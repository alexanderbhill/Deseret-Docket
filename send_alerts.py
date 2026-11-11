#!/usr/bin/env python3
"""Deseret Docket email alerts.

Runs every 15 minutes from GitHub Actions. It asks the website which subscriptions are confirmed,
works out who is due an email right now (each person picks their own times and days), writes the
emails from the bill data in this repository, and hands them to the website, which sends them
through Resend. Nothing office-only (departments, priorities, notes) ever goes into an email.

  SITE_URL=https://deseret-docket.pages.dev CRON_KEY=... python3 -I send_alerts.py
  python3 -I send_alerts.py --dry OUT_DIR      # write the emails to files instead of sending
  python3 -I send_alerts.py --dry OUT_DIR --sample   # pretend there is one subscriber of each kind
"""
import argparse, glob, html, json, os, re, sys, urllib.request
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

MT = ZoneInfo("America/Denver")
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "site", "data")
WINDOW = timedelta(hours=3)  # if the job was down, don't send an email more than 3 hours late
e = html.escape


def load(path, default=None):
    try:
        return json.load(open(os.path.join(DATA, path)))
    except Exception:
        return default


def pd(s):
    try:
        return datetime.fromisoformat(s[:16]).replace(tzinfo=MT)
    except Exception:
        return None


def clock(d):
    h = d.hour % 12 or 12
    return f"{h}:{d.minute:02d} {'am' if d.hour < 12 else 'pm'}"


def day(d):
    return f"{d.strftime('%A')}, {d.strftime('%b')} {d.day}"


def short(num):
    m = re.match(r"([A-Z]+)0*(\d+)$", num)
    return f"{m.group(1)} {m.group(2)}" if m else num


def api(site, key, path, body=None):
    req = urllib.request.Request(site.rstrip("/") + "/api/" + path, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"X-Cron-Key": key, "Content-Type": "application/json", "User-Agent": "DeseretDocket-alerts/1.0"},
                                 method="POST" if body is not None else "GET")
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


# ---------------------------------------------------------------- data
def current_session(index):
    sess = [s for s in index.get("sessions", []) if s.get("count") or s.get("files")]
    return (sess or index.get("sessions", [{}]))[0].get("id")


def bill_matches(b, opts, keys, session):
    scope = opts.get("scope", "all")
    if scope in ("mine", "office"):
        return f"{session}/{b['n']}" in keys
    if scope == "list":
        if short(b["n"]).replace(" ", "") in opts.get("bills", []) or b["n"] in opts.get("bills", []):
            return True
        hay = (b.get("t", "") + " " + b.get("gd", "")).lower()
        return any(re.search(r"\b" + re.escape(w.lower()) + r"\b", hay) for w in opts.get("words", []))
    return True


# ---------------------------------------------------------------- email pieces
STYLE = "font:16px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#1d1d1b"


def wrap_html(site, title, intro, body):
    return f"""<div style="{STYLE};max-width:640px;margin:0 auto;padding:8px">
<div style="font:600 22px Georgia,'Times New Roman',serif;margin:8px 0 2px">{e(title)}</div>
<div style="color:#6b6b66;font-size:14px;margin-bottom:16px">{intro}</div>
{body}
<p style="color:#6b6b66;font-size:13px;margin-top:28px;border-top:1px solid #e3e2dd;padding-top:12px">From the Deseret Docket bill tracker. Links open the public view of each bill; signing in isn't needed.<br>
<a href="{{{{MANAGE}}}}" style="color:#7a4a0a">Change what you get</a> · <a href="{{{{UNSUB}}}}" style="color:#7a4a0a">Unsubscribe</a></p></div>"""


def bill_link(site, session, b):
    return f"{site.rstrip('/')}/#bill-{session}-{b['n']}"


def bill_line(site, session, b, extra=""):
    sp = b.get("sp", "")
    return (f'<div style="margin:0 0 10px"><a href="{e(bill_link(site, session, b))}" style="color:#7a4a0a;font-weight:700;text-decoration:none">{e(short(b["n"]))}</a> '
            f'<span style="font-family:Georgia,serif">{e(b.get("t", ""))}</span><div style="color:#6b6b66;font-size:14px">{e(sp)}{extra}</div></div>')


def section(title, inner):
    return f'<div style="background:#fff;border:1px solid #e3e2dd;border-radius:8px;padding:14px 16px;margin:0 0 14px"><div style="font-weight:600;margin-bottom:8px">{e(title)}</div>{inner}</div>'


