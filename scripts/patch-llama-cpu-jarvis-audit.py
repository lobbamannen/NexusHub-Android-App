#!/usr/bin/env python3
"""Create runtime-gated Jarvis CPU-audit copies of the pinned ggml CPU sources.

Usage: patch-llama-cpu-jarvis-audit.py <llama.cpp source dir> <output dir>

The canonical llama.cpp checkout stays pristine. The generated copies add diagnostic evidence only:
CPU graph entry/return, node dispatch/completion, worker call/return timing, Linux TID and CPU-ID
start/end snapshots. They do not change graph scheduling, affinity, op support or model math.
"""
from pathlib import Path
import sys

if len(sys.argv) != 3:
    raise SystemExit("usage: patch-llama-cpu-jarvis-audit.py <llama.cpp source dir> <output dir>")

root = Path(sys.argv[1])
out = Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)

src_c = root / "ggml/src/ggml-cpu/ggml-cpu.c"
src_cpp = root / "ggml/src/ggml-cpu/ggml-cpu.cpp"
if not src_c.is_file() or not src_cpp.is_file():
    raise SystemExit("pinned ggml CPU sources not found")

c = src_c.read_text()
cpp = src_cpp.read_text()
if "ggml_backend_cpu_set_jarvis_audit" in c or "ggml_backend_cpu_jarvis_graph_begin" in cpp:
    raise SystemExit("canonical llama.cpp source is already patched; refusing misleading provenance")

# ----- ggml-cpu.c ---------------------------------------------------------------------------
include_marker = '#include "ggml-backend.h"\n'
if include_marker not in c:
    raise SystemExit("ggml-cpu.c include marker not found")
c = c.replace(include_marker, include_marker + '#include "ggml-cpu.h"\n', 1)

signal_marker = '#include <signal.h>\n'
if signal_marker not in c:
    raise SystemExit("ggml-cpu.c signal include marker not found")
c = c.replace(signal_marker, signal_marker + '''#if defined(__linux__) || defined(__ANDROID__)\n#include <sys/syscall.h>\n#include <unistd.h>\n#endif\n''', 1)

# Keep this deliberately tied to the pinned llama.cpp source. c7bda030 uses unparenthesized
# assignments for both x and y; older variants are accepted only to make failures explicit
# rather than silently injecting at an unrelated location.
state_markers = (
    '#define SWAP(x, y, T) do { T SWAP = x; (x) = y; (y) = SWAP; } while (0)\n',
    '#define SWAP(x, y, T) do { T SWAP = (x); (x) = (y); (y) = SWAP; } while (0)\n',
    '#define SWAP(x, y, T) do { T SWAP = x; (x) = (y); (y) = SWAP; } while (0)\n',
)
state_marker = next((marker for marker in state_markers if marker in c), None)
if state_marker is None:
    raise SystemExit("ggml-cpu.c SWAP marker not found for pinned/known source variants")

