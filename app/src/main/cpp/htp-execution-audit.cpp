#include "htp-execution-audit.h"

#include <algorithm>
#include <atomic>
#include <cctype>
#include <cstdlib>
#include <map>
#include <mutex>
#include <string>
#include <unordered_set>
#include <vector>

#include "ggml.h"
#include "ggml-backend.h"
#include "json.h"

namespace {

struct PhaseStats {
    int64_t graph_calls = 0;
    int64_t observed_nodes = 0;
    int64_t htp_nodes = 0;
    int64_t cpu_nodes = 0;
    int64_t other_nodes = 0;
    int64_t derived_backend_transitions = 0;
    int64_t supports_yes = 0;
    int64_t supports_no = 0;
    int64_t execute_ops = 0;
    int64_t profile_ops = 0;
    int64_t queue_submits = 0;
    int64_t batch_pushes = 0;
    int64_t batch_completions = 0;
    int64_t batch_profiles = 0;
    int64_t hmx_starts = 0;
    int64_t hmx_stops = 0;
    int64_t hvx_starts = 0;
    int64_t hvx_stops = 0;
    int64_t dma_starts = 0;
    int64_t dma_stops = 0;
    int64_t set_tensor_bytes = 0;
    int64_t get_tensor_bytes = 0;
    std::string last_backend_class;
    std::map<std::string, int64_t> execute_op_counts;
    std::map<std::string, int64_t> profile_op_counts;
    std::map<std::string, int64_t> observed_htp_ops;
    std::map<std::string, int64_t> observed_cpu_ops;
    std::map<std::string, int64_t> observed_other_ops;
    std::map<std::string, int64_t> trace_event_counts;
};

struct AuditState {
    bool enabled = false;
    uint64_t run_id = 0;
    PhaseStats setup;
    PhaseStats prefill;
    PhaseStats decode;
    std::map<std::string, int64_t> buffer_alloc_bytes;
    std::map<std::string, int64_t> logical_tensor_bytes;
    std::map<std::string, int64_t> buffer_counts;
    std::unordered_set<const void *> seen_buffers;
    std::unordered_set<const void *> seen_tensors;
    bool placement_truncated = false;
};

std::mutex g_audit_mutex;
AuditState g_audit;
std::atomic<int> g_phase{static_cast<int>(JarvisAuditPhase::SETUP)};
std::atomic<uint64_t> g_run_counter{0};

std::string lower_copy(std::string s) {
    std::transform(s.begin(), s.end(), s.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
    return s;
}

bool contains_ci(const std::string & value, const std::string & needle) {
    return lower_copy(value).find(lower_copy(needle)) != std::string::npos;
}

std::string backend_class(const std::string & name) {
    if (contains_ci(name, "hexagon") || contains_ci(name, "htp")) return "HTP";
    if (contains_ci(name, "cpu")) return "CPU";
    if (name.empty() || name == "UNKNOWN") return "UNKNOWN";
    return "OTHER";
}

PhaseStats & current_phase_locked() {
    switch (static_cast<JarvisAuditPhase>(g_phase.load(std::memory_order_relaxed))) {
        case JarvisAuditPhase::PREFILL: return g_audit.prefill;
        case JarvisAuditPhase::DECODE: return g_audit.decode;
        case JarvisAuditPhase::SETUP:
        default: return g_audit.setup;
    }
}

const PhaseStats & phase_const(const AuditState & state, JarvisAuditPhase phase) {
    switch (phase) {
        case JarvisAuditPhase::PREFILL: return state.prefill;
        case JarvisAuditPhase::DECODE: return state.decode;
        case JarvisAuditPhase::SETUP:
        default: return state.setup;
    }
}

std::string extract_after_until(const std::string & line, const std::string & marker, char delimiter) {
    const size_t p = line.find(marker);
    if (p == std::string::npos) return {};
    const size_t start = p + marker.size();
    const size_t end = line.find(delimiter, start);
    if (end == std::string::npos) return line.substr(start);
    return line.substr(start, end - start);
}

int64_t parse_u64_after(const std::string & line, const std::string & marker) {
    const size_t p = line.find(marker);
    if (p == std::string::npos) return 0;
    const char * begin = line.c_str() + p + marker.size();
    char * end = nullptr;
    const unsigned long long value = std::strtoull(begin, &end, 10);
    return end == begin ? 0 : static_cast<int64_t>(value);
}

common_json map_json(const std::map<std::string, int64_t> & values) {
    common_json out = common_json::object();
    for (const auto & item : values) out[item.first] = item.second;
    return out;
}

common_json phase_json(const PhaseStats & p) {
    return {
        {"graph_calls", p.graph_calls},
        {"observed_node_evaluations", p.observed_nodes},
        {"observed_htp_nodes", p.htp_nodes},
        {"observed_cpu_nodes", p.cpu_nodes},
        {"observed_other_nodes", p.other_nodes},
        {"exact_graph_splits", common_json(nullptr)},
        {"derived_backend_transitions", p.derived_backend_transitions},
        {"supports_yes", p.supports_yes},
        {"supports_no", p.supports_no},
        {"htp_execute_ops", p.execute_ops},
        {"htp_profile_ops", p.profile_ops},
        {"queue_submit_attempts", p.queue_submits},
        {"batch_pushes", p.batch_pushes},
        {"completed_batches", p.batch_completions},
        {"profiled_batches", p.batch_profiles},
        {"hmx_trace_starts", p.hmx_starts},
        {"hmx_trace_stops", p.hmx_stops},
        {"hvx_trace_starts", p.hvx_starts},
        {"hvx_trace_stops", p.hvx_stops},
        {"dma_trace_starts", p.dma_starts},
        {"dma_trace_stops", p.dma_stops},
        {"set_tensor_bytes", p.set_tensor_bytes},
        {"get_tensor_bytes", p.get_tensor_bytes},
        {"execute_op_counts", map_json(p.execute_op_counts)},
        {"profile_op_counts", map_json(p.profile_op_counts)},
        {"trace_event_counts", map_json(p.trace_event_counts)}
    };
}

int64_t sum_field(const AuditState & s, int64_t PhaseStats::* field) {
    return s.setup.*field + s.prefill.*field + s.decode.*field;
}

int64_t sum_matching(const AuditState & s, const std::vector<std::string> & patterns,
                     const std::map<std::string, int64_t> PhaseStats::* field) {
    int64_t total = 0;
    for (JarvisAuditPhase phase : {JarvisAuditPhase::SETUP, JarvisAuditPhase::PREFILL, JarvisAuditPhase::DECODE}) {
        const auto & values = phase_const(s, phase).*field;
        for (const auto & item : values) {
            for (const auto & pattern : patterns) {
                if (contains_ci(item.first, pattern)) {
                    total += item.second;
                    break;
                }
            }
        }
    }
    return total;
}

common_json critical_op_json(const AuditState & s, const std::vector<std::string> & patterns) {
    const int64_t htp_placement = sum_matching(s, patterns, &PhaseStats::observed_htp_ops);
    const int64_t cpu_placement = sum_matching(s, patterns, &PhaseStats::observed_cpu_ops);
    const int64_t other_placement = sum_matching(s, patterns, &PhaseStats::observed_other_ops);
    const int64_t dispatches = sum_matching(s, patterns, &PhaseStats::execute_op_counts);
    const int64_t profiles = sum_matching(s, patterns, &PhaseStats::profile_op_counts);

    std::string status = "UNVERIFIED";
    if (dispatches > 0 && cpu_placement > 0) status = "MIXED";
    else if (dispatches > 0) status = "HTP_DISPATCHED";
    else if (htp_placement > 0 && cpu_placement > 0) status = "MIXED_PLACEMENT";
    else if (htp_placement > 0) status = "HTP_PLACEMENT_OBSERVED";
    else if (cpu_placement > 0) status = "CPU_OBSERVED";

    return {
        {"status", status},
        {"observed_htp_nodes", htp_placement},
        {"observed_cpu_nodes", cpu_placement},
        {"observed_other_nodes", other_placement},
        {"htp_dispatches", dispatches},
        {"htp_profile_records", profiles},
        {"compute_resource", "UNVERIFIED_PER_OP"},
        {"compute_note", "Pinned upstream trace records expose HMX/HVX activity but no stable op_index; resource attribution is batch-level only."}
    };
}

int64_t bytes_for_class(const std::map<std::string, int64_t> & values, const std::string & wanted) {
    int64_t total = 0;
    for (const auto & item : values) {
        if (backend_class(item.first) == wanted) total += item.second;
    }
    return total;
}

} // namespace

void jarvis_htp_audit_configure_environment(bool enabled) {
    // The upstream Hexagon backend reads these when its registry is initialized. Jarvis records
    // whether trace evidence actually arrives instead of assuming the environment request worked.
    setenv("GGML_HEXAGON_VERBOSE", enabled ? "1" : "0", 1);
    setenv("GGML_HEXAGON_PROFILE", enabled ? "3" : "0", 1);
    setenv("GGML_HEXAGON_OPTRACE", enabled ? "65536" : "0", 1);
}

void jarvis_htp_audit_reset(bool enabled) {
    std::lock_guard<std::mutex> lock(g_audit_mutex);
    g_audit = AuditState{};
    g_audit.enabled = enabled;
    g_audit.run_id = ++g_run_counter;
    g_phase.store(static_cast<int>(JarvisAuditPhase::SETUP), std::memory_order_relaxed);
}

void jarvis_htp_audit_set_phase(JarvisAuditPhase phase) {
    g_phase.store(static_cast<int>(phase), std::memory_order_relaxed);
}

void jarvis_htp_audit_begin_graph_call(JarvisAuditPhase phase) {
    g_phase.store(static_cast<int>(phase), std::memory_order_relaxed);
    std::lock_guard<std::mutex> lock(g_audit_mutex);
    if (!g_audit.enabled) return;
    auto & p = current_phase_locked();
    p.graph_calls++;
    p.last_backend_class.clear();
}

void jarvis_htp_audit_observe_node(const ggml_tensor * tensor) {
    if (!tensor) return;
    std::lock_guard<std::mutex> lock(g_audit_mutex);
    if (!g_audit.enabled) return;

    const ggml_tensor * storage = tensor;
    while (storage && !storage->buffer && storage->view_src) storage = storage->view_src;
    const char * raw_name = storage && storage->buffer
        ? ggml_backend_buft_name(ggml_backend_buffer_get_type(storage->buffer))
        : "UNKNOWN";
    const std::string buffer_name = raw_name ? raw_name : "UNKNOWN";
    const std::string klass = backend_class(buffer_name);
    const char * raw_op = ggml_op_name(tensor->op);
    const std::string op = raw_op ? raw_op : "UNKNOWN";

    auto & p = current_phase_locked();
    p.observed_nodes++;
    if (klass == "HTP") {
        p.htp_nodes++;
        p.observed_htp_ops[op]++;
    } else if (klass == "CPU") {
        p.cpu_nodes++;
        p.observed_cpu_ops[op]++;
    } else {
        p.other_nodes++;
        p.observed_other_ops[op]++;
    }
    if (!p.last_backend_class.empty() && p.last_backend_class != klass) p.derived_backend_transitions++;
    p.last_backend_class = klass;

    if (storage && storage->buffer) {
        const void * buffer_key = reinterpret_cast<const void *>(storage->buffer);
        if (g_audit.seen_buffers.insert(buffer_key).second) {
            g_audit.buffer_counts[buffer_name]++;
            g_audit.buffer_alloc_bytes[buffer_name] += static_cast<int64_t>(ggml_backend_buffer_get_size(storage->buffer));
        }
    }
    const void * tensor_key = reinterpret_cast<const void *>(storage);
    if (storage && g_audit.seen_tensors.insert(tensor_key).second) {
        g_audit.logical_tensor_bytes[buffer_name] += static_cast<int64_t>(ggml_nbytes(storage));
    }
}

void jarvis_htp_audit_parse_log(const char * text) {
    if (!text) return;
    std::lock_guard<std::mutex> lock(g_audit_mutex);
    if (!g_audit.enabled) return;

    const std::string line(text);
    if (line.find("ggml-hex:") == std::string::npos) return;
    auto & p = current_phase_locked();

    if (line.find(" supports-op ") != std::string::npos) {
        if (line.find("|yes") != std::string::npos) p.supports_yes++;
        else if (line.find("|no") != std::string::npos) p.supports_no++;
    }

    if (line.find(" execute-op ") != std::string::npos) {
        const std::string op = extract_after_until(line, " execute-op ", '|');
        p.execute_ops++;
        if (!op.empty()) p.execute_op_counts[op]++;
    }

    if (line.find(" profile-op OPBATCH|") != std::string::npos) {
        p.batch_profiles++;
    } else if (line.find(" profile-op ") != std::string::npos) {
        const std::string op = extract_after_until(line, " profile-op ", '|');
        p.profile_ops++;
        if (!op.empty()) p.profile_op_counts[op]++;
    }

    if (line.find(" opqueue-push batch #") != std::string::npos) p.batch_pushes++;
    if (line.find(" queue-opbatch:") != std::string::npos) p.queue_submits++;
    if (line.find(" opqueue-pop batch #") != std::string::npos) p.batch_completions++;

    if (line.find(" trace-evt ") != std::string::npos) {
        const std::string event = extract_after_until(line, " trace-evt ", ':');
        if (!event.empty()) p.trace_event_counts[event]++;
        const bool stop = line.find(" stop ") != std::string::npos;
        const bool start = line.find(" start ") != std::string::npos;
        if (event == "HMX_COMP") {
            if (start) p.hmx_starts++;
            if (stop) p.hmx_stops++;
        } else if (event == "HVX_COMP") {
            if (start) p.hvx_starts++;
            if (stop) p.hvx_stops++;
        } else if (event == "DMA") {
            if (start) p.dma_starts++;
            if (stop) p.dma_stops++;
        }
    }

    // Count only the base set/get log lines. Async/2D wrappers call into these paths and would
    // otherwise double-count requested transfer bytes.
    if (line.find(" set-tensor ") != std::string::npos) {
        p.set_tensor_bytes += parse_u64_after(line, " size ");
    }
    if (line.find(" get-tensor ") != std::string::npos) {
        p.get_tensor_bytes += parse_u64_after(line, " size ");
    }
}

std::string jarvis_htp_audit_json(
    const std::string & active_backend,
    int32_t requested_layers,
    int32_t assigned_layers,
    int32_t total_layers,
    int32_t output_tokens,
    const std::string & finish_reason) {
    std::lock_guard<std::mutex> lock(g_audit_mutex);
    const AuditState s = g_audit;

    const int64_t htp_nodes = sum_field(s, &PhaseStats::htp_nodes);
    const int64_t cpu_nodes = sum_field(s, &PhaseStats::cpu_nodes);
    const int64_t execute_ops = sum_field(s, &PhaseStats::execute_ops);
    const int64_t queue_submits = sum_field(s, &PhaseStats::queue_submits);
    const int64_t completions = sum_field(s, &PhaseStats::batch_completions);
    const int64_t hmx_starts = sum_field(s, &PhaseStats::hmx_starts);
    const int64_t hmx_stops = sum_field(s, &PhaseStats::hmx_stops);
    const int64_t hvx_starts = sum_field(s, &PhaseStats::hvx_starts);
    const int64_t hvx_stops = sum_field(s, &PhaseStats::hvx_stops);
    const bool compute_trace = (hmx_starts > 0 && hmx_stops > 0) || (hvx_starts > 0 && hvx_stops > 0);
    const bool backend_htp = backend_class(active_backend) == "HTP";

    std::string evidence_level = "E0";
    std::string verdict = s.enabled ? "INSUFFICIENT_EVIDENCE" : "AUDIT_NOT_CAPTURED";
    if (s.enabled && backend_htp) {
        evidence_level = "E1";
        verdict = "HTP_BACKEND_ACTIVE_ONLY";
    }
    if (s.enabled && htp_nodes > 0) {
        evidence_level = "E3";
        verdict = "HEXAGON_PLACEMENT_OBSERVED";
    }
    if (s.enabled && execute_ops > 0) {
        evidence_level = "E4";
        verdict = "HTP_DISPATCH_OBSERVED";
    }
    if (s.enabled && queue_submits > 0) {
        evidence_level = "E5";
        verdict = "HTP_SUBMIT_ATTEMPT_OBSERVED";
    }
    if (s.enabled && completions > 0) {
        evidence_level = "E6";
        verdict = "HTP_BATCH_COMPLETION_OBSERVED";
    }
    if (s.enabled && compute_trace && completions > 0) {
        evidence_level = "E7";
        verdict = cpu_nodes > 0 ? "HYBRID_HTP_CPU_EXECUTION_VERIFIED" : "HTP_COMPUTE_VERIFIED_WITHOUT_OBSERVED_CPU_NODES";
    }

    common_json critical = common_json::object();
    critical["GET_ROWS"] = critical_op_json(s, {"GET_ROWS"});
    critical["MATMUL"] = critical_op_json(s, {"MUL_MAT"});
    critical["RMSNorm"] = critical_op_json(s, {"RMS_NORM"});
    critical["Attention"] = critical_op_json(s, {"FLASH_ATTN", "ATTN"});
    critical["ROPE"] = critical_op_json(s, {"ROPE"});
    critical["PLE"] = {
        {"status", "UNVERIFIED"},
        {"reason", "PLE is a semantic region composed of ordinary ggml nodes; this pinned Jarvis build does not annotate Gemma graph-builder nodes with a PLE semantic role."}
    };
    critical["FFN"] = {
        {"status", "UNVERIFIED"},
        {"reason", "FFN is a model-semantic region, not a unique HTP opcode; no stable FFN semantic annotation is emitted by the pinned runtime."}
    };
    critical["KV operations"] = {
        {"status", "UNVERIFIED"},
        {"reason", "KV-related graph work is not uniquely correlated to a physical HTP compute event by the available callback/log evidence."}
    };
    critical["LM head"] = {
        {"status", "UNVERIFIED"},
        {"reason", "The LM head is backend-level matmul, but this build does not carry a stable LM_HEAD semantic annotation into the audit."}
    };

    const int64_t htp_buffer_bytes = bytes_for_class(s.buffer_alloc_bytes, "HTP");
    const int64_t cpu_buffer_bytes = bytes_for_class(s.buffer_alloc_bytes, "CPU");
    int64_t other_buffer_bytes = 0;
    for (const auto & item : s.buffer_alloc_bytes) {
        const std::string klass = backend_class(item.first);
        if (klass != "HTP" && klass != "CPU") other_buffer_bytes += item.second;
    }

    common_json limitations = common_json::array();
    limitations.push_back("Observed node placement comes from llama.cpp's post-evaluation callback and output-buffer backend, not a physical utilization counter.");
    limitations.push_back("exact_graph_splits is UNVERIFIED: callback backend transitions are shown separately and are not claimed to equal scheduler split count.");
    limitations.push_back("Pinned upstream HTP trace records do not carry a stable htp_op_index, so HMX/HVX events are batch-correlated rather than operator-correlated.");
    limitations.push_back("Global physical HTP utilization percent is not exposed by this verified upstream path.");
    limitations.push_back("Hexagon profile/trace options are requested through upstream environment variables; the audit trusts only events actually observed in this run.");

    common_json root = {
        {"schema_version", 1},
        {"enabled", s.enabled},
        {"run_id", static_cast<int64_t>(s.run_id)},
        {"verdict", verdict},
        {"evidence_level", evidence_level},
        {"evidence_model", "E0 backend detected -> E3 placement -> E4 HTP dispatch -> E5 submit attempt -> E6 completion -> E7 HMX/HVX compute trace"},
        {"full_htp_execution", "NOT_PROVEN"},
        {"hybrid_cpu_fallback_observed", cpu_nodes > 0},
        {"active_backend", active_backend},
        {"finish_reason", finish_reason},
        {"output_tokens", output_tokens},
        {"offload", {
            {"requested_layers", requested_layers},
            {"assigned_layers", assigned_layers < 0 ? common_json(nullptr) : common_json(assigned_layers)},
            {"total_offloadable_layers", total_layers < 0 ? common_json(nullptr) : common_json(total_layers)}
        }},
        {"memory_placement", {
            {"scope", "deduplicated buffers/tensors touched by audited evaluation callbacks; not whole-system physical memory"},
            {"htp_buffer_alloc_bytes", htp_buffer_bytes},
            {"cpu_buffer_alloc_bytes", cpu_buffer_bytes},
            {"other_buffer_alloc_bytes", other_buffer_bytes},
            {"buffer_alloc_bytes_by_type", map_json(s.buffer_alloc_bytes)},
            {"logical_tensor_bytes_by_type", map_json(s.logical_tensor_bytes)},
            {"buffer_count_by_type", map_json(s.buffer_counts)}
        }},
        {"setup", phase_json(s.setup)},
        {"prefill", phase_json(s.prefill)},
        {"decode", phase_json(s.decode)},
        {"htp_execution", {
            {"supports_yes", sum_field(s, &PhaseStats::supports_yes)},
            {"supports_no", sum_field(s, &PhaseStats::supports_no)},
            {"execute_ops", execute_ops},
            {"queue_submit_attempts", queue_submits},
            {"completed_batches", completions},
            {"profile_ops", sum_field(s, &PhaseStats::profile_ops)},
            {"hmx_trace_starts", hmx_starts},
            {"hmx_trace_stops", hmx_stops},
            {"hvx_trace_starts", hvx_starts},
            {"hvx_trace_stops", hvx_stops},
            {"dma_trace_starts", sum_field(s, &PhaseStats::dma_starts)},
            {"dma_trace_stops", sum_field(s, &PhaseStats::dma_stops)},
            {"trace_to_op_correlation", "UNVERIFIED"},
            {"trace_to_op_reason", "Upstream trace event info is kernel-dependent and is not a stable HTP op index in the pinned commit."}
        }},
        {"transfers", {
            {"host_to_hexagon_requested_bytes", sum_field(s, &PhaseStats::set_tensor_bytes)},
            {"hexagon_to_host_requested_bytes", sum_field(s, &PhaseStats::get_tensor_bytes)},
            {"completed_transfer_bytes", common_json(nullptr)},
            {"completed_transfer_bytes_evidence", "UNVERIFIED without scheduler/copy completion instrumentation"}
        }},
        {"critical_ops", critical},
        {"limitations", limitations}
    };

    return root.dump();
}
