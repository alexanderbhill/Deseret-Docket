#!/usr/bin/env python3
"""Deseret Docket extras, run after update_docket.py on each data update.

  data/ag.json               the Utah Attorney General's office in the news: press releases, AG Brown's
                             op-eds, and newspaper stories that mention the office (Learn → AG's Office)
  data/media.json            news stories (RSS feeds in site/config.json) that mention a bill, a simple
                             sentiment score per bill, and what's trending in the news.

Usage:  python3 -I intel_update.py OUT_DIR [--prev PREV_DIR]
Every outside source is optional: if one fails, the rest still run and the old data is kept.
"""
import argparse, json, os, re, sys, time, glob, urllib.request, urllib.parse, html, email.utils
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG = json.load(open(os.path.join(HERE, "site", "config.json")))
UA = {"User-Agent": "DeseretDocket/1.0 (+https://deseret-docket.pages.dev)"}


def get(url, data=None, headers=None, timeout=40):
    req = urllib.request.Request(url, data=data, headers={**UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def load(path, default):
    try:
        return json.load(open(path))
    except Exception:
        return default


# ---------------------------------------------------------------- media
POS = set("""support supports supported win wins good great helpful protect protects protecting improve improves improved benefit benefits
celebrate celebrated praise praised success successful strong safer fair fairness relief boost welcome welcomed applaud hope hopeful
landmark bipartisan common-sense commonsense thank thanks love wonderful important needed smart sensible progress""".split())
NEG = set("""oppose opposes opposed opposition against bad worse worst harm harms harmful dangerous risk risky attack attacks unfair
unconstitutional lawsuit sue sued controversial outrage outraged angry concern concerns concerned worried fail fails failed
cut cuts kill kills killed overreach terrible awful wrong problem problems crisis threat threatens backlash criticism criticized slammed""".split())


def sentiment(text):
    words = re.findall(r"[a-z][a-z'-]+", text.lower())
    p = sum(w in POS for w in words); n = sum(w in NEG for w in words)
    return 0.0 if p + n == 0 else round((p - n) / (p + n), 2)


def parse_feed(raw, name):
    s = raw.decode("utf-8", "replace")
    items = []
    for m in re.finditer(r"<(item|entry)\b[\s\S]*?</\1>", s):
        blk = m.group(0)
        def tag(t):
            mm = re.search(rf"<{t}\b[^>]*>([\s\S]*?)</{t}>", blk)
            v = mm.group(1) if mm else ""
            v = re.sub(r"<!\[CDATA\[([\s\S]*?)\]\]>", r"\1", v)
            return html.unescape(re.sub(r"<[^>]+>", " ", v)).strip()
        link = tag("link")
        if not link:
            lm = re.search(r'<link[^>]*href="([^"]+)"', blk)
            link = lm.group(1) if lm else ""
        date = tag("pubDate") or tag("published") or tag("updated") or tag("dc:date")
        try:
            d = email.utils.parsedate_to_datetime(date).astimezone(timezone.utc).isoformat()[:16]
        except Exception:
            d = date[:16]
        # A picture for the story, if the feed has one (media:content, media:thumbnail, an enclosure, or the first <img>).
        im = re.search(r'<media:(?:content|thumbnail)[^>]*url="([^"]+)"', blk) or re.search(r'<enclosure[^>]*url="([^"]+\.(?:jpe?g|png|webp)[^"]*)"', blk, re.I) or re.search(r'<img[^>]*src=["\']([^"\']+)', html.unescape(blk))
        img = html.unescape(im.group(1)) if im else ""
        items.append({"t": tag("title")[:300], "d": re.sub(r"\s+", " ", tag("description") or tag("summary") or tag("content"))[:600], "u": link, "date": d, "src": name, "kind": "news", **({"img": img} if img.startswith("https://") else {})})
    return items


def bill_matchers(bills):
    out = []
    for b in bills:
        m = re.match(r"([A-Z]+)0*(\d+)$", b["n"])
        if not m:
            continue
        pre, n = m.group(1), m.group(2)
        long = {"HB": r"house bill", "SB": r"senate bill", "HJR": r"house joint resolution", "SJR": r"senate joint resolution", "HCR": r"house concurrent resolution", "SCR": r"senate concurrent resolution"}.get(pre)
        pats = [r"\b" + r"\.?\s?".join(pre) + rf"\.?\s*0*{n}\b"]
        if long:
            pats.append(rf"\b{long}\s+0*{n}\b")
        title = b.get("t", "")
        tre = re.compile(r"\b" + re.escape(title) + r"\b", re.I) if len(title.split()) >= 4 else None
        out.append((b["n"], re.compile("|".join(pats), re.I), tre))
    return out


# Stories about the Legislature or what it's doing, for the "Legislature in the news" feed.
LEG_STRONG = re.compile(r"\b(legislat\w*|lawmakers?|state (?:house|senate)|utah (?:house|senate)|interim committee|special session|general session|sine die|senate president|house speaker|speaker (?:mike )?schultz|president (?:stuart )?adams|state capitol|veto(?:ed|es)?|override)\b", re.I)
LEG_WEAK = re.compile(r"\b(bill|h\.?\s?b\.?\s?\d+|s\.?\s?b\.?\s?\d+|sponsor(?:ed|s)?|rep\.|sen\.|state law|new law|governor cox|cox signs?)\b", re.I)
NOT_LEG = re.compile(r"\b(congress(?:ional)?|u\.s\. (?:house|senate)|washington|white house|supreme court of the united states)\b", re.I)
# Utah's members of Congress, so their federal bills don't land in the state feed.
FEDERAL = re.compile(r"\b(john curtis|curtis,|sen\.? curtis|mike lee|sen\.? lee|celeste maloy|maloy|burgess owens|blake moore|mike kennedy|cortez masto|rosen)\b", re.I)


def legislature_news(items, old, now):
    cutoff = (now - timedelta(days=10)).isoformat()[:16]
    seen, out = set(), []
    for it in sorted(items + old, key=lambda x: x.get("date") or "", reverse=True):
        t, d = it.get("t", ""), it.get("d", "")
        key = re.sub(r"[^a-z0-9]+", "", t.lower())[:60]
        if not t or not it.get("u") or (it.get("date") or "") < cutoff or it["u"] in seen or key in seen:
            continue
        score = 3 * bool(LEG_STRONG.search(t)) + bool(LEG_STRONG.search(d)) + bool(LEG_WEAK.search(t)) + 0.5 * bool(LEG_WEAK.search(d))
        if NOT_LEG.search(t) and not re.search(r"\butah\b", t, re.I):
            score -= 2
        if FEDERAL.search(t):
            score -= 4
        if score < 2:
            continue
        seen.update([it["u"], key])
        out.append({k: it[k] for k in ("t", "d", "u", "date", "src", "img") if it.get(k)} | {"d": d[:240]})
    return out[:30]


# ---------------------------------------------------------------- the AG's office in the news
AG_SITE = "https://attorneygeneral.utah.gov"
AG_RX = re.compile(r"\b(utah attorney general|attorney general derek brown|ag derek brown|derek brown|attorney general'?s office|utah ag\b|state attorney general)", re.I)
NOT_AG = re.compile(r"\b(u\.s\. attorney general|us attorney general|attorney general (?:pam |pamela )?bondi|department of justice|justice department)\b", re.I)


def ag_opeds():
    """Op-eds and articles AG Brown lists on attorneygeneral.utah.gov/op-eds-and-articles/."""
    s = get(f"{AG_SITE}/op-eds-and-articles/").decode("utf-8", "replace")
    out = []
    for m in re.finditer(r'<h[23][^>]*>\s*<a[^>]+href="(https?://[^"]+)"[^>]*>([\s\S]*?)</a>\s*</h[23]>(?:\s*<p[^>]*>([\s\S]*?)</p>)?', s):
        u, t, d = m.group(1), m.group(2), m.group(3) or ""
        if "attorneygeneral.utah.gov" in u:
            continue
        t = html.unescape(re.sub(r"<[^>]+>", "", t)).strip()
        dm = re.search(r"/(20\d\d)/(\d\d)/(\d\d)/", u)
        src = re.sub(r"^www\.", "", urllib.parse.urlparse(u).netloc)
        src = {"deseret.com": "Deseret News", "sltrib.com": "Salt Lake Tribune", "ksl.com": "KSL", "foxnews.com": "Fox News", "thehill.com": "The Hill", "wsj.com": "Wall Street Journal"}.get(src, src)
        out.append({"t": t.replace("Opinion: ", "")[:240], "u": u, "src": src, "d": html.unescape(re.sub(r"<[^>]+>", "", d)).strip()[:300], "date": f"{dm.group(1)}-{dm.group(2)}-{dm.group(3)}" if dm else ""})
    return sorted(out, key=lambda x: x["date"], reverse=True)


def build_ag(out, prev, items):
    old = load(os.path.join(prev, "ag.json"), {}) if prev else {}
    res = {"fetched": datetime.now(timezone.utc).isoformat()[:16]}
    try:  # the office's own press releases (skip the "Schedule" posts)
        raw = get(f"{AG_SITE}/feed/").decode("utf-8", "replace")
        press = []
        for blk in re.findall(r"<item\b[\s\S]*?</item>", raw):
            cats = re.findall(r"<category><!\[CDATA\[([^\]]*)", blk)
            if "Schedule" in cats and "News" not in cats:
                continue
            press += [{**x, "src": "AG’s office"} for x in parse_feed(blk.encode(), "AG’s office")]
        res["press"] = press[:20] or old.get("press", [])
    except Exception as e:
        print(f"  ag press: {e}", file=sys.stderr); res["press"] = old.get("press", [])
    try:
        res["oped"] = ag_opeds() or old.get("oped", [])
    except Exception as e:
        print(f"  ag op-eds: {e}", file=sys.stderr); res["oped"] = old.get("oped", [])
    # newspaper stories that mention the office, kept for 60 days
    cutoff = (datetime.now(timezone.utc) - timedelta(days=60)).isoformat()[:16]
    seen, news = set(), []
    for it in sorted(items + old.get("news", []), key=lambda x: x.get("date") or "", reverse=True):
        text = f"{it.get('t', '')} {it.get('d', '')}"
        if not it.get("u") or it["u"] in seen or (it.get("date") or "") < cutoff or "attorneygeneral.utah.gov" in it["u"]:
            continue
        if AG_RX.search(text) and not (NOT_AG.search(it.get("t", "")) and not re.search(r"\butah\b|derek brown", text, re.I)):
            seen.add(it["u"])
            news.append({k: it[k] for k in ("t", "u", "date", "src", "img") if it.get(k)} | {"d": it.get("d", "")[:260], "s": sentiment(text)})
    res["news"] = news[:40]
    json.dump(res, open(os.path.join(out, "ag.json"), "w"), separators=(",", ":"))
    print(f"  ag: {len(res['press'])} press releases, {len(res['oped'])} op-eds, {len(res['news'])} news stories")


def build_media(out, prev):
    old = load(os.path.join(prev, "media.json"), {}) if prev else {}
    idx = load(os.path.join(out, "index.json"), {})
    live = [s["id"] for s in idx.get("sessions", []) if s.get("count")]
    session = live[0] if live else old.get("session") or ""
    bills = load(os.path.join(out, session, "bills.json"), []) if live else []
    items, status = [], []
    for f in CONFIG.get("newsFeeds", []):
        try:
            got = parse_feed(get(f["url"]), f["name"])
            items += got; status.append({"name": f["name"], "ok": True, "n": len(got)})
        except Exception as e:
            status.append({"name": f["name"], "ok": False, "err": str(e)[:120]})
    cutoff = (datetime.now(timezone.utc) - timedelta(days=60)).isoformat()[:16]
    matchers = bill_matchers(bills)
    per = {num: list(v.get("items", [])) for num, v in (old.get("bills") or {}).items()} if old.get("session") == session else {}
    for it in items:
        text = f"{it['t']} {it['d']}"
        for num, rx, tre in matchers:
            if rx.search(text) or (tre and tre.search(text)):
                lst = per.setdefault(num, [])
                if not any(x["u"] == it["u"] for x in lst):
                    lst.append({**it, "s": sentiment(text)})
    bills_out = {}
    now = datetime.now(timezone.utc)
    day, week = {}, {}
    for num, lst in per.items():
        lst = sorted([x for x in lst if (x.get("date") or "") >= cutoff], key=lambda x: x.get("date") or "", reverse=True)[:60]
        if not lst:
            continue
        recent = [x for x in lst if (x.get("date") or "") >= (now - timedelta(days=14)).isoformat()[:16]] or lst[:10]
        score = round(sum(x["s"] for x in recent) / len(recent), 2)
        bills_out[num] = {"items": lst, "score": score, "n": len(recent), "news": sum(x["kind"] == "news" for x in recent), "social": 0}
        day[num] = sum((x.get("date") or "") >= (now - timedelta(days=1)).isoformat()[:16] for x in lst)
        week[num] = sum((x.get("date") or "") >= (now - timedelta(days=7)).isoformat()[:16] for x in lst)
    top = lambda m: [[k, v] for k, v in sorted(m.items(), key=lambda kv: -kv[1]) if v][:15]
    leg = legislature_news(items, old.get("leg") or [], now)
    try:
        build_ag(out, prev, items)
    except Exception as e:
        print(f"  ag failed: {e}", file=sys.stderr)
    json.dump({"session": session, "fetched": now.isoformat()[:16], "sources": status, "bills": bills_out, "trending": {"day": top(day), "week": top(week)}, "leg": leg},
              open(os.path.join(out, "media.json"), "w"), separators=(",", ":"))
    print(f"  media: {len(items)} items read, {len(bills_out)} bills mentioned, {len(leg)} legislature stories")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out"); ap.add_argument("--prev")
    a = ap.parse_args()
    idx = load(os.path.join(a.out, "index.json"), {})
    try:
        build_media(a.out, a.prev)
    except Exception as e:
        print(f"  media failed: {e}", file=sys.stderr)
        if a.prev and os.path.exists(os.path.join(a.prev, "media.json")):
            import shutil; shutil.copy(os.path.join(a.prev, "media.json"), os.path.join(a.out, "media.json"))
    # carry forward files other jobs write (media availability analyses)
    if a.prev:
        import shutil
        for f in ("media-avail.json", "ag.json"):
            if os.path.exists(os.path.join(a.prev, f)) and not os.path.exists(os.path.join(a.out, f)):
                shutil.copy(os.path.join(a.prev, f), os.path.join(a.out, f))


if __name__ == "__main__":
    main()