state = r'''

// Jarvis CPU execution evidence. Hot-path work is fixed-size atomics + clocks/syscalls only.
// CPU-ID observations are snapshots; they are deliberately not reported as scheduler residency.
#ifndef JARVIS_LLAMA_COMMIT
#define JARVIS_LLAMA_COMMIT "unknown"
#endif
#ifndef JARVIS_CPU_AUDIT_PATCH_SHA256
#define JARVIS_CPU_AUDIT_PATCH_SHA256 "unknown"
#endif
#define JARVIS_CPU_AUDIT_PHASES 2
#define JARVIS_CPU_AUDIT_MAX_WORKERS 32

struct jarvis_cpu_worker_stats {
    atomic_uint_fast64_t calls;
    atomic_uint_fast64_t returns;
    atomic_uint_fast64_t wall_ns;
    atomic_uint_fast64_t thread_cpu_ns;
    atomic_uint_fast64_t cpu_snapshot_changes;
    atomic_int tid;
    atomic_int last_cpu_start;
    atomic_int last_cpu_end;
};

struct jarvis_cpu_audit_state {
    atomic_bool enabled;
    atomic_int phase; // 0 = prefill/setup, 1 = decode
    atomic_uint_fast64_t graph_entries[JARVIS_CPU_AUDIT_PHASES];
    atomic_uint_fast64_t graph_completions[JARVIS_CPU_AUDIT_PHASES];
    atomic_uint_fast64_t graph_failures[JARVIS_CPU_AUDIT_PHASES];
    atomic_uint_fast64_t graph_nodes_planned[JARVIS_CPU_AUDIT_PHASES];
    atomic_uint_fast64_t max_graph_threads[JARVIS_CPU_AUDIT_PHASES];
    atomic_uint_fast64_t node_dispatch[JARVIS_CPU_AUDIT_PHASES][GGML_OP_COUNT];
    atomic_uint_fast64_t node_completion[JARVIS_CPU_AUDIT_PHASES][GGML_OP_COUNT];
    atomic_uint_fast64_t worker_dispatch[JARVIS_CPU_AUDIT_PHASES][GGML_OP_COUNT];
    atomic_uint_fast64_t worker_completion[JARVIS_CPU_AUDIT_PHASES][GGML_OP_COUNT];
    atomic_uint_fast64_t worker_calls[JARVIS_CPU_AUDIT_PHASES];
    atomic_uint_fast64_t worker_returns[JARVIS_CPU_AUDIT_PHASES];
    atomic_uint_fast64_t worker_wall_ns[JARVIS_CPU_AUDIT_PHASES];
    atomic_uint_fast64_t worker_thread_cpu_ns[JARVIS_CPU_AUDIT_PHASES];
    atomic_uint_fast64_t cpu_snapshot_changes[JARVIS_CPU_AUDIT_PHASES];
    atomic_uint_fast64_t generic_compute_path_calls[JARVIS_CPU_AUDIT_PHASES];
    atomic_uint_fast64_t extra_compute_path_calls[JARVIS_CPU_AUDIT_PHASES];
    atomic_uint_fast64_t fused_followup_nodes[JARVIS_CPU_AUDIT_PHASES];
    struct jarvis_cpu_worker_stats workers[JARVIS_CPU_AUDIT_PHASES][JARVIS_CPU_AUDIT_MAX_WORKERS];
};

static struct jarvis_cpu_audit_state g_jarvis_cpu_audit;
static atomic_uint_fast64_t g_jarvis_cpu_run_sequence = 0;
static atomic_uint_fast64_t g_jarvis_cpu_active_run = 0;
static _Thread_local char g_jarvis_cpu_json[65536];

static int jarvis_cpu_phase(void) {
    return atomic_load_explicit(&g_jarvis_cpu_audit.phase, memory_order_relaxed) ? 1 : 0;
}
static uint64_t jarvis_cpu_clock_ns(clockid_t clock_id) {
    struct timespec ts;
    if (clock_gettime(clock_id, &ts) != 0) return 0;
    return (uint64_t) ts.tv_sec * 1000000000ULL + (uint64_t) ts.tv_nsec;
}
static int jarvis_cpu_tid(void) {
#if defined(__linux__) || defined(__ANDROID__)
# if defined(SYS_gettid)
    return (int) syscall(SYS_gettid);
# elif defined(__NR_gettid)
    return (int) syscall(__NR_gettid);
# endif
#endif
    return -1;
}
static int jarvis_cpu_id_snapshot(void) {
#if defined(__linux__) || defined(__ANDROID__)
    unsigned cpu = 0;
# if defined(SYS_getcpu)
    if (syscall(SYS_getcpu, &cpu, NULL, NULL) == 0) return (int) cpu;
# elif defined(__NR_getcpu)
    if (syscall(__NR_getcpu, &cpu, NULL, NULL) == 0) return (int) cpu;
# endif
#endif
    return -1;
}

static void jarvis_cpu_reset_counters(void) {
    for (int p = 0; p < JARVIS_CPU_AUDIT_PHASES; ++p) {
        atomic_store(&g_jarvis_cpu_audit.graph_entries[p], 0);
        atomic_store(&g_jarvis_cpu_audit.graph_completions[p], 0);
        atomic_store(&g_jarvis_cpu_audit.graph_failures[p], 0);
        atomic_store(&g_jarvis_cpu_audit.graph_nodes_planned[p], 0);
        atomic_store(&g_jarvis_cpu_audit.max_graph_threads[p], 0);
        atomic_store(&g_jarvis_cpu_audit.worker_calls[p], 0);
        atomic_store(&g_jarvis_cpu_audit.worker_returns[p], 0);
        atomic_store(&g_jarvis_cpu_audit.worker_wall_ns[p], 0);
        atomic_store(&g_jarvis_cpu_audit.worker_thread_cpu_ns[p], 0);
        atomic_store(&g_jarvis_cpu_audit.cpu_snapshot_changes[p], 0);
        atomic_store(&g_jarvis_cpu_audit.generic_compute_path_calls[p], 0);
        atomic_store(&g_jarvis_cpu_audit.extra_compute_path_calls[p], 0);
        atomic_store(&g_jarvis_cpu_audit.fused_followup_nodes[p], 0);
        for (int op = 0; op < GGML_OP_COUNT; ++op) {
            atomic_store(&g_jarvis_cpu_audit.node_dispatch[p][op], 0);
            atomic_store(&g_jarvis_cpu_audit.node_completion[p][op], 0);
            atomic_store(&g_jarvis_cpu_audit.worker_dispatch[p][op], 0);
            atomic_store(&g_jarvis_cpu_audit.worker_completion[p][op], 0);
        }
        for (int w = 0; w < JARVIS_CPU_AUDIT_MAX_WORKERS; ++w) {
            struct jarvis_cpu_worker_stats * ws = &g_jarvis_cpu_audit.workers[p][w];
            atomic_store(&ws->calls, 0); atomic_store(&ws->returns, 0);
            atomic_store(&ws->wall_ns, 0); atomic_store(&ws->thread_cpu_ns, 0);
            atomic_store(&ws->cpu_snapshot_changes, 0);
            atomic_store(&ws->tid, -1); atomic_store(&ws->last_cpu_start, -1); atomic_store(&ws->last_cpu_end, -1);
        }
    }
}

GGML_BACKEND_API void ggml_backend_cpu_set_jarvis_audit(int enabled) {
    atomic_store_explicit(&g_jarvis_cpu_audit.enabled, enabled != 0, memory_order_relaxed);
    if (enabled) {
        jarvis_cpu_reset_counters();
        atomic_store(&g_jarvis_cpu_audit.phase, 0);
        atomic_store(&g_jarvis_cpu_active_run, atomic_fetch_add(&g_jarvis_cpu_run_sequence, 1) + 1);
    }
}
GGML_BACKEND_API void ggml_backend_cpu_jarvis_set_phase(int phase) {
    atomic_store_explicit(&g_jarvis_cpu_audit.phase, phase ? 1 : 0, memory_order_relaxed);
}
GGML_BACKEND_API void ggml_backend_cpu_jarvis_graph_begin(int n_nodes, int n_threads) {
    if (!atomic_load_explicit(&g_jarvis_cpu_audit.enabled, memory_order_relaxed)) return;
    const int p = jarvis_cpu_phase();
    atomic_fetch_add(&g_jarvis_cpu_audit.graph_entries[p], 1);
    if (n_nodes > 0) atomic_fetch_add(&g_jarvis_cpu_audit.graph_nodes_planned[p], (uint64_t) n_nodes);
    const uint64_t old = atomic_load(&g_jarvis_cpu_audit.max_graph_threads[p]);
    if ((uint64_t) n_threads > old) atomic_store(&g_jarvis_cpu_audit.max_graph_threads[p], (uint64_t) n_threads);
}
GGML_BACKEND_API void ggml_backend_cpu_jarvis_graph_complete(int status) {
    if (!atomic_load_explicit(&g_jarvis_cpu_audit.enabled, memory_order_relaxed)) return;
    const int p = jarvis_cpu_phase();
    atomic_fetch_add(&g_jarvis_cpu_audit.graph_completions[p], 1);
    if (status != GGML_STATUS_SUCCESS) atomic_fetch_add(&g_jarvis_cpu_audit.graph_failures[p], 1);
}

static void jarvis_cpu_note_node_dispatch(const struct ggml_tensor * node) {
    if (!atomic_load_explicit(&g_jarvis_cpu_audit.enabled, memory_order_relaxed) || !node) return;
    const int op = (int) node->op;
    if (op >= 0 && op < GGML_OP_COUNT) atomic_fetch_add(&g_jarvis_cpu_audit.node_dispatch[jarvis_cpu_phase()][op], 1);
}
static void jarvis_cpu_note_node_completion(const struct ggml_tensor * node) {
    if (!atomic_load_explicit(&g_jarvis_cpu_audit.enabled, memory_order_relaxed) || !node) return;
    const int op = (int) node->op;
    if (op >= 0 && op < GGML_OP_COUNT) atomic_fetch_add(&g_jarvis_cpu_audit.node_completion[jarvis_cpu_phase()][op], 1);
}

struct jarvis_cpu_worker_stamp {
    bool active;
    int phase;
    int op;
    int ith;
    int tid;
    int cpu_start;
    uint64_t wall_start_ns;
    uint64_t thread_cpu_start_ns;
};
static struct jarvis_cpu_worker_stamp jarvis_cpu_worker_begin(const struct ggml_tensor * node, int ith) {
    struct jarvis_cpu_worker_stamp s = {0};
    if (!atomic_load_explicit(&g_jarvis_cpu_audit.enabled, memory_order_relaxed) || !node) return s;
    const int op = (int) node->op;
    if (op < 0 || op >= GGML_OP_COUNT) return s;
    s.active = true; s.phase = jarvis_cpu_phase(); s.op = op; s.ith = ith;
    s.tid = jarvis_cpu_tid(); s.cpu_start = jarvis_cpu_id_snapshot();
    s.wall_start_ns = jarvis_cpu_clock_ns(CLOCK_MONOTONIC);
    s.thread_cpu_start_ns = jarvis_cpu_clock_ns(CLOCK_THREAD_CPUTIME_ID);
    atomic_fetch_add(&g_jarvis_cpu_audit.worker_calls[s.phase], 1);
    atomic_fetch_add(&g_jarvis_cpu_audit.worker_dispatch[s.phase][op], 1);
    if (ith >= 0 && ith < JARVIS_CPU_AUDIT_MAX_WORKERS) {
        struct jarvis_cpu_worker_stats * ws = &g_jarvis_cpu_audit.workers[s.phase][ith];
        atomic_fetch_add(&ws->calls, 1); atomic_store(&ws->tid, s.tid); atomic_store(&ws->last_cpu_start, s.cpu_start);
    }
    return s;
}
static void jarvis_cpu_worker_end(struct jarvis_cpu_worker_stamp s) {
    if (!s.active) return;
    const uint64_t wall_end = jarvis_cpu_clock_ns(CLOCK_MONOTONIC);
    const uint64_t cpu_end_ns = jarvis_cpu_clock_ns(CLOCK_THREAD_CPUTIME_ID);
    const int cpu_end = jarvis_cpu_id_snapshot();
    const uint64_t wall_delta = wall_end >= s.wall_start_ns ? wall_end - s.wall_start_ns : 0;
    const uint64_t cpu_delta = cpu_end_ns >= s.thread_cpu_start_ns ? cpu_end_ns - s.thread_cpu_start_ns : 0;
    atomic_fetch_add(&g_jarvis_cpu_audit.worker_returns[s.phase], 1);
    atomic_fetch_add(&g_jarvis_cpu_audit.worker_completion[s.phase][s.op], 1);
    atomic_fetch_add(&g_jarvis_cpu_audit.worker_wall_ns[s.phase], wall_delta);
    atomic_fetch_add(&g_jarvis_cpu_audit.worker_thread_cpu_ns[s.phase], cpu_delta);
    if (s.cpu_start >= 0 && cpu_end >= 0 && s.cpu_start != cpu_end) atomic_fetch_add(&g_jarvis_cpu_audit.cpu_snapshot_changes[s.phase], 1);
    if (s.ith >= 0 && s.ith < JARVIS_CPU_AUDIT_MAX_WORKERS) {
        struct jarvis_cpu_worker_stats * ws = &g_jarvis_cpu_audit.workers[s.phase][s.ith];
        atomic_fetch_add(&ws->returns, 1); atomic_fetch_add(&ws->wall_ns, wall_delta); atomic_fetch_add(&ws->thread_cpu_ns, cpu_delta);
        atomic_store(&ws->last_cpu_end, cpu_end);
        if (s.cpu_start >= 0 && cpu_end >= 0 && s.cpu_start != cpu_end) atomic_fetch_add(&ws->cpu_snapshot_changes, 1);
    }
}
static void jarvis_cpu_note_generic_path(void) {
    if (atomic_load_explicit(&g_jarvis_cpu_audit.enabled, memory_order_relaxed)) atomic_fetch_add(&g_jarvis_cpu_audit.generic_compute_path_calls[jarvis_cpu_phase()], 1);
}
static void jarvis_cpu_note_extra_path(void) {
    if (atomic_load_explicit(&g_jarvis_cpu_audit.enabled, memory_order_relaxed)) atomic_fetch_add(&g_jarvis_cpu_audit.extra_compute_path_calls[jarvis_cpu_phase()], 1);
}
static void jarvis_cpu_note_fused_followups(int n) {
    if (n > 0 && atomic_load_explicit(&g_jarvis_cpu_audit.enabled, memory_order_relaxed)) atomic_fetch_add(&g_jarvis_cpu_audit.fused_followup_nodes[jarvis_cpu_phase()], (uint64_t) n);
}

static void jarvis_cpu_json_append(char ** dst, size_t * remaining, const char * fmt, ...) {
    if (*remaining <= 1) return;
    va_list ap; va_start(ap, fmt);
    const int n = vsnprintf(*dst, *remaining, fmt, ap);
    va_end(ap);
    if (n < 0) return;
    const size_t used = (size_t) n >= *remaining ? *remaining - 1 : (size_t) n;
    *dst += used; *remaining -= used;
}
static uint64_t jarvis_cpu_sum_ops(atomic_uint_fast64_t counts[GGML_OP_COUNT]) {
    uint64_t total = 0;
    for (int op = 0; op < GGML_OP_COUNT; ++op) total += atomic_load(&counts[op]);
    return total;
}

GGML_BACKEND_API const char * ggml_backend_cpu_get_jarvis_audit_json(void) {
    char * w = g_jarvis_cpu_json; size_t rem = sizeof(g_jarvis_cpu_json); g_jarvis_cpu_json[0] = '\0';
    const bool enabled = atomic_load(&g_jarvis_cpu_audit.enabled);
    const uint64_t completions = atomic_load(&g_jarvis_cpu_audit.graph_completions[0]) + atomic_load(&g_jarvis_cpu_audit.graph_completions[1]);
    const uint64_t failures = atomic_load(&g_jarvis_cpu_audit.graph_failures[0]) + atomic_load(&g_jarvis_cpu_audit.graph_failures[1]);
    const uint64_t returned = atomic_load(&g_jarvis_cpu_audit.worker_returns[0]) + atomic_load(&g_jarvis_cpu_audit.worker_returns[1]);
    const char * verdict = completions > 0 && returned > 0 ? "CPU_GRAPH_AND_NODE_COMPLETION_VERIFIED" : returned > 0 ? "CPU_OP_DISPATCH_RETURN_OBSERVED" : "INSUFFICIENT_EVIDENCE";
    const char * level = completions > 0 && returned > 0 ? "E6" : returned > 0 ? "E4" : "E0";
    jarvis_cpu_json_append(&w,&rem,"{\"schema_version\":\"1.0.0\",\"enabled\":%s,\"run_id\":%llu,\"llama_commit\":\"%s\",\"cpu_audit_patch_sha256\":\"%s\",\"verdict\":\"%s\",\"evidence_level\":\"%s\",\"evidence_model\":\"E0 device -> E1 buffer -> E2 assignment -> E3 CPU graph -> E4 op dispatch -> E6 node/graph completion; E5 exact microkernel participation and E7 scheduler residency require deeper/OS tracing\",\"successful_graph_completions\":%llu,",enabled?"true":"false",(unsigned long long)atomic_load(&g_jarvis_cpu_active_run),JARVIS_LLAMA_COMMIT,JARVIS_CPU_AUDIT_PATCH_SHA256,verdict,level,(unsigned long long)(completions >= failures ? completions - failures : 0));
    jarvis_cpu_json_append(&w,&rem,"\"physical_cpu_core_execution\":\"NOT_PROVEN_WITHOUT_SCHED_TRACE\",\"exact_microkernel\":\"UNVERIFIED\",\"kernel_provider\":\"UNVERIFIED_EXACT_PROVIDER\",\"e9_output_consumption\":\"NOT_CORRELATED_IN_CPU_AUDIT\",\"features\":{\"neon\":%d,\"arm_fma\":%d,\"fp16_va\":%d,\"dotprod\":%d,\"i8mm\":%d,\"sve\":%d,\"sve_bytes\":%d,\"sme\":%d,\"sme2\":%d},",ggml_cpu_has_neon(),ggml_cpu_has_arm_fma(),ggml_cpu_has_fp16_va(),ggml_cpu_has_dotprod(),ggml_cpu_has_matmul_int8(),ggml_cpu_has_sve(),ggml_cpu_get_sve_cnt(),ggml_cpu_has_sme(),ggml_cpu_has_sme2());
    for (int p = 0; p < 2; ++p) {
        const char * name = p == 0 ? "prefill" : "decode";
        jarvis_cpu_json_append(&w,&rem,"\"%s\":{\"graph_entries\":%llu,\"graph_completions\":%llu,\"graph_failures\":%llu,\"graph_nodes_planned\":%llu,\"max_graph_threads\":%llu,\"node_dispatches\":%llu,\"node_completions\":%llu,\"worker_calls\":%llu,\"worker_returns\":%llu,\"worker_wall_ns\":%llu,\"worker_thread_cpu_ns\":%llu,\"cpu_start_end_snapshot_changes\":%llu,\"generic_compute_path_calls\":%llu,\"extra_compute_path_calls\":%llu,\"fused_followup_nodes\":%llu},",name,(unsigned long long)atomic_load(&g_jarvis_cpu_audit.graph_entries[p]),(unsigned long long)atomic_load(&g_jarvis_cpu_audit.graph_completions[p]),(unsigned long long)atomic_load(&g_jarvis_cpu_audit.graph_failures[p]),(unsigned long long)atomic_load(&g_jarvis_cpu_audit.graph_nodes_planned[p]),(unsigned long long)atomic_load(&g_jarvis_cpu_audit.max_graph_threads[p]),(unsigned long long)jarvis_cpu_sum_ops(g_jarvis_cpu_audit.node_dispatch[p]),(unsigned long long)jarvis_cpu_sum_ops(g_jarvis_cpu_audit.node_completion[p]),(unsigned long long)atomic_load(&g_jarvis_cpu_audit.worker_calls[p]),(unsigned long long)atomic_load(&g_jarvis_cpu_audit.worker_returns[p]),(unsigned long long)atomic_load(&g_jarvis_cpu_audit.worker_wall_ns[p]),(unsigned long long)atomic_load(&g_jarvis_cpu_audit.worker_thread_cpu_ns[p]),(unsigned long long)atomic_load(&g_jarvis_cpu_audit.cpu_snapshot_changes[p]),(unsigned long long)atomic_load(&g_jarvis_cpu_audit.generic_compute_path_calls[p]),(unsigned long long)atomic_load(&g_jarvis_cpu_audit.extra_compute_path_calls[p]),(unsigned long long)atomic_load(&g_jarvis_cpu_audit.fused_followup_nodes[p]));
    }
    jarvis_cpu_json_append(&w,&rem,"\"op_counts\":{"); bool first = true;
    for (int op = 0; op < GGML_OP_COUNT; ++op) {
        const uint64_t nd = atomic_load(&g_jarvis_cpu_audit.node_dispatch[0][op]) + atomic_load(&g_jarvis_cpu_audit.node_dispatch[1][op]);
        const uint64_t nc = atomic_load(&g_jarvis_cpu_audit.node_completion[0][op]) + atomic_load(&g_jarvis_cpu_audit.node_completion[1][op]);
        const uint64_t wd = atomic_load(&g_jarvis_cpu_audit.worker_dispatch[0][op]) + atomic_load(&g_jarvis_cpu_audit.worker_dispatch[1][op]);
        const uint64_t wc = atomic_load(&g_jarvis_cpu_audit.worker_completion[0][op]) + atomic_load(&g_jarvis_cpu_audit.worker_completion[1][op]);
        if (!(nd || nc || wd || wc)) continue;
        jarvis_cpu_json_append(&w,&rem,"%s\"%s\":{\"node_dispatch\":%llu,\"node_completion\":%llu,\"worker_dispatch\":%llu,\"worker_completion\":%llu}",first?"":",",ggml_op_name((enum ggml_op)op),(unsigned long long)nd,(unsigned long long)nc,(unsigned long long)wd,(unsigned long long)wc);
        first = false;
    }
    jarvis_cpu_json_append(&w,&rem,"},\"workers\":["); first = true;
    for (int p = 0; p < 2; ++p) for (int ith = 0; ith < JARVIS_CPU_AUDIT_MAX_WORKERS; ++ith) {
        struct jarvis_cpu_worker_stats * ws = &g_jarvis_cpu_audit.workers[p][ith];
        const uint64_t calls = atomic_load(&ws->calls); if (!calls) continue;
        jarvis_cpu_json_append(&w,&rem,"%s{\"phase\":\"%s\",\"ith\":%d,\"tid\":%d,\"calls\":%llu,\"returns\":%llu,\"wall_ns\":%llu,\"thread_cpu_ns\":%llu,\"last_cpu_start\":%d,\"last_cpu_end\":%d,\"start_end_snapshot_changes\":%llu}",first?"":",",p==0?"prefill":"decode",ith,atomic_load(&ws->tid),(unsigned long long)calls,(unsigned long long)atomic_load(&ws->returns),(unsigned long long)atomic_load(&ws->wall_ns),(unsigned long long)atomic_load(&ws->thread_cpu_ns),atomic_load(&ws->last_cpu_start),atomic_load(&ws->last_cpu_end),(unsigned long long)atomic_load(&ws->cpu_snapshot_changes));
        first = false;
    }
    jarvis_cpu_json_append(&w,&rem,"],\"limitations\":[\"CPU-ID values are start/end syscall snapshots and do not prove full interval residency or migrations.\",\"worker_dispatch counts calls into the CPU op path; it does not prove every worker had a non-empty arithmetic partition.\",\"node_completion is recorded after the existing CPU threadpool barrier; fused follow-up nodes are counted once by worker 0 and are not claimed as independent dispatches.\",\"Exact NEON/KleidiAI microkernel symbol, frequency, PMU cycles/IPC/cache and physical core residency remain UNVERIFIED without deeper provider hooks and/or Perfetto/ftrace.\",\"Audit timing is diagnostic and must not be used as canonical performance.\"]}");
    return g_jarvis_cpu_json;
}
'''
c = c.replace(state_marker, state_marker + state, 1)

