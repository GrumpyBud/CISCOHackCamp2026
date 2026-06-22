#include "LauncherApp.h"
static const char* const kApps[] = {"Sensor Lab", "Scope", "Logic Probe", "Pin Monitor", "Tone Tool", "I/O Tester", "Settings", "About"};
void LauncherApp::onEnter() { selected_ = clampValue<uint8_t>(storage_.settings().lastApp, 0, 7); needsDraw_ = true; }
void LauncherApp::draw() {
  if (!needsDraw_) return; display_.clear(); display_.drawHeader("PocketLab OS", "HOME");
  uint8_t top = selected_ > 6 ? selected_ - 6 : 0; display_.drawMenu(kApps, 8, selected_, top);
  display_.drawFooterHints("UP/DN NAV  RIGHT/ENTER OPEN"); needsDraw_ = false;
}
void LauncherApp::handleInput(const InputEvent& e) {
  if (e.type == InputEventType::Up && selected_ > 0) { --selected_; navBeep(); }
  else if (e.type == InputEventType::Down && selected_ < 7) { ++selected_; navBeep(); }
  else if (e.type == InputEventType::Right || e.type == InputEventType::Enter || e.type == InputEventType::Select) { storage_.settings().lastApp = selected_; storage_.save(); manager_.launch(selected_ + 1); return; }
  else return; needsDraw_ = true;
}
