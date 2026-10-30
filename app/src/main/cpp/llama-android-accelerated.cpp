// Jarvis local Gemma runtime with real Snapdragon accelerator selection.
// Backend requests, load-log evidence and observed graph placement are reported separately.
#include <jni.h>
#include <string>
#include <vector>
#include <array>
#include <mutex>
#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdio>
#include <cerrno>
#include <cstring>
#include <sstream>
#include <android/log.h>
#include <atomic>
#include <chrono>
#include <dlfcn.h>
#include <cstdlib>
#include <malloc.h>
#include <map>
#include <memory>
#include "runtime-utils.h"
#include "llama-context.h"

#include "llama.h"
#include "ggml-backend.h"
#include "chat.h"

#define TAG "JarvisLlamaNative"
#define LOGW(...) __android_log_print(ANDROID_LOG_WARN, TAG, __VA_ARGS__)
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, TAG, __VA_ARGS__)

struct ProcessMemStats {
    int64_t rss_kb = -1;
    int64_t pss_kb = -1;
    int64_t native_heap_kb = -1;
};

static ProcessMemStats read_process_memory() {
    ProcessMemStats stats;
    struct mallinfo mi = mallinfo();
    stats.native_heap_kb = mi.uordblks > 0 ? (mi.uordblks / 1024) : 0;
    FILE* fp = fopen("/proc/self/smaps_rollup", "r");
    if (fp) {
        char line[256];
        while (fgets(line, sizeof(line), fp)) {
            if (strncmp(line, "Rss:", 4) == 0) sscanf(line + 4, "%ld", &stats.rss_kb);
            else if (strncmp(line, "Pss:", 4) == 0) sscanf(line + 4, "%ld", &stats.pss_kb);
        }
        fclose(fp);
    }
    if (stats.rss_kb <= 0) {
        fp = fopen("/proc/self/status", "r");
        if (fp) {
            char line[256];
            while (fgets(line, sizeof(line), fp)) {
                if (strncmp(line, "VmRSS:", 6) == 0) {
                    sscanf(line + 6, "%ld", &stats.rss_kb);
                    break;
                }
            }
            fclose(fp);
        }
    }
    return stats;
}

static std::string json_escape(const std::string& s) {
    std::string out;
    out.reserve(s.size() + 8);
    for (char c : s) {
        switch (c) {
            case '"': out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default: if (static_cast<unsigned char>(c) >= 32) out += c; break;
        }
    }
    return out;
}

static int64_t monotonic_ms() {
    return std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now().time_since_epoch()).count();
}

struct BackendState {
    std::string native_library_dir;
    bool opencl_loaded = false;
    bool hexagon_loaded = false;
    std::string requested_backend = "CPU";
    std::string active_backend = "CPU (ARM NEON)";
    std::string active_device = "CPU (ARM64-v8a NEON)";
    int32_t requested_offload_layers = 0;
    int32_t actual_offloaded_layers = 0;
    int32_t total_offloadable_layers = 0;
    bool fallback_occurred = false;
    std::string fallback_reason;
    std::string opencl_load_error;
    std::string hexagon_load_error;
};

struct TelemetryData {
    int64_t model_load_time_ms = 0;
    int64_t prefill_time_ms = 0;
    int64_t decode_time_ms = 0;
    int64_t ttft_ms = 0;
    int64_t total_time_ms = 0;
    int32_t prompt_tokens = 0;
    int32_t output_tokens = 0;
    double prefill_tok_per_sec = 0.0;
    double decode_tok_per_sec = 0.0;
    double total_tok_per_sec = 0.0;
    float sampler_temperature = 0.70f;
    float sampler_top_p = 0.95f;
    int32_t sampler_top_k = 64;
    float sampler_min_p = 0.05f;
    float sampler_repeat_penalty = 1.10f;
    int64_t sampler_seed = -1;
    std::string sampler_mode = "Stochastic";
    std::string finish_reason = "not_started";
    std::string error;
    int32_t prefill_evaluated_tokens = 0;
    int32_t decode_evaluated_tokens = 0;
    std::vector<llama_token> generated_ids;
    std::map<std::string, int64_t> observed_buffers;
    std::map<std::string, std::string> observed_nodes;
    bool placement_truncated = false;
    ProcessMemStats mem_before_model_load;
    ProcessMemStats mem_after_model_load;
    ProcessMemStats mem_after_context_init;
    ProcessMemStats mem_after_generation;
};

struct EngineState {
    std::string model_path;
    llama_model* model = nullptr;
    llama_context* ctx = nullptr;
    int32_t context_size = 4096;
    int32_t threads = 4;
    int32_t threads_batch = 6;
    int32_t n_batch = 512;
    int32_t n_ubatch = 128;
    bool use_q8_kv = true;
    bool flash_attention = true;
    bool use_mlock = false;
    bool audit_backend = false;
    bool chat_ready = false;
    bool thinking_requested = false;
    common_chat_params chat_params;
    common_chat_parser_params parser_params;
    std::atomic<bool> initialized{false};
    std::mutex lock;
    int32_t n_past = 0;
    std::vector<llama_token> cached_prompt_tokens;
    BackendState backend;
    TelemetryData telemetry;
};

static EngineState g_engine;
static std::atomic<bool> g_stop_requested{false};
static bool g_backend_initialized = false;
static std::string g_last_error;
static std::mutex g_error_mutex;
static std::string g_llama_log;
static std::mutex g_log_mutex;
static int32_t g_log_offloaded = -1;
static int32_t g_log_total = -1;