extra_marker = '''    // extra_buffer op?\n    if (ggml_cpu_extra_compute_forward(params, tensor)) {\n        return;\n    }\n\n    switch (tensor->op) {'''
extra_repl = '''    // extra_buffer op?\n    if (ggml_cpu_extra_compute_forward(params, tensor)) {\n        jarvis_cpu_note_extra_path();\n        return;\n    }\n\n    jarvis_cpu_note_generic_path();\n    switch (tensor->op) {'''
if extra_marker not in c:
    raise SystemExit("ggml_compute_forward extra-buffer marker not found")
c = c.replace(extra_marker, extra_repl, 1)

loop_marker = '''    for (int node_n = 0; node_n < cgraph->n_nodes && atomic_load_explicit(&tp->abort, memory_order_relaxed) != node_n; node_n++) {\n        struct ggml_tensor * node = cgraph->nodes[node_n];'''
loop_repl = '''    struct ggml_tensor * jarvis_last_node_for_completion = NULL;\n    for (int node_n = 0; node_n < cgraph->n_nodes && atomic_load_explicit(&tp->abort, memory_order_relaxed) != node_n; node_n++) {\n        struct ggml_tensor * node = cgraph->nodes[node_n];'''
if loop_marker not in c:
    raise SystemExit("CPU worker loop marker not found")
