#pragma once

#include <Arduino.h>
#include <Preferences.h>
#include <TFT_eSPI.h>

class FullOS {
public:
  void begin();
  void loop();

private:
  enum AppId : uint8_t {
    APP_DESKTOP,
    APP_SETTINGS,
    APP_ABOUT,
    APP_CALC,
    APP_CLOCK,
    APP_NOTES,
    APP_PAINT,
    APP_FILES,
    APP_GPIO,
    APP_SENSOR,
    APP_LOGIC,
    APP_SCOPE,
    APP_WIFI,
    APP_TONE,
    APP_HELP,
    APP_COUNT
  };

  struct Pointer {
    int16_t x = 64;
    int16_t y = 70;
    bool left = false;
    bool right = false;
    bool leftPressed = false;
    bool rightPressed = false;
    bool leftReleased = false;
    bool rightReleased = false;
  };

  struct Settings {
    int16_t joyCenterX = 2048;
    int16_t joyCenterY = 2048;
    uint8_t deadzone = 16;
    uint8_t speed = 4;
    uint16_t touchThreshold = 24;
    uint8_t theme = 0;
    bool sound = true;
  };

  TFT_eSPI tft_;
  Preferences prefs_;
  Pointer pointer_;
  Settings settings_;

  AppId currentApp_ = APP_DESKTOP;
  AppId focusedApp_ = APP_DESKTOP;
  bool dirty_ = true;
  bool contextMenu_ = false;
  bool toneOn_ = false;
  bool ledOn_ = false;
  bool wifiScanning_ = false;

  unsigned long lastFrame_ = 0;
  unsigned long lastPointer_ = 0;
  unsigned long appEnteredAt_ = 0;
  uint8_t selectedIcon_ = 0;
  uint8_t settingsRow_ = 0;
  uint8_t fileSlot_ = 0;
  uint8_t paintColor_ = 0;
  uint8_t calcOp_ = 0;
  int32_t calcA_ = 0;
  int32_t calcB_ = 0;
  int32_t calcResult_ = 0;
  uint8_t calcCell_ = 0;
  uint8_t gpioPage_ = 0;
  uint8_t sensorIndex_ = 0;
  uint8_t noteIndex_ = 0;
  uint8_t noteCursor_ = 0;
  char note_[65] = "Welcome to FullOS";
  uint8_t scopeSamples_[96] = {};
  uint8_t scopeHead_ = 0;
  int16_t wifiCount_ = -2;

  void loadSettings();
  void saveSettings();
  void calibrateJoystick();
  void readPointer(unsigned long now);

  void openApp(AppId app);
  void closeApp();
  void draw();
  void drawWallpaper();
  void drawDesktop();
  void drawStatusBar();
  void drawCursor();
  void drawWindow(const char *title);
  void drawContextMenu();
  bool hit(int16_t x, int16_t y, int16_t w, int16_t h) const;
  bool closeHit() const;
  uint8_t iconAt(int16_t x, int16_t y) const;
  void launchIcon(uint8_t icon);

  void handleDesktop();
  void handleWindowChrome();
  void handleSettings();
  void handleCalc();
  void handleNotes();
  void handlePaint();
  void handleFiles();
  void handleGPIO();
  void handleSensor();
  void handleLogic();
  void handleScope();
  void handleWifi(unsigned long now);
  void handleTone();

  void drawSettings();
  void drawAbout();
  void drawCalc();
  void drawClock();
  void drawNotes();
  void drawPaint();
  void drawFiles();
  void drawGPIO();
  void drawSensor();
  void drawLogic();
  void drawScope();
  void drawWifi();
  void drawTone();
  void drawHelp();

  void text(uint8_t x, uint8_t y, const char *s, uint16_t color = TFT_WHITE, uint8_t size = 1);
  void labelValue(uint8_t y, const char *label, const String &value);
  void appListName(uint8_t index, char *out, size_t outSize) const;
};
