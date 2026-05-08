"""
Pingui — Network Investigation Suite v7
FastAPI backend: ping (WebSocket), traceroute (SSE), WHOIS/geo (ipinfo.io), export
"""
from __future__ import annotations
import asyncio, json, re, sqlite3, sys
import base64, io, time, zipfile
from pathlib import Path

import httpx, uvicorn
from fastapi import FastAPI, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse, Response

BASE_DIR = Path(__file__).parent
ASSETS   = BASE_DIR / "assets"
DATA_DIR = BASE_DIR / "data"; DATA_DIR.mkdir(exist_ok=True)
DB_PATH  = DATA_DIR / "pingui.db"
TEMP_DIR = BASE_DIR / "temp"
TEMP_DIR.mkdir(exist_ok=True)
IS_MAC   = sys.platform == "darwin"

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app):
    init_db()
    yield

app = FastAPI(title="Pingui", version="7.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ── Database ───────────────────────────────────────────────────────────────────

def init_db():
    with sqlite3.connect(DB_PATH) as c:
        c.execute("""CREATE TABLE IF NOT EXISTS beta_signups (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            email     TEXT UNIQUE,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            ip        TEXT
        )""")
        c.commit()

# ── Helpers ────────────────────────────────────────────────────────────────────

def is_private(ip: str) -> bool:
    if not ip: return False
    p = ip.split(".")
    if len(p) != 4: return False
    try:
        a = [int(x) for x in p]
        return (a[0] == 10 or
                (a[0] == 172 and 16 <= a[1] <= 31) or
                (a[0] == 192 and a[1] == 168) or
                a[0] == 127)
    except: return False

HOP_RE  = re.compile(r"^\s*(\d+)\s+(.*?)$")
RTT_RE  = re.compile(r"(\d+(?:\.\d+)?)\s*ms")
HOST_RE = re.compile(r"(\S+)\s+\(([^)]+)\)")

def parse_hop(line: str) -> dict | None:
    m = HOP_RE.match(line)
    if not m: return None
    n, rest = int(m.group(1)), m.group(2).strip()
    if re.match(r"^[\*\s]+$", rest):
        return {"hop": n, "host": "", "ip": "", "rtts": [], "timeout": True}
    hm   = HOST_RE.search(rest)
    host = hm.group(1) if hm else ""
    ip   = hm.group(2) if hm else ""
    if not ip:
        bm = re.match(r"(\d{1,3}(?:\.\d{1,3}){3})", rest)
        if bm: ip = bm.group(1)
    rtts = [float(r) for r in RTT_RE.findall(rest)]
    return {"hop": n, "host": host, "ip": ip, "rtts": rtts, "timeout": "*" in rest}

_geo_cache: dict[str, dict] = {}

async def get_geo(ip: str) -> dict:
    if ip in _geo_cache: return _geo_cache[ip]
    try:
        async with httpx.AsyncClient(timeout=6) as client:
            r = await client.get(f"https://ipinfo.io/{ip}/json")
            d = r.json()
        org_raw = d.get("org", "")
        asn, org = "", org_raw
        if org_raw.startswith("AS"):
            parts = org_raw.split(" ", 1)
            asn = parts[0]; org = parts[1] if len(parts) > 1 else ""
        lat = lon = None
        if "," in d.get("loc", ""):
            try: lat, lon = (float(x) for x in d["loc"].split(",", 1))
            except: pass
        result = {
            "org": org, "country": d.get("country", ""),
            "city": d.get("city", ""), "region": d.get("region", ""),
            "asn": asn, "hostname": d.get("hostname", ""),
            "lat": lat, "lon": lon,
            "postal": d.get("postal", ""), "timezone": d.get("timezone", ""),
        }
        _geo_cache[ip] = result
        return result
    except: return {}

# ── Static files ───────────────────────────────────────────────────────────────

@app.get("/")
async def root(): return FileResponse(BASE_DIR / "landing.html")

@app.get("/app")
async def app_page(): return FileResponse(BASE_DIR / "index.html")

@app.get("/assets/{name:path}")
async def asset(name: str):
    p = ASSETS / name
    return FileResponse(p) if p.exists() else JSONResponse({"error": "not found"}, status_code=404)

# ── API ────────────────────────────────────────────────────────────────────────

@app.get("/api/myip")
async def myip(request: Request):
    fwd = request.headers.get("x-forwarded-for", "")
    ip  = fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "")
    return JSONResponse({"ip": ip})

@app.get("/api/geo/me")
async def geo_me(request: Request):
    """Return the caller's approximate lat/lon via ipinfo.io."""
    fwd = request.headers.get("x-forwarded-for", "")
    ip  = fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "")
    # loopback → skip geo lookup, return null coords
    if not ip or ip in ("127.0.0.1", "::1", "localhost"):
        return JSONResponse({"ip": ip, "lat": None, "lon": None})
    geo = await get_geo(ip)
    return JSONResponse({"ip": ip, "lat": geo.get("lat"), "lon": geo.get("lon"),
                         "city": geo.get("city", ""), "country": geo.get("country", "")})