static std::string from_java(JNIEnv* env, jstring value) {
    if (!value) return {};
    jclass cls = env->FindClass("java/lang/String");
    jmethodID method = env->GetMethodID(cls, "getBytes", "(Ljava/lang/String;)[B");
    jstring encoding = env->NewStringUTF("UTF-8");
    auto bytes = static_cast<jbyteArray>(env->CallObjectMethod(value, method, encoding));
    std::string result;
    if (bytes && !env->ExceptionCheck()) {
        result.resize(env->GetArrayLength(bytes));
        env->GetByteArrayRegion(bytes, 0, result.size(), reinterpret_cast<jbyte*>(result.data()));
    }
    if (bytes) env->DeleteLocalRef(bytes);
    env->DeleteLocalRef(encoding); env->DeleteLocalRef(cls);
    return result;
}

static jstring to_java(JNIEnv* env, const std::string& value) {
    jclass cls = env->FindClass("java/lang/String");
    jmethodID constructor = env->GetMethodID(cls, "<init>", "([BLjava/lang/String;)V");
    jbyteArray bytes = env->NewByteArray(value.size());
    if (!bytes) { env->DeleteLocalRef(cls); return nullptr; }
    env->SetByteArrayRegion(bytes, 0, value.size(), reinterpret_cast<const jbyte*>(value.data()));
    jstring encoding = env->NewStringUTF("UTF-8");
    auto result = static_cast<jstring>(env->NewObject(cls, constructor, bytes, encoding));
    env->DeleteLocalRef(bytes); env->DeleteLocalRef(encoding); env->DeleteLocalRef(cls);
    return result;
}

static bool abort_requested(void*) { return g_stop_requested.load(std::memory_order_relaxed); }

static bool observe_node(ggml_tensor* tensor, bool ask, void*) {
    if (ask) return tensor->op != GGML_OP_NONE;
    // The callback runs after evaluation. Output-buffer placement is evidence, not a hardware counter.
    const ggml_tensor* storage = tensor;
    while (!storage->buffer && storage->view_src) storage = storage->view_src;
    const char* name = storage->buffer ? ggml_backend_buft_name(ggml_backend_buffer_get_type(storage->buffer)) : "UNKNOWN";
    g_engine.telemetry.observed_buffers[name]++;
    const std::string key = std::string(tensor->name) + " | " + ggml_op_name(tensor->op);
    if (g_engine.telemetry.observed_nodes.size() < 4096 || g_engine.telemetry.observed_nodes.count(key)) {
        g_engine.telemetry.observed_nodes[key] = name;
    } else g_engine.telemetry.placement_truncated = true;
    return !abort_requested(nullptr);
}

static void set_last_error(const std::string& message) {
    std::lock_guard<std::mutex> lock(g_error_mutex);
    g_last_error = message;
    LOGE("%s", message.c_str());
}

static void parse_offload_log_line(const char* text) {
    if (!text) return;
    std::string s(text);
    const std::string needle = "offloaded ";
    size_t pos = s.rfind(needle);
    if (pos == std::string::npos) return;
    size_t start = pos + needle.size();
    size_t slash = s.find('/', start);
    size_t end = slash == std::string::npos ? std::string::npos : s.find(" layers", slash);
    if (slash == std::string::npos || end == std::string::npos) return;
    try {
        g_log_offloaded = std::stoi(s.substr(start, slash - start));
        g_log_total = std::stoi(s.substr(slash + 1, end - slash - 1));
    } catch (...) { LOGW("Recovered native exception in %s", __func__); }
}

static void llama_log_callback(enum ggml_log_level level, const char* text, void*) {
    if (!text) return;
    if (level == GGML_LOG_LEVEL_ERROR) LOGE("[llama.cpp] %s", text);
    else if (level == GGML_LOG_LEVEL_WARN) LOGW("[llama.cpp WARN] %s", text);
    else LOGD("[llama.cpp] %s", text);
    std::lock_guard<std::mutex> lock(g_log_mutex);
    parse_offload_log_line(text);
    if (g_llama_log.size() < 32768) g_llama_log += text;
}

static void ensure_core_backend() {
    if (!g_backend_initialized) {
        llama_log_set(llama_log_callback, nullptr);
        llama_backend_init();
        g_backend_initialized = true;
    }
}

static bool registry_contains(const std::string& pattern) {
    const size_t count = ggml_backend_reg_count();
    for (size_t i = 0; i < count; ++i) {
        ggml_backend_reg_t reg = ggml_backend_reg_get(i);
        const char* name = reg ? ggml_backend_reg_name(reg) : nullptr;
        if (name && std::string(name).find(pattern) != std::string::npos) return true;
    }
    return false;
}

static bool load_backend_library(
    const char* soname,
    const char* primary_symbol,
    bool& loaded_flag,
    std::string& error_out) {
    if (loaded_flag) return true;
    // Isolate each backend's registration log before the model-load loop resets it.
    // In particular, Hexagon reports driver/symbol failures through the GGML logger.
    {
        std::lock_guard<std::mutex> lock(g_log_mutex);
        g_llama_log.clear();
    }
    std::vector<std::string> candidates;
    if (!g_engine.backend.native_library_dir.empty()) {
        candidates.push_back(g_engine.backend.native_library_dir + "/" + soname);
    }
    candidates.push_back(soname);
    void* handle = nullptr;
    std::string last_error;
    for (const auto& path : candidates) {
        dlerror();
        handle = dlopen(path.c_str(), RTLD_NOW | RTLD_GLOBAL);
        if (handle) {
            LOGI("Loaded accelerator backend %s", path.c_str());
            break;
        }
        const char* err = dlerror();
        last_error = err ? err : "unknown dlopen error";
        LOGW("Could not load %s: %s", path.c_str(), last_error.c_str());
    }
    if (!handle) {
        error_out = last_error;
        return false;
    }
    auto reg_fn = reinterpret_cast<ggml_backend_reg_t (*)(void)>(dlsym(handle, primary_symbol));
    if (!reg_fn) reg_fn = reinterpret_cast<ggml_backend_reg_t (*)(void)>(dlsym(handle, "ggml_backend_init"));
    if (!reg_fn) {
        const char* err = dlerror();
        error_out = std::string("backend registration symbol missing: ") + (err ? err : "unknown");
        return false;
    }
    ggml_backend_reg_t reg = reg_fn();
    if (!reg) {
        error_out = "backend registration returned null";
        {
            std::lock_guard<std::mutex> lock(g_log_mutex);
            if (!g_llama_log.empty()) {
                const size_t start = g_llama_log.size() > 8192 ? g_llama_log.size() - 8192 : 0;
                error_out += " | registration log: " + g_llama_log.substr(start);
            }
        }
        return false;
    }
    ggml_backend_register(reg);
    loaded_flag = true;
    error_out.clear();
    return true;
}

