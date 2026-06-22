#include "Buzzer.h"
void Buzzer::begin() {
#if ENABLE_BUZZER
  attached_ = ledcAttach(Pins::BUZZER, 1000, 10);
  if (attached_) ledcWrite(Pins::BUZZER, 0);
#endif
}
void Buzzer::tone(uint16_t hz, uint8_t dutyPercent) {
#if ENABLE_BUZZER
  if (!enabled_ || !attached_) return;
  ledcWriteTone(Pins::BUZZER, hz);
  ledcWrite(Pins::BUZZER, (1023UL * dutyPercent) / 100UL);
  active_ = hz > 0;
#else
  (void)hz; (void)dutyPercent;
#endif
}
void Buzzer::stop() {
#if ENABLE_BUZZER
  if (attached_) ledcWriteTone(Pins::BUZZER, 0);
#endif
  active_ = false; stopAt_ = 0;
}
void Buzzer::beep(uint16_t hz, uint16_t durationMs) { tone(hz); stopAt_ = millis() + durationMs; }
void Buzzer::update(uint32_t nowMs) { if (stopAt_ && static_cast<int32_t>(nowMs - stopAt_) >= 0) stop(); }
