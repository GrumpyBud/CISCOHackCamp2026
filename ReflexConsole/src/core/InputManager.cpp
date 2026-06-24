#include "InputManager.h"

#include "../config/BuildConfig.h"
#include "../config/PinConfig.h"

namespace {
// Measured on this badge: idle values are above 800 and pressed values are below 500.
constexpr uint16_t TOUCH_THRESHOLD = 500;
constexpr uint8_t TOUCH_PINS[] = {Pins::TOUCH_UP, Pins::TOUCH_DOWN, Pins::TOUCH_LEFT,
                                  Pins::TOUCH_RIGHT, Pins::TOUCH_SELECT, Pins::TOUCH_BACK,
                                  Pins::TOUCH_START, Pins::TOUCH_MENU};
constexpr InputEvent TOUCH_EVENTS[] = {InputEvent::UP, InputEvent::DOWN, InputEvent::LEFT,
                                       InputEvent::RIGHT, InputEvent::SELECT, InputEvent::BACK,
                                       InputEvent::START, InputEvent::MENU};
}

void InputManager::begin() {
#if DEBUG_SERIAL
  DEBUGF("Touch controls: S2=UP S3=DOWN S0=LEFT S4=RIGHT S5=A/SELECT S6=B/BACK S8=X/MENU S7=Y/START\n");
#endif
}

InputEvent InputManager::touchEvent() {
#if USE_TOUCH_INPUT
  for (uint8_t i = 0; i < 8; ++i) {
    const bool isDown = touchRead(TOUCH_PINS[i]) < TOUCH_THRESHOLD;
    if (isDown && !touchDown[i]) {
      touchDown[i] = true;
      return TOUCH_EVENTS[i];
    }
    if (!isDown) touchDown[i] = false;
  }
#endif
  return InputEvent::NONE;
}

InputEvent InputManager::update(uint32_t now) {
  (void)now;
  return touchEvent();
}
