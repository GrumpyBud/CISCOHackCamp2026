#include "FullOS.h"

#include <string.h>
#include <WiFi.h>
#include "config/BuildConfig.h"
#include "config/PinConfig.h"

namespace {
constexpr uint16_t BG0 = TFT_NAVY;
constexpr uint16_t BG1 = TFT_DARKCYAN;
constexpr uint16_t PANEL = 0x2104;
constexpr uint16_t PANEL_2 = 0x3186;
constexpr uint16_t ACCENT = TFT_CYAN;
constexpr uint16_t WARN = TFT_ORANGE;
constexpr uint16_t COLOR_OK = TFT_GREEN;
constexpr uint8_t ICON_W = 25;
constexpr uint8_t ICON_H = 20;
constexpr uint8_t ICON_COLS = 4;
constexpr uint8_t ICON_TOP = 18;
constexpr char NOTE_CHARS[] = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,!?-";
const uint16_t PALETTE[] = {TFT_WHITE, TFT_RED, TFT_GREEN, TFT_BLUE, TFT_YELLOW, TFT_MAGENTA, TFT_CYAN, TFT_BLACK};

uint16_t mix565(uint8_t r, uint8_t g, uint8_t b) {
  return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3);
}
}

void FullOS::begin() {
#if DEBUG_SERIAL
  Serial.begin(115200);
  delay(250);
  Serial.println();
  Serial.println("[FullOS] boot");
#endif
  pinMode(Pins::JOY_CLICK, INPUT_PULLUP);
  pinMode(Pins::LED, OUTPUT);
  pinMode(Pins::DISPLAY_BL, OUTPUT);
  digitalWrite(Pins::DISPLAY_BL, HIGH);
  digitalWrite(Pins::LED, LOW);

#if DEBUG_SERIAL
  Serial.println("[FullOS] pins ready");
#endif
  prefs_.begin("fullos", false);
  loadSettings();

#if DEBUG_SERIAL
  Serial.println("[FullOS] settings ready");
  Serial.print("[FullOS] speed=");
  Serial.print(settings_.speed);
  Serial.print(" deadzone=");
  Serial.print(settings_.deadzone);
  Serial.print(" touch=");
  Serial.println(settings_.touchThreshold);
#endif
  tft_.init();
  tft_.setRotation(0);
  tft_.fillScreen(TFT_BLACK);
  tft_.setTextFont(1);
  tft_.setTextSize(1);
  tft_.setTextWrap(false);
#if ENABLE_BOOT_DIAGNOSTICS
  tft_.fillScreen(TFT_RED);
  delay(120);
  tft_.fillScreen(TFT_GREEN);
  delay(120);
  tft_.fillScreen(TFT_BLUE);
  delay(120);
  tft_.fillScreen(TFT_BLACK);
  tft_.setTextColor(TFT_WHITE, TFT_BLACK);
  tft_.setCursor(8, 56);
  tft_.print("FullOS boot");
  delay(250);
#endif

  WiFi.mode(WIFI_OFF);
#if DEBUG_SERIAL
  Serial.println("[FullOS] display ready");
#endif
  openApp(APP_DESKTOP);
}

void FullOS::loop() {
  const unsigned long now = millis();
  readPointer(now);

  if (currentApp_ == APP_DESKTOP) {
    handleDesktop();
  } else {
    handleWindowChrome();
    switch (currentApp_) {
      case APP_SETTINGS: handleSettings(); break;
      case APP_CALC: handleCalc(); break;
      case APP_NOTES: handleNotes(); break;
      case APP_PAINT: handlePaint(); break;
      case APP_FILES: handleFiles(); break;
      case APP_GPIO: handleGPIO(); break;
      case APP_SENSOR: handleSensor(); break;
      case APP_LOGIC: handleLogic(); break;
      case APP_SCOPE: handleScope(); break;
      case APP_WIFI: handleWifi(now); break;
      case APP_TONE: handleTone(); break;
      default: break;
    }
  }

  if (now - lastFrame_ >= FRAME_MS || dirty_) {
    lastFrame_ = now;
    draw();
    dirty_ = false;
  }
}

