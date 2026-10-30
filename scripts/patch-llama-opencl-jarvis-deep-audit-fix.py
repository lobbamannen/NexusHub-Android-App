#!/usr/bin/env python3
"""Harden Jarvis deep OpenCL audit snapshot sizing and event ownership."""
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit("usage: patch-llama-opencl-jarvis-deep-audit-fix.py <llama.cpp source dir>")

path = Path(sys.argv[1]) / "ggml/src/ggml-opencl/ggml-opencl.cpp"
text = path.read_text()

old_snapshot = "static thread_local char g_jarvis_opencl_snapshot[4096];"
if old_snapshot in text:
    text = text.replace(old_snapshot, "static thread_local char g_jarvis_opencl_snapshot[16384];", 1)
elif "static thread_local char g_jarvis_opencl_snapshot[16384];" not in text:
    raise SystemExit("Jarvis snapshot marker not found")

text = text.replace('\\\"transfer_event_profiling\\\":\\\"UNVERIFIED\\\"',
                    '\\\"transfer_event_profiling_base\\\":\\\"UNVERIFIED\\\"', 1)

# Accept both the legacy one-lambda generator and the current split literal/formatted appenders.
old_append = 'auto append=[&](const char * fmt, auto... args){if(len<cap){int n=std::snprintf(dst+len,cap-len,fmt,args...);if(n>0)len+=std::min((size_t)n,cap-len-1);}};'
new_append = 'auto append=[&](const char * fmt, auto... args){if(len<cap){int n; if constexpr(sizeof...(args)==0){n=std::snprintf(dst+len,cap-len,"%s",fmt);}else{n=std::snprintf(dst+len,cap-len,fmt,args...);}if(n>0)len+=std::min((size_t)n,cap-len-1);}};'
if old_append in text:
    text = text.replace(old_append, new_append, 1)
elif not ('auto append_literal=' in text and 'auto append_fmt=' in text):
    raise SystemExit("deep JSON append implementation not recognized")

for kind in (0, 1, 2):
    old = f"jarvis_record_transfer(q,evt,{kind},bytes); if(out)*out=nullptr;"
    new = f"if(out){{CL_CHECK(clRetainEvent(evt));*out=evt;}} jarvis_record_transfer(q,evt,{kind},bytes);"
    if old in text:
        text = text.replace(old, new, 1)
    elif new not in text:
        raise SystemExit(f"transfer wrapper marker {kind} not found")

path.write_text(text)
print(f"hardened deep OpenCL audit in {path}")
