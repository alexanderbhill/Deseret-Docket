#!/usr/bin/env python3
"""Deseret Docket extras, run after update_docket.py on each data update.

  data/<SESSION>/ai.json     plain-English summaries, fiscal-impact assessments, suggested divisions,
                             "what this substitute does" and leads on similar laws elsewhere.
                             Only built when ANTHROPIC_API_KEY is set; cached per bill version.
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


# ---------------------------------------------------------------- AI (optional)
AI_MODEL = os.environ.get("AI_MODEL", "claude-haiku-5-5")
AI_MAX = int(os.environ.get("AI_MAX_PER_RUN", "120"))


def claude(prompt, max_tokens=900):
    key = os.environ.get("ANTHROPIC_API_KEY")
    body = json.dumps({"model": AI_MODEL, "max_tokens": max_tokens, "messages": [{"role": "user", "content": prompt}]}).encode()
    raw = get("https://api.anthropic.com/v1/messages", data=body, headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"}, timeout=120)
    d = json.loads(raw)
    return "".join(b.get("text", "") for b in d.get("content", []) if b.get("type") == "text")


def bill_text(passages, limit=9000):
    t = []
    for p in passages or []:
        txt = re.sub(r"\u0001[^\u0002]*\u0002", "", p[1])  # leave struck language out
        t.append(f"[{p[0]}] {txt}")
        if sum(len(x) for x in t) > limit:
            break
    return "\n".join(t)[:limit]


DIV_LIST = "\n".join(f"{d['id']}: {d['name']}" for d in CONFIG.get("divisions", []))


def ai_for(b, passages):
    vd = b.get("vd") or {}
    changes = ""
    if vd.get("items"):
        clean = lambda x: re.sub("[\u0001\u0002]", "", x or "")
        changes = "\n".join(f"- {i[0]} ({i[1]}): OLD: {clean(i[2])[:300]} NEW: {clean(i[3])[:300]}" for i in vd["items"][:12])
    subsum_hint = '"one or two plain-English sentences on what changed in this version"' if changes else '""'
    change_block = f"Changes from {vd.get('from', '')} to {vd.get('to', '')}:\n{changes}" if changes else ""
    prompt = f"""You help a government legal office triage Utah legislation. Read the bill and answer in JSON only.

Bill {b['n']} ({b.get('ver','')}): {b.get('t','')}
Sponsor: {b.get('sp','')}
General description: {b.get('gd','')}
Text excerpt:
{bill_text(passages)}
{change_block}

Divisions (id: name):
{DIV_LIST}

Return exactly this JSON object:
{{"sum": "2-3 plain-English sentences on what the bill does, for a busy reader",
 "need": "likely" | "unlikely" | "unsure"  (would it create costs for state agencies or the office: new duties, staff, programs, enforcement, reports?),
 "why": "one sentence explaining that judgment, citing the bill",
 "conf": 0-100,
 "divs": ["up to 3 division ids from the list whose work this bill most affects"],
 "subsum": {subsum_hint},
 "elsewhere": [{{"state": "...", "law": "name or citation", "note": "what happened: passed, struck down, challenged, cost"}}]  (only laws you are confident are real and closely similar; [] if unsure)
}}"""
    out = claude(prompt)
    m = re.search(r"\{[\s\S]*\}", out)
    if not m:
        raise ValueError("no JSON in reply")
    j = json.loads(m.group(0))
    ids = {d["id"] for d in CONFIG.get("divisions", [])}
    return {"ver": b.get("ver", ""), "sum": str(j.get("sum", ""))[:1200], "need": j.get("need") if j.get("need") in ("likely", "unlikely", "unsure") else "unsure",
            "why": str(j.get("why", ""))[:600], "conf": max(0, min(100, int(j.get("conf") or 0))), "divs": [x for x in j.get("divs", []) if x in ids][:3],
            "subsum": str(j.get("subsum", ""))[:800], "elsewhere": [{k: str(e.get(k, ""))[:300] for k in ("state", "law", "note")} for e in (j.get("elsewhere") or [])[:4] if isinstance(e, dict)],
            "at": datetime.now(timezone.utc).isoformat()[:16]}


def build_ai(out, prev, session):
    path_prev = os.path.join(prev, session, "ai.json") if prev else None
    cache = load(path_prev, {}) if path_prev else {}
    bills_path = os.path.join(out, session, "bills.json")
    if not os.path.exists(bills_path):
        return
    bills = load(bills_path, [])
    if not os.environ.get("ANTHROPIC_API_KEY"):
        if cache:
            json.dump(cache, open(os.path.join(out, session, "ai.json"), "w"), separators=(",", ":"))
        return
    text = {}
    for f in sorted(glob.glob(os.path.join(out, session, "text-*.json"))):
        text.update(load(f, {}))
    todo = [b for b in bills if (cache.get(b["n"]) or {}).get("ver") != b.get("ver")]
    todo.sort(key=lambda b: b.get("upd", ""), reverse=True)
    done = 0
    for b in todo[:AI_MAX]:
        try:
            cache[b["n"]] = ai_for(b, text.get(b["n"]))
            done += 1
        except Exception as e:
            print(f"  ai {b['n']}: {e}", file=sys.stderr)
            if "401" in str(e) or "403" in str(e):
                break
        time.sleep(0.3)
    print(f"  AI: {done} bills summarized in {session} ({max(0, len(todo) - done)} still to do)")
    json.dump(cache, open(os.path.join(out, session, "ai.json"), "w"), separators=(",", ":"))


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
        items.append({"t": tag("title")[:300], "d": re.sub(r"\s+", " ", tag("description") or tag("summary") or tag("content"))[:600], "u": link, "date": d, "src": name, "kind": "news"})
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


def build_media(out, prev):
    old = load(os.path.join(prev, "media.json"), {}) if prev else {}
    idx = load(os.path.join(out, "index.json"), {})
    live = [s["id"] for s in idx.get("sessions", []) if s.get("count")]
    if not live:
        if old:
            json.dump(old, open(os.path.join(out, "media.json"), "w"), separators=(",", ":"))
        return
    session = live[0]
    bills = load(os.path.join(out, session, "bills.json"), [])
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
    json.dump({"session": session, "fetched": now.isoformat()[:16], "sources": status, "bills": bills_out, "trending": {"day": top(day), "week": top(week)}},
              open(os.path.join(out, "media.json"), "w"), separators=(",", ":"))
    print(f"  media: {len(items)} items read, {len(bills_out)} bills mentioned")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out"); ap.add_argument("--prev")
    a = ap.parse_args()
    idx = load(os.path.join(a.out, "index.json"), {})
    for s in idx.get("sessions", []):
        try:
            build_ai(a.out, a.prev, s["id"])
        except Exception as e:
            print(f"  ai {s['id']} failed: {e}", file=sys.stderr)
    try:
        build_media(a.out, a.prev)
    except Exception as e:
        print(f"  media failed: {e}", file=sys.stderr)
        if a.prev and os.path.exists(os.path.join(a.prev, "media.json")):
            import shutil; shutil.copy(os.path.join(a.prev, "media.json"), os.path.join(a.out, "media.json"))
    # carry forward files other jobs write (media availability analyses)
    if a.prev:
        import shutil
        for f in ("media-avail.json",):
            if os.path.exists(os.path.join(a.prev, f)) and not os.path.exists(os.path.join(a.out, f)):
                shutil.copy(os.path.join(a.prev, f), os.path.join(a.out, f))


if __name__ == "__main__":
    main()
