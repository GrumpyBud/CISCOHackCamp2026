#include "Buzzer.h"

#include "../config/BuildConfig.h"
#include "../config/PinConfig.h"

void Buzzer::begin() {
#if ENABLE_BUZZER
  ledcAttach(Pins::BUZZER, 2000, 8);
#endif
}

void Buzzer::beep(uint16_t frequencyHz, uint16_t durationMs) {
#if ENABLE_BUZZER
  ledcWriteTone(Pins::BUZZER, frequencyHz);
  until = millis() + durationMs;
#endif
}

void Buzzer::update(uint32_t now) {
  if (until != 0 && now >= until) stop();
}

void Buzzer::stop() {
#if ENABLE_BUZZER
  ledcWriteTone(Pins::BUZZER, 0);
#endif
  until = 0;
}
