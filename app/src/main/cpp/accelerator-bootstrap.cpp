// Snapdragon accelerator bootstrap for Jarvis.
// Mirrors the Android/FastRPC setup used by the proven Ai-Router implementation.
#include <jni.h>
#include <android/log.h>
#include <sys/stat.h>
#include <sys/system_properties.h>
#include <unistd.h>
#include <dlfcn.h>
#include <dirent.h>
#include <cstdlib>
#include <cstring>
#include <cctype>
#include <mutex>
#include <sstream>
#include <string>
#include <vector>

#define TAG "JarvisAccelBootstrap"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, TAG, __VA_ARGS__)
#define LOGW(...) __android_log_print(ANDROID_LOG_WARN, TAG, __VA_ARGS__)

namespace {

struct ProbeResult {
    std::string path;
    std::string status;
    std::string error;
};

struct SymbolResult {
    std::string name;
    bool required = true;
    bool found = false;
};

struct BootstrapState {
    std::string nativeLibraryDir;
    std::string socName = "ARM64 Standard Android";
    bool qualcommSocDetected = false;
    bool dspNodeDetected = false;
    bool openclBundled = false;
    bool hexagonBundled = false;
    bool htpRuntimeBundled = false;
    bool fastrpcLoaded = false;
    std::string fastrpcLoadedPath;
    bool requiredSymbolsOk = false;
    std::string firstMissingSymbol;
    std::string blockerCategory = "UNKNOWN";
    std::vector<ProbeResult> probes;
    std::vector<SymbolResult> symbols;
};

BootstrapState g_state;
std::mutex g_mutex;

std::string jsonEscape(const std::string& value) {
    std::string out;
    out.reserve(value.size() + 8);
    for (char c : value) {
        switch (c) {
            case '"': out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default:
                if (static_cast<unsigned char>(c) >= 32) out += c;
                break;
        }
    }
    return out;
}

bool readable(const std::string& path) {
    return !path.empty() && access(path.c_str(), R_OK) == 0;
}

bool hasHtpRuntime(const std::string& dir) {
    DIR* dp = opendir(dir.c_str());
    if (!dp) return false;
    bool found = false;
    while (dirent* entry = readdir(dp)) {
        const std::string name = entry->d_name ? entry->d_name : "";
        if (name.rfind("libggml-htp-", 0) == 0 && name.size() > 3 && name.substr(name.size() - 3) == ".so") {
            found = true;
            break;
        }
    }
    closedir(dp);
    return found;
}

void detectSocAndNodes(BootstrapState& state) {
    char prop[PROP_VALUE_MAX] = {0};
    std::string soc;
    if (__system_property_get("ro.soc.model", prop) > 0 && *prop) soc = prop;
    else if (__system_property_get("ro.board.platform", prop) > 0 && *prop) soc = prop;
    else if (__system_property_get("ro.hardware", prop) > 0 && *prop) soc = prop;
    if (soc.empty()) soc = "ARM64 Standard Android";
    state.socName = soc;

    std::string lower = soc;
    for (char& c : lower) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
    state.qualcommSocDetected =
        lower.find("qcom") != std::string::npos ||
        lower.find("snapdragon") != std::string::npos ||
        lower.rfind("sm", 0) == 0 ||
        lower.find("kalama") != std::string::npos ||
        lower.find("pineapple") != std::string::npos ||
        lower.find("sun") != std::string::npos;

    struct stat st{};
    state.dspNodeDetected =
        stat("/dev/cdsp-smd", &st) == 0 ||
        stat("/dev/fastrpc-cdsp", &st) == 0 ||
        stat("/dev/fastrpc-cdsp-secure", &st) == 0 ||
        stat("/dev/adsprpc-smd", &st) == 0;
    if (state.dspNodeDetected) state.qualcommSocDetected = true;
}

void probeFastRpc(BootstrapState& state) {
    state.probes.clear();
    state.symbols.clear();
    state.fastrpcLoaded = false;
    state.fastrpcLoadedPath.clear();
    state.requiredSymbolsOk = false;
    state.firstMissingSymbol.clear();
    state.blockerCategory = "UNKNOWN";

    const char* candidates[] = {
        "libcdsprpc.so",
        "/vendor/lib64/libcdsprpc.so",
        "/system/vendor/lib64/libcdsprpc.so"
    };

    void* selected = nullptr;
    for (const char* candidate : candidates) {
        ProbeResult result;
        result.path = candidate;
        dlerror();
        void* handle = dlopen(candidate, RTLD_NOW | RTLD_LOCAL);
        if (handle) {
            result.status = "SUCCESS";
            if (!selected) {
                selected = handle;
                state.fastrpcLoadedPath = candidate;
            } else {
                dlclose(handle);
            }
        } else {
            result.status = "FAIL";
            const char* err = dlerror();
            result.error = err ? err : "unknown dlopen error";
        }
        state.probes.push_back(result);
    }

    if (!selected) {
        bool namespaceDenied = false;
        for (const auto& probe : state.probes) {
            std::string lower = probe.error;
            for (char& c : lower) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
            if (lower.find("namespace") != std::string::npos ||
                lower.find("not accessible") != std::string::npos ||
                lower.find("permission denied") != std::string::npos ||
                lower.find("access denied") != std::string::npos) {
                namespaceDenied = true;
                break;
            }
        }
        state.blockerCategory = namespaceDenied
            ? "FASTRPC_LINKER_NAMESPACE_DENIED"
            : "FASTRPC_LIBRARY_NOT_FOUND";
        return;
    }

    state.fastrpcLoaded = true;
    const char* required[] = {
        "rpcmem_alloc", "rpcmem_free", "rpcmem_to_fd",
        "fastrpc_mmap", "fastrpc_munmap",
        "dspqueue_create", "dspqueue_close", "dspqueue_export",
        "dspqueue_write", "dspqueue_read", "dspqueue_read_noblock",
        "remote_handle64_open", "remote_handle64_invoke",
        "remote_handle_control", "remote_handle64_control",
        "remote_session_control", "remote_handle64_close"
    };
    const char* optional[] = {
        "rpcmem_alloc2", "remote_system_request"
    };

    bool allRequired = true;
    for (const char* name : required) {
        dlerror();
        const bool found = dlsym(selected, name) != nullptr;
        state.symbols.push_back({name, true, found});
        if (!found) {
            allRequired = false;
            if (state.firstMissingSymbol.empty()) state.firstMissingSymbol = name;
        }
    }
    for (const char* name : optional) {
        dlerror();
        state.symbols.push_back({name, false, dlsym(selected, name) != nullptr});
    }

    state.requiredSymbolsOk = allRequired;
    state.blockerCategory = allRequired ? "FASTRPC_DRIVER_READY" : "FASTRPC_SYMBOL_MISSING";
    dlclose(selected);
}

void configureLocked(const std::string& dir) {
    g_state.nativeLibraryDir = dir;

    // Qualcomm HTP DSP loader and Android dynamic loader both need the APK native dir.
    setenv("ADSP_LIBRARY_PATH", dir.c_str(), 1);
    setenv("LD_LIBRARY_PATH", dir.c_str(), 1);

    g_state.openclBundled = readable(dir + "/libggml-opencl.so");
    g_state.hexagonBundled = readable(dir + "/libggml-hexagon.so");
    g_state.htpRuntimeBundled = hasHtpRuntime(dir);
    detectSocAndNodes(g_state);
    probeFastRpc(g_state);

    LOGI(
        "Configured accelerator env dir=%s soc=%s qcom=%d dsp=%d fastrpc=%d symbols=%d opencl=%d hexagon=%d htp=%d blocker=%s",
        dir.c_str(), g_state.socName.c_str(), static_cast<int>(g_state.qualcommSocDetected),
        static_cast<int>(g_state.dspNodeDetected), static_cast<int>(g_state.fastrpcLoaded),
        static_cast<int>(g_state.requiredSymbolsOk), static_cast<int>(g_state.openclBundled),
        static_cast<int>(g_state.hexagonBundled), static_cast<int>(g_state.htpRuntimeBundled),
        g_state.blockerCategory.c_str());
}

} // namespace

