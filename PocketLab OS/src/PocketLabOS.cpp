#include <Arduino.h>
#include "PocketLabOS.h"
#include "config/BuildConfig.h"
#include "config/PinConfig.h"
#include "core/Display.h"
#include "core/Storage.h"
#include "core/Buzzer.h"
#include "core/InputManager.h"
#include "core/AppManager.h"
#include "apps/LauncherApp.h"
#include "apps/SensorLabApp.h"
#include "apps/ScopeApp.h"
#include "apps/LogicProbeApp.h"
#include "apps/PinMonitorApp.h"
#include "apps/ToneToolApp.h"
#include "apps/IOTesterApp.h"
#include "apps/SettingsApp.h"
#include "apps/AboutApp.h"
namespace {
Storage storage; Display display; Buzzer buzzer; InputManager input(storage); AppManager manager(display, storage, buzzer);
LauncherApp launcher(display, storage, buzzer, input, manager); SensorLabApp sensorLab(display, storage, buzzer, input, manager);
ScopeApp scope(display, storage, buzzer, input, manager); LogicProbeApp logicProbe(display, storage, buzzer, input, manager);
PinMonitorApp pinMonitor(display, storage, buzzer, input, manager); ToneToolApp toneTool(display, storage, buzzer, input, manager);
IOTesterApp ioTester(display, storage, buzzer, input, manager); SettingsApp settings(display, storage, buzzer, input, manager); AboutApp about(display, storage, buzzer, input, manager);
App* apps[] = {&launcher, &sensorLab, &scope, &logicProbe, &pinMonitor, &toneTool, &ioTester, &settings, &about};
}
void PocketLabOS::begin() {
#if DEBUG_SERIAL
  Serial.begin(115200); Serial.printf("PocketLab OS %s\n", POCKETLAB_VERSION);
#endif
  storage.begin(); buzzer.begin(); buzzer.setEnabled(storage.settings().soundOn); input.begin();
  display.begin(storage.settings().rotation, storage.settings().brightness); manager.setApps(apps, sizeof(apps) / sizeof(apps[0])); manager.begin();
}
void PocketLabOS::loop() { const uint32_t now = millis(); InputEvent event; if (input.poll(now, event)) manager.handleInput(event); manager.update(now); }
