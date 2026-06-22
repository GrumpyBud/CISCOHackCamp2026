#pragma once
#include <Arduino.h>
#include <Preferences.h>

struct Settings {
  bool soundOn = true;
  bool ledFeedback = true;
  uint8_t rotation = 0;
  uint8_t brightness = 255;
  uint16_t joystickDeadzone = 700;
  uint16_t touchThreshold = 35;
  uint8_t lastApp = 0;
};

class Storage {
 public:
  void begin();
  Settings& settings() { return settings_; }
  const Settings& settings() const { return settings_; }
  void save();
  void reset();
 private:
  Preferences prefs_;
  Settings settings_;
};
