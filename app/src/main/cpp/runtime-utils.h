#pragma once
#include <algorithm>
#include <string>
#include <vector>

namespace jarvis {
// Only publish complete UTF-8 code points. JNI callbacks may split a multi-byte character.
inline size_t complete_utf8_prefix(const std::string& text) {
    size_t i = 0;
    while (i < text.size()) {
        const auto c = static_cast<unsigned char>(text[i]);
        const size_t n = c < 0x80 ? 1 : (c & 0xe0) == 0xc0 ? 2 : (c & 0xf0) == 0xe0 ? 3 : (c & 0xf8) == 0xf0 ? 4 : 1;
        if (i + n > text.size()) break;
        bool valid = true;
        for (size_t j = 1; j < n; ++j) if ((static_cast<unsigned char>(text[i+j]) & 0xc0) != 0x80) valid = false;
        i += valid ? n : 1;
    }
    return i;
}

inline std::string without_stop_suffix(const std::string& text, const std::vector<std::string>& stops) {
    size_t keep = text.size();
    for (const auto& stop : stops) {
        if (stop.empty()) continue;
        for (size_t n = 1; n <= std::min(text.size(), stop.size()); ++n) {
            if (text.compare(text.size()-n, n, stop, 0, n) == 0) keep = std::min(keep, text.size()-n);
        }
    }
    return text.substr(0, keep);
}
}
