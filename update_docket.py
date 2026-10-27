#!/usr/bin/env python3
"""Deseret Docket updater.

Pulls bills from the Utah Legislature API (glen.le.utah.gov) and bill text from
le.utah.gov, then writes the data files the Deseret Docket page reads:

  data/index.json                 sessions + last-checked time
  data/<SESSION>/bills.json       one record per bill (status, history, hearings, docs, changes)
  data/<SESSION>/text-<k>.json    searchable bill text, chunked

Usage:
  python3 -I update_docket.py TOKEN OUT_DIR [--prev PREV_DIR] [--sessions 2027GS,2026GS]

PREV_DIR is the previously published data folder (the one holding index.json). Bills whose
update time has not changed are copied from it instead of re-downloaded, and differences
between PREV and the fresh data become entries on the Updates board.
"""
import argparse, json, os, re, sys, time, glob, urllib.request, concurrent.futures as cf
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

MT = ZoneInfo("America/Denver")
API = "https://glen.le.utah.gov"
LE = "https://le.utah.gov"
CHUNK_BYTES = 3_000_000
KEEP_CHANGES_DAYS = 45


def get(url, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "DeseretDocket/1.0"})
            with urllib.request.urlopen(req, timeout=90) as r:
                return r.read()
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(2 * (i + 1))


# ---------------------------------------------------------------- text parsing
STRUCK_OPEN, STRUCK_CLOSE = "\u0001", "\u0002"


def runs(el, skip_sub=True):
    """Text of el (excluding nested subsections), marking struck text."""
    out = []

    def walk(e, struck):
        tag = e.tag
        s = struck or (tag == "amend" and e.get("style") == "2")
        if tag == "display":
            pass  # label, handled separately
        elif skip_sub and tag == "subsection" and e is not el:
            return  # child subsection: its tail is handled by the caller loop
        else:
            if tag in ("hl", "para", "cell", "row", "tbl"):
                out.append((" ", False))
            if e.text:
                out.append((e.text, s))
        for c in e:
            walk(c, s)
            if c.tail:
                out.append((c.tail, struck or (tag == "amend" and e.get("style") == "2")))
    walk(el, False)
    txt = ""
    for t, s in out:
        t = t.replace("\n", " ")
        txt += (STRUCK_OPEN + t + STRUCK_CLOSE) if s and t.strip() else t
    txt = re.sub(STRUCK_CLOSE + r"(\s*)" + STRUCK_OPEN, r"\1", txt)
    return re.sub(r"\s+", " ", txt).strip()


def parse_bill_xml(raw):
    s = raw.decode("utf-8", errors="replace")
    s = re.sub(r"^\s*<\?xml[^>]*\?>", "", s)
    try:
        root = ET.fromstring(s)
    except ET.ParseError:
        return []
    passages = []
    hp = root.find(".//hp")
    if hp is not None:
        t = runs(hp, skip_sub=False)
        if t:
            passages.append(["Highlighted provisions", t, ""])
    for sec in root.iter("section"):
        num = sec.get("number") or ""
        cat = sec.find("catline")
        cat_txt = re.sub(r"\s+", " ", "".join(cat.itertext())).strip() if cat is not None else ""
        defs_section = "definition" in cat_txt.lower()
        base = f"Section {num}" if num else (cat_txt[:60] or "Uncodified section")

        def walk_sub(sub, labels):
            d = sub.find("display")
            lab = (d.text or "").strip() if d is not None else ""
            path = labels + ([lab] if lab else [])
            t = runs(sub)
            if t:
                in_def = defs_section or bool(re.search(r'"[^"]{1,80}"\s+(means|includes)\b', t))
                where = base + (" > Subsection " + "".join(path) if path else "")
                passages.append([where, t, "d" if in_def else ""])
            for c in sub.findall("subsection"):
                walk_sub(c, path)

        if cat_txt:
            passages.append([base, cat_txt, "d" if defs_section else ""])
        nested = {id(c) for sub in sec.iter("subsection") for c in sub.iter("subsection") if c is not sub}
        subs = [x for x in sec.iter("subsection") if id(x) not in nested]
        if subs:
            for sub in subs:
                walk_sub(sub, [])
        else:
            st = sec.find("sectionText")
            t = runs(st if st is not None else sec, skip_sub=False)
            if cat_txt and t.startswith(cat_txt):
                t = t[len(cat_txt):].strip()
            if t:
                passages.append([base, t, "d" if defs_section else ""])
    return passages