void FullOS::loadSettings() {
  settings_.joyCenterX = prefs_.getShort("jcx", 2048);
  settings_.joyCenterY = prefs_.getShort("jcy", 2048);
  settings_.deadzone = prefs_.getUChar("dead", 16);
  settings_.speed = prefs_.getUChar("spd", 4);
  settings_.touchThreshold = prefs_.getUShort("tthr", 24);
  settings_.theme = prefs_.getUChar("theme", 0);
  settings_.sound = prefs_.getBool("sound", true);
  prefs_.getBytes("note", note_, sizeof(note_));
  note_[sizeof(note_) - 1] = '\0';
  noteCursor_ = strnlen(note_, sizeof(note_) - 1);

  if (settings_.speed < 1) settings_.speed = 1;
  if (settings_.speed > 9) settings_.speed = 9;
  if (settings_.deadzone < 4) settings_.deadzone = 4;
  if (settings_.deadzone > 48) settings_.deadzone = 48;
  if (settings_.touchThreshold < 8) settings_.touchThreshold = 8;
  if (settings_.touchThreshold > 80) settings_.touchThreshold = 80;
  settings_.theme = settings_.theme % 4;
}

void FullOS::saveSettings() {
  prefs_.putShort("jcx", settings_.joyCenterX);
  prefs_.putShort("jcy", settings_.joyCenterY);
  prefs_.putUChar("dead", settings_.deadzone);
  prefs_.putUChar("spd", settings_.speed);
  prefs_.putUShort("tthr", settings_.touchThreshold);
  prefs_.putUChar("theme", settings_.theme);
  prefs_.putBool("sound", settings_.sound);
  prefs_.putBytes("note", note_, sizeof(note_));
}

void FullOS::calibrateJoystick() {
  long sx = 0;
  long sy = 0;
  for (uint8_t i = 0; i < 24; ++i) {
    sx += analogRead(Pins::JOY_X);
    sy += analogRead(Pins::JOY_Y);
    delay(2);
  }
  settings_.joyCenterX = sx / 24;
  settings_.joyCenterY = sy / 24;
  saveSettings();
  dirty_ = true;
}

void FullOS::readPointer(unsigned long now) {
  pointer_.leftPressed = pointer_.leftReleased = pointer_.rightPressed = pointer_.rightReleased = false;
  if (now - lastPointer_ < POINTER_MS) return;
  lastPointer_ = now;

  int rawX = analogRead(Pins::JOY_X) - settings_.joyCenterX;
  int rawY = analogRead(Pins::JOY_Y) - settings_.joyCenterY;
  int threshold = settings_.deadzone * 16;
  int divisor = max(1, 128 / max(1, static_cast<int>(settings_.speed)));
  int dx = abs(rawX) > threshold ? rawX / divisor : 0;
  int dy = abs(rawY) > threshold ? rawY / divisor : 0;
  if (dx || dy) {
    pointer_.x = constrain(pointer_.x + dx, 0, 127);
    pointer_.y = constrain(pointer_.y + dy, 0, 127);
    dirty_ = true;
  }

  bool leftNow = digitalRead(Pins::JOY_CLICK) == LOW;
  if (leftNow != pointer_.left) {
    pointer_.leftPressed = leftNow;
    pointer_.leftReleased = !leftNow;
    pointer_.left = leftNow;
    dirty_ = true;
  }

#if ENABLE_TOUCH_RIGHT_CLICK
  bool rightNow = touchRead(Pins::RIGHT_CLICK_TOUCH) < settings_.touchThreshold;
#else
  bool rightNow = false;
#endif
  if (rightNow != pointer_.right) {
    pointer_.rightPressed = rightNow;
    pointer_.rightReleased = !rightNow;
    pointer_.right = rightNow;
    dirty_ = true;
  }
}

void FullOS::openApp(AppId app) {
  currentApp_ = app;
  focusedApp_ = app;
  appEnteredAt_ = millis();
  contextMenu_ = false;
  if (app == APP_PAINT) tft_.fillRect(4, 18, 120, 96, TFT_BLACK);
  if (app == APP_WIFI) {
    wifiCount_ = -2;
    wifiScanning_ = false;
  }
  dirty_ = true;
}

void FullOS::closeApp() {
  if (toneOn_) {
    ledcWriteTone(Pins::BUZZER, 0);
    toneOn_ = false;
  }
  openApp(APP_DESKTOP);
}

