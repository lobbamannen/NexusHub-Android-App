#include "../../app/src/main/cpp/runtime-utils.h"
#include <cassert>
int main() {
    const std::vector<std::string> stops = {"<end>", "<end><turn>", "<stop>"};
    assert(jarvis::publishable_text("answer <", stops, true) == "answer ");
    assert(jarvis::publishable_text("answer <", stops, false) == "answer <");
    assert(jarvis::publishable_text("answer <en", stops, false) == "answer <en");
    assert(jarvis::publishable_text("answer <end>hidden", stops, false) == "answer ");
    assert(jarvis::publishable_text("a<stop>b<end>", stops, false) == "a");
    assert(jarvis::publishable_text("answer <end><", stops, false) == "answer ");
    assert(jarvis::publishable_text("\xc3", stops, false).empty());
    assert(jarvis::publishable_text("\xc3\xa5<", stops, false) == "\xc3\xa5<");
    assert(jarvis::publishable_text("\xc3\xa5<", stops, true) == "\xc3\xa5");
    assert(jarvis::publishable_text("text<en", stops, true) == "text"); // cancellation retains ambiguity
}
