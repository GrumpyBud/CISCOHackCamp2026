#include "SensorLabApp.h"
#include "../config/PinConfig.h"
#include <stdio.h>
void SensorLabApp::resetStats() { min_ = 4095; max_ = 0; for (auto& v : samples_) v = 0; }
void SensorLabApp::onEnter() { pinIndex_ = 0; digitalMode_ = false; filtered_ = 0; resetStats(); needsDraw_ = true; }
void SensorLabApp::update(uint32_t now) {
  if (!elapsed(now, lastSampleMs_, 75)) return; lastSampleMs_ = now; uint8_t pin = Pins::ANALOG_INPUTS[pinIndex_];
  if (digitalMode_) { pinMode(pin, INPUT); raw_ = digitalRead(pin) ? 4095 : 0; }
  else raw_ = analogRead(pin);
  filtered_ = filtered_ == 0 ? raw_ : (filtered_ * 3 + raw_) / 4; min_ = min(min_, raw_); max_ = max(max_, raw_);
  for (uint8_t i = 0; i < GRAPH - 1; ++i) samples_[i] = samples_[i + 1]; samples_[GRAPH - 1] = filtered_; needsDraw_ = true;
}
void SensorLabApp::draw() {
  if (!needsDraw_) return; char buf[24]; display_.clear(); display_.drawHeader("Sensor Lab", digitalMode_ ? "DIG" : "ANLG");
  snprintf(buf, sizeof(buf), "GPIO %u", Pins::ANALOG_INPUTS[pinIndex_]); display_.drawMetric("Input", buf, 17);
  snprintf(buf, sizeof(buf), "%u", raw_); display_.drawMetric("Raw", buf, 29);
  snprintf(buf, sizeof(buf), "%.2f V", adcToVolts(raw_)); display_.drawMetric("Voltage", buf, 41);
  snprintf(buf, sizeof(buf), "%u  [%u..%u]", filtered_, min_, max_); display_.drawMetric("Filter", buf, 53);
  snprintf(buf, sizeof(buf), "T:%u %s", threshold_, filtered_ >= threshold_ ? "HIGH" : "LOW"); display_.drawMetric("Threshold", buf, 65, filtered_ >= threshold_ ? TFT_GREEN : TFT_ORANGE);
  auto& t = display_.tft(); t.drawRect(2, 78, 124, 27, TFT_DARKGREY);
  for (uint8_t i = 1; i < GRAPH; ++i) { int y1 = 103 - (samples_[i - 1] * 23L / 4095); int y2 = 103 - (samples_[i] * 23L / 4095); t.drawLine(3 + (i - 1) * 2, y1, 3 + i * 2, y2, TFT_CYAN); }
  display_.drawFooterHints("L/R PIN  SEL MODE  MENU CLR"); needsDraw_ = false;
}
void SensorLabApp::handleInput(const InputEvent& e) {
  if (e.type == InputEventType::Left && pinIndex_ > 0) --pinIndex_;
  else if (e.type == InputEventType::Right && pinIndex_ + 1 < Pins::ANALOG_INPUT_COUNT) ++pinIndex_;
  else if (e.type == InputEventType::Up && threshold_ < 3995) threshold_ += 100;
  else if (e.type == InputEventType::Down && threshold_ >= 100) threshold_ -= 100;
  else if (e.type == InputEventType::Select || e.type == InputEventType::Enter) digitalMode_ = !digitalMode_;
  else if (e.type == InputEventType::Menu) resetStats(); else return;
  navBeep(); needsDraw_ = true;
}