void FullOS::draw() {
  if (currentApp_ == APP_PAINT && !dirty_) {
    drawCursor();
    return;
  }
  if (currentApp_ == APP_DESKTOP) {
    drawDesktop();
  } else {
    switch (currentApp_) {
      case APP_SETTINGS: drawSettings(); break;
      case APP_ABOUT: drawAbout(); break;
      case APP_CALC: drawCalc(); break;
      case APP_CLOCK: drawClock(); break;
      case APP_NOTES: drawNotes(); break;
      case APP_PAINT: drawPaint(); break;
      case APP_FILES: drawFiles(); break;
      case APP_GPIO: drawGPIO(); break;
      case APP_SENSOR: drawSensor(); break;
      case APP_LOGIC: drawLogic(); break;
      case APP_SCOPE: drawScope(); break;
      case APP_WIFI: drawWifi(); break;
      case APP_TONE: drawTone(); break;
      case APP_HELP: drawHelp(); break;
      default: drawDesktop(); break;
    }
  }
  if (contextMenu_) drawContextMenu();
  drawCursor();
}

void FullOS::drawWallpaper() {
  for (uint8_t y = 0; y < 128; ++y) {
    uint8_t r = 4 + y / 5;
    uint8_t g = 24 + (settings_.theme * 18) + y / 7;
    uint8_t b = 55 + y / 4;
    tft_.drawFastHLine(0, y, 128, mix565(r, g, b));
  }
  for (uint8_t i = 0; i < 34; ++i) {
    uint8_t x = (i * 37 + 11) % 128;
    uint8_t y = (i * 23 + 19) % 118 + 8;
    tft_.drawPixel(x, y, i % 3 == 0 ? TFT_CYAN : TFT_WHITE);
  }
  tft_.drawCircle(101, 31, 18, mix565(230, 210, 90));
  tft_.drawCircle(100, 30, 19, mix565(70, 180, 220));
}

void FullOS::drawDesktop() {
  drawWallpaper();
  drawStatusBar();
  const uint8_t apps = APP_COUNT - 1;
  for (uint8_t i = 0; i < apps; ++i) {
    uint8_t col = i % ICON_COLS;
    uint8_t row = i / ICON_COLS;
    uint8_t x = 4 + col * 31;
    uint8_t y = ICON_TOP + row * 27;
    uint16_t color = i == selectedIcon_ ? TFT_YELLOW : ACCENT;
    tft_.fillRoundRect(x, y, ICON_W, ICON_H, 3, PANEL);
    tft_.drawRoundRect(x, y, ICON_W, ICON_H, 3, color);
    tft_.fillCircle(x + 12, y + 8, 5, color);
    char name[8];
    appListName(i, name, sizeof(name));
    text(x, y + 21, name, TFT_WHITE);
  }
}

void FullOS::drawStatusBar() {
  tft_.fillRect(0, 0, 128, 12, TFT_BLACK);
  text(2, 2, FULLOS_NAME, ACCENT);
  char buf[18];
  snprintf(buf, sizeof(buf), "%lus", millis() / 1000);
  text(82, 2, buf, TFT_LIGHTGREY);
  tft_.drawRect(116, 3, 9, 5, TFT_WHITE);
  tft_.fillRect(118, 5, 5, 1, COLOR_OK);
}

void FullOS::drawCursor() {
  int16_t x = pointer_.x;
  int16_t y = pointer_.y;
  tft_.drawLine(x, y, x, y + 9, TFT_BLACK);
  tft_.drawLine(x, y, x + 6, y + 6, TFT_BLACK);
  tft_.drawLine(x, y + 9, x + 3, y + 7, TFT_BLACK);
  tft_.drawLine(x + 6, y + 6, x + 3, y + 7, TFT_BLACK);
  tft_.drawLine(x + 1, y + 1, x + 1, y + 7, TFT_WHITE);
  tft_.drawLine(x + 1, y + 1, x + 5, y + 5, TFT_WHITE);
}

void FullOS::drawWindow(const char *title) {
  tft_.fillScreen(TFT_BLACK);
  tft_.fillRect(0, 0, 128, 13, PANEL_2);
  text(3, 3, title, TFT_WHITE);
  tft_.drawRect(116, 2, 10, 9, TFT_RED);
  text(119, 3, "x", TFT_RED);
  tft_.drawRect(0, 13, 128, 115, PANEL_2);
}

