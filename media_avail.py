#!/usr/bin/env python3
"""Analyze House and Senate media availabilities (streamed live on Facebook).

Picks up (1) any Facebook video links an admin pasted on the Daily Updates page and (2) new videos on
the Facebook pages in site/config.json ("mediaPages"). For each new recording it downloads the audio
(yt-dlp), transcribes it (faster-whisper, on the GitHub runner), then writes a summary with topics,
bills mentioned and notable quotes with who said them (Claude, when ANTHROPIC_API_KEY is set; otherwise
a plain extract). Results go to site/data/media-avail.json, which the Daily Updates page shows.

Usage: python3 media_avail.py [--url FACEBOOK_URL]   (env: SITE_URL, CRON_KEY, ANTHROPIC_API_KEY)
Facebook sometimes blocks automated downloads; when that happens the job says so on the site and an
admin can paste the link to try again.
"""
import argparse, json, os, re, subprocess, sys, tempfile, urllib.request
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

MT = ZoneInfo("America/Denver")
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "site", "data", "media-avail.json")
SITE = os.environ.get("SITE_URL", "https://deseret-docket.pages.dev").rstrip("/")
KEY = os.environ.get("CRON_KEY", "")
CONFIG = json.load(open(os.path.join(HERE, "site", "config.json")))


def http(url, data=None, headers=None, timeout=60):
    req = urllib.request.Request(url, data=data, headers={"User-Agent": "DeseretDocket/1.0", **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def site(path, body=None):
    if not KEY:
        return {}
    return json.loads(http(f"{SITE}/api/{path}", data=None if body is None else json.dumps(body).encode(), headers={"Content-Type": "application/json", "X-Cron-Key": KEY}))


def recent_page_videos():
    """New videos on the configured Facebook pages from the last day (best effort)."""
    out = []
    since = (datetime.now(MT) - timedelta(days=1)).strftime("%Y%m%d")
    for chamber, url in (CONFIG.get("mediaPages") or {}).items():
        if chamber.startswith("_"):
            continue
        try:
            r = subprocess.run(["yt-dlp", "--flat-playlist", "--playlist-end", "5", "--dateafter", since, "-J", url], capture_output=True, text=True, timeout=180)
            d = json.loads(r.stdout or "{}")
            for e in d.get("entries", []) or []:
                u = e.get("url") or e.get("webpage_url")
                if u:
                    out.append({"url": u, "label": f"{chamber.title()} media availability", "chamber": chamber})
        except Exception as ex:
            print(f"  {chamber} page: {ex}", file=sys.stderr)
    return out


def transcribe(url):
    with tempfile.TemporaryDirectory() as tmp:
        audio = os.path.join(tmp, "a.m4a")
        r = subprocess.run(["yt-dlp", "-f", "bestaudio/best", "-x", "--audio-format", "m4a", "-o", audio, "--print-json", url], capture_output=True, text=True, timeout=1500)
        if r.returncode != 0 or not os.path.exists(audio):
            last = (r.stderr or "").strip().splitlines()
            raise RuntimeError("Facebook didn't allow the download" + (": " + last[-1][:200] if last else ""))
        meta = json.loads(r.stdout.splitlines()[-1]) if r.stdout.strip() else {}
        from faster_whisper import WhisperModel
        model = WhisperModel(os.environ.get("WHISPER_MODEL", "small.en"), device="cpu", compute_type="int8")
        segs, _ = model.transcribe(audio, vad_filter=True)
        lines = [[round(s.start), s.text.strip()] for s in segs if s.text.strip()]
        return meta, lines


def summarize(lines, label):
    text = "\n".join(f"[{t//60}:{t%60:02d}] {x}" for t, x in lines)
    key = os.environ.get("ANTHROPIC_API_KEY")
    if key:
        prompt = f"""This is an automatic transcript of a Utah Legislature media availability ({label}). Reporters ask legislative leaders questions.
Return JSON only: {{"summary": "3-5 sentences", "topics": ["short topic", ...], "bills": ["HB 12", ...],
"speakers": ["names you can identify from the transcript (e.g. 'Speaker Schultz', 'President Adams')"],
"quotes": [{{"t": seconds, "who": "speaker if clear from context, else 'Unclear'", "text": "short quote, under 30 words"}}] (up to 8)}}
Only attribute a quote to someone if the transcript makes it clear who is talking. Transcript:
{text[:60000]}"""
        body = json.dumps({"model": os.environ.get("AI_MODEL", "claude-haiku-5-5"), "max_tokens": 1500, "messages": [{"role": "user", "content": prompt}]}).encode()
        raw = http("https://api.anthropic.com/v1/messages", data=body, headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"}, timeout=180)
        out = "".join(b.get("text", "") for b in json.loads(raw).get("content", []))
        m = re.search(r"\{[\s\S]*\}", out)
        if m:
            j = json.loads(m.group(0)); j["src"] = "ai"; return j
    bills = sorted(set(re.sub(r"\s+", " ", b.upper()) for b in re.findall(r"\b[HS]\.?\s?[BJ]\.?\s?R?\.?\s?\d{1,4}\b", text)))
    return {"summary": "Automatic transcript. Connect ANTHROPIC_API_KEY for a written summary and speaker attribution.", "topics": [], "bills": bills,
            "speakers": [], "quotes": [{"t": t, "who": "Unclear", "text": x[:200]} for t, x in lines[:: max(1, len(lines) // 6)][:6]], "src": "auto"}


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--url"); a = ap.parse_args()
    data = json.load(open(OUT)) if os.path.exists(OUT) else {"items": []}
    done = {x["url"] for x in data["items"]}
    todo = []
    if a.url:
        todo.append({"url": a.url, "label": "Media availability"})
    try:
        todo += [q for q in site("cron/media-queue").get("queue", []) if q.get("status") == "waiting"]
    except Exception as e:
        print(f"  queue: {e}", file=sys.stderr)
    todo += recent_page_videos()
    seen = set()
    for t in todo:
        if t["url"] in done or t["url"] in seen:
            continue
        seen.add(t["url"])
        print("Analyzing", t["url"])
        try:
            meta, lines = transcribe(t["url"])
            s = summarize(lines, t.get("label", ""))
            data["items"].insert(0, {"url": t["url"], "label": t.get("label") or meta.get("title") or "Media availability", "title": meta.get("title", ""),
                                     "date": datetime.now(MT).isoformat()[:16], "mins": round((lines[-1][0] if lines else 0) / 60), **s,
                                     "transcript": lines[:4000]})
            site("cron/media-done", {"url": t["url"], "ok": True})
        except Exception as e:
            print(f"  failed: {e}", file=sys.stderr)
            try: site("cron/media-done", {"url": t["url"], "ok": False, "note": str(e)[:300]})
            except Exception: pass
    data["items"] = data["items"][:40]
    json.dump(data, open(OUT, "w"), separators=(",", ":"))


if __name__ == "__main__":
    main()
