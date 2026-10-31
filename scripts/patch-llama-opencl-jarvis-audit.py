#!/usr/bin/env python3
"""Add a Jarvis-only runtime-gated OpenCL event audit to the pinned disposable llama.cpp tree."""
from pathlib import Path
import sys
if len(sys.argv) != 2: raise SystemExit("usage: patch-llama-opencl-jarvis-audit.py <llama.cpp source dir>")
root = Path(sys.argv[1]); path = root / "ggml/src/ggml-opencl/ggml-opencl.cpp"; text = path.read_text()
symbol = "ggml_backend_opencl_set_jarvis_audit"
if symbol in text: print(f"{symbol} already present"); raise SystemExit(0)
if '#include <atomic>\n' not in text: text = text.replace('#include <mutex>\n', '#include <mutex>\n#include <atomic>\n#include <cstdio>\n', 1)
marker = "// Profiling\nstruct ProfilingInfo {"
if marker not in text: raise SystemExit("ProfilingInfo marker not found")
state = r'''// Jarvis diagnostic-only OpenCL event evidence. It never changes placement or kernel choice.
struct JarvisOpenClAuditState {
    std::atomic<bool> enabled{false}; std::atomic<int> phase{0}; std::atomic<uint64_t> graph_id{0};
    std::atomic<uint64_t> submitted[2]{{0},{0}}, completed[2]{{0},{0}}, complete_status[2]{{0},{0}}, profiled[2]{{0},{0}}, correlated[2]{{0},{0}};
    std::atomic<uint64_t> exec_ns[2]{{0},{0}}, q2s_ns[2]{{0},{0}}, s2start_ns[2]{{0},{0}}, end2complete_ns[2]{{0},{0}};
};
static JarvisOpenClAuditState g_jarvis_opencl_audit;
static thread_local char g_jarvis_opencl_snapshot[4096];
extern "C" GGML_BACKEND_API void ggml_backend_opencl_set_jarvis_audit(int enabled) {
    g_jarvis_opencl_audit.enabled.store(enabled != 0, std::memory_order_relaxed);
    if (enabled) { for (int p=0;p<2;++p) { g_jarvis_opencl_audit.submitted[p]=0; g_jarvis_opencl_audit.completed[p]=0; g_jarvis_opencl_audit.complete_status[p]=0; g_jarvis_opencl_audit.profiled[p]=0; g_jarvis_opencl_audit.correlated[p]=0; g_jarvis_opencl_audit.exec_ns[p]=0; g_jarvis_opencl_audit.q2s_ns[p]=0; g_jarvis_opencl_audit.s2start_ns[p]=0; g_jarvis_opencl_audit.end2complete_ns[p]=0; } g_jarvis_opencl_audit.phase=0; g_jarvis_opencl_audit.graph_id=0; }
}
extern "C" GGML_BACKEND_API void ggml_backend_opencl_jarvis_set_phase(int phase) { g_jarvis_opencl_audit.phase.store(phase?1:0, std::memory_order_relaxed); }
extern "C" GGML_BACKEND_API void ggml_backend_opencl_jarvis_begin_graph(void) { if (g_jarvis_opencl_audit.enabled.load(std::memory_order_relaxed)) g_jarvis_opencl_audit.graph_id.fetch_add(1,std::memory_order_relaxed); }
extern "C" GGML_BACKEND_API const char * ggml_backend_opencl_get_jarvis_audit_json(void) {
    auto L=[](const std::atomic<uint64_t>&v){return v.load(std::memory_order_relaxed);}; bool on=g_jarvis_opencl_audit.enabled.load(std::memory_order_relaxed);
    std::snprintf(g_jarvis_opencl_snapshot,sizeof(g_jarvis_opencl_snapshot),"{\"schema_version\":2,\"enabled\":%s,\"evidence\":\"OPENCL_EVENT_PROFILING\",\"graph_calls\":%llu,\"prefill\":{\"submitted_kernels\":%llu,\"completed_events\":%llu,\"cl_complete_events\":%llu,\"profiled_events\":%llu,\"tensor_correlated_events\":%llu,\"device_execution_ns\":%llu,\"queued_to_submit_ns\":%llu,\"submit_to_start_ns\":%llu,\"end_to_complete_ns\":%llu},\"decode\":{\"submitted_kernels\":%llu,\"completed_events\":%llu,\"cl_complete_events\":%llu,\"profiled_events\":%llu,\"tensor_correlated_events\":%llu,\"device_execution_ns\":%llu,\"queued_to_submit_ns\":%llu,\"submit_to_start_ns\":%llu,\"end_to_complete_ns\":%llu},\"physical_gpu_utilization\":\"UNVERIFIED\",\"transfer_event_profiling\":\"UNVERIFIED\",\"semantic_role_attribution\":\"UNVERIFIED\"}",on?"true":"false",(unsigned long long)L(g_jarvis_opencl_audit.graph_id),(unsigned long long)L(g_jarvis_opencl_audit.submitted[0]),(unsigned long long)L(g_jarvis_opencl_audit.completed[0]),(unsigned long long)L(g_jarvis_opencl_audit.complete_status[0]),(unsigned long long)L(g_jarvis_opencl_audit.profiled[0]),(unsigned long long)L(g_jarvis_opencl_audit.correlated[0]),(unsigned long long)L(g_jarvis_opencl_audit.exec_ns[0]),(unsigned long long)L(g_jarvis_opencl_audit.q2s_ns[0]),(unsigned long long)L(g_jarvis_opencl_audit.s2start_ns[0]),(unsigned long long)L(g_jarvis_opencl_audit.end2complete_ns[0]),(unsigned long long)L(g_jarvis_opencl_audit.submitted[1]),(unsigned long long)L(g_jarvis_opencl_audit.completed[1]),(unsigned long long)L(g_jarvis_opencl_audit.complete_status[1]),(unsigned long long)L(g_jarvis_opencl_audit.profiled[1]),(unsigned long long)L(g_jarvis_opencl_audit.correlated[1]),(unsigned long long)L(g_jarvis_opencl_audit.exec_ns[1]),(unsigned long long)L(g_jarvis_opencl_audit.q2s_ns[1]),(unsigned long long)L(g_jarvis_opencl_audit.s2start_ns[1]),(unsigned long long)L(g_jarvis_opencl_audit.end2complete_ns[1])); return g_jarvis_opencl_snapshot;
}
// Profiling
struct ProfilingInfo {'''
text=text.replace(marker,state,1)
needle="    cl_ulong cmd_total_duration_ns;\n    // Global and local work sizes."
if needle not in text: raise SystemExit("duration marker not found")
text=text.replace(needle,"    cl_ulong cmd_total_duration_ns;\n    int jarvis_phase = 0;\n    // Global and local work sizes.",1)
needle="    info.evt         = evt;\n\n    // 0 means not specified"
if needle not in text: raise SystemExit("populate marker not found")
text=text.replace(needle,"    info.evt         = evt;\n    info.jarvis_phase = g_jarvis_opencl_audit.phase.load(std::memory_order_relaxed);\n\n    // 0 means not specified",1)
old='''#ifdef GGML_OPENCL_PROFILING
        cl_event evt;
        CL_CHECK(clEnqueueNDRangeKernel(queue, kernel, work_dim, NULL, global_work_size, local_work_size, 0, NULL, &evt));

        profiling_info.emplace_back();
        populateProfilingInfo(profiling_info.back(), evt, kernel, work_dim, global_work_size, local_work_size, tensor);
        if (profiling_info.size() >= 2048) {
            flush_profiling_batch();
        }
#else
        GGML_UNUSED(tensor);
        CL_CHECK(clEnqueueNDRangeKernel(queue, kernel, work_dim, NULL, global_work_size, local_work_size, 0, NULL, NULL));
#endif'''
new='''#ifdef GGML_OPENCL_PROFILING
        if (g_jarvis_opencl_audit.enabled.load(std::memory_order_relaxed)) {
            cl_event evt; CL_CHECK(clEnqueueNDRangeKernel(queue,kernel,work_dim,NULL,global_work_size,local_work_size,0,NULL,&evt));
            const int p=g_jarvis_opencl_audit.phase.load(std::memory_order_relaxed)?1:0; g_jarvis_opencl_audit.submitted[p].fetch_add(1,std::memory_order_relaxed); if(tensor&&tensor->name[0]!='\\0') g_jarvis_opencl_audit.correlated[p].fetch_add(1,std::memory_order_relaxed);
            profiling_info.emplace_back(); populateProfilingInfo(profiling_info.back(),evt,kernel,work_dim,global_work_size,local_work_size,tensor); if(profiling_info.size()>=2048) flush_profiling_batch();
        } else { GGML_UNUSED(tensor); CL_CHECK(clEnqueueNDRangeKernel(queue,kernel,work_dim,NULL,global_work_size,local_work_size,0,NULL,NULL)); }
#else
        GGML_UNUSED(tensor); CL_CHECK(clEnqueueNDRangeKernel(queue,kernel,work_dim,NULL,global_work_size,local_work_size,0,NULL,NULL));
#endif'''
if old not in text: raise SystemExit("enqueue profiling block not found")
text=text.replace(old,new,1)
needle='''            CL_CHECK(clGetEventProfilingInfo(
                info.evt, CL_PROFILING_COMMAND_COMPLETE, sizeof(cl_ulong), &cmd_complete, NULL));
            CL_CHECK(clReleaseEvent(info.evt));'''
