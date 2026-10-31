#include <jni.h>
#include <android/log.h>
#include <cstdint>
#include <csignal>
#include <cstring>
#include <fcntl.h>
#include <limits.h>
#include <sys/syscall.h>
#include <time.h>
#include <unistd.h>

namespace {
char g_crash_path[PATH_MAX] = {0};

size_t append_text(char * dst, size_t cap, size_t pos, const char * text) {
    if (!text) return pos;
    while (*text && pos + 1 < cap) dst[pos++] = *text++;
    return pos;
}

size_t append_uint(char * dst, size_t cap, size_t pos, unsigned long long value) {
    char tmp[32];
    size_t n = 0;
    do {
        tmp[n++] = static_cast<char>('0' + value % 10);
        value /= 10;
    } while (value && n < sizeof(tmp));
    while (n > 0 && pos + 1 < cap) dst[pos++] = tmp[--n];
    return pos;
}

size_t append_hex(char * dst, size_t cap, size_t pos, uintptr_t value) {
    static const char * hex = "0123456789abcdef";
    pos = append_text(dst, cap, pos, "0x");
    bool started = false;
    for (int shift = static_cast<int>(sizeof(uintptr_t) * 8 - 4); shift >= 0; shift -= 4) {
        const unsigned nib = (value >> shift) & 0xF;
        if (nib || started || shift == 0) {
            started = true;
            if (pos + 1 < cap) dst[pos++] = hex[nib];
        }
    }
    return pos;
}

void fatal_signal_handler(int sig, siginfo_t * info, void *) {
    if (g_crash_path[0] != '\0') {
        char buf[1024];
        size_t p = 0;
        struct timespec ts {};
        clock_gettime(CLOCK_REALTIME, &ts);
        p = append_text(buf, sizeof(buf), p, "JARVIS NATIVE CRASH\n");
        p = append_text(buf, sizeof(buf), p, "epoch_sec=");
        p = append_uint(buf, sizeof(buf), p, static_cast<unsigned long long>(ts.tv_sec));
        p = append_text(buf, sizeof(buf), p, "\nsignal=");
        p = append_uint(buf, sizeof(buf), p, static_cast<unsigned long long>(sig));
        p = append_text(buf, sizeof(buf), p, "\nsi_code=");
        p = append_uint(buf, sizeof(buf), p, static_cast<unsigned long long>(info ? info->si_code : 0));
        p = append_text(buf, sizeof(buf), p, "\nfault_addr=");
        p = append_hex(buf, sizeof(buf), p, reinterpret_cast<uintptr_t>(info ? info->si_addr : nullptr));
        p = append_text(buf, sizeof(buf), p, "\npid=");
        p = append_uint(buf, sizeof(buf), p, static_cast<unsigned long long>(getpid()));
        p = append_text(buf, sizeof(buf), p, "\ntid=");
        p = append_uint(buf, sizeof(buf), p, static_cast<unsigned long long>(syscall(SYS_gettid)));
        p = append_text(buf, sizeof(buf), p, "\n");

        const int fd = open(g_crash_path, O_WRONLY | O_CREAT | O_TRUNC | O_CLOEXEC, 0600);
        if (fd >= 0) {
            (void) write(fd, buf, p);
            (void) fsync(fd);
            (void) close(fd);
        }
    }

    signal(sig, SIG_DFL);
    raise(sig);
}

void install_one(int sig) {
    struct sigaction sa {};
    sa.sa_sigaction = fatal_signal_handler;
    sigemptyset(&sa.sa_mask);
    sa.sa_flags = SA_SIGINFO | SA_RESETHAND;
    sigaction(sig, &sa, nullptr);
}
}

extern "C" JNIEXPORT void JNICALL
Java_com_example_ai_runtime_LlamaNative_installNativeCrashHandler(JNIEnv * env, jobject, jstring jPath) {
    if (!jPath) return;
    const char * raw = env->GetStringUTFChars(jPath, nullptr);
    if (!raw) return;
    std::strncpy(g_crash_path, raw, sizeof(g_crash_path) - 1);
    g_crash_path[sizeof(g_crash_path) - 1] = '\0';
    env->ReleaseStringUTFChars(jPath, raw);

    install_one(SIGABRT);
    install_one(SIGSEGV);
    install_one(SIGBUS);
    install_one(SIGILL);
    install_one(SIGFPE);
    __android_log_print(ANDROID_LOG_INFO, "JarvisCrash", "Native crash handler installed");
}
