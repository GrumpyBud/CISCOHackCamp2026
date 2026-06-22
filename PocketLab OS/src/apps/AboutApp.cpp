#include "AboutApp.h"
#include "../config/BuildConfig.h"
void AboutApp::draw() {
  if (!needsDraw_) return; display_.clear(); display_.drawHeader("About");
  display_.drawCenteredText("PocketLab OS", 20, TFT_CYAN, 2); display_.drawCenteredText("Lightweight app launcher", 43, TFT_LIGHTGREY);
  display_.drawCenteredText("for ESP32 badges", 55, TFT_LIGHTGREY); display_.drawMetric("Version", POCKETLAB_VERSION, 73); display_.drawMetric("Board", "CUHSP 2021", 85);
  display_.drawMetric("Arduino core", ESP_ARDUINO_VERSION_STR, 97); display_.drawCenteredText(__DATE__, 109, TFT_DARKGREY); display_.drawFooterHints("BACK: HOME"); needsDraw_ = false;
}