# ---------------------------------------------------------------- bill records
def fmt_date(s):
    """'2026-03-06 13:01:19.573' -> '2026-03-06T13:01'"""
    if not s:
        return ""
    m = re.match(r"(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})", s)
    if m:
        return f"{m.group(1)}T{m.group(2)}"
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})", s)
    if m:
        return f"{m.group(3)}-{int(m.group(1)):02d}-{int(m.group(2)):02d}T00:00"
    return s


def versions_of(d):
    vers = []
    for v in d.get("billVersionList", []):
        sub = int(v.get("subVersion") or 0)
        docs = v.get("billDocs", [])
        for doc in docs:
            ft, fn = doc.get("fileType"), doc.get("fileName", "")
            if not fn.lower().endswith(".xml"):
                continue
            if ft == "Introduced":
                name = "Introduced"
            elif ft == "PubSub":
                name = f"Substitute #{sub}"
            elif ft == "Enrolled":
                name = "Enrolled"
            elif ft == "Amended":
                base = f"Substitute #{sub}" if sub else "Introduced"
                dt = fmt_date(doc.get("fileDate"))
                name = f"{base} as amended {int(dt[5:7])}/{int(dt[8:10])}/{dt[:4]}" if dt else f"{base} as amended"
            else:
                continue
            url = doc.get("url", "")
            if url.startswith("/"):
                url = LE + url
            vers.append({"name": name, "date": fmt_date(doc.get("fileDate")), "url": url})
    vers.sort(key=lambda x: x["date"])
    return vers


def docs_of(d):
    groups = []
    for v in d.get("billVersionList", []):
        sub = int(v.get("subVersion") or 0)
        label = f"Substitute #{sub}" if sub else "Introduced"
        if v.get("hasEnrolled"):
            label = "Enrolled" if not sub else label
        items = []
        for doc in v.get("billDocs", []):
            url = doc.get("url", "")
            if url.startswith("/"):
                url = LE + url
            fn = doc.get("fileName", "")
            ext = fn.rsplit(".", 1)[-1].upper() if "." in fn else ("PDF" if url.lower().endswith(".pdf") else "")
            items.append([f"{doc.get('shortDesc', doc.get('fileType', 'Document'))} {ext}".strip(), fmt_date(doc.get("fileDate")), url])
        items.sort(key=lambda x: x[1])
        groups.append([label, items])
    groups.sort(key=lambda g: g[1][0][1] if g[1] else "", reverse=True)
    return groups


def record_of(d, upd):
    vers = versions_of(d)
    label = vers[-1]["name"] if vers else ""
    hist = [[fmt_date(a.get("actionDate")), a.get("description", ""), a.get("owner", ""), a.get("voteStr", "") or ""]
            for a in d.get("actionHistoryList", [])]
    hist.sort(key=lambda h: h[0], reverse=True)
    ag = []
    for a in d.get("agendaList", []) or []:
        url = a.get("agendaURL", "")
        if url.startswith("/"):
            url = LE + url
        ag.append({"id": a.get("mtgID"), "date": fmt_date(a.get("mtgDate")), "committee": a.get("committeeName", ""),
                   "place": a.get("mtgPlace", ""), "url": url})
    secs = sorted({s.get("secNo") for v in d.get("billVersionList", []) for s in v.get("sectionAffectedList", []) if s.get("secNo")})
    subjects = sorted({s.get("description") for v in d.get("billVersionList", []) for s in v.get("subjectList", []) if s.get("description")})
    return {
        "n": d.get("billNumber"), "t": d.get("shortTitle", ""), "sp": d.get("primeSponsorName", ""),
        "fl": d.get("floorSponsorName", "") or "", "ver": label,
        "act": d.get("lastAction", ""), "own": d.get("lastActionOwner", ""), "date": fmt_date(d.get("lastActionDate")),
        "gd": d.get("generalProvisions", "") or "", "hist": hist,
        "vers": [[v["name"], v["date"]] for v in vers], "docs": docs_of(d), "ag": ag, "secs": secs, "subj": subjects,
        "upd": upd, "ch": [], "mk": markers_of(d),
    }


