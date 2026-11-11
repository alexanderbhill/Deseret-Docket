#!/usr/bin/env python3
"""Deseret Docket emails.

Runs every hour from GitHub Actions (.github/workflows/email.yml). For each confirmed subscriber it
decides what is due and sends it through Resend:

  * Main email, at the subscriber's chosen time:
      - Tomorrow: committee hearings tomorrow for the bills they follow (the day-before heads-up)
      - Coming up: committee meetings in the next week, and bills waiting on the floor calendars
      - New bill files opened since their last email
  * End-of-day recap around 6 pm: how each bill's committee or floor discussion went today,
    from the meeting transcripts and timeline notes.

Subscribers live in the site's D1 database. This script reads them from the site with CRON_SECRET
and reads bill data from site/data in this repository (kept fresh by the weekday update).

Environment: RESEND_API_KEY, EMAIL_FROM, CRON_SECRET, SITE_URL (default https://deseret-docket.pages.dev)

Try it without sending anything:
  python3 -I send_emails.py --dry-run preview --subs test_subs.json --now 2026-02-18T07:10
"""
import argparse, html, json, os, re, sys, time, urllib.request, urllib.error
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

MT = ZoneInfo("America/Denver")
RECAP_HOUR = 18          # 6 pm
LATEST_HOUR_OFFSET = 3   # if GitHub runs late, still send up to 3 hours after the chosen time
DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "site", "data")
SITE = os.environ.get("SITE_URL", "https://deseret-docket.pages.dev").rstrip("/")
UA = {"User-Agent": "DeseretDocket-mailer/1.0"}
E = html.escape


# ---------------------------------------------------------------- helpers
def bkey(num):
    """'HB0101' / 'HB 101' -> 'HB101' so bill numbers compare however they were typed."""
    m = re.match(r"([A-Z]+)\s*0*(\d+)$", (num or "").upper().replace(".", ""))
    return f"{m.group(1)}{int(m.group(2))}" if m else (num or "").upper()


def nice_num(num):
    m = re.match(r"([A-Z]+)0*(\d+)$", num or "")
    return f"{m.group(1)} {int(m.group(2))}" if m else num


def pdt(s):
    try:
        return datetime.fromisoformat(s[:16]).replace(tzinfo=MT)
    except Exception:
        return None


def clock(dt):
    h = dt.hour % 12 or 12
    return f"{h}:{dt.minute:02d} {'am' if dt.hour < 12 else 'pm'}"


def day_label(dt):
    return f"{dt.strftime('%A')}, {dt.strftime('%b')} {dt.day}"


def bill_url(session, num):
    return f"{SITE}/#bill-{session}-{num}"


def http_json(url, data=None, headers=None, method=None):
    body = json.dumps(data).encode() if data is not None else None
    h = {**UA, **(headers or {})}
    if body is not None:
        h["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=body, headers=h, method=method or ("POST" if body is not None else "GET"))
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read() or b"{}")


# ---------------------------------------------------------------- data
class Data:
    def __init__(self, root):
        self.index = json.load(open(os.path.join(root, "index.json")))
        self.bills = []  # (session, record)
        for s in self.index["sessions"]:
            if s.get("count"):
                for b in json.load(open(os.path.join(root, s["id"], "bills.json"))):
                    self.bills.append((s["id"], b))
        live = [s["id"] for s in self.index["sessions"] if s.get("count")]
        self.current = live[0] if live else None
        self.files = []
        bf = self.index.get("billfiles")
        if bf:
            p = os.path.join(root, bf["session"], "billfiles.json")
            if os.path.exists(p):
                self.files = json.load(open(p))
            self.files_session = bf["session"]

    def follows(self, settings):
        want = {bkey(b) for b in settings.get("bills") or []}
        return (lambda num: bkey(num) in want) if want else (lambda num: True)

    def meetings(self, start, end, follow):
        """Committee meetings with start <= date < end that include a followed bill."""
        out = {}
        for session, b in self.bills:
            if not follow(b["n"]):
                continue
            for a in b.get("ag", []):
                d = pdt(a.get("date", ""))
                if not d or not (start <= d < end):
                    continue
                k = a.get("id") or (a["date"] + a.get("committee", ""))
                m = out.setdefault(k, {"d": d, "committee": a.get("committee", ""), "place": a.get("place", ""), "url": a.get("url", ""), "bills": []})
                m["bills"].append((session, b))
        return sorted(out.values(), key=lambda m: (m["d"], m["committee"]))

    def floor(self, follow):
        """Bills in the current session now sitting on a House or Senate reading calendar."""
        out = {}
        for session, b in self.bills:
            if session != self.current or not follow(b["n"]):
                continue
            own = b.get("own", "")
            if re.search(r"calendar", own, re.I) and not re.search(r"file for bills not passed", own, re.I):
                out.setdefault(own, []).append((session, b))
        return sorted(out.items())

    def discussed(self, day, follow):
        """Today's committee/floor discussions from the transcripts, plus votes recorded today."""
        out = []
        for session, b in self.bills:
            if session != self.current or not follow(b["n"]):
                continue
            tx = [t for t in b.get("tx", []) if (t.get("date") or "")[:10] == day and t.get("status") in ("ok", "nocap")]
            votes = [h for h in b.get("hist", []) if (h[0] or "")[:10] == day and h[3]]
            if tx or votes:
                out.append((session, b, tx, votes))
        return out


