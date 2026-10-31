#include "htp-execution-audit.h"

#include <jni.h>
#include <atomic>
#include <dlfcn.h>
#include <string>

#include "llama.h"
#include "ggml-backend.h"

namespace {
std::atomic<bool> g_audit_enabled{false};
std::atomic<int> g_decode_phase{static_cast<int>(JarvisAuditPhase::PREFILL)};
std::string g_native_library_dir;
ggml_log_callback g_original_log_callback = nullptr;
void * g_original_log_user_data = nullptr;
ggml_backend_sched_eval_callback g_original_eval_callback = nullptr;
void * g_original_eval_user_data = nullptr;

std::string from_java(JNIEnv * env, jstring value) {
    if (!value) return {};
    const char * chars = env->GetStringUTFChars(value, nullptr);
    if (!chars) return {};
    std::string out(chars);
    env->ReleaseStringUTFChars(value, chars);
    return out;
}
jstring to_java(JNIEnv * env, const std::string & value) { return env->NewStringUTF(value.c_str()); }
void audit_log_callback(enum ggml_log_level level, const char * text, void *) {
    jarvis_htp_audit_parse_log(text);
    if (g_original_log_callback) g_original_log_callback(level, text, g_original_log_user_data);
}
bool audit_eval_callback(struct ggml_tensor * tensor, bool ask, void *) {
    if (ask) {
        if (g_original_eval_callback) return g_original_eval_callback(tensor, true, g_original_eval_user_data);
        return tensor && tensor->op != GGML_OP_NONE;
    }
    if (g_audit_enabled.load(std::memory_order_relaxed)) jarvis_htp_audit_observe_node(tensor);
    if (g_original_eval_callback) return g_original_eval_callback(tensor, false, g_original_eval_user_data);
    return true;
}

using control_fn = void (*)(int);
using phase_fn = void (*)(int);
using graph_fn = void (*)();
using json_fn = const char * (*)();

void * loaded_library(const char * name) {
    const std::string full = g_native_library_dir.empty() ? std::string() : g_native_library_dir + "/" + name;
    if (!full.empty()) if (void * h = dlopen(full.c_str(), RTLD_NOW | RTLD_NOLOAD)) return h;
    return dlopen(name, RTLD_NOW | RTLD_NOLOAD);
}
void apply_control(const char * lib, const char * symbol, bool enabled) {
    if (void * h = loaded_library(lib)) {
        auto fn = reinterpret_cast<control_fn>(dlsym(h, symbol));
        if (fn) fn(enabled ? 1 : 0);
        dlclose(h);
    }
}
void set_library_phase(const char * lib, const char * symbol, int phase) {
    if (void * h = loaded_library(lib)) {
        auto fn = reinterpret_cast<phase_fn>(dlsym(h, symbol));
        if (fn) fn(phase);
        dlclose(h);
    }
}
std::string library_json(const char * lib, const char * symbol) {
    if (void * h = loaded_library(lib)) {
        auto fn = reinterpret_cast<json_fn>(dlsym(h, symbol));
        std::string value = fn ? fn() : "";
        dlclose(h);
        return value;
    }
    return {};
}
void append_json_child(std::string & root, const char * key, const std::string & child) {
    if (child.empty() || child.front() != '{' || child.back() != '}' || root.empty() || root.back() != '}') return;
    root.pop_back();
    if (root.size() > 1) root.push_back(',');
    root += '"'; root += key; root += "\":"; root += child; root.push_back('}');
}
void opencl_phase(int phase) { set_library_phase("libggml-opencl.so", "ggml_backend_opencl_jarvis_set_phase", phase); }
void cpu_phase(int phase) { set_library_phase("libggml-cpu.so", "ggml_backend_cpu_jarvis_set_phase", phase); }
void opencl_begin_graph() {
    if (void * h = loaded_library("libggml-opencl.so")) {
        auto fn = reinterpret_cast<graph_fn>(dlsym(h, "ggml_backend_opencl_jarvis_begin_graph"));
        if (fn) fn();
        dlclose(h);
    }
}

// configureHtpExecutionAudit/resetHtpExecutionAudit run before initEngineExt. Accelerator DSOs are
// loaded later by ensure_requested_backends(), so RTLD_NOLOAD cannot see OpenCL/Hexagon at the
// initial toggle. Re-apply the persisted audit state once llama_init_from_model is reached: by
// then the requested backend DSO has been loaded and registered. This is intentionally done once
// per context initialization, never per token, because set_jarvis_audit(1) resets audit counters.
void late_bind_loaded_audits() {
    const bool on = g_audit_enabled.load(std::memory_order_relaxed);
    apply_control("libggml-cpu.so", "ggml_backend_cpu_set_jarvis_audit", on);
    apply_control("libggml-hexagon.so", "ggml_backend_hexagon_set_jarvis_audit", on);
    apply_control("libggml-opencl.so", "ggml_backend_opencl_set_jarvis_audit", on);
    const int p = g_decode_phase.load(std::memory_order_relaxed) == static_cast<int>(JarvisAuditPhase::DECODE) ? 1 : 0;
    cpu_phase(p);
    opencl_phase(p);
}
} // namespace

