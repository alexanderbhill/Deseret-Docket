#!/usr/bin/env python3
""""You're up next": watch today's committee meetings and alert whoever is assigned to a bill when the
bill before theirs is taken up, so nobody has to sit through three hours waiting.

How it works, every few minutes during session days:
  1. Find today's committee hearings for bills in the published data (site/data).
  2. Ask the site which of those bills are assigned to someone (with their email).
  3. Read the agenda for the order of bills, and the meeting's live timeline on utleg.gov for which
     bills have been taken up so far.
  4. When the bill right before an assigned bill is up (or the assigned bill itself starts first),
     the site emails that person and shows a browser notification. Each alert is sent once.

Usage: python3 -I up_next.py    (env: SITE_URL, CRON_KEY, LEG_TOKEN)
"""
import json, os, re, sys, glob, urllib.request, html
from datetime import datetime
from zoneinfo import ZoneInfo

MT = ZoneInfo("America/Denver")
SITE = os.environ.get("SITE_URL", "https://deseret-docket.pages.dev").rstrip("/")
KEY = os.environ.get("CRON_KEY", "")
TOKEN = os.environ.get("LEG_TOKEN", "")
API = "https://glen.le.utah.gov"
ES = "https://www.utleg.gov/event-streaming"
HERE = os.path.dirname(os.path.abspath(__file__))


def get(url, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers={"User-Agent": "DeseretDocket/1.0", **(headers or {})})
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read()


def site(path, body):
    return json.loads(get(f"{SITE}/api/{path}", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "X-Cron-Key": KEY}))


def nums_in(text):
    """Bill numbers in the order they appear (H.B. 12, HB0012, S.B. 3 …)."""
    out = []
    for m in re.finditer(r"\b([HS])\.?\s?([BJCR])\.?\s?(R\.?\s?)?0*(\d{1,4})\b", text):
        pre = m.group(1) + m.group(2) + ("R" if m.group(3) else "")
        n = f"{pre}{int(m.group(4)):04d}"
        if n not in out:
            out.append(n)
    return out


def main():
    if not KEY:
        print("CRON_KEY isn't set; skipping."); return
    today = datetime.now(MT).strftime("%Y-%m-%d")
    meetings = {}  # agenda url -> {date, committee, bills, session}
    for path in glob.glob(os.path.join(HERE, "site", "data", "*", "bills.json")):
        session = os.path.basename(os.path.dirname(path))
        for b in json.load(open(path)):
            for a in b.get("ag", []):
                if (a.get("date") or "")[:10] == today and a.get("url"):
                    m = meetings.setdefault(a["url"], {"date": a["date"], "committee": a["committee"], "id": a.get("id"), "bills": [], "session": session})
                    m["bills"].append(b["n"])
    if not meetings:
        print("No committee hearings today."); return
    keys = [f"{m['session']}/{n}" for m in meetings.values() for n in m["bills"]]
    targets = site("cron/upnext-targets", {"keys": keys}).get("targets", {})
    sent = 0
    for url, m in meetings.items():
        assigned = {n: targets.get(f"{m['session']}/{n}") for n in m["bills"] if targets.get(f"{m['session']}/{n}")}
        if not assigned:
            continue
        try:
            order = [n for n in nums_in(html.unescape(re.sub(r"<[^>]+>", " ", get(url).decode("utf-8", "replace")))) if n in m["bills"]] or m["bills"]
        except Exception as e:
            print(f"  agenda {url}: {e}", file=sys.stderr); order = m["bills"]
        # The meeting's live timeline: find its marker page from any bill's details.
        marker = None
        for n in m["bills"]:
            try:
                d = json.loads(get(f"{API}/bills/{m['session']}/{n}/{TOKEN}"))
                for a in d.get("agendaList", []) or []:
                    if a.get("markerID") and str(a.get("mtgDate", ""))[:10] == today:
                        marker = f"{ES}/committee/marker/{a['markerID']}"; break
            except Exception:
                pass
            if marker:
                break
        if not marker:
            print(f"  {m['committee']}: no live timeline yet"); continue
        try:
            page = get(marker).decode("utf-8", "replace")
        except Exception as e:
            print(f"  timeline {marker}: {e}", file=sys.stderr); continue
        taken = []
        for mm in re.finditer(r'<button class="marker[^"]*"([^>]*)>[\s\S]*?<span class="description">([\s\S]*?)</span>', page):
            if re.search(r'data-type="(AI|bill)"', mm.group(1)):
                for n in nums_in(html.unescape(re.sub(r"<[^>]+>", " ", mm.group(2)))):
                    if n not in taken:
                        taken.append(n)
        for n, people in assigned.items():
            if n in taken and n not in order:
                continue
            i = order.index(n) if n in order else -1
            prev = order[i - 1] if i > 0 else None
            now_up = n in taken
            before_up = prev and prev in taken
            if not (now_up or before_up):
                continue
            short = re.sub(r"^([A-Z]+)0*", r"\1 ", n)
            if now_up:
                title, body, tag = f"{short} is being heard now in {m['committee']}", f"{m['committee']} has taken up {short}.", "now"
            else:
                title = f"You're up next: {short} in {m['committee']}"
                body = f"{re.sub(r'^([A-Z]+)0*', r'\1 ', prev)} is being heard now. {short} is next on the agenda."
                tag = "next"
            for p in people:
                r = site("cron/upnext-send", {"user": p["user"], "title": title, "body": body, "url": marker, "dedupe": f"{m.get('id') or url}|{n}|{p['user']}|{tag if tag == 'now' else 'next'}"})
                sent += r.get("sent", 0)
    print(f"{sent} alert(s) sent.")


if __name__ == "__main__":
    main()