replacement='''            CL_CHECK(clGetEventProfilingInfo(
                info.evt, CL_PROFILING_COMMAND_COMPLETE, sizeof(cl_ulong), &cmd_complete, NULL));
            cl_int js=0; CL_CHECK(clGetEventInfo(info.evt,CL_EVENT_COMMAND_EXECUTION_STATUS,sizeof(js),&js,NULL)); const int jp=info.jarvis_phase?1:0; g_jarvis_opencl_audit.completed[jp].fetch_add(1,std::memory_order_relaxed); if(js==CL_COMPLETE) g_jarvis_opencl_audit.complete_status[jp].fetch_add(1,std::memory_order_relaxed); if(cmd_end>=cmd_start&&cmd_start>=cmd_submit&&cmd_submit>=cmd_queued){g_jarvis_opencl_audit.profiled[jp].fetch_add(1,std::memory_order_relaxed);g_jarvis_opencl_audit.exec_ns[jp].fetch_add(cmd_end-cmd_start,std::memory_order_relaxed);g_jarvis_opencl_audit.q2s_ns[jp].fetch_add(cmd_submit-cmd_queued,std::memory_order_relaxed);g_jarvis_opencl_audit.s2start_ns[jp].fetch_add(cmd_start-cmd_submit,std::memory_order_relaxed);if(cmd_complete>=cmd_end)g_jarvis_opencl_audit.end2complete_ns[jp].fetch_add(cmd_complete-cmd_end,std::memory_order_relaxed);}
            CL_CHECK(clReleaseEvent(info.evt));'''
if needle not in text: raise SystemExit("COMPLETE marker not found")
text=text.replace(needle,replacement,1); path.write_text(text)
cmake=root/"ggml/src/ggml-opencl/CMakeLists.txt"; c=cmake.read_text(); cm="target_link_libraries(${TARGET_NAME} PRIVATE ${OpenCL_LIBRARIES})\n"; add=cm+"# Jarvis compiles the upstream event path in, but runtime-gates event creation behind the audit toggle.\ntarget_compile_definitions(${TARGET_NAME} PRIVATE GGML_OPENCL_PROFILING)\n";
if add not in c:
    if cm not in c: raise SystemExit("OpenCL CMake marker not found")
    cmake.write_text(c.replace(cm,add,1))
print(f"patched {path} with runtime-gated Jarvis OpenCL event audit")