void FullOS::drawContextMenu() {
  tft_.fillRect(46, 38, 76, 42, TFT_BLACK);
  tft_.drawRect(46, 38, 76, 42, ACCENT);
  text(51, 44, "Open", TFT_WHITE);
  text(51, 56, "Calibrate", TFT_WHITE);
  text(51, 68, "Close", TFT_WHITE);
}

bool FullOS::hit(int16_t x, int16_t y, int16_t w, int16_t h) const {
  return pointer_.x >= x && pointer_.x < x + w && pointer_.y >= y && pointer_.y < y + h;
}

bool FullOS::closeHit() const { return hit(114, 0, 14, 14); }

uint8_t FullOS::iconAt(int16_t x, int16_t y) const {
  if (y < ICON_TOP) return 255;
  uint8_t col = x / 31;
  uint8_t row = (y - ICON_TOP) / 27;
  uint8_t localX = x - col * 31;
  uint8_t localY = y - ICON_TOP - row * 27;
  uint8_t idx = row * ICON_COLS + col;
  if (idx >= APP_COUNT - 1 || localX < 4 || localX > 29 || localY > 20) return 255;
  return idx;
}

void FullOS::launchIcon(uint8_t icon) { openApp(static_cast<AppId>(icon + 1)); }

void FullOS::handleDesktop() {
  uint8_t idx = iconAt(pointer_.x, pointer_.y);
  if (idx != 255 && idx != selectedIcon_) {
    selectedIcon_ = idx;
    dirty_ = true;
  }
  if (pointer_.leftReleased && idx != 255) launchIcon(idx);
  if (pointer_.rightPressed) {
    contextMenu_ = !contextMenu_;
    dirty_ = true;
  }
  if (contextMenu_ && pointer_.leftReleased) {
    if (hit(46, 50, 76, 13)) calibrateJoystick();
    if (hit(46, 62, 76, 16)) contextMenu_ = false;
  }
}

void FullOS::handleWindowChrome() {
  if (pointer_.rightPressed) {
    contextMenu_ = !contextMenu_;
    dirty_ = true;
  }
  if (pointer_.leftReleased && closeHit()) closeApp();
  if (contextMenu_ && pointer_.leftReleased && hit(46, 62, 76, 16)) closeApp();
}

void FullOS::handleSettings() {
  if (!pointer_.leftReleased) return;
  if (hit(10, 25, 108, 12)) settingsRow_ = 0;
  if (hit(10, 39, 108, 12)) settingsRow_ = 1;
  if (hit(10, 53, 108, 12)) settingsRow_ = 2;
  if (hit(10, 67, 108, 12)) settingsRow_ = 3;
  if (hit(10, 84, 48, 14)) calibrateJoystick();
  if (hit(68, 84, 48, 14)) {
    settings_.sound = !settings_.sound;
    saveSettings();
  }
  if (settingsRow_ == 0) settings_.speed = constrain(settings_.speed + 1, 1, 9);
  if (settingsRow_ == 1) settings_.deadzone = constrain(settings_.deadzone + 2, 4, 48);
  if (settingsRow_ == 2) settings_.touchThreshold = settings_.touchThreshold < 60 ? settings_.touchThreshold + 2 : 12;
  if (settingsRow_ == 3) settings_.theme = (settings_.theme + 1) % 4;
  saveSettings();
  dirty_ = true;
}

void FullOS::handleCalc() {
  if (!pointer_.leftReleased) return;
  int gx = (pointer_.x - 8) / 28;
  int gy = (pointer_.y - 45) / 17;
  if (gx < 0 || gx > 3 || gy < 0 || gy > 3) return;
  calcCell_ = gy * 4 + gx;
  if (calcCell_ < 10) {
    calcB_ = calcB_ * 10 + calcCell_;
  } else if (calcCell_ == 10) {
    calcOp_ = (calcOp_ + 1) % 4;
  } else if (calcCell_ == 11) {
    calcA_ = calcB_;
    calcB_ = 0;
  } else if (calcCell_ == 12) {
    if (calcOp_ == 0) calcResult_ = calcA_ + calcB_;
    if (calcOp_ == 1) calcResult_ = calcA_ - calcB_;
    if (calcOp_ == 2) calcResult_ = calcA_ * calcB_;
    if (calcOp_ == 3) calcResult_ = calcB_ ? calcA_ / calcB_ : 0;
  } else if (calcCell_ == 13) {
    calcA_ = calcB_ = calcResult_ = 0;
  }
  dirty_ = true;
}

