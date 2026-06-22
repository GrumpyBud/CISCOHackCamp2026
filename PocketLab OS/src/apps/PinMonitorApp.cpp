#include "PinMonitorApp.h"
#include "../config/PinConfig.h"
#include <stdio.h>
void PinMonitorApp::onEnter() { page_ = 0; needsDraw_ = true; }
void PinMonitorApp::update(uint32_t now) { if (elapsed(now, lastRefreshMs_, 200)) { lastRefreshMs_ = now; needsDraw_ = true; } }
void PinMonitorApp::draw() {
  if (!needsDraw_) return; display_.clear(); display_.drawHeader("Pin Monitor", page_ ? "2/2" : "1/2"); char left[16], right[25];
  const uint8_t start = page_ * 5; for (uint8_t row = 0; row < 5; ++row) { uint8_t i = start + row; if (i >= Pins::MONITOR_PIN_COUNT) break; uint8_t pin = Pins::MONITOR_PINS[i];
    snprintf(left, sizeof(left), "GPIO %u", pin); if (Pins::isTftPin(pin)) snprintf(right, sizeof(right), "RESERVED TFT");
    else if (Pins::isAdcCapable(pin)) snprintf(right, sizeof(right), "%s  A:%u", digitalRead(pin) ? "HIGH" : "LOW", analogRead(pin));
    else snprintf(right, sizeof(right), "%s", digitalRead(pin) ? "HIGH" : "LOW");
    display_.drawMetric(left, right, 20 + row * 16, Pins::isReserved(pin) ? TFT_ORANGE : TFT_CYAN);
  }
  display_.drawWarning("Do not drive reserved pins"); display_.drawFooterHints("L/R PAGE  BACK HOME"); needsDraw_ = false;
}
void PinMonitorApp::handleInput(const InputEvent& e) { if ((e.type == InputEventType::Left || e.type == InputEventType::Right) && Pins::MONITOR_PIN_COUNT > 5) { page_ = !page_; navBeep(); needsDraw_ = true; } }