# ---------------------------------------------------------------- email pieces
STYLE_WRAP = 'font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1b2738;max-width:640px'
H2 = 'font:600 19px Georgia,serif;margin:26px 0 8px;color:#1b2738'
CARD = 'border:1px solid #dfe3ea;border-radius:8px;padding:12px 14px;margin:0 0 10px'
MUTED = 'color:#5b6676;font-size:13px'
LINK = 'color:#1e5591'


def bill_line(session, b, sponsor=True):
    sp = f' <span style="color:#5b6676">· {E(b.get("sp", ""))}</span>' if sponsor and b.get("sp") else ""
    return f'<div><a href="{E(bill_url(session, b["n"]))}" style="color:#1e5591"><b>{E(nice_num(b["n"]))}</b></a> {E(b.get("t", ""))}{sp}</div>\n'



def meeting_block(m, show_day=True, brief=False):
    when = (day_label(m["d"]) + " at " if show_day else "") + clock(m["d"])
    agenda = f' · <a href="{E(m["url"])}" style="{LINK}">Agenda</a>' if m["url"] else ""
    ordered = sorted(m["bills"], key=lambda x: x[1]["n"])
    if brief:  # bill numbers only, so a whole week of meetings fits in one email
        bills = '<div style="margin-top:4px">' + " · ".join(f'<a href="{E(bill_url(s, b["n"]))}" style="color:#1e5591" title="{E(b.get("t", ""))}">{E(nice_num(b["n"]))}</a>' for s, b in ordered) + "</div>"
    else:
        bills = "".join(bill_line(s, b) for s, b in ordered)
    return (f'<div style="{CARD}"><div style="font-weight:700">{E(m["committee"])}</div>'
            f'<div style="{MUTED}">{E(when)} · {E(m["place"])}{agenda}</div>{bills}</div>')


def meeting_text(m, show_day=True):
    when = (day_label(m["d"]) + " at " if show_day else "") + clock(m["d"])
    lines = [f'{m["committee"]} — {when}, {m["place"]}']
    for s, b in sorted(m["bills"], key=lambda x: x[1]["n"]):
        lines.append(f'  {nice_num(b["n"])} {b.get("t", "")} ({b.get("sp", "")}) {bill_url(s, b["n"])}')
    return "\n".join(lines)


def files_block(files, session):
    rows = "".join(f'<tr><td style="padding:4px 10px 4px 0;vertical-align:top">{E(f[1])}</td><td style="padding:4px 0;{MUTED};white-space:nowrap;vertical-align:top">{E(f[2] or "No sponsor listed")}</td></tr>' for f in files[:150])
    more = f'<p style="{MUTED}">…and {len(files) - 150} more.</p>' if len(files) > 150 else ""
    return (f'<table style="border-collapse:collapse;width:100%;font-size:14px">{rows}</table>{more}'
            f'<p style="{MUTED}">Only the working title and sponsor are public until a bill is numbered. '
            f'<a href="https://le.utah.gov/bills/billSearch.jsp?sess={E(session)}&amp;disp=all&amp;sub=all" style="{LINK}">See all bill files</a></p>')


def footer(token):
    manage = f"{SITE}/#email-{token}"
    unsub = f"{SITE}/api/email/unsubscribe?t={token}"
    return (f'<hr style="border:0;border-top:1px solid #dfe3ea;margin:28px 0 12px"><p style="{MUTED}">Deseret Docket · live data from the Utah Legislature. '
            f'Bill links open without signing in, so this email doesn\'t include the office\'s divisions, flags or notes.<br>'
            f'<a href="{E(manage)}" style="{LINK}">Change what you get</a> · <a href="{E(unsub)}" style="{LINK}">Unsubscribe</a></p>'), \
           f"\n--\nChange what you get: {manage}\nUnsubscribe: {unsub}\n"