c = c.replace(loop_marker, loop_repl, 1)

compute_marker = '''        // TODO: move fused-op detection into ggml_graph_plan so fusion decisions are made once at planning time\n        // Try fused ops, fall back to normal compute\n        const int n_fused = ggml_cpu_try_fuse_ops(cgraph, node_n, &params, cplan);\n        if (n_fused > 0) {\n            node_n += n_fused;\n        } else {\n            ggml_compute_forward(&params, node);\n        }'''
compute_repl = '''        if (state->ith == 0) jarvis_cpu_note_node_dispatch(node);\n        struct jarvis_cpu_worker_stamp jarvis_stamp = jarvis_cpu_worker_begin(node, state->ith);\n        // Try fused ops, fall back to normal compute. This proves the CPU software call/return path;\n        // exact participating arithmetic partition/microkernel remains a deeper E5 hook.\n        const int n_fused = ggml_cpu_try_fuse_ops(cgraph, node_n, &params, cplan);\n        if (n_fused > 0) {\n            if (state->ith == 0) jarvis_cpu_note_fused_followups(n_fused);\n            node_n += n_fused;\n        } else {\n            ggml_compute_forward(&params, node);\n        }\n        jarvis_cpu_worker_end(jarvis_stamp);\n        jarvis_last_node_for_completion = node;'''
if compute_marker not in c:
    raise SystemExit("CPU compute dispatch marker not found")
