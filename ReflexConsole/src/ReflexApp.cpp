#include "ReflexApp.h"
#include "config/BuildConfig.h"
#include "config/PinConfig.h"
#include "core/MathUtils.h"
#include <cstdarg>
#include <esp_system.h>
#include <cstring>
#include <string>

#if ENABLE_BLE_DASHBOARD
#include <BLE2902.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#endif

static const char* const MENU[] = {"Quick Test", "Focus Test", "Choice Test", "Rhythm Test", "Stats", "Settings"};
static const char* const SETTING[] = {"Sound", "LED", "Test length", "Quick trials", "Lapse threshold", "Reset stats", "Reset baseline", "About"};

#if ENABLE_BLE_DASHBOARD
namespace {
constexpr char BLE_SERVICE_UUID[] = "8f4f0001-b0bc-4cf0-a4f2-49e0e6a8c101";
constexpr char BLE_COMMAND_UUID[] = "8f4f0002-b0bc-4cf0-a4f2-49e0e6a8c101";
constexpr char BLE_DATA_UUID[] = "8f4f0003-b0bc-4cf0-a4f2-49e0e6a8c101";
constexpr size_t BLE_CHUNK_SIZE = 160;

void writeLine(Print& out, const char* fmt, ...) {
  char line[320];
  va_list args;
  va_start(args, fmt);
  vsnprintf(line, sizeof(line), fmt, args);
  va_end(args);
  out.print(line);
  out.print('\n');
}

class BleNotifyPrint final : public Print {
 public:
  explicit BleNotifyPrint(BLECharacteristic* characteristic) : characteristic(characteristic) {}

  size_t write(uint8_t b) override { return write(&b, 1); }

  size_t write(const uint8_t* buffer, size_t size) override {
    if (!characteristic || !size) return 0;
    size_t offset = 0;
    while (offset < size) {
      size_t chunk = size - offset;
      if (chunk > BLE_CHUNK_SIZE) chunk = BLE_CHUNK_SIZE;
      characteristic->setValue((uint8_t*)(buffer + offset), chunk);
      characteristic->notify();
      offset += chunk;
      delay(2);
    }
    return size;
  }

 private:
  BLECharacteristic* characteristic;
};

class BleCommandCallbacks final : public BLECharacteristicCallbacks {
 public:
  explicit BleCommandCallbacks(ReflexApp& app) : app(app) {}

  void onWrite(BLECharacteristic* characteristic) override {
    const std::string value = characteristic->getValue();
    if (value == "REFLEX_EXPORT_V1" || value == "REFLEX_EXPORT_V1\n" || value == "REFLEX_EXPORT_V1\r\n") {
      app.requestBleExport();
    }
  }

 private:
  ReflexApp& app;
};
}  // namespace
#endif

void ReflexApp::begin() {
  Serial.begin(115200);
  DEBUGF("\nReflex Console %s boot %s %s\n", FIRMWARE_VERSION, __DATE__, __TIME__);
  pinMode(Pins::LED, OUTPUT);
  led(false);
  display.begin();
  input.begin();
  buzzer.begin();
  storage.begin(stats);
  randomSeed(esp_random());
#if ENABLE_BLE_DASHBOARD
  startBluetooth();
#endif
  change(AppState::BOOT);
}

void ReflexApp::led(bool on) { digitalWrite(Pins::LED, (storage.settings.led && on) ? HIGH : LOW); }

bool ReflexApp::action(InputEvent e) const { return e == InputEvent::SELECT || e == InputEvent::START; }

void ReflexApp::change(AppState s) {
  state = s;
  stateAt = millis();
  dirty = true;
  led(false);
  DEBUGF("State %u\n", (unsigned)state);
}

void ReflexApp::newWait(uint32_t now, uint16_t lo, uint16_t hi) { nextAt = now + random(lo, hi + 1); }

void ReflexApp::stimulus(uint32_t now, AppState s) {
  stimulusAt = now;
  change(s);
  stimulusAt = now;
  led(true);
  if (storage.settings.sound) buzzer.beep(1100, 45);
}

