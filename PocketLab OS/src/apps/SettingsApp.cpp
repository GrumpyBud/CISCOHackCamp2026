#include "SettingsApp.h"
#include <stdio.h>
static const char* const kSettings[] = {"Sound", "LED feedback", "Rotation", "Brightness", "Joy deadzone", "Touch threshold", "Reset settings"};
void SettingsApp::onEnter() { selected_ = 0; needsDraw_ = true; }
void SettingsApp::draw() {
  if (!needsDraw_) return; char values[7][20]; const Settings& s = storage_.settings();
  snprintf(values[0], sizeof(values[0]), "%s", s.soundOn ? "ON" : "OFF"); snprintf(values[1], sizeof(values[1]), "%s", s.ledFeedback ? "ON" : "OFF");
  snprintf(values[2], sizeof(values[2]), "%u", s.rotation); snprintf(values[3], sizeof(values[3]), "%u", s.brightness);
  snprintf(values[4], sizeof(values[4]), "%u", s.joystickDeadzone); snprintf(values[5], sizeof(values[5]), "%u", s.touchThreshold); snprintf(values[6], sizeof(values[6]), "ENTER");
  display_.clear(); display_.drawHeader("Settings"); auto& t = display_.tft();
  for (uint8_t i = 0; i < 7; ++i) { int y = 17 + i * 14; bool on = i == selected_; t.fillRect(1, y, 126, 12, on ? TFT_BLUE : TFT_BLACK); t.setTextColor(on ? TFT_WHITE : TFT_LIGHTGREY, on ? TFT_BLUE : TFT_BLACK); t.drawString(kSettings[i], 4, y + 2, 1); t.drawRightString(values[i], 124, y + 2, 1); }
  display_.drawFooterHints("UP/DN NAV  L/R CHANGE  ENTER"); needsDraw_ = false;
}
void SettingsApp::change(int d) {
  Settings& s = storage_.settings();
  switch (selected_) {
    case 0: s.soundOn = !s.soundOn; buzzer_.setEnabled(s.soundOn); break;
    case 1: s.ledFeedback = !s.ledFeedback; break;
    case 2: s.rotation = (s.rotation + (d > 0 ? 1 : 3)) & 3; display_.setRotation(s.rotation); break;
    case 3: s.brightness = d > 0 ? min(255, s.brightness + 16) : max(0, s.brightness - 16); display_.setBrightness(s.brightness); break;
    case 4: s.joystickDeadzone = clampValue<int>(s.joystickDeadzone + d * 50, 100, 1800); break;
    case 5: s.touchThreshold = clampValue<int>(s.touchThreshold + d * 2, 5, 100); break;
    case 6: storage_.reset(); display_.setRotation(storage_.settings().rotation); display_.setBrightness(storage_.settings().brightness); buzzer_.setEnabled(storage_.settings().soundOn); break;
  } storage_.save();
}
void SettingsApp::handleInput(const InputEvent& e) {
  if (e.type == InputEventType::Up && selected_ > 0) --selected_;
  else if (e.type == InputEventType::Down && selected_ < 6) ++selected_;
  else if (e.type == InputEventType::Left) change(-1);
  else if (e.type == InputEventType::Right) change(1);
  else if ((e.type == InputEventType::Select || e.type == InputEventType::Enter) && (selected_ == 0 || selected_ == 1 || selected_ == 6)) change(1);
  else return; navBeep(); needsDraw_ = true;
}