c = c.replace(compute_marker, compute_repl, 1)

barrier_marker = '''        if (node_n + 1 < cgraph->n_nodes) {\n            ggml_barrier(state->threadpool);\n        }\n    }'''
barrier_repl = '''        if (node_n + 1 < cgraph->n_nodes) {\n            ggml_barrier(state->threadpool);\n            if (state->ith == 0) { jarvis_cpu_note_node_completion(node); jarvis_last_node_for_completion = NULL; }\n        }\n    }'''
if barrier_marker not in c:
    raise SystemExit("CPU per-node barrier marker not found")
c = c.replace(barrier_marker, barrier_repl, 1)

final_barrier = '''    ggml_barrier(state->threadpool);\n\n#ifdef GGML_USE_CPU_RISCV64_SPACEMIT'''
final_repl = '''    ggml_barrier(state->threadpool);\n    if (state->ith == 0 && jarvis_last_node_for_completion != NULL) jarvis_cpu_note_node_completion(jarvis_last_node_for_completion);\n\n#ifdef GGML_USE_CPU_RISCV64_SPACEMIT'''
if final_barrier not in c:
    raise SystemExit("CPU final barrier marker not found")
c = c.replace(final_barrier, final_repl, 1)

# ----- ggml-cpu.cpp: E3 CPU graph entry and E6 synchronous graph return ----------------------
decl_marker = '// ggml-backend interface\n'
if decl_marker not in cpp:
    raise SystemExit("ggml-cpu.cpp backend marker not found")
