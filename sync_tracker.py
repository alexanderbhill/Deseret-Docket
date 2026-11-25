#!/usr/bin/env python3
"""Write Deseret Docket's office list into the shared bill tracker workbook (Excel on SharePoint/OneDrive).

Runs at the end of each weekday data update (.github/workflows/update.yml), so the workbook refreshes
four times a day, right after the Legislature data does.

  SITE_URL=https://deseret-docket.pages.dev CRON_KEY=... \
  MS_TENANT_ID=... MS_CLIENT_ID=... MS_CLIENT_SECRET=... python3 -I sync_tracker.py site/data

1. Asks the site (with CRON_KEY) for the workbook link the admin saved and the office's information on
   each bill.
2. Builds one row per bill from the bill data in site/data and that office information.
3. With a Microsoft 365 app registration (MS_* secrets, Microsoft Graph permission to edit the file),
   clears and rewrites ONE sheet of the workbook (default "Deseret Docket"). Other sheets are untouched.
4. Reports the result and a short preview back to the site for the Updates page. Without the MS_*
   secrets it still reports the preview, marked "not connected".
"""
import base64, json, os, sys, urllib.parse, urllib.request

GRAPH = "https://graph.microsoft.com/v1.0"


def http(method, url, body=None, headers=None, form=False, timeout=90):
    data = None
    h = dict(headers or {})
    if body is not None:
        if form:
            data = urllib.parse.urlencode(body).encode()
            h["Content-Type"] = "application/x-www-form-urlencoded"
        else:
            data = json.dumps(body).encode()
            h["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:400]
        try:
            detail = json.loads(detail).get("error", {}).get("message", detail)
        except Exception:
            pass
        raise RuntimeError(f"{e.code} {detail}") from None


def site_api(site, key, path, body=None):
    return http("POST" if body is not None else "GET", site.rstrip("/") + "/api/" + path, body,
                {"X-Cron-Key": key, "X-Docket": "1", "User-Agent": "deseret-docket-sync"})


def short_num(n):
    import re
    m = re.match(r"^([A-Z]+)0*(\d+)$", str(n or ""))
    return f"{m.group(1)} {m.group(2)}" if m else str(n or "")


def load_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def cpos_label(x, pos):
    """An association's position as the sheet should show it: its own wording when it has one."""
    if not x:
        return ""
    p = x.get("pos", "")
    if p == "tagged":
        return "X"
    return x.get("raw") or ("Hold" if p == "hold" else pos.get(p, p))


def build_rows(data_dir, cfg, office, config, site):
    index = load_json(os.path.join(data_dir, "index.json"), {"sessions": []})
    sessions = [s["id"] for s in index.get("sessions", [])]
    ses = cfg.get("session") or (sessions[0] if sessions else "")
    bills = load_json(os.path.join(data_dir, ses, "bills.json"), [])
    files = load_json(os.path.join(data_dir, ses, "files.json"), {}).get("files", [])
    off = {o["key"]: o for o in office}
    dept = {d["id"]: d["name"] for d in config.get("departments", [])}
    div = {d["id"]: d["name"] for d in config.get("divisions", [])}
    pos = {p["id"]: p["name"] for p in config.get("positions", [])}
    desig = config.get("designations", [])

    def on_office(o):
        return bool(o) and bool(o.get("departments") or o.get("divisions") or o.get("designations") or o.get("cpos")
                                or o.get("position") or o.get("assignees") or (o.get("priority") and o.get("priority") != "notrelevant"))

    head = ["Bill #", "Title", "Sponsor", "Position", "Department", "Division", *[d["name"] for d in desig],
            "Status / location", "Last action date", "Fiscal note", "AG office action", "Assigned to", "Notes", "General provisions", "Link"]
    rows, counts = [], {}
    items = [("bill", b) for b in bills] + [("file", f) for f in files]
    for kind, b in items:
        if kind == "bill":
            key = f"{ses}/{b['n']}"
            o = off.get(key) or (off.get(f"{ses}/F-{b.get('tid')}") if b.get("tid") else None)
        else:
            key = f"{ses}/F-{b['tid']}"
            o = off.get(key)
        if cfg.get("scope") != "all" and not on_office(o):
            continue
        o = o or {}
        cp = o.get("cpos") or {}
        fn = b.get("fn") if kind == "bill" else None
        fis = "" if kind == "file" else ("No fiscal note yet" if not fn else "No direct cost to the state" if fn.get("none") else (fn.get("u") or "Fiscal note posted"))
        p = pos.get(o.get("position") or "", "")
        counts[p or "No position"] = counts.get(p or "No position", 0) + 1
        link = f"{site.rstrip('/')}/#bill-{ses}-" + (b["n"] if kind == "bill" else f"F-{b['tid']}")
        rows.append([
            short_num(b["n"]) if kind == "bill" else "Bill file (not numbered)",
            b.get("t", ""),
            b.get("sp", ""),
            p,
            "; ".join(dept.get(x, x) for x in o.get("departments", [])),
            "; ".join(div.get(x, x) for x in o.get("divisions", [])),
            *[cpos_label(cp.get(d["id"]), pos) for d in desig],
            (f"{b.get('act', '')}{' — ' + b['own'] if b.get('own') else ''}" if kind == "bill" else b.get("st", "")),
            (b.get("date") or "")[:10] if kind == "bill" else "",
            fis,
            o.get("agAction", ""),
            "; ".join(o.get("assignees", [])),
            o.get("note", ""),
            b.get("gd", "") if kind == "bill" else "",
            link,
        ])
    rows.sort(key=lambda r: (r[0].startswith("Bill file"), r[0].split(" ")[0], int(r[0].split(" ")[1]) if r[0].split(" ")[-1].isdigit() else 0, r[1]))
    return ses, head, rows, counts


def col_letter(n):
    s = ""
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def graph_token():
    t, c, sec = os.environ.get("MS_TENANT_ID", ""), os.environ.get("MS_CLIENT_ID", ""), os.environ.get("MS_CLIENT_SECRET", "")
    if not (t and c and sec):
        return None
    j = http("POST", f"https://login.microsoftonline.com/{t}/oauth2/v2.0/token",
             {"client_id": c, "client_secret": sec, "scope": "https://graph.microsoft.com/.default", "grant_type": "client_credentials"}, form=True)
    return j["access_token"]


def write_workbook(token, share_url, sheet, head, rows):
    auth = {"Authorization": f"Bearer {token}"}
    share_id = "u!" + base64.urlsafe_b64encode(share_url.encode()).decode().rstrip("=")
    item = http("GET", f"{GRAPH}/shares/{share_id}/driveItem", headers=auth)
    base = f"{GRAPH}/drives/{item['parentReference']['driveId']}/items/{item['id']}/workbook"
    names = [w["name"] for w in http("GET", f"{base}/worksheets", headers=auth).get("value", [])]
    if sheet not in names:
        http("POST", f"{base}/worksheets/add", {"name": sheet}, auth)
    ws = f"{base}/worksheets('{urllib.parse.quote(sheet)}')"
    http("POST", f"{ws}/range(address='A1:{col_letter(40)}20000')/clear", {"applyTo": "Contents"}, auth)
    width = len(head)
    allrows = [head] + [[str(x) for x in r] for r in rows]
    for start in range(0, len(allrows), 400):
        chunk = allrows[start:start + 400]
        addr = f"A{start + 1}:{col_letter(width)}{start + len(chunk)}"
        http("PATCH", f"{ws}/range(address='{addr}')", {"values": chunk}, auth)
    try:
        http("PATCH", f"{ws}/range(address='A1:{col_letter(width)}1')/format/font", {"bold": True}, auth)
    except RuntimeError:
        pass


def main():
    data_dir = sys.argv[1] if len(sys.argv) > 1 else "site/data"
    site = os.environ.get("SITE_URL", "https://deseret-docket.pages.dev")
    key = os.environ.get("CRON_KEY", "")
    if not key:
        print("CRON_KEY isn't set; skipping the bill tracker sync.")
        return
    try:
        j = site_api(site, key, "cron/tracker")
    except Exception as e:
        print(f"Couldn't reach the site for the tracker settings: {e}")
        return
    cfg, office = j.get("cfg") or {}, j.get("office") or []
    config = load_json(os.path.join(os.path.dirname(data_dir.rstrip("/")) or ".", "config.json"), None) or load_json("site/config.json", {})
    ses, head, rows, counts = build_rows(data_dir, cfg, office, config, site)
    status = {"ok": False, "connected": False, "rows": len(rows), "session": ses, "head": head, "preview": rows[:6], "counts": counts, "error": ""}
    if not cfg.get("url"):
        status["error"] = "No workbook link saved on the Admin tab yet."
    else:
        try:
            token = graph_token()
            if token:
                status["connected"] = True
                write_workbook(token, cfg["url"], cfg.get("sheet") or "Deseret Docket", head, rows)
                status["ok"] = True
            else:
                status["error"] = "The Microsoft 365 connection (MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET) isn't set up yet."
        except Exception as e:
            status["error"] = str(e)[:380]
    print(f"Bill tracker: {len(rows)} rows for {ses}; " + ("written to the workbook." if status["ok"] else status["error"]))
    try:
        site_api(site, key, "cron/tracker-status", status)
    except Exception as e:
        print(f"Couldn't report the sync to the site: {e}")


if __name__ == "__main__":
    main()
