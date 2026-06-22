#include "AppManager.h"
void AppManager::setApps(App** apps, uint8_t count) { apps_ = apps; appCount_ = count; }
void AppManager::begin() { if (apps_ && appCount_) { current_ = 0; apps_[current_]->onEnter(); dirty_ = true; } }
void AppManager::update(uint32_t nowMs) {
  if (!apps_ || !appCount_) return;
  apps_[current_]->update(nowMs); apps_[current_]->draw(); dirty_ = false;
  buzzer_.update(nowMs);
}
void AppManager::handleInput(const InputEvent& event) {
  if (!apps_ || event.type == InputEventType::None) return;
  if (event.type == InputEventType::Back && current_ != 0) { home(); return; }
  apps_[current_]->handleInput(event);
}
void AppManager::launch(uint8_t index) {
  if (!apps_ || index >= appCount_ || index == current_) return;
  apps_[current_]->onExit(); current_ = index; apps_[current_]->onEnter(); dirty_ = true;
  if (storage_.settings().soundOn) buzzer_.beep(2100, 28);
}
void AppManager::home() { launch(0); }
