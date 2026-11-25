#!/usr/bin/env python3
"""Interim study items: what the Legislature chose to study between sessions, by interim committee.

Reads the year's "Approved Interim Study Items" PDF (its link lives in site/config.json under
interimStudyItems, one per year; add next year's when the Legislative Management Committee approves it,
usually in April) and writes site/data/interim.json, which Outreach → Interim shows under each committee.

  python3 -I build_interim.py new-data --prev site/data

Runs at the end of each data update but only downloads and re-reads the PDF when the link changes;
otherwise it copies last run's file forward. Needs pdfplumber (pip install pdfplumber).
"""
import json, os, re, shutil, sys, urllib.request

NUM = re.compile(r"\d{1,2}")
PUA = re.compile(r"[-•]")


def lines_of(words):
    rows = {}
    for w in words:
        rows.setdefault(round(w["top"] / 3), []).append(w)
    out = []
    for k in sorted(rows):
        ws = sorted(rows[k], key=lambda w: w["x0"])
        segs, cur = [], [ws[0]]
        for w in ws[1:]:
            if w["x0"] - cur[-1]["x1"] > 10:
                segs.append(cur)
                cur = [w]
            else:
                cur.append(w)
        segs.append(cur)
        out.append({"top": min(w["top"] for w in ws), "segs": [{"x0": s[0]["x0"], "t": " ".join(x["text"] for x in s), "w": s} for s in segs]})
    return out


def parse(path, names):
    """Each committee's section: a heading with its name, then a table of numbered items (title, description)."""
    import pdfplumber
    pdf = pdfplumber.open(path)
    res, com, descx = {}, None, None
    for p in pdf.pages:
        L = [l for l in lines_of(p.extract_words()) if "Utah State Legislature |" not in " ".join(s["t"] for s in l["segs"])]
        toc = any("Table of Contents" in " ".join(s["t"] for s in x["segs"]) for x in L)
        for l in L:
            t = " ".join(s["t"] for s in l["segs"]).strip()
            if t in names and not toc:
                com = t
                res.setdefault(com, [])
            if l["segs"][0]["t"] in ("Item", "Study Item") and len(l["segs"]) > 1 and l["segs"][-1]["t"].startswith("Description"):
                descx = l["segs"][-1]["x0"]
        if not com or descx is None:
            continue
        # Table rows: every rectangle or rule taller than a line marks a row's top and bottom.
        spans = [(r["top"], r["bottom"]) for r in list(p.rects) + list(p.lines) if r["bottom"] - r["top"] > 20]
        items = []
        for l in L:
            s0 = l["segs"][0]
            if NUM.fullmatch(s0["t"]) and s0["x0"] < descx - 60:
                cy = l["top"] + 4
                c = [sp for sp in spans if sp[0] - 2 <= cy <= sp[1] + 2]
                items.append({"n": int(s0["t"]), "sp": min(c, key=lambda s: s[1] - s[0]) if c else (cy - 30, cy + 30), "lines": []})
        for l in L:
            it = next((x for x in items if x["sp"][0] - 3 <= l["top"] <= x["sp"][1] - 2), None)
            if it:
                it["lines"].append(l)
        for it in items:
            segs = [[s for s in l["segs"] if not (NUM.fullmatch(s["t"]) and s["x0"] < descx - 60) and not s["t"].startswith("Topic:")] for l in it["lines"]]
            two = [ss[-1]["x0"] for ss in segs if len(ss) >= 2]
            starts = sorted(two + [s["x0"] for ss in segs for s in ss if len(s["t"]) > 38])  # description lines are long
            tcol = min((s["x0"] for ss in segs for s in ss), default=0)  # where the title column starts
            starts = [x for x in starts if x > tcol + 30]
            dx = starts[0] if starts else descx - 25
            title, desc = [], []
            for ss in segs:
                for s in ss:
                    # the title column is narrow, so a long run of words is description even if it starts a little left;
                    # otherwise each word goes by where it sits (a title and a description line can run together)
                    ws = s["w"]
                    first = next((i for i, w in enumerate(ws) if w["x0"] >= dx - 8), len(ws))
                    # words snug against the first description word are the start of that description line
                    while 0 < first < len(ws) and ws[first]["x0"] - ws[first - 1]["x1"] < 5 and (ws[first - 1]["text"][:1].islower() or ws[first - 1]["text"][-1:] in ",;"):
                        first -= 1
                    title += [w["text"] for w in ws[:first]]
                    desc += [w["text"] for w in ws[first:]]
            ti = re.sub(r"(\w)- (\w)", r"\1-\2", PUA.sub(" ", " ".join(title))).strip()
            de = re.sub(r"\s+", " ", PUA.sub(" ", " ".join(desc))).strip()
            ti = re.sub(r"\s+", " ", ti)
            if (ti or de) and not any(x["title"] == ti and x["desc"] == de for x in res[com]):
                res[com].append({"n": it["n"], "title": ti, "desc": de})
    return res


def main():
    out, prev = sys.argv[1], sys.argv[sys.argv.index("--prev") + 1] if "--prev" in sys.argv else None
    root = os.path.dirname(os.path.abspath(__file__))
    cfg = json.load(open(os.path.join(root, "site", "config.json"), encoding="utf-8"))
    src = cfg.get("interimStudyItems") or {}
    if not src:
        return
    year = max(src)
    want = src[year]
    url = want["url"] if isinstance(want, dict) else want
    old = os.path.join(prev, "interim.json") if prev else None
    dest = os.path.join(out, "interim.json")
    if old and os.path.exists(old):
        try:
            o = json.load(open(old, encoding="utf-8"))
            if o.get("source") == url:
                if os.path.abspath(old) != os.path.abspath(dest):
                    shutil.copy(old, dest)
                print("Interim study items: unchanged")
                return
        except Exception:
            pass
    coms = json.load(open(os.path.join(prev or out, "committees.json"), encoding="utf-8"))
    coms = coms if isinstance(coms, list) else coms.get("committees", [])
    byname = {c["name"].replace(" Interim Committee", ""): c["id"] for c in coms if "Interim Committee" in c["name"]}
    tmp = os.path.join(out, "_studyitems.pdf")
    req = urllib.request.Request(url, headers={"User-Agent": "deseret-docket"})
    with urllib.request.urlopen(req, timeout=60) as r, open(tmp, "wb") as f:
        f.write(r.read())
    try:
        res = parse(tmp, set(byname))
    finally:
        os.remove(tmp)
    data = {"year": year, "source": url, "label": want.get("label", "") if isinstance(want, dict) else "",
            "committees": {byname[k]: v for k, v in res.items() if k in byname}}
    json.dump(data, open(dest, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"Interim study items: {sum(len(v) for v in data['committees'].values())} items for {len(data['committees'])} committees")


if __name__ == "__main__":
    main()