extern "C" {
void __real_llama_log_set(ggml_log_callback, void *);
struct llama_context * __real_llama_init_from_model(struct llama_model *, struct llama_context_params);
int32_t __real_llama_decode(struct llama_context *, struct llama_batch);
llama_token __real_llama_sampler_sample(struct llama_sampler *, struct llama_context *, int32_t);

void __wrap_llama_log_set(ggml_log_callback callback, void * user_data) {
    g_original_log_callback = callback;
    g_original_log_user_data = user_data;
    __real_llama_log_set(audit_log_callback, nullptr);
}
struct llama_context * __wrap_llama_init_from_model(struct llama_model * model, struct llama_context_params params) {
    if (!g_audit_enabled.load(std::memory_order_relaxed)) return __real_llama_init_from_model(model, params);
    g_original_eval_callback = params.cb_eval;
    g_original_eval_user_data = params.cb_eval_user_data;
    params.cb_eval = audit_eval_callback;
    params.cb_eval_user_data = nullptr;
    struct llama_context * ctx = __real_llama_init_from_model(model, params);
    if (ctx) late_bind_loaded_audits();
    return ctx;
}
int32_t __wrap_llama_decode(struct llama_context * ctx, struct llama_batch batch) {
    if (g_audit_enabled.load(std::memory_order_relaxed)) {
        const auto phase = static_cast<JarvisAuditPhase>(g_decode_phase.load(std::memory_order_relaxed));
        const int p = phase == JarvisAuditPhase::DECODE ? 1 : 0;
        jarvis_htp_audit_begin_graph_call(phase);
        opencl_phase(p);
        cpu_phase(p);
        opencl_begin_graph();
    }
    return __real_llama_decode(ctx, batch);
}
llama_token __wrap_llama_sampler_sample(struct llama_sampler * sampler, struct llama_context * ctx, int32_t idx) {
    const llama_token result = __real_llama_sampler_sample(sampler, ctx, idx);
    if (g_audit_enabled.load(std::memory_order_relaxed)) {
        g_decode_phase.store(static_cast<int>(JarvisAuditPhase::DECODE), std::memory_order_relaxed);
        jarvis_htp_audit_set_phase(JarvisAuditPhase::DECODE);
        opencl_phase(1);
        cpu_phase(1);
    }
    return result;
}

JNIEXPORT void JNICALL Java_com_example_ai_runtime_LlamaNative_configureHtpExecutionAudit(JNIEnv * env, jobject, jboolean enabled, jstring dir) {
    const bool on = enabled == JNI_TRUE;
    g_native_library_dir = from_java(env, dir);
    g_audit_enabled.store(on, std::memory_order_relaxed);
    jarvis_htp_audit_configure_environment(on);
    apply_control("libggml-cpu.so", "ggml_backend_cpu_set_jarvis_audit", on);
    apply_control("libggml-hexagon.so", "ggml_backend_hexagon_set_jarvis_audit", on);
    apply_control("libggml-opencl.so", "ggml_backend_opencl_set_jarvis_audit", on);
}
JNIEXPORT void JNICALL Java_com_example_ai_runtime_LlamaNative_resetHtpExecutionAudit(JNIEnv *, jobject, jboolean enabled) {
    const bool on = enabled == JNI_TRUE;
    g_audit_enabled.store(on, std::memory_order_relaxed);
    g_decode_phase.store(static_cast<int>(JarvisAuditPhase::PREFILL), std::memory_order_relaxed);
    jarvis_htp_audit_reset(on);
    jarvis_htp_audit_set_phase(JarvisAuditPhase::PREFILL);
    apply_control("libggml-cpu.so", "ggml_backend_cpu_set_jarvis_audit", on);
    apply_control("libggml-opencl.so", "ggml_backend_opencl_set_jarvis_audit", on);
    cpu_phase(0);
    opencl_phase(0);
}
JNIEXPORT jstring JNICALL Java_com_example_ai_runtime_LlamaNative_getHtpExecutionAuditJson(JNIEnv * env, jobject, jstring active, jint requested, jint assigned, jint total, jint output_tokens, jstring finish_reason) {
    std::string result = jarvis_htp_audit_json(from_java(env, active), (int32_t) requested, (int32_t) assigned, (int32_t) total, (int32_t) output_tokens, from_java(env, finish_reason));
    append_json_child(result, "cpu_execution_audit", library_json("libggml-cpu.so", "ggml_backend_cpu_get_jarvis_audit_json"));
    append_json_child(result, "opencl_execution_audit", library_json("libggml-opencl.so", "ggml_backend_opencl_get_jarvis_audit_json"));
    return to_java(env, result);
}
JNIEXPORT jstring JNICALL Java_com_example_ai_runtime_LlamaNative_getOpenClExecutionAuditJson(JNIEnv * env, jobject) { return to_java(env, library_json("libggml-opencl.so", "ggml_backend_opencl_get_jarvis_audit_json")); }
JNIEXPORT jstring JNICALL Java_com_example_ai_runtime_LlamaNative_getCpuExecutionAuditJson(JNIEnv * env, jobject) { return to_java(env, library_json("libggml-cpu.so", "ggml_backend_cpu_get_jarvis_audit_json")); }
} // extern "C"