# ---------------------------------------------------------------- meeting video transcripts
# Committee and floor video pages on utleg.gov list timeline markers (agenda items, speakers,
# motions) and embed a Vimeo recording that has auto-generated captions. For each bill we cut
# the captions to the bill's part of the meeting and look for mentions of the Attorney General.
import html as _html
ES = "https://www.utleg.gov/event-streaming"
AG_RE = re.compile(
    r"\b(?:(?:assistant|deputy|chief deputy|solicitor)\s+)?attorney\s*-?\s*general(?:'s)?(?:\s+office)?\b"
    r"|\bAG'?s\s+office\b|\bthe\s+A\.?\s?G\.?(?!\s*(?:land|lands|side|sector|community|department|dept|systems?|business|committees?|leasing|optimization|advisory|wildlife|resources?|industry|producers?|water|operations?|uses?|commissioner|interests?|exemptions?|economy|areas?|groups?|world|folks|people|loans?|programs?|board|lobby|organizations?)\b)(?=[\s,.;:!?]|$)|\bA\.G\.(?=\s)|\bsolicitor\s+general\b|\boffice\s+of\s+the\s+attorney\b",
    re.I)
MARKER_RE = re.compile(r'<button class="marker[^"]*"(?P<attrs>[^>]*)>[\s\S]*?<span class="description">(?P<desc>[\s\S]*?)</span>')
ATTR_RE = re.compile(r'data-([a-z]+)="([^"]*)"')
BILL_TYPES = {"AI", "bill"}
NOTE_TYPES = {"speaker", "motion", "freetext", "vote"}
END_TYPES = BILL_TYPES | {"marker"}
_page_cache, _video_cache = {}, {}


def bill_patterns(num):
    m = re.match(r"([A-Z]+)0*(\d+)$", num)
    if not m:
        return [re.escape(num)]
    pre, n = m.group(1), m.group(2)
    dotted = r"\.?\s?".join(pre)  # H.B. / HB / H B
    return [rf"\b{dotted}\.?\s*0*{n}(?!\d)"]


def page_markers(url):
    if url in _page_cache:
        return _page_cache[url]
    try:
        s = get(url).decode("utf-8", "replace")
    except Exception:
        _page_cache[url] = None
        return None
    out = []
    for m in MARKER_RE.finditer(s):
        a = dict(ATTR_RE.findall(m.group("attrs")))
        desc = re.sub(r"\s+", " ", _html.unescape(re.sub(r"<[^>]+>", "", m.group("desc")))).strip()
        try:
            off = int(float(a.get("offset", "0")))
        except ValueError:
            off = 0
        out.append({"type": a.get("type", ""), "off": off, "video": a.get("vodurl", ""), "tl": a.get("timelineid", ""), "desc": desc})
    _page_cache[url] = out
    return out


