#pragma once
#include "esphome/components/captive_portal/captive_portal.h"
#include "esphome/components/web_server_base/web_server_base.h"

namespace ascs_radar {
// The browser editor only needs the root, its embedded script, the event stream
// and one command. Keep the original Wi-Fi setup page reachable on the fallback AP.
class EditorWebScope final : public AsyncWebHandler {
 public:
  bool canHandle(AsyncWebServerRequest *request) const override {
    auto *portal = esphome::captive_portal::global_captive_portal;
    char path_buffer[AsyncWebServerRequest::URL_BUF_SIZE];
    const auto path = request->url_to(path_buffer);
    if (portal->is_active())
      return request->method() != HTTP_POST || path != "/update";
    if (request->method() == HTTP_GET)
      return path != "/" && path != "/0.js" && path != "/events" && path != "/favicon.ico";
    return request->method() != HTTP_POST || path != "/text/ASCS Zonenauftrag/set";
  }

  void handleRequest(AsyncWebServerRequest *request) override {
    auto *portal = esphome::captive_portal::global_captive_portal;
    if (portal->is_active() && request->method() == HTTP_GET) {
      portal->handleRequest(request);
      return;
    }
    request->send(404);
  }
};

inline void register_editor_routes() {
  static EditorWebScope scope;
  esphome::web_server_base::global_web_server_base->add_handler(&scope);
}
}  // namespace ascs_radar