def wrap(title, intro, body_html, token):
    f_html, f_text = footer(token)
    return (f'<div style="{STYLE_WRAP}"><div style="font:600 22px Georgia,serif;margin:0 0 2px">Deseret Docket</div>'
            f'<div style="{MUTED};margin-bottom:14px">{E(title)}</div>{intro}{body_html}{f_html}</div>'), f_text


def build_main(data, sub, now, today_is_day):
    st = sub["settings"]
    follow = data.follows(st)
    today0 = now.replace(hour=0, minute=0, second=0, microsecond=0)
    tomorrow0, after0 = today0 + timedelta(days=1), today0 + timedelta(days=2)
    parts_h, parts_t, subject_bits = [], [], []

    tomorrow = data.meetings(tomorrow0, after0, follow) if st.get("daybefore") else []
    if tomorrow:
        n = sum(len(m["bills"]) for m in tomorrow)
        parts_h.append(f'<h2 style="{H2}">Tomorrow, {E(day_label(tomorrow0))}</h2>' + "".join(meeting_block(m, False, brief=not st.get("bills") and n > 40) for m in tomorrow))
        parts_t.append(f"TOMORROW, {day_label(tomorrow0).upper()}\n" + "\n\n".join(meeting_text(m, False) for m in tomorrow))
        subject_bits.append(f"{n} bill{'s' if n != 1 else ''} in committee tomorrow")

    if st.get("calendar") and today_is_day:
        week = [m for m in data.meetings(today0, today0 + timedelta(days=8), follow) if not (tomorrow and tomorrow0 <= m["d"] < after0)]
        floor = data.floor(follow)
        if week:
            parts_h.append(f'<h2 style="{H2}">Committee meetings this week</h2>' + "".join(meeting_block(m, brief=not st.get("bills")) for m in week))
            parts_t.append("COMMITTEE MEETINGS THIS WEEK\n" + "\n\n".join(meeting_text(m) for m in week))
            if not subject_bits:
                subject_bits.append(f"{len(week)} committee meeting{'s' if len(week) != 1 else ''} this week")
        if floor:
            brief = not st.get("bills")
            blocks = "".join(f'<div style="{CARD}"><div style="font-weight:700">{E(own)}</div><div style="{MUTED}">The House and Senate set floor times each day.</div>'
                             + (" · ".join(f'<a href="{E(bill_url(s, b["n"]))}" style="color:#1e5591">{E(nice_num(b["n"]))}</a>' for s, b in sorted(bills, key=lambda x: x[1]["n"])) if brief
                                else "".join(bill_line(s, b) for s, b in sorted(bills, key=lambda x: x[1]["n"]))) + "</div>" for own, bills in floor)
            parts_h.append(f'<h2 style="{H2}">Waiting on the floor</h2>' + blocks)
            parts_t.append("WAITING ON THE FLOOR\n" + "\n".join(f"{own}: " + ", ".join(nice_num(b['n']) for s, b in bills) for own, bills in floor))
            if not subject_bits:
                subject_bits.append(f"{sum(len(b) for _, b in floor)} bills on the floor calendars")

    new_files = []
    if st.get("billfiles") and (today_is_day or not st.get("days")) and data.files:
        seen = sub.get("files_seen") or ""
        new_files = [f for f in data.files if f[4] != "base" and f[4] > seen]
        if new_files:
            parts_h.append(f'<h2 style="{H2}">{len(new_files)} new bill file{"s" if len(new_files) != 1 else ""}</h2>' + files_block(new_files, data.files_session))
            parts_t.append("NEW BILL FILES\n" + "\n".join(f"  {f[1]} ({f[2] or 'no sponsor listed'})" for f in new_files))
            subject_bits.append(f"{len(new_files)} new bill file{'s' if len(new_files) != 1 else ''}")

    if not parts_h:
        return None, new_files
    who = f" for {len(st['bills'])} bill{'s' if len(st['bills']) != 1 else ''} you follow" if st.get("bills") else ""
    intro = f'<p style="margin:0 0 4px">Here\'s what\'s coming up{E(who)}, as of {E(clock(now))} {E(day_label(now))}.</p>'
    title = f"{day_label(now)}"
    h, t = wrap(title, intro, "".join(parts_h), sub["token"])
    subject = "Deseret Docket: " + "; ".join(subject_bits[:2])
    text = f"Deseret Docket — {title}\n\n" + "\n\n".join(parts_t) + t
    return (subject, h, text), new_files