static void ensure_requested_backends(bool need_opencl, bool need_hexagon) {
    ensure_core_backend();
    if (need_opencl && !registry_contains("OpenCL")) {
        load_backend_library("libggml-opencl.so", "ggml_backend_opencl_reg",
            g_engine.backend.opencl_loaded, g_engine.backend.opencl_load_error);
    } else if (need_opencl) {
        g_engine.backend.opencl_loaded = true;
    }
    if (need_hexagon && !registry_contains("Hexagon") && !registry_contains("HTP")) {
        load_backend_library("libggml-hexagon.so", "ggml_backend_hexagon_reg",
            g_engine.backend.hexagon_loaded, g_engine.backend.hexagon_load_error);
    } else if (need_hexagon) {
        g_engine.backend.hexagon_loaded = true;
    }
}

enum class BackendTarget { CPU, OPENCL, HTP };

static ggml_backend_dev_t find_device(BackendTarget target) {
    const size_t count = ggml_backend_dev_count();
    for (size_t i = 0; i < count; ++i) {
        ggml_backend_dev_t dev = ggml_backend_dev_get(i);
        if (!dev) continue;
        const char* dname = ggml_backend_dev_name(dev);
        const char* ddesc = ggml_backend_dev_description(dev);
        ggml_backend_reg_t reg = ggml_backend_dev_backend_reg(dev);
        const char* rname = reg ? ggml_backend_reg_name(reg) : nullptr;
        std::string text = dname ? dname : "";
        text += " "; text += ddesc ? ddesc : "";
        text += " "; text += rname ? rname : "";
        std::string lower = text;
        std::transform(lower.begin(), lower.end(), lower.begin(), [](unsigned char c){ return std::tolower(c); });
        const bool is_htp = lower.find("hexagon") != std::string::npos || lower.find("htp") != std::string::npos;
        const bool is_opencl = !is_htp && (lower.find("opencl") != std::string::npos || lower.find("adreno") != std::string::npos);
        if (target == BackendTarget::HTP && is_htp) return dev;
        if (target == BackendTarget::OPENCL && is_opencl) return dev;
        if (target == BackendTarget::CPU && ggml_backend_dev_type(dev) == GGML_BACKEND_DEVICE_TYPE_CPU) return dev;
    }
    return nullptr;
}

static std::string device_name(ggml_backend_dev_t dev, const std::string& fallback) {
    const char* name = dev ? ggml_backend_dev_name(dev) : nullptr;
    return name && *name ? std::string(name) : fallback;
}

static void reset_log_capture() {
    std::lock_guard<std::mutex> lock(g_log_mutex);
    g_llama_log.clear();
    g_log_offloaded = -1;
    g_log_total = -1;
}

static void capture_offload_counts() {
    std::lock_guard<std::mutex> lock(g_log_mutex);
    g_engine.backend.actual_offloaded_layers = g_log_offloaded;
    g_engine.backend.total_offloadable_layers = g_log_total;
}

static void release_locked() {
    if (g_engine.ctx) { llama_free(g_engine.ctx); g_engine.ctx = nullptr; }
    if (g_engine.model) { llama_model_free(g_engine.model); g_engine.model = nullptr; }
    g_engine.n_past = 0;
    g_engine.cached_prompt_tokens.clear();
    g_engine.model_path.clear();
    g_engine.chat_ready = false;
    g_engine.initialized.store(false, std::memory_order_release);
}

static bool try_model_load(
    const std::string& model_path,
    llama_model_params& params,
    ggml_backend_dev_t device,
    int32_t gpu_layers,
    const std::string& backend_name,
    const std::string& fallback_device) {
    std::array<ggml_backend_dev_t, 2> devices = {device, nullptr};
    params.devices = devices.data();
    params.n_gpu_layers = gpu_layers;
    reset_log_capture();
    g_engine.model = llama_model_load_from_file(model_path.c_str(), params);
    if (!g_engine.model) {
        params.devices = nullptr;
        params.n_gpu_layers = 0;
        return false;
    }
    capture_offload_counts();
    g_engine.backend.active_backend = backend_name;
    g_engine.backend.active_device = device_name(device, fallback_device);
    params.devices = nullptr;
    params.n_gpu_layers = 0;
    return true;
}

extern "C" JNIEXPORT void JNICALL
Java_com_example_ai_runtime_LlamaNative_setNativeLibraryDir(JNIEnv* env, jobject, jstring jDir) {
    if (!jDir) return;
    std::lock_guard<std::mutex> guard(g_engine.lock);
    const std::string dir = from_java(env, jDir);
    g_engine.backend.native_library_dir = dir;
    LOGI("nativeLibraryDir=%s", dir.c_str());
}

extern "C" JNIEXPORT void JNICALL
Java_com_example_ai_runtime_LlamaNative_requestStop(JNIEnv*, jobject) {
    g_stop_requested.store(true, std::memory_order_relaxed);
}

extern "C" JNIEXPORT void JNICALL
Java_com_example_ai_runtime_LlamaNative_resetStop(JNIEnv*, jobject) {
    g_stop_requested.store(false, std::memory_order_relaxed);
}

