#include "ToneToolApp.h"
#include <stdio.h>
void ToneToolApp::applyTone() { if (playing_) buzzer_.tone(frequency_, duty_); }
void ToneToolApp::onEnter() { frequency_ = 1000; duty_ = 50; field_ = 0; playing_ = sweeping_ = false; needsDraw_ = true; }
void ToneToolApp::onExit() { buzzer_.stop(); }
void ToneToolApp::update(uint32_t now) { if (sweeping_ && elapsed(now, lastSweepMs_, 40)) { lastSweepMs_ = now; frequency_ += 50; if (frequency_ > 3000) frequency_ = 250; applyTone(); needsDraw_ = true; } }
void ToneToolApp::draw() {
  if (!needsDraw_) return; char buf[24]; display_.clear(); display_.drawHeader("Tone Tool", playing_ ? "ON" : "OFF");
  snprintf(buf, sizeof(buf), "%u Hz%s", frequency_, field_ == 0 ? " <" : ""); display_.drawMetric("Frequency", buf, 25);
  snprintf(buf, sizeof(buf), "%u%%%s", duty_, field_ == 1 ? " <" : ""); display_.drawMetric("Duty", buf, 40);
  display_.drawProgressBar(12, 58, 104, 11, duty_, 100, TFT_GREEN); display_.drawMetric("Mode", sweeping_ ? "SWEEP" : (playing_ ? "CONTINUOUS" : "STOPPED"), 77, TFT_YELLOW);
#if ENABLE_BUZZER
  display_.drawCenteredText("LEDC GPIO 9", 94, TFT_LIGHTGREY);
#else
  display_.drawWarning("BUZZER DISABLED IN CONFIG");
#endif
  display_.drawFooterHints("UP/DN EDIT  SEL ON/OFF  MENU SWEEP"); needsDraw_ = false;
}
void ToneToolApp::handleInput(const InputEvent& e) {
  if (e.type == InputEventType::Left || e.type == InputEventType::Right) field_ = !field_;
  else if (e.type == InputEventType::Up) { if (field_ == 0 && frequency_ < 5000) frequency_ += 50; else if (field_ == 1 && duty_ < 95) duty_ += 5; applyTone(); }
  else if (e.type == InputEventType::Down) { if (field_ == 0 && frequency_ > 100) frequency_ -= 50; else if (field_ == 1 && duty_ > 5) duty_ -= 5; applyTone(); }
  else if (e.type == InputEventType::Select || e.type == InputEventType::Enter) { playing_ = !playing_; sweeping_ = false; if (playing_) applyTone(); else buzzer_.stop(); }
  else if (e.type == InputEventType::Menu) { sweeping_ = !sweeping_; playing_ = sweeping_; if (playing_) applyTone(); else buzzer_.stop(); } else return;
  if (!playing_) navBeep(); needsDraw_ = true;
}