void ReflexApp::startQuick(uint32_t now) {
  trial = sampleCount = lapses = falseStarts = 0;
  newWait(now, 1500, 5000);
  change(AppState::QUICK_WAIT);
  DEBUGF("Quick start %u trials\n", storage.settings.quickTrials);
}

void ReflexApp::testFeedback(const char* t, uint16_t c, uint32_t now) {
  strncpy(feedback, t, sizeof(feedback) - 1);
  feedback[sizeof(feedback) - 1] = 0;
  feedbackColor = c;
  nextAt = now + 650;
  change(AppState::QUICK_FEEDBACK);
  nextAt = now + 650;
}

void ReflexApp::finish(TestKind k) {
  SessionResult r;
  r.lapses = lapses;
  r.falseStarts = falseStarts;
  r.attempts = sampleCount + wrong;
  r.correct = sampleCount;
  r.median = sampleCount ? MathUtils::median(samples, sampleCount) : 0;
  r.spread = sampleCount ? MathUtils::stddev(samples, sampleCount, MathUtils::mean(samples, sampleCount)) : 0;
  if (k == TestKind::QUICK) {
    r.score = stats.readiness(r);
    stats.recordQuick(r);
    change(AppState::QUICK_SUMMARY);
  } else if (k == TestKind::FOCUS) {
    r.score = stats.baseline.quickSamples ? stats.readiness(r) : 0;
    stats.recordFocus(r);
    change(AppState::FOCUS_SUMMARY);
  } else if (k == TestKind::CHOICE) {
    r.score = MathUtils::clampScore((r.attempts ? 100.f * r.correct / r.attempts : 0) * .55f + (r.median ? 45000.f / r.median : 0) * .45f);
    stats.last = r;
    stats.sessions++;
    change(AppState::CHOICE_SUMMARY);
  } else {
    r.bias = sampleCount ? rhythmTotal / sampleCount : 0;
    r.score = sampleCount ? MathUtils::clampScore(100 - r.median / 3) : 0;
    stats.recordRhythm(r);
    change(AppState::RHYTHM_SUMMARY);
  }
  storage.save(stats);
  storage.recordSession(k, r);
  DEBUGF("Test end median=%u score=%u lapses=%u false=%u\n", r.median, r.score, r.lapses, r.falseStarts);
}

void ReflexApp::serviceSerial() {
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (serialCommandLength) {
        serialCommand[serialCommandLength] = 0;
        if (strcmp(serialCommand, "REFLEX_EXPORT_V1") == 0) storage.exportHistory();
        serialCommandLength = 0;
      }
    } else if (serialCommandLength < sizeof(serialCommand) - 1) {
      serialCommand[serialCommandLength++] = c;
    } else {
      serialCommandLength = 0;
    }
  }
}

