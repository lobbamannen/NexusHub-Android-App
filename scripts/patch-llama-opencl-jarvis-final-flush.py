#!/usr/bin/env python3
"""Flush pending Jarvis OpenCL profiling events at the end of each audited graph."""
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit("usage: patch-llama-opencl-jarvis-final-flush.py <llama.cpp source dir>")

root = Path(sys.argv[1])
path = root / "ggml/src/ggml-opencl/ggml-opencl.cpp"
text = path.read_text()
marker = "// Jarvis final audited-graph profiling flush"

if marker in text:
    print(f"{marker} already present")
    raise SystemExit(0)

# This patch intentionally runs after patch-llama-opencl-jarvis-audit.py.
# The pinned backend owns profiling_info and flush_profiling_batch() on backend_ctx.
# Flushing here closes the final partial (<2048 event) batch before llama_decode returns,
# so the final telemetry snapshot does not under-count completed/profiled kernels.
needle = """        GGML_ASSERT(ok);\n    }\n\n    return GGML_STATUS_SUCCESS;\n}"""
replacement = """        GGML_ASSERT(ok);\n    }\n\n#ifdef GGML_OPENCL_PROFILING\n    // Jarvis final audited-graph profiling flush. Diagnostic-only: the audit toggle\n    // already makes timing non-canonical, so correctness/completeness wins here.\n    if (g_jarvis_opencl_audit.enabled.load(std::memory_order_relaxed)) {\n        CL_CHECK(clFinish(backend_ctx->queue));\n        backend_ctx->flush_profiling_batch();\n    }\n#endif\n\n    return GGML_STATUS_SUCCESS;\n}"""

count = text.count(needle)
if count != 1:
    raise SystemExit(f"expected exactly one OpenCL graph-compute return marker, found {count}")

path.write_text(text.replace(needle, replacement, 1))
print(f"patched {path} with final audited-graph profiling flush")
