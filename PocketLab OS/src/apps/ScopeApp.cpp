#include "ScopeApp.h"
#include "../config/PinConfig.h"
#include <stdio.h>
void ScopeApp::clearStats() { min_ = 4095; max_ = 0; sum_ = count_ = lastCrossMs_ = periodMs_ = 0; for (auto& v : samples_) v = 0; }
void ScopeApp::onEnter() { pinIndex_ = 0; paused_ = false; autoScale_ = true; manualTop_ = 4095; clearStats(); needsDraw_ = true; }
void ScopeApp::update(uint32_t now) {
  if (paused_ || !elapsed(now, lastSampleMs_, 20)) return; lastSampleMs_ = now;
  uint16_t value = analogRead(Pins::ANALOG_INPUTS[pinIndex_]); const uint16_t midpoint = (min_ + max_) / 2;
  if (count_ && last_ < midpoint && value >= midpoint) { if (lastCrossMs_) periodMs_ = now - lastCrossMs_; lastCrossMs_ = now; }
  last_ = value; min_ = min(min_, value); max_ = max(max_, value); sum_ += value; ++count_;
  for (uint8_t i = 0; i < N - 1; ++i) samples_[i] = samples_[i + 1]; samples_[N - 1] = value; needsDraw_ = true;
}
void ScopeApp::draw() {
  if (!needsDraw_) return; char buf[25]; display_.clear(); display_.drawHeader("Scope", paused_ ? "PAUSE" : "LIVE"); auto& t = display_.tft();
  t.drawRect(1, 16, 126, 74, TFT_DARKGREY); for (int x = 21; x < 127; x += 20) t.drawFastVLine(x, 17, 72, TFT_DARKGREY); for (int y = 34; y < 90; y += 18) t.drawFastHLine(2, y, 124, TFT_DARKGREY);
  uint16_t low = autoScale_ && max_ > min_ ? min_ : 0, high = autoScale_ && max_ > min_ ? max_ : manualTop_; if (high <= low) high = low + 1;
  for (uint8_t i = 1; i < N; ++i) { int y1 = 88 - ((samples_[i - 1] - low) * 68L / (high - low)); int y2 = 88 - ((samples_[i] - low) * 68L / (high - low)); y1 = clampValue(y1, 17, 88); y2 = clampValue(y2, 17, 88); t.drawLine(2 + i - 1, y1, 2 + i, y2, TFT_GREEN); }
  snprintf(buf, sizeof(buf), "GPIO%u  %s", Pins::ANALOG_INPUTS[pinIndex_], autoScale_ ? "AUTO" : "MAN"); display_.drawMetric("Input", buf, 93);
  snprintf(buf, sizeof(buf), "%u/%u avg:%lu", min_, max_, count_ ? sum_ / count_ : 0); display_.drawMetric("Min/Max", buf, 104);
  if (periodMs_) snprintf(buf, sizeof(buf), "~%lu Hz", 1000UL / periodMs_); else snprintf(buf, sizeof(buf), "measuring"); display_.drawMetric("Freq", buf, 115, TFT_YELLOW);
  display_.drawFooterHints("L/R PIN  SEL PAUSE  MENU SCALE"); needsDraw_ = false;
}
void ScopeApp::handleInput(const InputEvent& e) {
  if (e.type == InputEventType::Left && pinIndex_ > 0) { --pinIndex_; clearStats(); }
  else if (e.type == InputEventType::Right && pinIndex_ + 1 < Pins::ANALOG_INPUT_COUNT) { ++pinIndex_; clearStats(); }
  else if (e.type == InputEventType::Select || e.type == InputEventType::Enter) paused_ = !paused_;
  else if (e.type == InputEventType::Menu) autoScale_ = !autoScale_;
  else if (!autoScale_ && e.type == InputEventType::Up && manualTop_ < 4095) manualTop_ += 256;
  else if (!autoScale_ && e.type == InputEventType::Down && manualTop_ > 512) manualTop_ -= 256; else return;
  navBeep(); needsDraw_ = true;
}