@app.websocket("/api/ping")
async def ping_ws(ws: WebSocket, target: str = Query(...)):
    await ws.accept()
    if not re.match(r"^[a-zA-Z0-9.\-:]+$", target):
        await ws.send_json({"error": "Invalid target"}); await ws.close(); return
    seq = 0
    try:
        while True:
            try:
                args = ["ping", "-c", "1"]
                args += ["-W", "2000"] if IS_MAC else ["-W", "2"]
                args.append(target)
                proc = await asyncio.create_subprocess_exec(
                    *args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
                try:
                    out, _ = await asyncio.wait_for(proc.communicate(), timeout=5)
                except asyncio.TimeoutError:
                    proc.kill()
                    await ws.send_json({"seq": seq, "rtt": None, "timeout": True})
                    seq += 1; await asyncio.sleep(1); continue
                m = re.search(r"time[=<](\d+(?:\.\d+)?)\s*ms", out.decode("utf-8", "ignore"))
                if m: await ws.send_json({"seq": seq, "rtt": float(m.group(1)), "timeout": False})
                else: await ws.send_json({"seq": seq, "rtt": None, "timeout": True})
                seq += 1; await asyncio.sleep(1)
            except WebSocketDisconnect: break
            except:
                await ws.send_json({"seq": seq, "rtt": None, "timeout": True})
                seq += 1; await asyncio.sleep(1)
    except WebSocketDisconnect: pass

@app.get("/api/trace")
async def trace(target: str = Query(...)):
    async def gen():
        def sse(d): return f"data: {json.dumps(d)}\n\n"
        if not re.match(r"^[a-zA-Z0-9.\-:]+$", target):
            yield sse({"type": "error", "message": "Invalid target"}); return
        yield sse({"type": "start", "target": target})
        try:
            tr = "/usr/sbin/traceroute" if Path("/usr/sbin/traceroute").exists() else "traceroute"
            proc = await asyncio.create_subprocess_exec(
                tr, "-m", "30", "-q", "3", target,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
            async for raw in proc.stdout:
                line = raw.decode("utf-8", "ignore").rstrip()
                if not line: continue
                yield sse({"type": "raw_line", "line": line})
                hop = parse_hop(line)
                if not hop: continue
                geo = {}
                if hop["ip"] and not is_private(hop["ip"]):
                    try: geo = await asyncio.wait_for(get_geo(hop["ip"]), timeout=5)
                    except: pass
                yield sse({"type": "hop", "data": {**hop, **geo}})
            await proc.wait()
            yield sse({"type": "done"})
        except Exception as e:
            yield sse({"type": "error", "message": str(e)})
    return StreamingResponse(gen(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

@app.get("/api/whois")
async def whois(target: str = Query(...)):
    if not re.match(r"^[a-zA-Z0-9.\-:]+$", target):
        return JSONResponse({"error": "Invalid target"})
    geo = await get_geo(target)
    raw_output = ""
    try:
        proc = await asyncio.create_subprocess_exec(
            "whois", target,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
        out, _ = await asyncio.wait_for(proc.communicate(), timeout=15)
        raw_output = out.decode("utf-8", "ignore")
    except Exception:
        pass
    return JSONResponse({"target": target, "fields": geo, "raw": raw_output})

@app.post("/api/beta/signup")
async def beta_signup(request: Request):
    body  = await request.json()
    email = (body.get("email") or "").strip().lower()
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        return JSONResponse({"error": "Invalid email"}, status_code=400)
    fwd = request.headers.get("x-forwarded-for", "")
    ip  = fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "")
    try:
        with sqlite3.connect(DB_PATH) as c:
            c.execute("INSERT INTO beta_signups (email, ip) VALUES (?, ?)", (email, ip))
            c.commit()
        return JSONResponse({"ok": True, "message": "You're on the list."})
    except sqlite3.IntegrityError:
        return JSONResponse({"ok": True, "message": "Already on the list."})

@app.get("/api/healthz")
async def healthz(): return JSONResponse({"status": "ok"})

@app.post("/api/export/snapshot")
async def save_snapshot(request: Request):
    body = await request.json()
    session_id = re.sub(r"[^\w\-]", "", body.get("session_id", "default"))[:64]
    png_b64 = body.get("png", "")
    if not png_b64:
        return JSONResponse({"error": "no png"}, status_code=400)
    try:
        png_bytes = base64.b64decode(png_b64)
    except Exception:
        return JSONResponse({"error": "invalid png"}, status_code=400)
    sess_dir = TEMP_DIR / session_id
    sess_dir.mkdir(exist_ok=True)
    existing = sorted(sess_dir.glob("snap_*.png"))
    n = len(existing) + 1
    (sess_dir / f"snap_{n:03d}.png").write_bytes(png_bytes)
    return JSONResponse({"ok": True, "count": n})

@app.post("/api/export/package")
async def package_export(request: Request):
    body = await request.json()
    session_id = re.sub(r"[^\w\-]", "", body.get("session_id", "default"))[:64]
    title = str(body.get("title", "")).strip()[:80]
    notes = str(body.get("notes", "")).strip()
    data  = body.get("data", {})
    safe_title = re.sub(r"[^\w\-]", "_", title)[:40] if title else ""
    ts = time.strftime("%Y-%m-%d_%H-%M")
    target_raw = str(data.get("target", "unknown"))
    safe_target = re.sub(r"[^\w.\-]", "_", target_raw)[:40]
    zip_name = f"pingui_{ts}_{safe_target}{'_' + safe_title if safe_title else ''}.zip"
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        inv = {**data, "notes": notes, "title": title, "exported_at": ts}
        zf.writestr("investigation.json", json.dumps(inv, indent=2))
        if notes:
            zf.writestr("notes.md", f"# {title or safe_target}\n\n{notes}\n")
        sess_dir = TEMP_DIR / session_id
        if sess_dir.exists():
            for snap in sorted(sess_dir.glob("snap_*.png")):
                zf.write(snap, f"screenshots/{snap.name}")
    buf.seek(0)
    return Response(
        content=buf.read(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{zip_name}"'}
    )

if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 8013))
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=False)
