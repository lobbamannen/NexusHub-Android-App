#pragma once

#include <cstdint>
#include <string>

struct ggml_tensor;

enum class JarvisAuditPhase : int {
    SETUP = 0,
    PREFILL = 1,
    DECODE = 2,
};

// Deep HTP audit is opt-in because Hexagon verbose/profile mode and per-node callbacks add
// measurable overhead. These hooks never change model math, sampling, or backend selection.
void jarvis_htp_audit_configure_environment(bool enabled);
void jarvis_htp_audit_reset(bool enabled);
void jarvis_htp_audit_set_phase(JarvisAuditPhase phase);
void jarvis_htp_audit_begin_graph_call(JarvisAuditPhase phase);
void jarvis_htp_audit_observe_node(const ggml_tensor * tensor);
void jarvis_htp_audit_parse_log(const char * text);

std::string jarvis_htp_audit_json(
    const std::string & active_backend,
    int32_t requested_layers,
    int32_t assigned_layers,
    int32_t total_layers,
    int32_t output_tokens,
    const std::string & finish_reason);