def video_cues(vod):
    """Return (duration, [(start_sec, text)]) for a Vimeo player URL, or (None, None) if no captions."""
    if vod in _video_cache:
        return _video_cache[vod]
    res = (None, None)
    m = re.search(r"/video/(\d+)(?:\?h=([0-9a-f]+))?", vod)
    if m:
        vid, h = m.group(1), m.group(2)
        cfg_url = f"https://player.vimeo.com/video/{vid}/config" + (f"?h={h}" if h else "")
        try:
            req = urllib.request.Request(cfg_url, headers={"User-Agent": "Mozilla/5.0 DeseretDocket/1.0", "Referer": "https://www.utleg.gov/"})
            with urllib.request.urlopen(req, timeout=60) as r:
                cfg = json.loads(r.read())
            dur = cfg.get("video", {}).get("duration")
            tracks = cfg.get("request", {}).get("text_tracks") or []
            tracks.sort(key=lambda t: (not t.get("lang", "").startswith("en"), "autogen" in t.get("lang", "")))
            if tracks:
                vtt = get(tracks[0]["url"]).decode("utf-8", "replace")
                cues = []
                for block in re.split(r"\n\s*\n", vtt):
                    tm = re.search(r"(\d+):(\d{2}):(\d{2})[.,]\d+\s+-->", block)
                    if not tm:
                        continue
                    sec = int(tm.group(1)) * 3600 + int(tm.group(2)) * 60 + int(tm.group(3))
                    lines = block.split("\n")
                    idx = next(i for i, l in enumerate(lines) if "-->" in l)
                    t = re.sub(r"<[^>]+>", "", " ".join(lines[idx + 1:])).strip()
                    if t:
                        cues.append((sec, t))
                res = (dur, cues)
            else:
                res = (dur, None)
        except Exception as e:
            print(f"  video {vid}: {e}", file=sys.stderr)
    _video_cache[vod] = res
    return res


def ag_hits(lines):
    ag = []
    for s, t in lines:
        for m in AG_RE.finditer(t):
            a, z = max(0, m.start() - 160), min(len(t), m.end() + 160)
            ag.append([s, ("…" if a else "") + t[a:z].strip() + ("…" if z < len(t) else ""), m.group(0)])
    return ag