extern "C" JNIEXPORT void JNICALL
Java_com_example_ai_runtime_LlamaNative_configureAcceleratorEnvironment(
    JNIEnv* env,
    jobject,
    jstring jDir) {
    if (!jDir) return;
    const char* chars = env->GetStringUTFChars(jDir, nullptr);
    if (!chars) return;
    const std::string dir(chars);
    env->ReleaseStringUTFChars(jDir, chars);

    std::lock_guard<std::mutex> guard(g_mutex);
    configureLocked(dir);
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_example_ai_runtime_LlamaNative_getAcceleratorBootstrapDiagnosticsJson(
    JNIEnv* env,
    jobject) {
    std::lock_guard<std::mutex> guard(g_mutex);
    std::ostringstream ss;
    ss << "{"
       << "\"native_library_dir\":\"" << jsonEscape(g_state.nativeLibraryDir) << "\","
       << "\"soc_name\":\"" << jsonEscape(g_state.socName) << "\","
       << "\"qualcomm_soc_detected\":" << (g_state.qualcommSocDetected ? "true" : "false") << ","
       << "\"hexagon_dsp_detected\":" << (g_state.dspNodeDetected ? "true" : "false") << ","
       << "\"opencl_bundled\":" << (g_state.openclBundled ? "true" : "false") << ","
       << "\"hexagon_bundled\":" << (g_state.hexagonBundled ? "true" : "false") << ","
       << "\"htp_runtime_bundled\":" << (g_state.htpRuntimeBundled ? "true" : "false") << ","
       << "\"fastrpc_library_loaded\":" << (g_state.fastrpcLoaded ? "true" : "false") << ","
       << "\"fastrpc_loaded_path\":\"" << jsonEscape(g_state.fastrpcLoadedPath) << "\","
       << "\"fastrpc_required_symbols_ok\":" << (g_state.requiredSymbolsOk ? "true" : "false") << ","
       << "\"fastrpc_first_missing_symbol\":\"" << jsonEscape(g_state.firstMissingSymbol) << "\","
       << "\"fastrpc_blocker_category\":\"" << jsonEscape(g_state.blockerCategory) << "\","
       << "\"fastrpc_probe_results\":[";

    for (size_t i = 0; i < g_state.probes.size(); ++i) {
        if (i > 0) ss << ",";
        const auto& probe = g_state.probes[i];
        ss << "{\"path\":\"" << jsonEscape(probe.path)
           << "\",\"status\":\"" << jsonEscape(probe.status)
           << "\",\"error\":\"" << jsonEscape(probe.error) << "\"}";
    }
    ss << "],\"fastrpc_symbol_results\":[";
    for (size_t i = 0; i < g_state.symbols.size(); ++i) {
        if (i > 0) ss << ",";
        const auto& symbol = g_state.symbols[i];
        ss << "{\"name\":\"" << jsonEscape(symbol.name)
           << "\",\"required\":" << (symbol.required ? "true" : "false")
           << ",\"status\":\"" << (symbol.found ? "FOUND" : "MISSING") << "\"}";
    }
    ss << "]}";
    return env->NewStringUTF(ss.str().c_str());
}