#if ENABLE_BLE_DASHBOARD
void ReflexApp::startBluetooth() {
  BLEDevice::init("Reflex Console");
  bleServer = BLEDevice::createServer();
  BLEService* service = bleServer->createService(BLE_SERVICE_UUID);
  BLECharacteristic* command = service->createCharacteristic(BLE_COMMAND_UUID, BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  command->setCallbacks(new BleCommandCallbacks(*this));
  bleDataCharacteristic = service->createCharacteristic(BLE_DATA_UUID, BLECharacteristic::PROPERTY_NOTIFY);
  bleDataCharacteristic->addDescriptor(new BLE2902());
  service->start();
  BLEAdvertising* advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(BLE_SERVICE_UUID);
  advertising->setScanResponse(true);
  advertising->setMinPreferred(0x06);
  advertising->setMaxPreferred(0x12);
  BLEDevice::startAdvertising();
  DEBUGF("BLE dashboard export ready\n");
}

void ReflexApp::requestBleExport() { bleExportRequested = true; }

void ReflexApp::serviceBluetooth() {
  if (!bleExportRequested || !bleDataCharacteristic) return;
  bleExportRequested = false;
  BleNotifyPrint out(bleDataCharacteristic);
  storage.exportHistory(out);
}
#endif

void ReflexApp::update() {
  serviceSerial();
#if ENABLE_BLE_DASHBOARD
  serviceBluetooth();
#endif
  uint32_t now = millis();
  buzzer.update(now);
  if (state == AppState::RHYTHM_RUNNING && now >= nextAt) {
    if (trial >= 24) {
      finish(TestKind::RHYTHM);
    } else {
      stimulusAt = now;
      trial++;
      nextAt += 600;
      led(true);
      dirty = true;
      if (storage.settings.sound) buzzer.beep(880, 35);
    }
  }
  InputEvent e = input.update(now);
  if (e == InputEvent::MENU && state != AppState::MENU) {
    change(AppState::MENU);
    return;
  }
  handle(e, now);
  if (state == AppState::BOOT && now - stateAt > 1800) change(AppState::MENU);
  if (state == AppState::FOCUS_WAIT && now - testStartedAt >= (storage.settings.length == 0 ? 30000UL : storage.settings.length == 1 ? 60000UL : 120000UL)) finish(TestKind::FOCUS);
  if (state == AppState::CHOICE_WAIT && eventCount >= 10) finish(TestKind::CHOICE);
  if ((state == AppState::QUICK_WAIT || state == AppState::FOCUS_WAIT || state == AppState::CHOICE_WAIT) && now >= nextAt) {
    AppState s = state == AppState::QUICK_WAIT ? AppState::QUICK_GO : state == AppState::FOCUS_WAIT ? AppState::FOCUS_GO : AppState::CHOICE_GO;
    if (s == AppState::CHOICE_GO) stimulusLeft = random(0, 2) == 0;
    stimulus(now, s);
  }
  if ((state == AppState::QUICK_GO || state == AppState::FOCUS_GO || state == AppState::CHOICE_GO) && now - stimulusAt > 1500) {
    lapses++;
    if (state == AppState::QUICK_GO) {
      trial++;
      if (trial >= storage.settings.quickTrials) {
        finish(TestKind::QUICK);
      } else {
        newWait(now, 1200, 3500);
        change(AppState::QUICK_WAIT);
      }
    } else if (state == AppState::FOCUS_GO) {
      newWait(now, 900, 2600);
      change(AppState::FOCUS_WAIT);
    } else {
      eventCount++;
      newWait(now, 900, 2200);
      change(AppState::CHOICE_WAIT);
    }
  }
  if (state == AppState::QUICK_FEEDBACK && now >= nextAt) {
    trial++;
    if (trial >= storage.settings.quickTrials) {
      finish(TestKind::QUICK);
    } else {
      newWait(now, 1200, 3500);
      change(AppState::QUICK_WAIT);
    }
  }
  if (state == AppState::RHYTHM_RUNNING && now - stimulusAt > 70) led(false);
  if (dirty) {
    draw();
    dirty = false;
  }
}

void ReflexApp::handle(InputEvent e, uint32_t now) {
  if (e == InputEvent::NONE) return;
  if (e == InputEvent::BACK && state != AppState::CHOICE_GO) {
    if (state != AppState::MENU) change(AppState::MENU);
    return;
  }
  if (state == AppState::MENU) {
    if (e == InputEvent::UP) menuIndex = (menuIndex + 5) % 6;
    else if (e == InputEvent::DOWN) menuIndex = (menuIndex + 1) % 6;
    else if (action(e)) {
      static const AppState targets[] = {AppState::QUICK_INTRO, AppState::FOCUS_INTRO, AppState::CHOICE_INTRO, AppState::RHYTHM_INTRO, AppState::STATS, AppState::SETTINGS};
      change(targets[menuIndex]);
    }
    dirty = true;
    return;
  }
  if (state == AppState::QUICK_INTRO && action(e)) { startQuick(now); return; }
  if (state == AppState::FOCUS_INTRO && action(e)) {
    sampleCount = lapses = falseStarts = 0;
    testStartedAt = now;
    nextAt = now + random(1000, 2500);
    change(AppState::FOCUS_WAIT);
    return;
  }
  if (state == AppState::CHOICE_INTRO && action(e)) {
    sampleCount = lapses = falseStarts = wrong = eventCount = 0;
    newWait(now, 1000, 2400);
    change(AppState::CHOICE_WAIT);
    return;
  }
  if (state == AppState::RHYTHM_INTRO && action(e)) {
    trial = sampleCount = 0;
    rhythmTotal = 0;
    for (uint8_t i = 0; i < 24; i++) rhythmTapped[i] = false;
    rhythmFirstBeatAt = now + 600;
    nextAt = rhythmFirstBeatAt;
    stimulusAt = now;
    change(AppState::RHYTHM_RUNNING);
    return;
  }
  if (state == AppState::QUICK_WAIT || state == AppState::FOCUS_WAIT || state == AppState::CHOICE_WAIT) {
    if (action(e) || e == InputEvent::LEFT || e == InputEvent::RIGHT) {
      falseStarts++;
      if (state == AppState::QUICK_WAIT) testFeedback("FALSE START", TFT_RED, now);
      else newWait(now, 900, 2200);
    }
    return;
  }
  if (state == AppState::QUICK_GO || state == AppState::FOCUS_GO) {
    if (action(e)) {
      uint16_t rt = (uint16_t)(now - stimulusAt);
      if (sampleCount < 30) samples[sampleCount++] = rt;
      if (rt > storage.settings.lapseMs) lapses++;
      led(false);
      if (state == AppState::QUICK_GO) {
        char b[16];
        snprintf(b, sizeof(b), "%u ms", rt);
        testFeedback(b, rt > storage.settings.lapseMs ? TFT_YELLOW : TFT_GREEN, now);
      } else {
        newWait(now, 800, 2200);
        change(AppState::FOCUS_WAIT);
      }
    }
    return;
  }
  if (state == AppState::CHOICE_GO) {
    bool correct = (stimulusLeft && e == InputEvent::BACK) || (!stimulusLeft && action(e));
    if (correct) {
      if (sampleCount < 30) samples[sampleCount++] = now - stimulusAt;
    } else {
      wrong++;
    }
    led(false);
    eventCount++;
    newWait(now, 800, 2000);
    change(AppState::CHOICE_WAIT);
    return;
  }
  if (state == AppState::RHYTHM_RUNNING && action(e)) {
    const int32_t offset = (int32_t)now - (int32_t)rhythmFirstBeatAt;
    const int16_t beat = (int16_t)((offset >= 0 ? offset + 300 : offset - 300) / 600);
    if (beat < 0 || beat >= 24 || rhythmTapped[beat]) return;
    const uint32_t targetAt = rhythmFirstBeatAt + (uint32_t)beat * 600;
    const int32_t err = (int32_t)now - (int32_t)targetAt;
    const uint16_t errorMs = (uint16_t)abs(err);
    rhythmTapped[beat] = true;
    rhythmTotal += err;
    if (sampleCount < 24) samples[sampleCount++] = errorMs;
    char rhythmFeedback[16];
    uint16_t rhythmColor = TFT_RED;
    if (errorMs <= 50) {
      snprintf(rhythmFeedback, sizeof(rhythmFeedback), "ON TIME");
      rhythmColor = TFT_GREEN;
    } else if (errorMs <= 150) {
      snprintf(rhythmFeedback, sizeof(rhythmFeedback), "GOOD %+ld", (long)err);
      rhythmColor = TFT_YELLOW;
    } else {
      snprintf(rhythmFeedback, sizeof(rhythmFeedback), err < 0 ? "EARLY %ld" : "LATE +%ld", (long)err);
    }
    display.tft.fillRect(0, 70, 128, 10, TFT_BLACK);
    display.centered(rhythmFeedback, 70, 1, rhythmColor);
    dirty = false;
    return;
  }
  if (state == AppState::SETTINGS) {
    if (e == InputEvent::UP) settingIndex = (settingIndex + 7) % 8;
    else if (e == InputEvent::DOWN) settingIndex = (settingIndex + 1) % 8;
    else if (e == InputEvent::LEFT || e == InputEvent::RIGHT || action(e)) {
      switch (settingIndex) {
        case 0: storage.settings.sound = !storage.settings.sound; break;
        case 1: storage.settings.led = !storage.settings.led; break;
        case 2: storage.settings.length = (storage.settings.length + 1) % 3; break;
        case 3: storage.settings.quickTrials = storage.settings.quickTrials == 5 ? 10 : storage.settings.quickTrials == 10 ? 20 : 5; break;
        case 4: storage.settings.lapseMs = storage.settings.lapseMs == 500 ? 650 : storage.settings.lapseMs == 650 ? 800 : 500; break;
        case 5: storage.resetStats(stats); break;
        case 6: storage.resetBaseline(stats); break;
        case 7: change(AppState::ABOUT); return;
      }
      storage.saveSettings();
    }
    dirty = true;
  }
}

void ReflexApp::draw() {
  char b[32];
  display.clear();
  if (state == AppState::BOOT) {
    display.centered("Reflex Console", 32, 2, TFT_CYAN);
    display.centered("Personal performance", 62, 1);
    display.centered("tracker", 73, 1);
    snprintf(b, sizeof(b), "v%s %s", FIRMWARE_VERSION, __DATE__);
    display.centered(b, 108, 1, TFT_DARKGREY);
    return;
  }
  if (state == AppState::MENU) {
    display.menu(MENU, 6, menuIndex);
    return;
  }
  if (state == AppState::STATS) {
    display.header("STATS");
    snprintf(b, sizeof(b), "Last score: %u", stats.last.score);
    display.metric("Last score", b + 12, 22, TFT_CYAN);
    snprintf(b, sizeof(b), "%u ms", stats.personalBest);
    display.metric("Best quick", b, 38, TFT_GREEN);
    snprintf(b, sizeof(b), "%.0f ms", stats.baseline.quickMedian);
    display.metric("Base median", b, 54);
    snprintf(b, sizeof(b), "%.0f ms", stats.baseline.quickSpread);
    display.metric("Base spread", b, 70);
    snprintf(b, sizeof(b), "%lu", (unsigned long)stats.sessions);
    display.metric("Sessions", b, 86);
    display.centered("BACK: menu", 112, 1, TFT_DARKGREY);
    return;
  }
  if (state == AppState::SETTINGS) {
    display.header("SETTINGS");
    for (uint8_t i = 0; i < 8; i++) {
      int y = 18 + i * 12;
      if (i == settingIndex) {
        display.tft.fillRect(2, y - 1, 124, 11, TFT_CYAN);
        display.tft.setTextColor(TFT_BLACK, TFT_CYAN);
      } else {
        display.tft.setTextColor(TFT_WHITE, TFT_BLACK);
      }
      display.tft.drawString(SETTING[i], 5, y);
      const char* v = "";
      if (i == 0) v = storage.settings.sound ? "ON" : "OFF";
      if (i == 1) v = storage.settings.led ? "ON" : "OFF";
      if (i == 2) v = storage.settings.length == 0 ? "SHORT" : storage.settings.length == 1 ? "NORMAL" : "LONG";
      if (i == 3) { snprintf(b, sizeof(b), "%u", storage.settings.quickTrials); v = b; }
      if (i == 4) { snprintf(b, sizeof(b), "%u", storage.settings.lapseMs); v = b; }
      display.tft.drawRightString(v, 123, y, 1);
    }
    return;
  }
  if (state == AppState::ABOUT) {
    display.header("ABOUT");
    display.centered("Reflex Console", 24, 1, TFT_CYAN);
    display.centered("Measures personal", 44, 1);
    display.centered("consistency and", 55, 1);
    display.centered("readiness trends.", 66, 1);
    display.centered("Not a diagnosis.", 90, 1, TFT_YELLOW);
    return;
  }

  bool intro = state == AppState::QUICK_INTRO || state == AppState::FOCUS_INTRO || state == AppState::CHOICE_INTRO || state == AppState::RHYTHM_INTRO;
  if (intro) {
    const char* title = state == AppState::QUICK_INTRO ? "QUICK TEST" : state == AppState::FOCUS_INTRO ? "FOCUS TEST" : state == AppState::CHOICE_INTRO ? "CHOICE TEST" : "RHYTHM TEST";
    display.header(title);
    const char* a = state == AppState::QUICK_INTRO ? "Wait for GREEN." : state == AppState::FOCUS_INTRO ? "Respond to each" : state == AppState::CHOICE_INTRO ? "BLUE = BACK" : "Tap with the beat";
    const char* c = state == AppState::CHOICE_INTRO ? "RED = SELECT" : state == AppState::QUICK_INTRO ? "Tap when GREEN." : "Press START";
    display.centered(a, 42, 1);
    display.centered(c, 60, 1);
    display.centered("START to begin", 102, 1, TFT_CYAN);
    return;
  }
  if (state == AppState::QUICK_WAIT || state == AppState::FOCUS_WAIT || state == AppState::CHOICE_WAIT) {
    display.centered("WAIT", 48, 3, TFT_LIGHTGREY);
    display.centered("Stay ready", 88, 1);
    return;
  }
  if (state == AppState::QUICK_GO || state == AppState::FOCUS_GO) {
    display.clear(TFT_GREEN);
    display.centered("GO", 45, 4, TFT_BLACK);
    return;
  }
  if (state == AppState::QUICK_FEEDBACK) {
    display.centered(feedback, 45, 2, feedbackColor);
    return;
  }
  if (state == AppState::CHOICE_GO) {
    display.clear(stimulusLeft ? TFT_BLUE : TFT_RED);
    display.centered(stimulusLeft ? "LEFT" : "RIGHT", 45, 2, TFT_WHITE);
    display.centered(stimulusLeft ? "BACK" : "SELECT", 78, 1, TFT_WHITE);
    return;
  }
  if (state == AppState::RHYTHM_RUNNING) {
    display.header("RHYTHM");
    display.centered("TAP", 40, 3, TFT_CYAN);
    snprintf(b, sizeof(b), "Beat %u / 24", trial);
    display.centered(b, 90, 1);
    return;
  }
  if (state == AppState::QUICK_SUMMARY || state == AppState::FOCUS_SUMMARY || state == AppState::CHOICE_SUMMARY || state == AppState::RHYTHM_SUMMARY) {
    display.header("SESSION SUMMARY");
    snprintf(b, sizeof(b), "Median %u ms", stats.last.median);
    display.metric(state == AppState::RHYTHM_SUMMARY ? "Timing error" : "Reaction", b + 7, 24, TFT_CYAN);
    snprintf(b, sizeof(b), "%.0f ms", stats.last.spread);
    display.metric("Consistency", b, 40);
    snprintf(b, sizeof(b), "%u", stats.last.lapses);
    display.metric("Lapses", b, 56, TFT_YELLOW);
    snprintf(b, sizeof(b), "%u", stats.last.falseStarts);
    display.metric("False starts", b, 72, TFT_RED);
    if (stats.baseline.quickSamples < 5) {
      snprintf(b, sizeof(b), "Baseline: %u/5", stats.baseline.quickSamples);
      display.centered(b, 94, 1, TFT_YELLOW);
    } else {
      snprintf(b, sizeof(b), state == AppState::CHOICE_SUMMARY || state == AppState::RHYTHM_SUMMARY ? "Score %u" : "Readiness %u", stats.last.score);
      display.centered(b, 94, 1, TFT_GREEN);
    }
    display.centered("BACK: menu", 113, 1, TFT_DARKGREY);
  }
}