def fmt_clock(sec):
    h, r = divmod(int(sec), 3600)
    m, s = divmod(r, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def transcript_for(num, kind, marker_id, label, date):
    """Discussion records for a bill at one meeting page: a list of (record, transcript_lines).
    A floor page can hold the same bill more than once (2nd and 3rd reading), so every match is returned."""
    url = f"{ES}/{'committee/timeline' if kind == 'committee' else 'floor/marker'}/{marker_id}"
    base = {"mid": str(marker_id), "kind": kind, "label": label, "date": date, "page": url}
    marks = page_markers(url)
    if not marks:
        return [({**base, "status": "nomarker"}, None)]
    pats = [re.compile(p, re.I) for p in bill_patterns(num)]
    hits = [i for i, m in enumerate(marks) if m["tl"] == str(marker_id)]
    if not hits:
        hits = [i for i, m in enumerate(marks) if m["type"] in BILL_TYPES and any(p.search(m["desc"]) for p in pats)]
    if not hits:
        return [({**base, "status": "nomarker"}, None)]
    out = []
    for idx in hits:
        start = marks[idx]
        vod = start["video"]
        end, notes = None, []
        for m in marks[idx + 1:]:
            if m["video"] != vod or m["type"] == "recording":
                break
            if m["type"] in BILL_TYPES or (kind == "floor" and m["type"] in END_TYPES):
                end = m["off"]
                break
            if m["type"] in NOTE_TYPES and m["desc"]:
                notes.append([m["off"], m["type"], m["desc"]])
        vid = re.search(r"/video/(\d+)", vod)
        hh = re.search(r"[?&]h=([0-9a-f]+)", vod)
        vlink = (f"https://vimeo.com/{vid.group(1)}" + (f"/{hh.group(1)}" if hh else "")) if vid else ""
        rec = {**base, "item": start["desc"], "video": vlink, "vod": vod,
               "t0": start["off"], "t1": end, "notes": notes, "status": "nocap"}
        dur, cues = video_cues(vod)
        if end is None and dur:
            rec["t1"] = end = int(dur)
        if not cues:
            out.append((rec, None))
            continue
        seg = [(s, t) for s, t in cues if s >= start["off"] - 3 and (end is None or s < end + 3)]
        lines, cur_s, cur = [], None, []
        for s, t in seg:
            if cur_s is None:
                cur_s = s
            cur.append(t)
            if s - cur_s >= 20 or (t.endswith((".", "?", "!")) and s - cur_s >= 10):
                lines.append([cur_s, " ".join(cur)]); cur_s, cur = None, []
        if cur:
            lines.append([cur_s, " ".join(cur)])
        ag = ag_hits(lines)
        rec.update({"status": "ok", "ag": ag, "words": sum(len(t.split()) for _, t in lines)})
        out.append((rec, lines))
    return out


def markers_of(d):
    out = []
    for a in d.get("agendaList", []) or []:
        if a.get("markerID"):
            out.append(["committee", str(a["markerID"]), fmt_date(a.get("mtgDate")), a.get("committeeName", "")])
    for f in d.get("floorDebateList", []) or []:
        if f.get("markerID"):
            house = {"H": "House", "S": "Senate"}.get(f.get("house"), f.get("house", ""))
            out.append(["floor", str(f["markerID"]), fmt_date(f.get("sessionDate")), f"{house} floor, day {f.get('dayOfSession', '')}".strip()])
    return out


# ---------------------------------------------------------------- change detection
def human_dt(iso):
    try:
        dt = datetime.fromisoformat(iso)
        h = dt.hour % 12 or 12
        ap = "am" if dt.hour < 12 else "pm"
        return f"{dt.strftime('%a')}, {dt.strftime('%b')} {dt.day} at {h}:{dt.minute:02d} {ap}"
    except Exception:
        return iso


def diff(old, new, stamp):
    out = []
    if old is None:
        return out
    old_ag = {a["id"] for a in old.get("ag", [])}
    for a in new.get("ag", []):
        if a["id"] not in old_ag:
            out.append([stamp, "New hearing", f"Placed on the {a['committee']} agenda for {human_dt(a['date'])} ({a['place']})."])
    old_v = {v[0] for v in old.get("vers", [])}
    for v in new.get("vers", []):
        if v[0] not in old_v:
            kind = "Enrolled" if v[0] == "Enrolled" else ("New substitute" if v[0].startswith("Substitute") and "amended" not in v[0] else "Amended")
            out.append([stamp, kind, f"{v[0]} released."])
    if old.get("own") != new.get("own") and new.get("own"):
        out.append([stamp, "Moved", f"Now with {new['own']} ({new['act']})."])
    elif old.get("act") != new.get("act") and new.get("act"):
        out.append([stamp, "New action", new["act"]])
    old_docs = {i[2] for g in old.get("docs", []) for i in g[1]}
    new_vers_urls = set()
    for g in new.get("docs", []):
        for i in g[1]:
            if i[2] not in old_docs and not i[0].lower().endswith("xml"):
                out.append([stamp, "New document", f"{i[0]} ({g[0]})."])
    return out


# ---------------------------------------------------------------- main
def load_prev(prev, session):
    if not prev:
        return {}, {}
    p = os.path.join(prev, session, "bills.json")
    if not os.path.exists(p):
        return {}, {}
    bills = {b["n"]: b for b in json.load(open(p))}
    text = {}
    for f in sorted(glob.glob(os.path.join(prev, session, "text-*.json"))):
        text.update(json.load(open(f)))
    return bills, text


def load_prev_tx(prev, session):
    tx = {}
    if prev:
        for f in sorted(glob.glob(os.path.join(prev, session, "tx-*.json"))):
            tx.update(json.load(open(f)))
    return tx


RETRY_NOCAP_DAYS = 21


def discussions_for(rec, old_tx_recs, old_lines, stamp):
    """Update rec["tx"] (summaries) and return (lines_by_key, new_changes)."""
    keep, lines_by_key, changes = [], {}, []
    old_by_mid = {}
    for t in old_tx_recs or []:
        old_by_mid.setdefault(t["mid"], []).append(t)
    cutoff = (datetime.now(MT) - timedelta(days=RETRY_NOCAP_DAYS)).isoformat()[:10]
    seen = set()
    for kind, mid, date, label in rec.get("mk", []):
        olds = old_by_mid.get(mid)
        redo = not olds or any(t["status"] == "nocap" and (t.get("date") or "")[:10] >= cutoff for t in olds) \
            or (all(t["status"] == "nomarker" for t in olds) and (date or "")[:10] >= cutoff)
        if not redo:
            for t in olds:
                k = (t.get("vod"), t.get("t0"))
                if t["status"] != "nomarker" and k in seen:
                    continue
                seen.add(k); keep.append(t)
                if t.get("key") in old_lines:
                    lines_by_key[t["key"]] = old_lines[t["key"]]
                    t["ag"] = ag_hits(old_lines[t["key"]])
            continue
        try:
            results = transcript_for(rec["n"], kind, mid, label, date)
        except Exception as e:
            print(f"  transcript {rec['n']} {mid}: {e}", file=sys.stderr)
            keep.extend(olds or []); continue
        # merge back-to-back segments of the same bill (e.g. 1st sub then 2nd sub on the floor)
        merged = []
        for r, ln in results:
            if merged and r["status"] == "ok" and merged[-1][0]["status"] == "ok" and merged[-1][0]["vod"] == r["vod"] and merged[-1][0]["t1"] == r["t0"]:
                m0, l0 = merged[-1]
                m0["t1"] = r["t1"]; m0["notes"] += r["notes"]; m0["ag"] += r["ag"]; m0["words"] += r["words"]
                merged[-1] = (m0, (l0 or []) + (ln or []))
            else:
                merged.append((r, ln))
        for r, ln in merged:
            k = (r.get("vod"), r.get("t0"))
            if r["status"] != "nomarker" and k in seen:
                continue
            seen.add(k)
            r["key"] = f"{mid}-{r.get('t0', 0)}"
            keep.append(r)
            if ln:
                lines_by_key[r["key"]] = ln
            was_ok = any(t["status"] == "ok" and t.get("t0") == r.get("t0") for t in (olds or []))
            if r["status"] == "ok" and not was_ok and old_tx_recs is not None:
                mins = max(1, round(((r.get("t1") or r["t0"]) - r["t0"]) / 60))
                changes.append([stamp, "Discussed", f"{label} ({date[:10]}): {mins} min of discussion transcribed."])
                if r["ag"]:
                    changes.append([stamp, "AG mentioned", f"The Attorney General came up {len(r['ag'])} time{'s' if len(r['ag']) != 1 else ''} during {label} ({date[:10]})."])
    keep.sort(key=lambda t: (t.get("date") or "", t.get("t0") or 0))
    rec["tx"] = keep
    rec["agm"] = sum(len(t.get("ag", [])) for t in keep)
    return lines_by_key, changes


def text_url(d):
    vers = versions_of(d)
    return vers[-1]["url"] if vers else None


def build_session(token, session, out, prev, stamp):
    bl = json.loads(get(f"{API}/bills/{session}/billlist/{token}"))
    old_bills, old_text = load_prev(prev, session)
    todo, bills, text = [], {}, {}
    for b in bl:
        n, upd = b["number"], b.get("updatetime", "")
        ob = old_bills.get(n)
        if ob and ob.get("upd") == upd and n in old_text and "mk" in ob:
            bills[n] = ob
            text[n] = old_text[n]
        else:
            todo.append((n, upd))

    def fetch(item):
        n, upd = item
        d = json.loads(get(f"{API}/bills/{session}/{n}/{token}"))
        rec = record_of(d, upd)
        url = text_url(d)
        passages = []
        if url:
            try:
                passages = parse_bill_xml(get(url))
            except Exception as e:
                print(f"  text failed for {n}: {e}", file=sys.stderr)
        return n, rec, passages

    fetched = 0
    with cf.ThreadPoolExecutor(8) as ex:
        for n, rec, passages in ex.map(fetch, todo):
            ob = old_bills.get(n)
            keep = [c for c in (ob or {}).get("ch", []) if c[0] >= (datetime.now(MT) - timedelta(days=KEEP_CHANGES_DAYS)).isoformat()[:16]]
            rec["ch"] = keep + diff(ob, rec, stamp)
            bills[n] = rec
            text[n] = passages
            fetched += 1

    # ---- meeting transcripts
    old_tx = load_prev_tx(prev, session)
    tx_lines = {}
    def do_tx(n):
        rec = bills[n]
        ob = old_bills.get(n)
        return n, discussions_for(rec, (ob or {}).get("tx") if ob else None, old_tx.get(n, {}), stamp)
    t_start = time.time()
    with cf.ThreadPoolExecutor(6) as ex:
        for n, (lines, ch) in ex.map(do_tx, sorted(bills)):
            tx_lines[n] = lines
            if ch:
                bills[n]["ch"] = bills[n].get("ch", []) + ch
    print(f"  transcripts: {sum(len(v) for v in tx_lines.values())} segments in {round(time.time() - t_start)} s", file=sys.stderr)

    order = sorted(bills)
    os.makedirs(os.path.join(out, session), exist_ok=True)
    for f in glob.glob(os.path.join(out, session, "text-*.json")) + glob.glob(os.path.join(out, session, "tx-*.json")):
        os.remove(f)
    # transcript chunks; each bill records which chunk holds its transcript
    tchunks, cur, size = [], {}, 0
    for n in order:
        if not tx_lines.get(n):
            bills[n].pop("txc", None); continue
        blob = len(json.dumps(tx_lines[n], separators=(",", ":")))
        if cur and size + blob > CHUNK_BYTES:
            tchunks.append(cur); cur, size = {}, 0
        cur[n] = dict(sorted(tx_lines[n].items())); size += blob; bills[n]["txc"] = len(tchunks)
    if cur:
        tchunks.append(cur)
    for i, c in enumerate(tchunks):
        json.dump(c, open(os.path.join(out, session, f"tx-{i}.json"), "w"), separators=(",", ":"))
    json.dump([bills[n] for n in order], open(os.path.join(out, session, "bills.json"), "w"), separators=(",", ":"))
    chunks, cur, size = [], {}, 0
    for n in order:
        blob = json.dumps(text.get(n, []), separators=(",", ":"))
        if cur and size + len(blob) > CHUNK_BYTES:
            chunks.append(cur); cur, size = {}, 0
        cur[n] = text.get(n, []); size += len(blob)
    if cur:
        chunks.append(cur)
    for i, c in enumerate(chunks):
        json.dump(c, open(os.path.join(out, session, f"text-{i}.json"), "w"), separators=(",", ":"))
    changes = sum(1 for n in order for c in bills[n]["ch"] if c[0] == stamp)
    print(f"{session}: {len(bl)} bills, {fetched} downloaded, {len(chunks)} text files, {len(tchunks)} transcript files, {changes} new changes")
    return {"id": session, "count": len(bl), "textFiles": len(chunks), "txFiles": len(tchunks)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("token"); ap.add_argument("out")
    ap.add_argument("--prev"); ap.add_argument("--sessions", default="2027GS,2026GS")
    a = ap.parse_args()
    stamp = datetime.now(MT).isoformat()[:16]
    sessions = [build_session(a.token, s.strip(), a.out, a.prev, stamp) for s in a.sessions.split(",") if s.strip()]
    json.dump({"updated": datetime.now(MT).isoformat(timespec="minutes"), "sessions": sessions},
              open(os.path.join(a.out, "index.json"), "w"), indent=1)
    # list which published files changed, so a publish can send only those
    import hashlib
    def h(p):
        return hashlib.sha256(open(p, "rb").read()).hexdigest() if os.path.exists(p) else None
    new_files = sorted(os.path.relpath(f, a.out) for f in glob.glob(os.path.join(a.out, "**", "*.json"), recursive=True))
    old_files = sorted(os.path.relpath(f, a.prev) for f in glob.glob(os.path.join(a.prev, "**", "*.json"), recursive=True)) if a.prev else []
    changed = [f for f in new_files if f == "index.json" or h(os.path.join(a.out, f)) != (h(os.path.join(a.prev, f)) if a.prev else None)]
    removed = [f for f in old_files if f not in new_files]
    with open(os.path.join(a.out, "CHANGED.txt"), "w") as fh:
        fh.write("\n".join([f"data/{f}" for f in changed] + [f"REMOVE data/{f}" for f in removed]) + "\n")
    print(f"{len(changed)} data files changed, {len(removed)} removed (see CHANGED.txt)")


if __name__ == "__main__":
    main()