def hearings(bills, start, end):
    out = {}
    for b in bills:
        for a in b.get("ag", []):
            d = pd(a.get("date", ""))
            if d and start <= d < end:
                k = (a.get("date"), a.get("committee"), a.get("place"))
                out.setdefault(k, {"d": d, "committee": a.get("committee", ""), "place": a.get("place", ""), "url": a.get("url", ""), "bills": []})["bills"].append(b)
    return sorted(out.values(), key=lambda h: h["d"])


def calendar_html(site, session, hs, cap=60):
    parts, last_day = [], None
    for h in hs[:cap]:
        if h["d"].date() != last_day:
            last_day = h["d"].date()
            parts.append(f'<div style="font-weight:700;margin:14px 0 6px">{e(day(h["d"]))}</div>')
        bl = "".join(bill_line(site, session, b) for b in h["bills"][:40])
        agenda = f' · <a href="{e(h["url"])}" style="color:#7a4a0a">Agenda</a>' if h["url"] else ""
        parts.append(section(f'{clock(h["d"])} · {h["committee"]}', f'<div style="color:#6b6b66;font-size:14px;margin:-4px 0 8px">{e(h["place"])}{agenda}</div>{bl}'))
    if len(hs) > cap:
        parts.append(f'<p style="color:#6b6b66;font-size:14px">And {len(hs) - cap} more meetings. <a href="{site}/#hearings" style="color:#7a4a0a">See them all</a>.</p>')
    return "".join(parts)


def money(v):
    s = f"${abs(v):,.0f}"
    return ("-" if v < 0 else "") + s


def fiscal_line(b):
    fn = b.get("fn") or {}
    if fn.get("none"):
        return "No direct cost to the state."
    exp = (fn.get("exp") or {}).get("tot") or []
    net = fn.get("net")
    if net:
        on, one, _ = net
        bits = []
        if on:
            bits.append(f"{money(-on)} ongoing")
        if one:
            bits.append(f"{money(-one)} one-time")
        return ("General Fund cost: " + ", ".join(bits)) if bits else ("Total spending " + money(exp[0]) if exp else "")
    return ""


# ---------------------------------------------------------------- the four kinds of email
def daily_email(site, session, bills, sub, now, files):
    opts, last = sub["opts"], sub.get("last", {})
    mine = [b for b in bills if bill_matches(b, opts, set(sub.get("bills", [])), session)]
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    hs = hearings(mine, now - timedelta(hours=1), today + timedelta(days=8))
    since = last.get("daily") or (now - timedelta(days=1)).isoformat()
    since = since[:16]
    changes = []
    for b in mine:
        for c in b.get("ch", []):
            if c[0] > since and c[1] in ("New substitute", "Amended", "Enrolled", "Fiscal note", "Moved", "New hearing") and (c[1] != "Fiscal note" or opts.get("fiscal", True)):
                changes.append((c, b))
    changes.sort(key=lambda x: x[0][0], reverse=True)
    body = ""
    if hs:
        body += f'<h3 style="font:600 18px Georgia,serif;margin:18px 0 4px">On the calendar</h3>' + calendar_html(site, session, hs)
    if changes:
        rows = "".join(bill_line(site, session, b, f" · <b>{e(c[1])}</b>: {e(c[2])}" + (f" {e(fiscal_line(b))}" if c[1] == "Fiscal note" and fiscal_line(b) else "")) for c, b in changes[:60])
        body += f'<h3 style="font:600 18px Georgia,serif;margin:18px 0 4px">Since the last email</h3>' + section(f"{len(changes)} change{'s' if len(changes) != 1 else ''}", rows)
    fbody = files_section(site, files, sub, now) if opts.get("files") else ""
    body += fbody
    if not body:
        return None
    n = sum(len(h["bills"]) for h in hs)
    subj = f"Deseret Docket: {n} bill{'s' if n != 1 else ''} on the calendar" if hs else ("Deseret Docket: new bill files" if fbody and not changes else "Deseret Docket: bill changes")
    intro = f"{e(day(now))}. " + ("Hearings for the next week, soonest first." if hs else "No hearings on your list this week.")
    return subj, wrap_html(site, "Your Deseret Docket", intro, body)


def files_section(site, files, sub, now):
    since = (sub.get("last", {}).get("files") or (now - timedelta(days=1)).isoformat())[:16]
    new = [f for f in files if f.get("seen", "") > since]
    if not new:
        return ""
    rows = "".join(f'<div style="margin:0 0 8px"><span style="font-family:Georgia,serif">{e(f["t"])}</span><div style="color:#6b6b66;font-size:14px">{e(f["sp"])} · {e(f.get("st", ""))}</div></div>' for f in new[:80])
    more = f'<p style="color:#6b6b66;font-size:14px">And {len(new) - 80} more on <a href="{site}/#all" style="color:#7a4a0a">All bills</a>.</p>' if len(new) > 80 else ""
    return (f'<h3 style="font:600 18px Georgia,serif;margin:18px 0 4px">New bill files</h3><p style="color:#6b6b66;font-size:14px;margin:0 0 8px">'
            f'Bill requests legislators opened since the last email. Until a bill is numbered, its title is all the Legislature publishes.</p>' + section(f"{len(new)} new", rows + more))


