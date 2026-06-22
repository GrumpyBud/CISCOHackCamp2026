#include "Storage.h"
void Storage::begin() {
  prefs_.begin("pocketlab", false);
  settings_.soundOn = prefs_.getBool("sound", true);
  settings_.ledFeedback = prefs_.getBool("led", true);
  settings_.rotation = prefs_.getUChar("rotation", 0) & 3;
  settings_.brightness = prefs_.getUChar("bright", 255);
  settings_.joystickDeadzone = prefs_.getUShort("deadzone", 700);
  settings_.touchThreshold = prefs_.getUShort("touch", 35);
  settings_.lastApp = prefs_.getUChar("lastapp", 0);
}
void Storage::save() {
  prefs_.putBool("sound", settings_.soundOn); prefs_.putBool("led", settings_.ledFeedback);
  prefs_.putUChar("rotation", settings_.rotation); prefs_.putUChar("bright", settings_.brightness);
  prefs_.putUShort("deadzone", settings_.joystickDeadzone); prefs_.putUShort("touch", settings_.touchThreshold);
  prefs_.putUChar("lastapp", settings_.lastApp);
}
void Storage::reset() { prefs_.clear(); settings_ = Settings(); save(); }