def summarize_notes(notes):
    presented, favor, against, motions, other = [], [], [], [], []
    for _, kind, desc in notes:
        d = desc.strip()
        if kind == "motion":
            motions.append(d)
        elif re.search(r"\bpresented\b", d, re.I):
            presented.append(d)
        elif re.search(r"in favor|in support", d, re.I):
            favor.append(d)
        elif re.search(r"opposition|opposed|against", d, re.I):
            against.append(d)
        elif kind in ("vote",):
            motions.append(d)
    return presented, favor, against, motions


def build_recap(data, sub, now):
    st = sub["settings"]
    follow = data.follows(st)
    day = now.strftime("%Y-%m-%d")
    items = data.discussed(day, follow)
    if not items:
        return None
    blocks_h, blocks_t = [], []
    brief = not st.get("bills")  # following every bill: one short entry per bill keeps the email readable
    for session, b, tx, votes in sorted(items, key=lambda x: x[1]["n"]):
        if brief:
            where = "; ".join(sorted({r.get("label", "") for r in tx})) or (votes[0][2] if votes else "")
            last = next((m for r in tx for _, k, m in reversed(r.get("notes", [])) if k == "motion" and not re.search(r"adjourn", m, re.I)), "")
            outcome = f"{votes[-1][1]} ({votes[-1][3]})" if votes else last
            agn = sum(len(r.get("ag") or []) for r in tx)
            extra = " · ".join(x for x in [where, outcome, f"Attorney General mentioned {agn}×" if agn else ""] if x)
            blocks_h.append(f'<div style="margin:0 0 8px">{bill_line(session, b, False)}<div style="color:#5b6676;font-size:13px">{E(extra)}</div></div>\n')
            blocks_t.append(f'{nice_num(b["n"])} {b.get("t", "")}: {extra} {bill_url(session, b["n"])}')
            continue
        h = [f'<div style="{CARD}">' + bill_line(session, b)]
        t = [f'{nice_num(b["n"])} {b.get("t", "")} — {bill_url(session, b["n"])}']
        for r in tx:
            mins = max(1, round(((r.get("t1") or r.get("t0") or 0) - (r.get("t0") or 0)) / 60)) if r.get("t1") else None
            vid = r.get("video", "")
            at = f'{vid}#t={int(r.get("t0") or 0)}s' if vid else ""
            head = f'{r.get("label", "")}' + (f' · {mins} min' if mins else "")
            h.append(f'<div style="margin-top:8px;font-weight:600">{E(head)}' + (f' · <a href="{E(at)}" style="{LINK};font-weight:400">Watch</a>' if at else "") + "</div>")
            t.append(f"  {head}" + (f" (watch: {at})" if at else ""))
            presented, favor, against, motions = summarize_notes(r.get("notes", []))
            lines = []
            if presented:
                lines.append(presented[0])
            if favor:
                lines.append(f"{len(favor)} spoke in favor: " + "; ".join(re.sub(r",? spoke in (favor|support) of the bill\.?", "", x) for x in favor[:6]) + ("…" if len(favor) > 6 else ""))
            if against:
                lines.append(f"{len(against)} spoke against: " + "; ".join(re.sub(r",? spoke in (opposition|opposed) (of|to) the bill\.?", "", x) for x in against[:6]) + ("…" if len(against) > 6 else ""))
            for m in motions:
                if not re.search(r"adjourn", m, re.I):
                    lines.append(m)
            if r.get("status") == "nocap" and not lines:
                lines.append("The recording's transcript isn't ready yet; it usually appears within a day.")
            ags, seen_at = [], set()
            for ag in r.get("ag") or []:  # one quote per moment (a sentence can match twice)
                if ag[0] not in seen_at:
                    seen_at.add(ag[0]); ags.append(ag)
            for ag in ags[:2]:
                lines.append(f'Attorney General mentioned: "{ag[1]}"')
            if len(ags) > 2:
                lines.append(f'…and {len(ags) - 2} more Attorney General mention{"s" if len(ags) - 2 != 1 else ""} on the bill page.')
            h.append("<ul style=\"margin:4px 0 0;padding-left:18px\">" + "".join(f"<li>{E(x)}</li>" for x in lines) + "</ul>" if lines else "")
            t.extend(f"    - {x}" for x in lines)
        for v in votes:
            h.append(f'<div style="margin-top:6px"><b>Vote:</b> {E(v[1])} ({E(v[3])})</div>')
            t.append(f"  Vote: {v[1]} ({v[3]})")
        h.append("</div>")
        blocks_h.append("".join(h))
        blocks_t.append("\n".join(t))
    n = len(items)
    if brief:
        blocks_t = ["\n".join(blocks_t)]
    intro = f'<p style="margin:0 0 4px">How today\'s committee and floor discussion went for {n} bill{"s" if n != 1 else ""}, from the meeting timelines and transcripts. Open a bill to read the full transcript.</p>'
    h, t = wrap(f"End of day · {day_label(now)}", intro, "".join(blocks_h), sub["token"])
    return (f"Deseret Docket recap: {n} bill{'s' if n != 1 else ''} discussed today", h, f"Deseret Docket — end of day, {day_label(now)}\n\n" + "\n\n".join(blocks_t) + t)


