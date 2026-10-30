#!/usr/bin/env python3
"""Extend the Jarvis OpenCL audit with kernel/work-size and transfer-event evidence."""
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit("usage: patch-llama-opencl-jarvis-deep-audit.py <llama.cpp source dir>")

root = Path(sys.argv[1])
path = root / "ggml/src/ggml-opencl/ggml-opencl.cpp"
text = path.read_text()
symbol = "jarvis_record_kernel"
if symbol in text:
    print(f"{symbol} already present")
    raise SystemExit(0)
if "ggml_backend_opencl_set_jarvis_audit" not in text:
    raise SystemExit("base Jarvis OpenCL audit must be applied first")

text = text.replace("clEnqueueReadBuffer(", "jarvis_clEnqueueReadBuffer(")
text = text.replace("clEnqueueWriteBuffer(", "jarvis_clEnqueueWriteBuffer(")
text = text.replace("clEnqueueCopyBuffer(", "jarvis_clEnqueueCopyBuffer(")

marker = "static thread_local char g_jarvis_opencl_snapshot[4096];\n"
if marker not in text:
    raise SystemExit("Jarvis snapshot marker not found")

deep = r'''struct JarvisKernelStat {
    uint64_t calls = 0, exec_ns = 0;
    size_t global_size[3] = {0,0,0}, local_size[3] = {0,0,0};
};
struct JarvisTransferStat {
    uint64_t submitted = 0, completed = 0, cl_complete = 0, profiled = 0, bytes = 0;
    uint64_t exec_ns = 0, queued_to_submit_ns = 0, submit_to_start_ns = 0, end_to_complete_ns = 0;
};
static std::mutex g_jarvis_deep_mutex;
static std::map<std::string, JarvisKernelStat> g_jarvis_kernel_stats[2];
static JarvisTransferStat g_jarvis_transfer[2][3];
static std::set<uintptr_t> g_jarvis_queues;
static std::string g_jarvis_device_name;

static void jarvis_reset_deep_audit(void) {
    std::lock_guard<std::mutex> lock(g_jarvis_deep_mutex);
    for (int p=0;p<2;++p) { g_jarvis_kernel_stats[p].clear(); for (int k=0;k<3;++k) g_jarvis_transfer[p][k]=JarvisTransferStat{}; }
    g_jarvis_queues.clear(); g_jarvis_device_name.clear();
}
static void jarvis_note_queue(cl_command_queue queue) {
    std::lock_guard<std::mutex> lock(g_jarvis_deep_mutex);
    g_jarvis_queues.insert((uintptr_t) queue);
    if (g_jarvis_device_name.empty()) {
        cl_device_id dev=nullptr;
        if (clGetCommandQueueInfo(queue,CL_QUEUE_DEVICE,sizeof(dev),&dev,nullptr)==CL_SUCCESS && dev) {
            char name[256]={0};
            if (clGetDeviceInfo(dev,CL_DEVICE_NAME,sizeof(name),name,nullptr)==CL_SUCCESS) g_jarvis_device_name=name;
        }
    }
}
static void jarvis_record_kernel(int phase, const char * name, const size_t * global_size, const size_t * local_size, uint64_t exec_ns) {
    if (!g_jarvis_opencl_audit.enabled.load(std::memory_order_relaxed)) return;
    std::lock_guard<std::mutex> lock(g_jarvis_deep_mutex);
    auto & s=g_jarvis_kernel_stats[phase?1:0][name?name:"<unknown>"]; s.calls++; s.exec_ns+=exec_ns;
    for(int i=0;i<3;++i){s.global_size[i]=global_size?global_size[i]:0;s.local_size[i]=local_size?local_size[i]:0;}
}
static void jarvis_record_transfer(cl_command_queue queue, cl_event evt, int kind, size_t bytes) {
    const int p=g_jarvis_opencl_audit.phase.load(std::memory_order_relaxed)?1:0;
    jarvis_note_queue(queue);
    cl_int wait_status=clWaitForEvents(1,&evt); CL_CHECK(wait_status);
    cl_int status=0; CL_CHECK(clGetEventInfo(evt,CL_EVENT_COMMAND_EXECUTION_STATUS,sizeof(status),&status,nullptr));
    cl_ulong q=0,s=0,st=0,e=0,c=0;
    cl_int pq=clGetEventProfilingInfo(evt,CL_PROFILING_COMMAND_QUEUED,sizeof(q),&q,nullptr);
    cl_int ps=clGetEventProfilingInfo(evt,CL_PROFILING_COMMAND_SUBMIT,sizeof(s),&s,nullptr);
    cl_int pst=clGetEventProfilingInfo(evt,CL_PROFILING_COMMAND_START,sizeof(st),&st,nullptr);
    cl_int pe=clGetEventProfilingInfo(evt,CL_PROFILING_COMMAND_END,sizeof(e),&e,nullptr);
    cl_int pc=clGetEventProfilingInfo(evt,CL_PROFILING_COMMAND_COMPLETE,sizeof(c),&c,nullptr);
    {
        std::lock_guard<std::mutex> lock(g_jarvis_deep_mutex); auto & t=g_jarvis_transfer[p][kind];
        t.submitted++; t.completed++; t.bytes+=bytes; if(status==CL_COMPLETE)t.cl_complete++;
        if(pq==CL_SUCCESS&&ps==CL_SUCCESS&&pst==CL_SUCCESS&&pe==CL_SUCCESS&&pc==CL_SUCCESS&&c>=e&&e>=st&&st>=s&&s>=q){
            t.profiled++;t.exec_ns+=e-st;t.queued_to_submit_ns+=s-q;t.submit_to_start_ns+=st-s;t.end_to_complete_ns+=c-e;
        }
    }
    CL_CHECK(clReleaseEvent(evt));
}
static cl_int jarvis_clEnqueueReadBuffer(cl_command_queue q, cl_mem b, cl_bool blocking, size_t off, size_t bytes, void * ptr, cl_uint n, const cl_event * waits, cl_event * out) {
    if(!g_jarvis_opencl_audit.enabled.load(std::memory_order_relaxed)) return clEnqueueReadBuffer(q,b,blocking,off,bytes,ptr,n,waits,out);
    cl_event evt=nullptr; cl_int rc=clEnqueueReadBuffer(q,b,blocking,off,bytes,ptr,n,waits,&evt); if(rc==CL_SUCCESS){jarvis_record_transfer(q,evt,0,bytes); if(out)*out=nullptr;} return rc;
}
static cl_int jarvis_clEnqueueWriteBuffer(cl_command_queue q, cl_mem b, cl_bool blocking, size_t off, size_t bytes, const void * ptr, cl_uint n, const cl_event * waits, cl_event * out) {
    if(!g_jarvis_opencl_audit.enabled.load(std::memory_order_relaxed)) return clEnqueueWriteBuffer(q,b,blocking,off,bytes,ptr,n,waits,out);
    cl_event evt=nullptr; cl_int rc=clEnqueueWriteBuffer(q,b,blocking,off,bytes,ptr,n,waits,&evt); if(rc==CL_SUCCESS){jarvis_record_transfer(q,evt,1,bytes); if(out)*out=nullptr;} return rc;
}
static cl_int jarvis_clEnqueueCopyBuffer(cl_command_queue q, cl_mem src, cl_mem dst, size_t so, size_t doff, size_t bytes, cl_uint n, const cl_event * waits, cl_event * out) {
    if(!g_jarvis_opencl_audit.enabled.load(std::memory_order_relaxed)) return clEnqueueCopyBuffer(q,src,dst,so,doff,bytes,n,waits,out);
    cl_event evt=nullptr; cl_int rc=clEnqueueCopyBuffer(q,src,dst,so,doff,bytes,n,waits,&evt); if(rc==CL_SUCCESS){jarvis_record_transfer(q,evt,2,bytes); if(out)*out=nullptr;} return rc;
}
static void jarvis_append_deep_json(char * dst, size_t cap) {
    std::lock_guard<std::mutex> lock(g_jarvis_deep_mutex); size_t len=strlen(dst); if(!len||dst[len-1]!='}')return; dst[--len]='\0';
    auto append_literal=[&](const char * value){
        if(len>=cap) return;
        size_t count=std::min(strlen(value),cap-len-1);
        std::memcpy(dst+len,value,count); len+=count; dst[len]='\0';
    };
    auto append_fmt=[&](const char * fmt, auto... args){
        if(len>=cap) return;
        char tmp[2048];
        int written=std::snprintf(tmp,sizeof(tmp),fmt,args...);
        if(written<=0) return;
        size_t count=std::min((size_t)written,sizeof(tmp)-1);
        count=std::min(count,cap-len-1);
        std::memcpy(dst+len,tmp,count); len+=count; dst[len]='\0';
    };
    append_fmt(",\"queue_count\":%llu,\"queue_device\":\"%s\",\"transfer_event_profiling\":\"VERIFIED_DIAGNOSTIC\",\"transfer_audit_forces_completion\":true",(unsigned long long)g_jarvis_queues.size(),g_jarvis_device_name.c_str());
    const char * pn[2]={"prefill","decode"}; const char * tn[3]={"read","write","copy"};
    append_literal(",\"transfers\":{"); for(int p=0;p<2;++p){if(p)append_literal(",");append_fmt("\"%s\":{",pn[p]);for(int k=0;k<3;++k){if(k)append_literal(",");auto&t=g_jarvis_transfer[p][k];append_fmt("\"%s\":{\"submitted\":%llu,\"completed\":%llu,\"cl_complete\":%llu,\"profiled\":%llu,\"bytes\":%llu,\"device_execution_ns\":%llu,\"queued_to_submit_ns\":%llu,\"submit_to_start_ns\":%llu,\"end_to_complete_ns\":%llu}",tn[k],(unsigned long long)t.submitted,(unsigned long long)t.completed,(unsigned long long)t.cl_complete,(unsigned long long)t.profiled,(unsigned long long)t.bytes,(unsigned long long)t.exec_ns,(unsigned long long)t.queued_to_submit_ns,(unsigned long long)t.submit_to_start_ns,(unsigned long long)t.end_to_complete_ns);}append_literal("}");}append_literal("}");
    append_literal(",\"kernel_histogram\":{"); for(int p=0;p<2;++p){if(p)append_literal(",");append_fmt("\"%s\":[",pn[p]);int emitted=0;for(const auto&kv:g_jarvis_kernel_stats[p]){if(emitted>=16)break;if(emitted++)append_literal(",");auto&s=kv.second;append_fmt("{\"name\":\"%s\",\"calls\":%llu,\"device_execution_ns\":%llu,\"global\":[%llu,%llu,%llu],\"local\":[%llu,%llu,%llu]}",kv.first.c_str(),(unsigned long long)s.calls,(unsigned long long)s.exec_ns,(unsigned long long)s.global_size[0],(unsigned long long)s.global_size[1],(unsigned long long)s.global_size[2],(unsigned long long)s.local_size[0],(unsigned long long)s.local_size[1],(unsigned long long)s.local_size[2]);}append_literal("]");}append_literal("},\"semantic_role_attribution\":\"UNVERIFIED\"}");
}
'''
text = text.replace(marker, marker + deep, 1)

reset_needle = "    if (enabled) { for (int p=0;p<2;++p) {"
if reset_needle not in text:
    raise SystemExit("audit reset marker not found")
text = text.replace(reset_needle, "    if (enabled) { jarvis_reset_deep_audit(); for (int p=0;p<2;++p) {", 1)

json_needle = ")); return g_jarvis_opencl_snapshot;\n}"
if json_needle not in text:
    raise SystemExit("audit JSON return marker not found")
text = text.replace(json_needle, ")); jarvis_append_deep_json(g_jarvis_opencl_snapshot,sizeof(g_jarvis_opencl_snapshot)); return g_jarvis_opencl_snapshot;\n}", 1)

kernel_needle = "            info.kernel_name = kernel_name;\n"
if kernel_needle not in text:
    raise SystemExit("kernel name marker not found")
text = text.replace(kernel_needle, kernel_needle + "            jarvis_record_kernel(info.jarvis_phase, info.kernel_name.c_str(), info.global_size, info.local_size, cmd_end >= cmd_start ? cmd_end-cmd_start : 0);\n", 1)

path.write_text(text)
print(f"patched {path} with deep Jarvis OpenCL kernel/transfer audit")
