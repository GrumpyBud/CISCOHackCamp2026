#pragma once
#include "config/BuildConfig.h"
#include "core/AppState.h"
#include "core/InputManager.h"
#include "core/Display.h"
#include "core/Buzzer.h"
#include "core/Storage.h"
class BLECharacteristic;
class BLEServer;
class ReflexApp { public: void begin(); void update(); private:
 InputManager input; Display display; Buzzer buzzer; Storage storage; Stats stats; AppState state=AppState::BOOT; uint32_t stateAt=0,nextAt=0,stimulusAt=0,testStartedAt=0,rhythmFirstBeatAt=0; uint8_t menuIndex=0,settingIndex=0,trial=0,eventCount=0; bool dirty=true,stimulusLeft=false,rhythmTapped[24]={}; uint16_t samples[30]={}; uint8_t sampleCount=0,lapses=0,falseStarts=0,wrong=0; int32_t rhythmTotal=0;
 char feedback[20]={}; uint16_t feedbackColor=TFT_WHITE;
 char serialCommand[32]={}; uint8_t serialCommandLength=0;
#if ENABLE_BLE_DASHBOARD
 BLEServer* bleServer=nullptr; BLECharacteristic* bleDataCharacteristic=nullptr; bool bleExportRequested=false;
#endif
 void change(AppState s); void draw(); void handle(InputEvent e,uint32_t now); void startQuick(uint32_t now); void finish(TestKind kind); void newWait(uint32_t now,uint16_t minMs,uint16_t maxMs); void stimulus(uint32_t now,AppState s); bool action(InputEvent e)const; void led(bool on); void testFeedback(const char* text,uint16_t color,uint32_t now); void serviceSerial();
#if ENABLE_BLE_DASHBOARD
 void startBluetooth(); void serviceBluetooth(); void requestBleExport();
#endif
};