void FullOS::handleNotes() {
  if (!pointer_.leftReleased) return;
  if (hit(8, 89, 32, 15)) {
    note_[noteCursor_++] = NOTE_CHARS[noteIndex_];
    note_[noteCursor_] = '\0';
    if (noteCursor_ >= sizeof(note_) - 1) noteCursor_ = sizeof(note_) - 2;
  } else if (hit(48, 89, 32, 15)) {
    if (noteCursor_ > 0) note_[--noteCursor_] = '\0';
  } else if (hit(88, 89, 32, 15)) {
    saveSettings();
  } else {
    noteIndex_ = (noteIndex_ + 1) % (sizeof(NOTE_CHARS) - 1);
  }
  dirty_ = true;
}

void FullOS::handlePaint() {
  if (pointer_.left) {
    tft_.fillCircle(pointer_.x, pointer_.y, 2, PALETTE[paintColor_]);
  }
  if (pointer_.rightReleased) {
    paintColor_ = (paintColor_ + 1) % (sizeof(PALETTE) / sizeof(PALETTE[0]));
    dirty_ = true;
  }
}

void FullOS::handleFiles() {
  if (!pointer_.leftReleased) return;
  fileSlot_ = (fileSlot_ + 1) % 3;
  dirty_ = true;
}

void FullOS::handleGPIO() {
  if (!pointer_.leftReleased) return;
  gpioPage_ = (gpioPage_ + 1) % ((Pins::MONITOR_PIN_COUNT + 4) / 5);
  dirty_ = true;
}

void FullOS::handleSensor() {
  if (!pointer_.leftReleased) return;
  sensorIndex_ = (sensorIndex_ + 1) % Pins::ANALOG_INPUT_COUNT;
  dirty_ = true;
}

void FullOS::handleLogic() {
  if (!pointer_.leftReleased) return;
  gpioPage_ = (gpioPage_ + 1) % Pins::MONITOR_PIN_COUNT;
  dirty_ = true;
}

void FullOS::handleScope() {
  uint8_t pin = Pins::ANALOG_INPUTS[sensorIndex_];
  scopeSamples_[scopeHead_] = map(analogRead(pin), 0, 4095, 0, 80);
  scopeHead_ = (scopeHead_ + 1) % sizeof(scopeSamples_);
  if (pointer_.leftReleased) handleSensor();
}

void FullOS::handleWifi(unsigned long) {
#if ENABLE_WIFI_SCANNER
  if (pointer_.leftReleased && !wifiScanning_) {
    WiFi.mode(WIFI_STA);
    WiFi.disconnect(false, true);
    WiFi.scanNetworks(true);
    wifiScanning_ = true;
    wifiCount_ = -1;
    dirty_ = true;
  }
  if (wifiScanning_) {
    int n = WiFi.scanComplete();
    if (n >= 0) {
      wifiCount_ = n;
      wifiScanning_ = false;
      dirty_ = true;
    }
  }
#endif
}

void FullOS::handleTone() {
  if (!pointer_.leftReleased) return;
  if (hit(12, 37, 46, 20)) {
    ledOn_ = !ledOn_;
    digitalWrite(Pins::LED, ledOn_ ? HIGH : LOW);
  }
  if (hit(70, 37, 46, 20)) {
    toneOn_ = !toneOn_;
    if (toneOn_ && settings_.sound) {
      ledcAttach(Pins::BUZZER, 1200, 8);
      ledcWriteTone(Pins::BUZZER, 1200);
    } else {
      ledcWriteTone(Pins::BUZZER, 0);
    }
  }
  dirty_ = true;
}

void FullOS::drawSettings() {
  drawWindow("Settings");
  labelValue(26, "Speed", String(settings_.speed));
  labelValue(40, "Dead", String(settings_.deadzone));
  labelValue(54, "Touch", String(settings_.touchThreshold));
  labelValue(68, "Theme", String(settings_.theme));
  tft_.drawRect(9, 24 + settingsRow_ * 14, 110, 12, TFT_YELLOW);
  tft_.drawRect(10, 84, 48, 14, ACCENT);
  text(15, 88, "Calib");
  tft_.drawRect(68, 84, 48, 14, ACCENT);
  text(74, 88, settings_.sound ? "Sound" : "Mute");
}

