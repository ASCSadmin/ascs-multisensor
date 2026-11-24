#pragma once
#include <array>
#include <charconv>
#include <cstdint>
#include <string>
#include <string_view>

namespace ascs_radar {
// Mode followed by X1, Y1, X2, Y2 for each of the three hardware zones.
using Settings = std::array<int, 13>;

inline bool valid_change(const Settings &before, const Settings &after) {
  if (after[0] < 0 || after[0] > 2) return false;
  for (size_t i = 1; i < after.size(); i += 4) {
    const int x1 = after[i], y1 = after[i + 1], x2 = after[i + 2], y2 = after[i + 3];
    // Preserve even legacy rectangles drawn in a different order when editing another zone.
    if (x1 == before[i] && y1 == before[i+1] && x2 == before[i+2] && y2 == before[i+3]) continue;
    if (x1 == 0 && y1 == 0 && x2 == 0 && y2 == 0) continue;
    if (x1 < -4860 || x2 > 4860 || y1 < 0 || y2 > 7560 || x1 >= x2 || y1 >= y2) return false;
  }
  return true;
}

inline bool read_settings(std::string_view input, Settings &out) {
  for (size_t i = 0; i < out.size(); ++i) {
    const auto comma = input.find(',');
    const bool last = i + 1 == out.size();
    if (last != (comma == input.npos)) return false;
    auto field = input.substr(0, comma);
    if (field.empty() || field.size() > 6) return false;
    const char *end = field.data() + field.size();
    auto result = std::from_chars(field.data(), end, out[i]);
    if (result.ec != std::errc{} || result.ptr != end) return false;
    if (!last) input.remove_prefix(comma + 1);
  }
  return true;
}

class ZoneWriter {
 public:
  // Called on ESPHome's main loop. A reply carries the submitting browser's token.
  template<class Query, class Reply>
  void begin(std::string_view request, uint32_t now, Query query, Reply reply) {
    if (request.size() < 10 || request[8] != '|') return;
    std::string token(request.substr(0, 8));
    if (token.find_first_not_of("0123456789abcdef") != token.npos) return;
    if (stage_ != Stage::idle) { reply(token + "|busy"); return; }
    request.remove_prefix(9);
    const auto divide = request.find('|');
    if (divide == request.npos || !read_settings(request.substr(0, divide), before_) ||
        !read_settings(request.substr(divide + 1), after_) || !valid_change(before_, after_)) {
      reply(token + "|invalid"); return;
    }
    token_ = token;
    stage_ = Stage::checking;
    fresh_ = false;
    started_ = now;
    query();
  }

  // The LD2450 publishes zone 3 Y2 last in its full configuration readback.
  void saw_readback() { fresh_ = true; }
  bool active() const { return stage_ != Stage::idle; }

  template<class Read, class Write, class Reply>
  void step(uint32_t now, Read read, Write write, Reply reply) {
    if (!active()) return;
    const auto finish = [&](const char *status) {
      stage_ = Stage::idle;
      reply(token_ + "|" + status);
    };
    if (now - started_ >= 3000) { finish("timeout"); return; }
    if (!fresh_) return;
    fresh_ = false;
    Settings actual;
    if (!read(actual)) { finish("unavailable"); return; }
    if (stage_ == Stage::checking) {
      if (actual != before_) { finish("conflict"); return; }
      if (actual == after_) { finish("ok"); return; }
      stage_ = Stage::verifying;
      started_ = now;
      write(after_); // The LD2450 component requests a fresh readback after the write ACK.
    } else {
      finish(actual == after_ ? "ok" : "mismatch");
    }
  }

 private:
  enum class Stage { idle, checking, verifying };
  Stage stage_{Stage::idle};
  bool fresh_{false};
  uint32_t started_{0};
  std::string token_;
  Settings before_{}, after_{};
};

inline ZoneWriter zone_writer;
}  // namespace ascs_radar
