#include "InputManager.h"
#include "Timing.h"
#include "../config/BuildConfig.h"
#include "../config/PinConfig.h"
void InputManager::begin() { analogReadResolution(12); recalibrate(); }
void InputManager::recalibrate() { rawX_ = analogRead(Pins::JOY_X); rawY_ = analogRead(Pins::JOY_Y); centerX_ = rawX_; centerY_ = rawY_; }
int8_t InputManager::direction() const {
#if USE_JOYSTICK_INPUT
  const int dz = storage_.settings().joystickDeadzone;
  int dx = static_cast<int>(rawX_) - centerX_, dy = static_cast<int>(rawY_) - centerY_;
  if (abs(dy) > abs(dx) && abs(dy) > dz) return dy > 0 ? 2 : 1; // down, up
  if (abs(dx) > dz) return dx > 0 ? 4 : 3; // right, left
#endif
  return 0;
}
bool InputManager::readTouch(uint8_t index, uint32_t nowMs, InputEvent& event) {
#if USE_TOUCH_INPUT
  const uint8_t pins[] = {Pins::TOUCH_SELECT, Pins::TOUCH_BACK, Pins::TOUCH_ENTER, Pins::TOUCH_MENU};
  if (touchRead(pins[index]) < storage_.settings().touchThreshold && elapsed(nowMs, touchLastMs_[index], 250)) {
    touchLastMs_[index] = nowMs;
    const InputEventType types[] = {InputEventType::Select, InputEventType::Back, InputEventType::Enter, InputEventType::Menu};
    event.type = types[index]; return true;
  }
#else
  (void)index; (void)nowMs; (void)event;
#endif
  return false;
}
bool InputManager::poll(uint32_t nowMs, InputEvent& event) {
  event.type = InputEventType::None;
#if USE_JOYSTICK_INPUT
  rawX_ = analogRead(Pins::JOY_X); rawY_ = analogRead(Pins::JOY_Y);
  const int8_t d = direction();
  if (d == 0) { heldDirection_ = 0; }
  else if (d != heldDirection_ || static_cast<int32_t>(nowMs - nextRepeatMs_) >= 0) {
    const bool newDirection = d != heldDirection_;
    heldDirection_ = d; nextRepeatMs_ = nowMs + (newDirection ? 350 : 130);
    const InputEventType types[] = {InputEventType::None, InputEventType::Up, InputEventType::Down, InputEventType::Left, InputEventType::Right};
    event.type = types[d]; return true;
  }
#endif
  for (uint8_t i = 0; i < 4; ++i) if (readTouch(i, nowMs, event)) return true;
  return false;
}
