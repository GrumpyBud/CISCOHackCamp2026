#include "LogicProbeApp.h"
#include "../config/PinConfig.h"
#include <stdio.h>
static const uint8_t kLogicPins[] = {32, 33, 36, 39};
void LogicProbeApp::configurePin() { pinMode(kLogicPins[pinIndex_], INPUT); state_ = previous_ = digitalRead(kLogicPins[pinIndex_]); rising_ = falling_ = pulseUs_ = 0; highStartUs_ = state_ ? micros() : 0; }
void LogicProbeApp::onEnter() { pinIndex_ = 0; activeHigh_ = true; configurePin(); needsDraw_ = true; }
void LogicProbeApp::update(uint32_t now) {
  bool current = digitalRead(kLogicPins[pinIndex_]); if (current != previous_) { uint32_t edge = micros(); if (current) { ++rising_; highStartUs_ = edge; } else { ++falling_; if (highStartUs_) pulseUs_ = edge - highStartUs_; } previous_ = current; }
  state_ = current; if (elapsed(now, lastUpdateMs_, 80)) { lastUpdateMs_ = now; needsDraw_ = true; }
}
void LogicProbeApp::draw() {
  if (!needsDraw_) return; char buf[26]; bool logical = activeHigh_ ? state_ : !state_; display_.clear(); display_.drawHeader("Logic Probe", logical ? "HIGH" : "LOW");
  snprintf(buf, sizeof(buf), "GPIO %u", kLogicPins[pinIndex_]); display_.drawMetric("Input", buf, 20);
  display_.tft().fillRoundRect(20, 35, 88, 25, 4, logical ? TFT_GREEN : TFT_RED); display_.drawCenteredText(logical ? "HIGH" : "LOW", 42, TFT_BLACK, 2);
  snprintf(buf, sizeof(buf), "%lu / %lu", rising_, falling_); display_.drawMetric("Rise/Fall", buf, 68);
  snprintf(buf, sizeof(buf), "%lu us", pulseUs_); display_.drawMetric("Last pulse", buf, 80);
  snprintf(buf, sizeof(buf), "%s (raw:%s)", activeHigh_ ? "Active HIGH" : "Active LOW", state_ ? "HIGH" : "LOW"); display_.drawMetric("Mode", buf, 92);
  display_.drawWarning("Polling only: pulses can be missed"); display_.drawFooterHints("L/R PIN  SEL POLARITY  MENU RESET"); needsDraw_ = false;
}
void LogicProbeApp::handleInput(const InputEvent& e) {
  if (e.type == InputEventType::Left && pinIndex_ > 0) { --pinIndex_; configurePin(); }
  else if (e.type == InputEventType::Right && pinIndex_ < 3) { ++pinIndex_; configurePin(); }
  else if (e.type == InputEventType::Select || e.type == InputEventType::Enter) activeHigh_ = !activeHigh_;
  else if (e.type == InputEventType::Menu) configurePin(); else return; navBeep(); needsDraw_ = true;
}
