#!/usr/bin/env python3
"""
Pingui v7 build script — assembles src/* into index.html
Usage:
  python3 build.py          # one-shot build
  python3 build.py --watch  # rebuild on file change
"""
import subprocess, sys, shutil, time
from pathlib import Path

BASE     = Path(__file__).parent
SRC      = BASE / "src"
OUT      = BASE / "index.html"
JS_DIR   = SRC / "js"
CSS_FILE = SRC / "css" / "app.css"
TMPL     = SRC / "template.html"

def js_files():
    return sorted(JS_DIR.glob("*.js"))

def check_js(path: Path) -> bool:
    result = subprocess.run(
        ["node", "--check", str(path)],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"  [SYNTAX ERROR] {path.name}:")
        print(result.stderr.strip())
        return False
    return True

def build() -> bool:
    print("Building…")

    # Checkpoint current output
    if OUT.exists():
        shutil.copy(OUT, OUT.with_suffix(".html.B"))

    # Syntax-check all JS modules
    files = js_files()
    errors = [f for f in files if not check_js(f)]
    if errors:
        print(f"\nBuild FAILED — fix {len(errors)} file(s) above.\n")
        return False

    css  = CSS_FILE.read_text(encoding="utf-8")
    js   = "\n\n".join(
        f"// ── {f.name} ──────────────────────────────────\n{f.read_text(encoding='utf-8')}"
        for f in files
    )
    html = TMPL.read_text(encoding="utf-8")
    html = html.replace("<!-- BUILD:CSS -->", f"<style>\n{css}\n</style>")
    html = html.replace("<!-- BUILD:JS -->",  f"<script>\n{js}\n</script>")
    OUT.write_text(html, encoding="utf-8")

    total = sum(f.stat().st_size for f in files)
    print(f"OK  {OUT.name}  ({len(html):,} chars, {len(files)} JS modules, {total//1024} KB source)\n")
    return True

def watch():
    print("Watching src/ for changes… (Ctrl+C to stop)\n")
    mtimes: dict = {}

    def current_mtimes():
        paths = list(js_files()) + [CSS_FILE, TMPL]
        return {str(p): p.stat().st_mtime for p in paths if p.exists()}

    mtimes = current_mtimes()
    while True:
        time.sleep(0.8)
        now = current_mtimes()
        if now != mtimes:
            mtimes = now
            print("Change detected —", end=" ")
            build()

if __name__ == "__main__":
    if "--watch" in sys.argv:
        build()
        watch()
    else:
        ok = build()
        sys.exit(0 if ok else 1)