extern "C" JNIEXPORT void JNICALL
Java_com_example_ai_runtime_LlamaNative_resetTurnTelemetry(JNIEnv*, jobject) {
    std::lock_guard<std::mutex> guard(g_engine.lock);
    const auto previous = g_engine.telemetry;
    g_engine.telemetry = TelemetryData();
    g_engine.telemetry.model_load_time_ms = previous.model_load_time_ms;
    g_engine.telemetry.mem_after_model_load = previous.mem_after_model_load;
    g_engine.telemetry.mem_after_context_init = previous.mem_after_context_init;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_example_ai_runtime_LlamaNative_initEngineExt(
    JNIEnv* env, jobject, jstring jModelPath, jint contextSize, jint threads,
    jint threadsBatch, jboolean, jboolean useQ80Kv, jboolean flashAttention,
    jint gpuLayers, jint nBatch, jint nUbatch, jboolean useMlock, jboolean useNpu, jboolean auditBackend) {
    std::lock_guard<std::mutex> guard(g_engine.lock);
    try {
        release_locked();
        { std::lock_guard<std::mutex> e(g_error_mutex); g_last_error.clear(); }
        const std::string model_path = from_java(env, jModelPath);
        if (model_path.empty()) throw std::runtime_error("Invalid model path");
        const bool request_hexagon = useNpu == JNI_TRUE;
        const bool request_opencl = gpuLayers > 0;
        ensure_requested_backends(request_opencl, request_hexagon);
        g_engine.context_size = std::clamp((int)contextSize, 1024, 32768);
        g_engine.threads = std::clamp((int)threads, 1, 12);
        g_engine.threads_batch = std::clamp((int)threadsBatch, 1, 12);
        g_engine.n_batch = std::clamp((int)nBatch, 64, 2048);
        g_engine.n_ubatch = std::min(std::clamp((int)nUbatch, 32, 1024), g_engine.n_batch);
        g_engine.use_q8_kv = useQ80Kv == JNI_TRUE;
        g_engine.flash_attention = flashAttention == JNI_TRUE;
        g_engine.use_mlock = useMlock == JNI_TRUE;
        g_engine.audit_backend = auditBackend == JNI_TRUE;
        g_engine.telemetry = TelemetryData();
        g_engine.telemetry.mem_before_model_load = read_process_memory();
        auto& backend = g_engine.backend;
        backend.requested_backend = request_hexagon ? (request_opencl ? "AUTO: Hexagon HTP -> Adreno OpenCL -> CPU" : "Hexagon HTP (NPU)") : (request_opencl ? "Adreno OpenCL (GPU)" : "CPU");
        backend.requested_offload_layers = request_hexagon ? 999 : gpuLayers;
        backend.active_backend = "UNKNOWN"; backend.active_device = "UNKNOWN";
        backend.actual_offloaded_layers = -1; backend.total_offloadable_layers = -1;
        backend.fallback_occurred = false; backend.fallback_reason.clear();
        const int64_t load_start = monotonic_ms();
        std::vector<BackendTarget> candidates;
        if (request_hexagon) candidates.push_back(BackendTarget::HTP);
        if (request_opencl) candidates.push_back(BackendTarget::OPENCL);
        candidates.push_back(BackendTarget::CPU);
        for (auto target : candidates) {
            reset_log_capture();
            if (abort_requested(nullptr)) throw std::runtime_error("Model initialization cancelled");
            const bool cpu = target == BackendTarget::CPU;
            const char* label = cpu ? "CPU (ARM NEON)" : target == BackendTarget::HTP ? "Hexagon HTP (NPU)" : "Adreno OpenCL (GPU)";
            ggml_backend_dev_t dev = find_device(target);
            std::string failure;
            if (!cpu && !dev) {
                failure = target == BackendTarget::HTP ? backend.hexagon_load_error : backend.opencl_load_error;
                if (failure.empty()) failure = "No registered device";
            } else {
                llama_model_params params = llama_model_default_params();
                params.load_mode = g_engine.use_mlock ? LLAMA_LOAD_MODE_MMAP_MLOCK : LLAMA_LOAD_MODE_MMAP;
                params.split_mode = LLAMA_SPLIT_MODE_NONE;
                params.check_tensors = true;
                params.progress_callback = [](float, void*) { return !abort_requested(nullptr); };
                const int layers = cpu ? 0 : target == BackendTarget::HTP ? 999 : gpuLayers;
                try {
                    if (!try_model_load(model_path, params, cpu ? nullptr : dev, layers, label, label)) {
                        failure = "Model load failed";
                    } else if (!cpu && backend.actual_offloaded_layers == 0) {
                        failure = "Loader reported zero offloaded layers";
                    } else {
                        llama_context_params ctx = llama_context_default_params();
                        ctx.n_ctx = g_engine.context_size;
                        ctx.n_threads = g_engine.threads; ctx.n_threads_batch = g_engine.threads_batch;
                        ctx.n_batch = g_engine.n_batch; ctx.n_ubatch = g_engine.n_ubatch;
                        ctx.flash_attn_type = g_engine.flash_attention ? LLAMA_FLASH_ATTN_TYPE_ENABLED : LLAMA_FLASH_ATTN_TYPE_DISABLED;
                        ctx.type_k = ctx.type_v = g_engine.use_q8_kv ? GGML_TYPE_Q8_0 : GGML_TYPE_F16;
                        // A previously registered accelerator must not receive CPU-baseline operations/KV.
                        ctx.offload_kqv = !cpu; ctx.op_offload = !cpu;
                        ctx.abort_callback = abort_requested;
                        if (g_engine.audit_backend) ctx.cb_eval = observe_node;
                        g_engine.telemetry.mem_after_model_load = read_process_memory();
                        g_engine.ctx = llama_init_from_model(g_engine.model, ctx);
                        if (g_engine.ctx) {
                            if (cpu) backend.actual_offloaded_layers = 0;
                            backend.active_backend = label;
                            backend.active_device = device_name(dev, label);
                            break;
                        }
                        failure = "Context initialization failed with requested KV/Flash Attention settings";
                    }
                } catch (const std::exception& e) { failure = e.what(); }
            }
            std::string log;
            { std::lock_guard<std::mutex> l(g_log_mutex); log = g_llama_log; }
            release_locked();
            if (!backend.fallback_reason.empty()) backend.fallback_reason += "; ";
            backend.fallback_reason += std::string(label) + ": " + failure + (log.empty() ? "" : " | " + log.substr(log.size() > 4096 ? log.size() - 4096 : 0));
            if (!cpu) backend.fallback_occurred = true;
        }
        g_engine.telemetry.model_load_time_ms = monotonic_ms() - load_start;
        if (!g_engine.ctx) throw std::runtime_error(backend.fallback_reason);
        g_engine.telemetry.mem_after_context_init = read_process_memory();
        g_engine.model_path = model_path;
        g_engine.initialized.store(true, std::memory_order_release);
        return JNI_TRUE;
    } catch (const std::exception& e) {
        release_locked();
        g_engine.backend.active_backend = "UNKNOWN";
        g_engine.backend.actual_offloaded_layers = -1;
        set_last_error(e.what());
        return JNI_FALSE;
    }
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_example_ai_runtime_LlamaNative_supportsThinking(JNIEnv*, jobject) {
    std::lock_guard<std::mutex> guard(g_engine.lock);
    if (!g_engine.model) return JNI_FALSE;
    try {
        common_chat_templates_ptr templates = common_chat_templates_init(g_engine.model, "");
        if (templates) return common_chat_templates_support_enable_thinking(templates.get()) ? JNI_TRUE : JNI_FALSE;
    } catch (...) { LOGW("Recovered native exception in %s", __func__); }
    return JNI_FALSE;
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_example_ai_runtime_LlamaNative_applyChatTemplateExt(
    JNIEnv* env, jobject, jobjectArray jRoles, jobjectArray jContents,
    jboolean jAddAssistant, jboolean jEnableThinking) {
    std::lock_guard<std::mutex> guard(g_engine.lock);
    g_engine.chat_ready = false;
    try {
        if (!g_engine.model || !jRoles || !jContents) throw std::runtime_error("No model/messages");
        const jsize count = env->GetArrayLength(jRoles);
        if (count <= 0 || count != env->GetArrayLength(jContents)) throw std::runtime_error("Invalid chat messages");
        if (!llama_model_chat_template(g_engine.model, nullptr)) throw std::runtime_error("Missing embedded GGUF chat template");
        auto templates = common_chat_templates_init(g_engine.model, "");
        if (!templates) throw std::runtime_error("Could not initialize embedded template");
        if (jEnableThinking && !common_chat_templates_support_enable_thinking(templates.get()))
            throw std::runtime_error("This model/template does not expose switchable thinking; disable Thinking for this profile");
        common_chat_templates_inputs inputs;
        inputs.use_jinja = true;
        inputs.add_generation_prompt = jAddAssistant == JNI_TRUE;
        inputs.enable_thinking = jEnableThinking == JNI_TRUE;
        inputs.reasoning_format = COMMON_REASONING_FORMAT_DEEPSEEK;
        // Tokenization below adds BOS once. The template renderer must not add it again.
        inputs.add_bos = false; inputs.add_eos = false;
        for (jsize i = 0; i < count; ++i) {
            auto role = static_cast<jstring>(env->GetObjectArrayElement(jRoles, i));
            auto content = static_cast<jstring>(env->GetObjectArrayElement(jContents, i));
            common_chat_msg msg; msg.role = from_java(env, role); msg.content = from_java(env, content);
            if (role) env->DeleteLocalRef(role); if (content) env->DeleteLocalRef(content);
            inputs.messages.push_back(std::move(msg));
        }
        g_engine.chat_params = common_chat_templates_apply(templates.get(), inputs);
        if (g_engine.chat_params.prompt.empty() || g_engine.chat_params.parser.empty())
            throw std::runtime_error("Embedded Gemma template did not produce a prompt and output parser");
        g_engine.parser_params = common_chat_parser_params(g_engine.chat_params);
        g_engine.parser_params.reasoning_format = COMMON_REASONING_FORMAT_DEEPSEEK;
        g_engine.parser_params.reasoning_in_content = false;
        g_engine.parser_params.parser.load(g_engine.chat_params.parser);
        g_engine.thinking_requested = jEnableThinking == JNI_TRUE;
        g_engine.chat_ready = true;
        return to_java(env, g_engine.chat_params.prompt);
    } catch (const std::exception& e) { set_last_error(std::string("Chat template: ") + e.what()); return nullptr; }
}

static std::vector<llama_token> tokenize(const std::string& prompt) {
    const auto* vocab = llama_model_get_vocab(g_engine.model);
    std::vector<llama_token> tokens(prompt.size() + 32);
    int n = llama_tokenize(vocab, prompt.data(), prompt.size(), tokens.data(), tokens.size(), true, true);
    if (n < 0) { tokens.resize(-n); n = llama_tokenize(vocab, prompt.data(), prompt.size(), tokens.data(), tokens.size(), true, true); }
    if (n < 0) throw std::runtime_error("Tokenization failed");
    tokens.resize(n); return tokens;
}

extern "C" JNIEXPORT jint JNICALL
Java_com_example_ai_runtime_LlamaNative_countTokens(JNIEnv* env, jobject, jstring prompt) {
    std::lock_guard<std::mutex> guard(g_engine.lock);
    try { return g_engine.model ? (jint)tokenize(from_java(env, prompt)).size() : -1; }
    catch (...) { LOGW("Native call failed in %s", __func__); return -1; }
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_example_ai_runtime_LlamaNative_generateCompletionExt(
    JNIEnv* env, jobject, jstring jPrompt, jobject jCallback, jint maxGenTokens,
    jfloat temperature, jfloat topP, jint topK, jfloat minP, jfloat repeatPenalty, jlong seed) {
    std::lock_guard<std::mutex> guard(g_engine.lock);
    auto& t = g_engine.telemetry;
    int64_t prefill_start = 0, decode_start = 0, first_token = 0;
    std::string raw, visible;
    llama_sampler* sampler = nullptr;
    jclass callback_class = nullptr;
    try {
        if (!g_engine.ctx || !g_engine.model || !g_engine.chat_ready) throw std::runtime_error("Engine/template is not ready");
        if (!std::isfinite(temperature) || !std::isfinite(topP) || !std::isfinite(minP) || !std::isfinite(repeatPenalty))
            throw std::runtime_error("Non-finite sampling parameter");
        auto* vocab = llama_model_get_vocab(g_engine.model);
        const std::string prompt = from_java(env, jPrompt);
        if (prompt != g_engine.chat_params.prompt) throw std::runtime_error("Prompt does not match the current template parser");
        auto tokens = tokenize(prompt);
        t.prompt_tokens = tokens.size();
        const int n_ctx = llama_n_ctx(g_engine.ctx);
        const int max_generation = std::clamp((int)maxGenTokens, 1, 4096);
        if (tokens.empty() || (int)tokens.size() + max_generation + 16 > n_ctx)
            throw std::runtime_error("Prompt exceeds native context budget");
        // Shared-KV/SWA rollback cannot be inferred from a matching token prefix. Re-evaluate
        // each turn until a pinned-model regression suite establishes safe cache reuse.
        llama_memory_clear(llama_get_memory(g_engine.ctx), true);
        t.finish_reason = "in_progress";
        prefill_start = monotonic_ms();
        for (size_t i = 0; i < tokens.size(); i += g_engine.n_batch) {
            if (abort_requested(nullptr)) { t.finish_reason = "cancelled"; break; }
            const int n = std::min((int)(tokens.size() - i), g_engine.n_batch);
            llama_batch batch = llama_batch_init(n, 0, 1);
            for (int j = 0; j < n; ++j) {
                batch.token[j] = tokens[i+j]; batch.pos[j] = i+j;
                batch.n_seq_id[j] = 1; batch.seq_id[j][0] = 0; batch.logits[j] = i+j+1 == tokens.size();
            }
            batch.n_tokens = n;
            const int rc = llama_decode(g_engine.ctx, batch);
            llama_batch_free(batch);
            if (rc != 0) {
                if (abort_requested(nullptr)) { t.finish_reason = "cancelled"; break; }
                throw std::runtime_error("Prefill llama_decode failed: " + std::to_string(rc));
            }
            t.prefill_evaluated_tokens += n;
        }
        t.prefill_time_ms = monotonic_ms() - prefill_start;
        if (t.finish_reason != "cancelled") {
            sampler = llama_sampler_chain_init(llama_sampler_chain_default_params());
            const float penalty = std::max(1.0f, (float)repeatPenalty);
            if (penalty > 1.0f) llama_sampler_chain_add(sampler, llama_sampler_init_penalties(llama_vocab_n_tokens(vocab), 64, penalty, 0, 0));
            t.sampler_repeat_penalty = penalty;
            if (temperature <= 0) {
                llama_sampler_chain_add(sampler, llama_sampler_init_greedy());
                t.sampler_mode = "Greedy"; t.sampler_temperature = 0;
                t.sampler_top_p = 1; t.sampler_top_k = 1; t.sampler_min_p = 0; t.sampler_seed = -1;
            } else {
                t.sampler_temperature = temperature; t.sampler_top_k = std::max(0, (int)topK);
                t.sampler_top_p = std::clamp((float)topP, 0.05f, 1.0f); t.sampler_min_p = std::clamp((float)minP, 0.0f, 1.0f);
                const uint32_t actual_seed = seed >= 0 ? (uint32_t)seed : (uint32_t)std::chrono::high_resolution_clock::now().time_since_epoch().count();
                t.sampler_seed = actual_seed;
                if (t.sampler_top_k) llama_sampler_chain_add(sampler, llama_sampler_init_top_k(t.sampler_top_k));
                if (t.sampler_top_p < 1) llama_sampler_chain_add(sampler, llama_sampler_init_top_p(t.sampler_top_p, 1));
                if (t.sampler_min_p > 0) llama_sampler_chain_add(sampler, llama_sampler_init_min_p(t.sampler_min_p, 1));
                llama_sampler_chain_add(sampler, llama_sampler_init_temp(temperature));
                llama_sampler_chain_add(sampler, llama_sampler_init_dist(actual_seed));
            }
            for (auto token : tokens) llama_sampler_accept(sampler, token);
            callback_class = jCallback ? env->GetObjectClass(jCallback) : nullptr;
            const jmethodID callback = callback_class ? env->GetMethodID(callback_class, "onToken", "(Ljava/lang/String;)V") : nullptr;
            auto publish = [&](bool partial) {
                const std::string safe = jarvis::without_stop_suffix(raw, g_engine.chat_params.additional_stops);
                const std::string utf8 = safe.substr(0, jarvis::complete_utf8_prefix(safe));
                auto parsed = common_chat_parse(utf8, partial, g_engine.parser_params);
                if (!parsed.tool_calls.empty()) throw std::runtime_error("Model requested a tool; Gemma Lab has no tool execution capability");
                if (parsed.content.compare(0, visible.size(), visible) != 0) {
                    // Partial parser output may temporarily retract an incomplete boundary.
                    if (partial) return;
                    throw std::runtime_error("Non-monotonic final chat parse");
                }
                const std::string delta = parsed.content.substr(visible.size());
                visible = parsed.content;
                if (!delta.empty() && callback) {
                    jstring chunk = to_java(env, delta);
                    env->CallVoidMethod(jCallback, callback, chunk);
                    if (chunk) env->DeleteLocalRef(chunk);
                    if (env->ExceptionCheck()) { env->ExceptionClear(); throw std::runtime_error("Kotlin streaming callback failed"); }
                }
            };
            decode_start = monotonic_ms();
            int position = tokens.size();
            t.finish_reason = "length";
            for (int i = 0; i < max_generation; ++i) {
                if (abort_requested(nullptr)) { t.finish_reason = "cancelled"; break; }
                const llama_token token = llama_sampler_sample(sampler, g_engine.ctx, -1);
                llama_sampler_accept(sampler, token);
                if (llama_vocab_is_eog(vocab, token)) { t.finish_reason = "eog"; break; }
                t.output_tokens++; t.generated_ids.push_back(token);
                if (!first_token) first_token = monotonic_ms();
                std::vector<char> piece(256);
                int n = llama_token_to_piece(vocab, token, piece.data(), piece.size(), 0, true);
                if (n < 0) { piece.resize(-n); n = llama_token_to_piece(vocab, token, piece.data(), piece.size(), 0, true); }
                if (n < 0) throw std::runtime_error("Detokenization failed");
                raw.append(piece.data(), n);
                bool stopped = false;
                for (const auto& stop : g_engine.chat_params.additional_stops) {
                    const auto at = stop.empty() ? std::string::npos : raw.find(stop);
                    if (at != std::string::npos) { raw.resize(at); stopped = true; break; }
                }
                publish(true);
                if (stopped) { t.finish_reason = "template_stop"; break; }
                if (i + 1 == max_generation) break;
                if (position >= n_ctx) { t.finish_reason = "context_limit"; break; }
                llama_batch batch = llama_batch_init(1, 0, 1);
                batch.n_tokens = 1; batch.token[0] = token; batch.pos[0] = position++;
                batch.n_seq_id[0] = 1; batch.seq_id[0][0] = 0; batch.logits[0] = true;
                const int rc = llama_decode(g_engine.ctx, batch);
                llama_batch_free(batch);
                if (rc != 0) {
                    if (abort_requested(nullptr)) { t.finish_reason = "cancelled"; break; }
                    throw std::runtime_error("Generation llama_decode failed: " + std::to_string(rc));
                }
                t.decode_evaluated_tokens++;
            }
            publish(t.finish_reason == "cancelled" || t.finish_reason == "length" || t.finish_reason == "context_limit");
        }
    } catch (const std::exception& e) {
        t.finish_reason = abort_requested(nullptr) ? "cancelled" : "error";
        t.error = e.what(); set_last_error(t.error);
    }
    if (decode_start) t.decode_time_ms = monotonic_ms() - decode_start;
    else if (prefill_start && !t.prefill_time_ms) t.prefill_time_ms = monotonic_ms() - prefill_start;
    t.ttft_ms = first_token ? first_token - prefill_start : -1;
    t.total_time_ms = t.prefill_time_ms + t.decode_time_ms;
    t.prefill_tok_per_sec = t.prefill_time_ms > 0 ? 1000.0 * t.prefill_evaluated_tokens / t.prefill_time_ms : 0;
    t.decode_tok_per_sec = t.decode_time_ms > 0 ? 1000.0 * t.output_tokens / t.decode_time_ms : 0;
    t.total_tok_per_sec = t.total_time_ms > 0 ? 1000.0 * (t.prefill_evaluated_tokens + t.output_tokens) / t.total_time_ms : 0;
    t.mem_after_generation = read_process_memory();
    if (g_engine.ctx) llama_memory_clear(llama_get_memory(g_engine.ctx), true);
    if (sampler) llama_sampler_free(sampler);
    if (callback_class) env->DeleteLocalRef(callback_class);
    return to_java(env, visible);
}

static common_json memory_json(const ProcessMemStats& m) {
    auto mb = [](int64_t kb) -> common_json { return kb < 0 ? common_json(nullptr) : common_json(kb / 1024.0); };
    return {{"rss_mb", mb(m.rss_kb)}, {"pss_mb", mb(m.pss_kb)}, {"native_heap_mb", mb(m.native_heap_kb)}};
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_example_ai_runtime_LlamaNative_getLatestTelemetryJson(JNIEnv* env, jobject) {
    std::lock_guard<std::mutex> guard(g_engine.lock);
    const auto& b = g_engine.backend; const auto& t = g_engine.telemetry;
    common_json j = {
        {"llama_commit", JARVIS_LLAMA_COMMIT}, {"backend_requested", b.requested_backend},
        {"backend_active", b.active_backend}, {"device_active", b.active_device},
        {"backend_evidence", "selected device and loader offload log; mixed CPU/accelerator execution is possible"},
        {"requested_gpu_layers", b.requested_offload_layers},
        {"actual_gpu_layers", b.actual_offloaded_layers < 0 ? common_json(nullptr) : common_json(b.actual_offloaded_layers)},
        {"total_offloadable_layers", b.total_offloadable_layers < 0 ? common_json(nullptr) : common_json(b.total_offloadable_layers)},
        {"fallback_occurred", b.fallback_occurred}, {"fallback_reason", b.fallback_reason},
        {"opencl_load_error", b.opencl_load_error}, {"hexagon_load_error", b.hexagon_load_error},
        {"model_load_time_ms", t.model_load_time_ms}, {"prefill_time_ms", t.prefill_time_ms},
        {"decode_time_ms", t.decode_time_ms}, {"ttft_ms", t.ttft_ms < 0 ? common_json(nullptr) : common_json(t.ttft_ms)},
        {"total_time_ms", t.total_time_ms}, {"prompt_tokens", t.prompt_tokens}, {"output_tokens", t.output_tokens},
        {"prefill_evaluated_tokens", t.prefill_evaluated_tokens}, {"reused_tokens", 0},
        {"decode_evaluated_tokens", t.decode_evaluated_tokens}, {"generated_token_ids", t.generated_ids},
        {"cache_reuse", "disabled: Gemma shared-KV/SWA rollback not validated"},
        {"prefill_tok_per_sec", t.prefill_tok_per_sec}, {"decode_tok_per_sec", t.decode_tok_per_sec},
        {"total_tok_per_sec", t.total_tok_per_sec}, {"finish_reason", t.finish_reason}, {"error", t.error},
        {"active_ctx_size", g_engine.ctx ? common_json(llama_n_ctx(g_engine.ctx)) : common_json(nullptr)},
        {"active_threads", g_engine.ctx ? common_json(llama_n_threads(g_engine.ctx)) : common_json(nullptr)},
        {"active_batch_threads", g_engine.ctx ? common_json(llama_n_threads_batch(g_engine.ctx)) : common_json(nullptr)},
        {"n_batch", g_engine.ctx ? common_json(llama_n_batch(g_engine.ctx)) : common_json(nullptr)},
        {"n_ubatch", g_engine.ctx ? common_json(llama_n_ubatch(g_engine.ctx)) : common_json(nullptr)},
        {"kv_requested", g_engine.use_q8_kv ? "Q8_0" : "F16"},
        {"kv_type", g_engine.ctx ? common_json(g_engine.use_q8_kv ? "Q8_0" : "F16") : common_json(nullptr)},
        {"kv_evidence", "explicit context allocation type; not an energy/quality measurement"},
        {"flash_attention_requested", g_engine.flash_attention},
        {"flash_attention", g_engine.ctx ? common_json(g_engine.ctx->get_cparams().flash_attn) : common_json(nullptr)},
        {"mmap_requested", true}, {"mlock_requested", g_engine.use_mlock},
        {"thinking_requested", g_engine.thinking_requested}, {"chat_parser_ready", g_engine.chat_ready},
        {"audit_backend", g_engine.audit_backend}, {"placement_evidence", "post-evaluation output buffer placement; audit adds synchronization overhead"},
        {"observed_output_buffers", t.observed_buffers}, {"observed_node_placement", t.observed_nodes},
        {"placement_truncated", t.placement_truncated},
        {"sampler_temp", t.sampler_temperature}, {"sampler_top_p", t.sampler_top_p}, {"sampler_top_k", t.sampler_top_k},
        {"sampler_min_p", t.sampler_min_p}, {"sampler_repeat_penalty", t.sampler_repeat_penalty},
        {"sampler_seed", t.sampler_seed}, {"sampler_mode", t.sampler_mode},
        {"memory", {{"before_model_load", memory_json(t.mem_before_model_load)}, {"after_model_load", memory_json(t.mem_after_model_load)},
                    {"after_context_init", memory_json(t.mem_after_context_init)}, {"after_generation", memory_json(t.mem_after_generation)}}}
    };
    common_json devices = common_json::array();
    for (size_t i = 0; i < ggml_backend_dev_count(); ++i) {
        auto dev = ggml_backend_dev_get(i);
        devices.push_back({{"name", ggml_backend_dev_name(dev)}, {"description", ggml_backend_dev_description(dev)}});
    }
    j["registered_devices"] = devices;
    return to_java(env, j.dump());
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_example_ai_runtime_LlamaNative_getCurrentProcessMemoryJson(JNIEnv* env, jobject) {
    return to_java(env, memory_json(read_process_memory()).dump());
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_example_ai_runtime_LlamaNative_getModelMetadataJson(JNIEnv* env, jobject) {
    std::lock_guard<std::mutex> guard(g_engine.lock);
    if (!g_engine.model) return to_java(env, "{}");
    char description[256] = {0}, meta[512] = {0};
    llama_model_desc(g_engine.model, description, sizeof(description));
    std::string architecture, modelName;
    if (llama_model_meta_val_str(g_engine.model, "general.architecture", meta, sizeof(meta)) > 0) architecture = meta;
    memset(meta, 0, sizeof(meta));
    if (llama_model_meta_val_str(g_engine.model, "general.name", meta, sizeof(meta)) > 0) modelName = meta;
    const char* chatTemplate = llama_model_chat_template(g_engine.model, nullptr);
    std::ostringstream ss;
    ss << "{\"model_description\":\"" << json_escape(description) << "\",\"architecture\":\"" << json_escape(architecture)
       << "\",\"model_name\":\"" << json_escape(modelName) << "\",\"n_layers\":" << llama_model_n_layer(g_engine.model)
       << ",\"n_ctx_train\":" << llama_model_n_ctx_train(g_engine.model) << ",\"n_ctx_loaded\":" << g_engine.context_size
       << ",\"n_params\":" << llama_model_n_params(g_engine.model) << ",\"size_bytes\":" << llama_model_size(g_engine.model)
       << ",\"has_chat_template\":" << ((chatTemplate && strlen(chatTemplate) > 0) ? "true" : "false") << "}";
    return to_java(env, ss.str());
}

extern "C" JNIEXPORT void JNICALL
Java_com_example_ai_runtime_LlamaNative_releaseEngine(JNIEnv*, jobject) {
    std::lock_guard<std::mutex> guard(g_engine.lock); release_locked(); LOGI("Released active Gemma model/context.");
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_example_ai_runtime_LlamaNative_isEngineInitialized(JNIEnv*, jobject) {
    return g_engine.initialized.load(std::memory_order_acquire) ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_example_ai_runtime_LlamaNative_getLastErrorMsg(JNIEnv* env, jobject) {
    std::lock_guard<std::mutex> guard(g_error_mutex); return to_java(env, g_last_error);
}


