#!/usr/bin/env python3
"""Normalize the pinned ggml-cpu SWAP macro in a disposable input tree, then run the CPU audit patch.

This exists because the audit generator intentionally matches exact source anchors, while cached/source
formatting can differ in harmless whitespace. The canonical llama.cpp checkout is never modified.
"""
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

if len(sys.argv) != 4:
    raise SystemExit("usage: run-llama-cpu-jarvis-audit.py <patch script> <llama.cpp source dir> <output dir>")

patch_script = Path(sys.argv[1]).resolve()
root = Path(sys.argv[2]).resolve()
out = Path(sys.argv[3]).resolve()
src_dir = root / "ggml/src/ggml-cpu"
src_c = src_dir / "ggml-cpu.c"
src_cpp = src_dir / "ggml-cpu.cpp"
if not patch_script.is_file() or not src_c.is_file() or not src_cpp.is_file():
    raise SystemExit("CPU audit wrapper inputs not found")

text = src_c.read_text()
canonical = '#define SWAP(x, y, T) do { T SWAP = x; (x) = y; (y) = SWAP; } while (0)'
pattern = re.compile(r'^\s*#\s*define\s+SWAP\s*\(\s*x\s*,\s*y\s*,\s*T\s*\)\s+do\s*\{[^\n]*\}\s*while\s*\(\s*0\s*\)\s*$', re.MULTILINE)
matches = list(pattern.finditer(text))
if len(matches) != 1:
    raise SystemExit(f"expected exactly one ggml-cpu.c SWAP macro, found {len(matches)}")
normalized = text[:matches[0].start()] + canonical + text[matches[0].end():]

with tempfile.TemporaryDirectory(prefix="jarvis-cpu-audit-") as td:
    temp_root = Path(td)
    temp_cpu = temp_root / "ggml/src/ggml-cpu"
    temp_cpu.mkdir(parents=True)
    (temp_cpu / "ggml-cpu.c").write_text(normalized)
    shutil.copy2(src_cpp, temp_cpu / "ggml-cpu.cpp")
    proc = subprocess.run([sys.executable, str(patch_script), str(temp_root), str(out)], text=True, capture_output=True)
    if proc.stdout:
        sys.stdout.write(proc.stdout)
    if proc.stderr:
        sys.stderr.write(proc.stderr)
    raise SystemExit(proc.returncode)