# ---------------------------------------------------------------- sending
def send(msg, sub, dry):
    subject, h, text = msg
    unsub = f"{SITE}/api/email/unsubscribe?t={sub['token']}"
    if dry:
        os.makedirs(dry, exist_ok=True)
        safe = re.sub(r"[^a-z0-9]+", "-", f"{sub['email']}-{subject}".lower())[:90]
        open(os.path.join(dry, safe + ".html"), "w").write(f"<!-- {subject} -->\n{h}")
        print(f"  [dry run] {sub['email']}: {subject}")
        return True
    payload = {"from": os.environ["EMAIL_FROM"], "to": [sub["email"]], "subject": subject, "html": h, "text": text,
               "headers": {"List-Unsubscribe": f"<{unsub}>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"}}
    for i in range(3):
        try:
            http_json("https://api.resend.com/emails", payload, {"Authorization": f"Bearer {os.environ['RESEND_API_KEY']}"})
            time.sleep(0.6)  # Resend allows a couple of requests per second
            print(f"  sent to {sub['email']}: {subject}")
            return True
        except urllib.error.HTTPError as e:
            msg_ = e.read().decode("utf-8", "replace")[:300]
            print(f"  Resend {e.code} for {sub['email']}: {msg_}", file=sys.stderr)
            if e.code == 429:
                time.sleep(2 * (i + 1)); continue
            return False
        except Exception as e:
            print(f"  send failed for {sub['email']}: {e}", file=sys.stderr)
            time.sleep(2)
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", metavar="DIR", help="write the emails as .html files in DIR instead of sending")
    ap.add_argument("--subs", help="read subscribers from this JSON file instead of the site (for testing)")
    ap.add_argument("--now", help="pretend it's this Mountain time, e.g. 2026-02-18T07:10 (for testing)")
    ap.add_argument("--force", action="store_true", help="ignore the chosen hour and what was already sent today")
    a = ap.parse_args()

    now = datetime.fromisoformat(a.now).replace(tzinfo=MT) if a.now else datetime.now(MT)
    today = now.strftime("%Y-%m-%d")
    js_day = (now.weekday() + 1) % 7  # the page stores days as 0 = Sunday

    if a.subs:
        subs = json.load(open(a.subs))
    else:
        subs = http_json(f"{SITE}/api/email/cron/subs", headers={"Authorization": f"Bearer {os.environ['CRON_SECRET']}"})["subs"]
    print(f"{len(subs)} subscriber{'s' if len(subs) != 1 else ''}; it's {now.strftime('%a %Y-%m-%d %H:%M')} Mountain")
    if not subs:
        return
    data = Data(DATA)
    newest_file = max((f[4] for f in data.files if f[4] != "base"), default="")
    updates = []

    for sub in subs:
        st = sub["settings"]
        up = {"id": sub["id"]}
        # main email at the chosen hour
        hour = int(st.get("hour", 7))
        if a.force or (hour <= now.hour < hour + LATEST_HOUR_OFFSET and sub.get("last_main") != today):
            msg, new_files = build_main(data, sub, now, js_day in (st.get("days") or []))
            ok = send(msg, sub, a.dry_run) if msg else True
            if ok:
                up["last_main"] = today
                if new_files:
                    up["files_seen"] = newest_file
        # end-of-day recap; if nothing yet at 6 pm, keep checking until 10 pm (the 7:40 pm update adds more)
        if st.get("recap") and (a.force or (RECAP_HOUR <= now.hour < RECAP_HOUR + 4 and sub.get("last_recap") != today)):
            msg = build_recap(data, sub, now)
            if msg and send(msg, sub, a.dry_run):
                up["last_recap"] = today
        if len(up) > 1:
            updates.append(up)

    if updates and not a.subs:
        r = http_json(f"{SITE}/api/email/cron/sent", {"updates": updates}, {"Authorization": f"Bearer {os.environ['CRON_SECRET']}"})
        print(f"Recorded {r.get('updated', 0)} updates")
    elif updates:
        print("Would record:", json.dumps(updates))


if __name__ == "__main__":
    main()