void FullOS::drawAbout() {
  drawWindow("About");
  text(8, 24, "FullOS badge desktop", ACCENT);
  text(8, 38, "ESP32 + ST7735");
  text(8, 50, "Joystick mouse");
  text(8, 62, "Touch = right click");
  text(8, 80, "Version " FULLOS_VERSION, TFT_LIGHTGREY);
  text(8, 94, "SMS not included", WARN);
}

void FullOS::drawCalc() {
  drawWindow("Calculator");
  labelValue(18, "A", String(calcA_));
  labelValue(30, "B", String(calcB_));
  const char ops[] = "+-*/";
  char op[2] = {ops[calcOp_], 0};
  labelValue(42, "Op", String(op));
  labelValue(54, "=", String(calcResult_));
  for (uint8_t i = 0; i < 14; ++i) {
    uint8_t x = 8 + (i % 4) * 28;
    uint8_t y = 70 + (i / 4) * 17;
    tft_.drawRect(x, y, 24, 14, i == calcCell_ ? TFT_YELLOW : ACCENT);
    char b[4];
    if (i < 10) snprintf(b, sizeof(b), "%u", i);
    else if (i == 10) snprintf(b, sizeof(b), "op");
    else if (i == 11) snprintf(b, sizeof(b), "set");
    else if (i == 12) snprintf(b, sizeof(b), "=");
    else snprintf(b, sizeof(b), "clr");
    text(x + 3, y + 3, b);
  }
}

void FullOS::drawClock() {
  drawWindow("Clock");
  unsigned long s = millis() / 1000;
  char b[24];
  snprintf(b, sizeof(b), "%02lu:%02lu:%02lu", (s / 3600) % 24, (s / 60) % 60, s % 60);
  tft_.setTextSize(2);
  text(14, 42, b, TFT_YELLOW, 2);
  tft_.setTextSize(1);
  labelValue(80, "Uptime", String(s) + "s");
}

void FullOS::drawNotes() {
  drawWindow("Notes");
  tft_.drawRect(7, 20, 114, 60, PANEL_2);
  text(10, 24, note_);
  char ch[2] = {NOTE_CHARS[noteIndex_], 0};
  labelValue(81, "Char", String(ch));
  tft_.drawRect(8, 89, 32, 15, ACCENT);
  text(15, 93, "Add");
  tft_.drawRect(48, 89, 32, 15, ACCENT);
  text(54, 93, "Del");
  tft_.drawRect(88, 89, 32, 15, ACCENT);
  text(94, 93, "Save");
}

void FullOS::drawPaint() {
  drawWindow("Paint");
  tft_.drawRect(4, 18, 120, 96, PANEL_2);
  tft_.fillRect(0, 115, 128, 13, TFT_BLACK);
  text(5, 118, "Hold=draw Right=color", TFT_LIGHTGREY);
  tft_.fillRect(112, 117, 10, 8, PALETTE[paintColor_]);
}

void FullOS::drawFiles() {
  drawWindow("Files");
  text(9, 24, "NVS Cabinet", ACCENT);
  for (uint8_t i = 0; i < 3; ++i) {
    uint8_t y = 43 + i * 18;
    tft_.drawRect(12, y, 104, 14, i == fileSlot_ ? TFT_YELLOW : ACCENT);
    char b[26];
    snprintf(b, sizeof(b), "slot %u: %s", i, i == 0 ? "note" : "empty");
    text(17, y + 4, b);
  }
}

void FullOS::drawGPIO() {
  drawWindow("GPIO");
  uint8_t start = gpioPage_ * 5;
  for (uint8_t i = 0; i < 5 && start + i < Pins::MONITOR_PIN_COUNT; ++i) {
    uint8_t pin = Pins::MONITOR_PINS[start + i];
    String value;
    if (Pins::isReserved(pin)) {
      value = "reserved";
    } else {
      if (!Pins::isInputOnly(pin)) pinMode(pin, INPUT_PULLUP);
      value = Pins::isAdcCapable(pin) ? String(analogRead(pin)) : String(digitalRead(pin));
    }
    char label[8];
    snprintf(label, sizeof(label), "GPIO%u", pin);
    labelValue(24 + i * 16, label, value);
  }
}

