#!/usr/bin/env python3
"""Patch the disposable pinned Snapdragon source with Jarvis audit controls."""
from pathlib import Path
import subprocess, sys
if len(sys.argv) != 2: raise SystemExit("usage: patch-llama-hexagon-jarvis-audit.py <llama.cpp source dir>")
root=Path(sys.argv[1]); path=root/"ggml/src/ggml-hexagon/ggml-hexagon.cpp"; text=path.read_text(); symbol="ggml_backend_hexagon_set_jarvis_audit"
if symbol not in text:
    marker="ggml_backend_reg_t ggml_backend_hexagon_reg(void) {"
    if marker not in text: raise SystemExit(f"expected marker not found in {path}")
    insertion=r'''
// Jarvis diagnostic-only control. Resolved with dlsym; does not change op support/placement.
extern "C" GGML_BACKEND_API void ggml_backend_hexagon_set_jarvis_audit(int enabled) {
    if (enabled) { opt_verbose=1; opt_profile=3; if (opt_optrace<65536) opt_optrace=65536; }
    else { opt_verbose=0; opt_profile=0; }
}

'''
    path.write_text(text.replace(marker,insertion+marker,1)); print(f"patched {path} with {symbol}")
else: print(f"{symbol} already present")
# Keep the workflow/cache contract stable: this existing entry point applies all OpenCL audit
# patches to the same disposable source tree. Its hash changes, invalidating accelerator cache.
for script_name in (
    "patch-llama-opencl-jarvis-audit.py",
    "patch-llama-opencl-jarvis-deep-audit.py",
    "patch-llama-opencl-jarvis-deep-audit-fix.py",
    "patch-llama-opencl-jarvis-final-flush.py",
):
    patch=Path(__file__).with_name(script_name)
    subprocess.run([sys.executable,str(patch),str(root)],check=True)
