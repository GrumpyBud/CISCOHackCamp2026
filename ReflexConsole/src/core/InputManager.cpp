#include "InputManager.h"

#include "../config/BuildConfig.h"
#include "../config/PinConfig.h"

namespace {
constexpr int JOYSTICK_DEADZONE = 1050;
constexpr uint32_t JOYSTICK_REPEAT_MS = 180;
constexpr uint16_t TOUCH_THRESHOLD = 35;
}

void InputManager::begin() {
  analogReadResolution(12);
  calibrate();
}

void InputManager::calibrate() {
  long totalX = 0;
  long totalY = 0;
  for (uint8_t i = 0; i < 16; ++i) {
    totalX += analogRead(Pins::JOY_X);
    totalY += analogRead(Pins::JOY_Y);
  }
  centerX = totalX / 16;
  centerY = totalY / 16;
}

InputEvent InputManager::touchEvent() {
#if USE_TOUCH_INPUT
  const uint8_t pins[] = {Pins::TOUCH_SELECT, Pins::TOUCH_BACK,
                          Pins::TOUCH_START, Pins::TOUCH_MENU};
  const InputEvent events[] = {InputEvent::SELECT, InputEvent::BACK,
                               InputEvent::START, InputEvent::MENU};

  for (uint8_t i = 0; i < 4; ++i) {
    const bool isDown = touchRead(pins[i]) < TOUCH_THRESHOLD;
    if (isDown && !touchDown[i]) {
      touchDown[i] = true;
      return events[i];
    }
    if (!isDown) touchDown[i] = false;
  }
#endif
  return InputEvent::NONE;
}

InputEvent InputManager::update(uint32_t now) {
  const InputEvent touch = touchEvent();
  if (touch != InputEvent::NONE) {
    lastEvent = now;
    return touch;
  }

#if USE_JOYSTICK_INPUT
  if (now - lastEvent < JOYSTICK_REPEAT_MS) return InputEvent::NONE;

  const int x = analogRead(Pins::JOY_X) - centerX;
  const int y = analogRead(Pins::JOY_Y) - centerY;
  InputEvent event = InputEvent::NONE;

  if (abs(x) > abs(y) && abs(x) > JOYSTICK_DEADZONE) {
    event = x > 0 ? InputEvent::RIGHT : InputEvent::LEFT;
  } else if (abs(y) > JOYSTICK_DEADZONE) {
    event = y > 0 ? InputEvent::DOWN : InputEvent::UP;
  }

  if (event != InputEvent::NONE) lastEvent = now;
  return event;
#else
  return InputEvent::NONE;
#endif
}