def files_email(site, files, sub, now):
    s = files_section(site, files, sub, now)
    if not s:
        return None
    n = s.count('font-family:Georgia,serif">')
    return f"Deseret Docket: new bill files opened", wrap_html(site, "New bill files", e(day(now)) + ".", s)


def eve_email(site, session, bills, sub, now):
    mine = [b for b in bills if bill_matches(b, sub["opts"], set(sub.get("bills", [])), session)]
    tomorrow = now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
    hs = hearings(mine, tomorrow, tomorrow + timedelta(days=1))
    floor = [b for b in mine if re.search(r"(3rd|third|2nd|second) reading calendar", b.get("act", ""), re.I)]
    if not hs and not floor:
        return None
    body = calendar_html(site, session, hs) if hs else ""
    if floor and sub["opts"].get("scope") != "all":
        body += f'<h3 style="font:600 18px Georgia,serif;margin:18px 0 4px">Waiting on a floor calendar</h3><p style="color:#6b6b66;font-size:14px;margin:0 0 8px">Floor debate isn\'t scheduled to the minute; these could come up any floor day.</p>' + section(
            f"{len(floor)} bill{'s' if len(floor) != 1 else ''}", "".join(bill_line(site, session, b, f" · {e(b.get('act', ''))}") for b in floor[:40]))
    n = sum(len(h["bills"]) for h in hs)
    subj = f"Tomorrow: {n} bill{'s' if n != 1 else ''} in committee" if hs else "Bills waiting on the floor calendar"
    return subj, wrap_html(site, "Coming up tomorrow", e(day(tomorrow)) + ". When and where each bill is heard.", body)


def wrap_email(site, session, bills, sub, now):
    mine = [b for b in bills if bill_matches(b, sub["opts"], set(sub.get("bills", [])), session)]
    today = now.date().isoformat()
    items = []
    for b in mine:
        talks = [t for t in b.get("tx", []) if (t.get("date") or "")[:10] == today]
        acts = [h for h in b.get("hist", []) if (h[0] or "")[:10] == today]
        if talks or acts:
            items.append((b, talks, acts))
    if not items:
        return None
    blocks = []
    for b, talks, acts in items[:120]:
        inner = ""
        for t in talks:
            mins = max(1, round(((t.get("t1") or t.get("t0") or 0) - (t.get("t0") or 0)) / 60)) if t.get("t1") else None
            watch = f'{t["video"]}#t={int(t.get("t0") or 0)}s' if t.get("video") else t.get("page", "")
            notes = [n for n in t.get("notes", []) if n[1] in ("motion", "vote", "freetext")][:6]
            ag = t.get("ag") or []
            inner += (f'<div style="margin:6px 0 10px"><b>{e(t.get("label", ""))}</b>' + (f" · {mins} min" if mins else "") +
                      (f' · <a href="{e(watch)}" style="color:#7a4a0a">Watch</a>' if watch else "") +
                      ("".join(f'<div style="font-size:14px;margin-top:3px">{e(n[2])}</div>' for n in notes)) +
                      (f'<div style="font-size:14px;margin-top:4px;background:#f3f2ee;border-left:3px solid #1d1d1b;padding:4px 8px">The Attorney General came up {len(ag)} time{"s" if len(ag) != 1 else ""}: “{e(ag[0][1][:220])}”</div>' if ag else "") +
                      ("" if t.get("status") == "ok" else '<div style="font-size:13px;color:#6b6b66">Captions aren\'t ready yet; the transcript will be on the bill page later.</div>') + "</div>")
        for h in acts[:6]:
            inner += f'<div style="font-size:14px">{e(h[1])}{" · " + e(h[2]) if h[2] else ""}{" · vote " + e(h[3]) if h[3] else ""}</div>'
        blocks.append(section(f"{short(b['n'])} {b.get('t', '')}", f'<div style="color:#6b6b66;font-size:14px;margin:-4px 0 6px">{e(b.get("sp", ""))} · <a href="{e(bill_link(site, session, b))}" style="color:#7a4a0a">Bill page</a></div>' + inner))
    subj = f"Today at the Legislature: {len(items)} bill{'s' if len(items) != 1 else ''} moved or discussed"
    return subj, wrap_html(site, "How today went", e(day(now)) + ". Committee and floor discussion, motions and votes from today's recordings.", "".join(blocks))