void FullOS::drawSensor() {
  drawWindow("Sensor");
  uint8_t pin = Pins::ANALOG_INPUTS[sensorIndex_];
  int raw = analogRead(pin);
  labelValue(26, "Pin", String(pin));
  labelValue(42, "Raw", String(raw));
  labelValue(58, "Volt", String(raw * 3.3f / 4095.0f, 2));
  tft_.drawRect(10, 82, 108, 12, ACCENT);
  tft_.fillRect(11, 83, map(raw, 0, 4095, 0, 106), 10, COLOR_OK);
}

void FullOS::drawLogic() {
  drawWindow("Logic");
  uint8_t pin = Pins::MONITOR_PINS[gpioPage_];
  bool reserved = Pins::isReserved(pin);
  if (!reserved && !Pins::isInputOnly(pin)) pinMode(pin, INPUT_PULLUP);
  labelValue(26, "Pin", String(pin));
  labelValue(42, "State", reserved ? String("reserved") : String(digitalRead(pin) ? "HIGH" : "LOW"));
  text(8, 70, "Click cycles pins", TFT_LIGHTGREY);
  tft_.fillCircle(97, 43, 12, reserved ? WARN : (digitalRead(pin) ? COLOR_OK : TFT_RED));
}

void FullOS::drawScope() {
  drawWindow("Scope");
  tft_.drawRect(15, 24, 98, 82, ACCENT);
  for (uint8_t i = 0; i < 96; ++i) {
    uint8_t idx = (scopeHead_ + i) % sizeof(scopeSamples_);
    uint8_t y = 105 - scopeSamples_[idx];
    tft_.drawPixel(16 + i, y, TFT_YELLOW);
  }
  text(17, 111, "Click changes ADC pin", TFT_LIGHTGREY);
}

void FullOS::drawWifi() {
  drawWindow("Wi-Fi Scan");
#if ENABLE_WIFI_SCANNER
  if (wifiCount_ == -2) {
    text(10, 32, "Click to scan");
  } else if (wifiCount_ == -1) {
    text(10, 32, "Scanning...", TFT_YELLOW);
  } else {
    labelValue(22, "Found", String(wifiCount_));
    for (int i = 0; i < wifiCount_ && i < 5; ++i) {
      String ssid = WiFi.SSID(i);
      if (ssid.length() > 12) ssid = ssid.substring(0, 12);
      labelValue(40 + i * 14, ssid.c_str(), String(WiFi.RSSI(i)));
    }
  }
#else
  text(10, 32, "Disabled");
#endif
}

void FullOS::drawTone() {
  drawWindow("LED/Tone");
  tft_.drawRect(12, 37, 46, 20, ACCENT);
  text(23, 44, ledOn_ ? "LED on" : "LED");
  tft_.drawRect(70, 37, 46, 20, ACCENT);
  text(77, 44, toneOn_ ? "Tone on" : "Tone");
  text(10, 76, "Uses GPIO22 and TP9", TFT_LIGHTGREY);
}

void FullOS::drawHelp() {
  drawWindow("Help");
  text(8, 24, "Joystick moves cursor");
  text(8, 38, "Press stick: left click");
  text(8, 52, "Touch pad: right click");
  text(8, 66, "Top-right x closes");
  text(8, 84, "Settings calibrates");
}

void FullOS::text(uint8_t x, uint8_t y, const char *s, uint16_t color, uint8_t size) {
  tft_.setTextSize(size);
  tft_.setTextColor(color, TFT_BLACK);
  tft_.setCursor(x, y);
  tft_.print(s);
  tft_.setTextSize(1);
}

void FullOS::labelValue(uint8_t y, const char *label, const String &value) {
  text(9, y, label, TFT_LIGHTGREY);
  tft_.setTextColor(TFT_WHITE, TFT_BLACK);
  tft_.setCursor(55, y);
  tft_.print(value);
}

void FullOS::appListName(uint8_t index, char *out, size_t outSize) const {
  static const char *names[] = {
      "Set", "About", "Calc", "Clock", "Notes", "Paint", "Files",
      "GPIO", "Sens", "Logic", "Scope", "WiFi", "Tone", "Help"};
  snprintf(out, outSize, "%s", names[index]);
}