cpp = cpp.replace(decl_marker, '''extern "C" void ggml_backend_cpu_jarvis_graph_begin(int n_nodes, int n_threads);\nextern "C" void ggml_backend_cpu_jarvis_graph_complete(int status);\n\n''' + decl_marker, 1)

plan_marker = '''static enum ggml_status ggml_backend_cpu_graph_plan_compute(ggml_backend_t backend, ggml_backend_graph_plan_t plan) {\n    struct ggml_backend_plan_cpu * cpu_plan = (struct ggml_backend_plan_cpu *)plan;\n\n    return ggml_graph_compute(&cpu_plan->cgraph, &cpu_plan->cplan);\n\n    GGML_UNUSED(backend);\n}'''
plan_repl = '''static enum ggml_status ggml_backend_cpu_graph_plan_compute(ggml_backend_t backend, ggml_backend_graph_plan_t plan) {\n    struct ggml_backend_plan_cpu * cpu_plan = (struct ggml_backend_plan_cpu *)plan;\n    ggml_backend_cpu_jarvis_graph_begin(cpu_plan->cgraph.n_nodes, cpu_plan->cplan.n_threads);\n    const enum ggml_status status = ggml_graph_compute(&cpu_plan->cgraph, &cpu_plan->cplan);\n    ggml_backend_cpu_jarvis_graph_complete((int) status);\n    GGML_UNUSED(backend);\n    return status;\n}'''
if plan_marker not in cpp:
    raise SystemExit("CPU graph plan compute marker not found")