def text_of(h):
    t = re.sub(r"<(br|/div|/p|/h3)[^>]*>", "\n", h)
    t = re.sub(r"<a [^>]*href=\"([^\"]+)\"[^>]*>([^<]*)</a>", r"\2 (\1)", t)
    t = html.unescape(re.sub(r"<[^>]+>", "", t))
    return re.sub(r"\n\s*\n+", "\n\n", t).strip()


def due(opts_key_time, sub, kind, now):
    opts = sub["opts"]
    hh, mm = map(int, opts.get(opts_key_time, "07:00").split(":"))
    at = now.replace(hour=hh, minute=mm, second=0, microsecond=0)
    if now.weekday() not in [(d - 1) % 7 for d in opts.get("days", [1, 2, 3, 4, 5])]:  # stored as 0=Sunday
        return False
    if not (at <= now < at + WINDOW):
        return False
    return (sub.get("last", {}).get(kind) or "")[:10] != now.date().isoformat()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry")
    ap.add_argument("--sample", action="store_true")
    ap.add_argument("--now")
    a = ap.parse_args()
    site = os.environ.get("SITE_URL", "https://deseret-docket.pages.dev")
    key = os.environ.get("CRON_KEY", "")
    now = datetime.fromisoformat(a.now).replace(tzinfo=MT) if a.now else datetime.now(MT)
    index = load("index.json", {})
    session = current_session(index)
    bills = load(f"{session}/bills.json", []) or []
    files = (load(f"{session}/files.json", {}) or {}).get("files", [])
    if a.sample:
        base = {"days": [0, 1, 2, 3, 4, 5, 6], "time": now.strftime("%H:%M"), "wrapTime": now.strftime("%H:%M"), "eveTime": now.strftime("%H:%M"), "fiscal": True}
        subs = [{"id": "all", "opts": {**base, "daily": True, "wrap": True, "eve": True, "files": True, "scope": "all"}, "last": {}},
                {"id": "list", "opts": {**base, "daily": True, "wrap": True, "eve": True, "files": False, "scope": "list", "bills": ["HB20"], "words": ["victim"]}, "last": {}}]
    else:
        if not key:
            sys.exit("Set CRON_KEY (and SITE_URL) to send emails.")
        subs = api(site, key, "cron/subs")["subs"]
    out = []
    for sub in subs:
        o = sub["opts"]
        jobs = []
        if o.get("daily") and due("time", sub, "daily", now):
            jobs.append(("daily", daily_email(site, session, bills, sub, now, files)))
            if o.get("files"):
                sub.setdefault("last", {})  # files went out with the daily email
                jobs.append(("files", ("", "")))
        elif o.get("files") and not o.get("daily") and due("time", sub, "files", now):
            jobs.append(("files", files_email(site, files, sub, now)))
        if o.get("eve") and due("eveTime", sub, "eve", now):
            jobs.append(("eve", eve_email(site, session, bills, sub, now)))
        if o.get("wrap") and due("wrapTime", sub, "wrap", now):
            jobs.append(("wrap", wrap_email(site, session, bills, sub, now)))
        for kind, m in jobs:
            stamp = now.isoformat(timespec="minutes")
            if m and m[0]:
                out.append({"id": sub["id"], "type": kind, "stamp": stamp, "subject": m[0], "html": m[1], "text": text_of(m[1])})
            else:  # nothing to say today; remember we checked so it isn't rebuilt every 15 minutes
                out.append({"id": sub["id"], "type": kind, "stamp": stamp, "skip": True})
    if a.dry:
        os.makedirs(a.dry, exist_ok=True)
        for i, m in enumerate(x for x in out if not x.get("skip")):
            open(os.path.join(a.dry, f"{i:02d}-{m['id']}-{m['type']}.html"), "w").write(f"<!-- {m['subject']} -->\n" + m["html"])
        print(f"wrote {sum(1 for x in out if not x.get('skip'))} emails to {a.dry}")
        return
    real = [m for m in out if not m.get("skip")]
    skips = [m for m in out if m.get("skip")]
    sent = 0
    for i in range(0, len(real), 50):
        sent += api(site, key, "cron/send", {"emails": real[i:i + 50]}).get("sent", 0)
    if skips:  # record the empty checks (sent with no message so nothing goes out)
        api(site, key, "cron/send", {"emails": [], "marks": [{"id": m["id"], "type": m["type"], "stamp": m["stamp"]} for m in skips]})
    print(f"{len(subs)} subscriptions, {sent} emails sent, {len(skips)} with nothing to send")


if __name__ == "__main__":
    main()
