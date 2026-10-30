#include <cstdint>
#include <map>
#include <memory>
#include <string>

#include "json.h"

// llama.cpp's pinned common_json only instantiates map<string, bool> and
// map<string, string>. Jarvis telemetry uses int64_t buffer counters, so add
// the one specialization required by this Android runtime instead of relying
// on an unavailable template instantiation at link time.
template <>
common_json_value::common_json_value(const std::map<std::string, int64_t> & vals) :
    type(VAL_JSON), val_json(std::make_shared<common_json>(common_json::object())) {
    for (const auto & item : vals) {
        (*val_json)[item.first] = item.second;
    }
}