cpp = cpp.replace(plan_marker, plan_repl, 1)

compute_marker_cpp = '''    cplan.abort_callback      = cpu_ctx->abort_callback;\n    cplan.abort_callback_data = cpu_ctx->abort_callback_data;\n    cplan.use_ref             = cpu_ctx->use_ref;\n\n    return ggml_graph_compute(cgraph, &cplan);\n}'''
compute_repl_cpp = '''    cplan.abort_callback      = cpu_ctx->abort_callback;\n    cplan.abort_callback_data = cpu_ctx->abort_callback_data;\n    cplan.use_ref             = cpu_ctx->use_ref;\n\n    ggml_backend_cpu_jarvis_graph_begin(cgraph->n_nodes, cplan.n_threads);\n    const enum ggml_status status = ggml_graph_compute(cgraph, &cplan);\n    ggml_backend_cpu_jarvis_graph_complete((int) status);\n    return status;\n}'''
if compute_marker_cpp not in cpp:
    raise SystemExit("CPU graph compute marker not found")
cpp = cpp.replace(compute_marker_cpp, compute_repl_cpp, 1)

(out / "ggml-cpu.c").write_text(c)
(out / "ggml-cpu.cpp").write_text(cpp)
print(f"wrote patched CPU audit sources to {out}")
