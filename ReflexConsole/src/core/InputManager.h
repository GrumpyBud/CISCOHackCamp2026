#pragma once
#include <Arduino.h>
#include "AppState.h"
class InputManager { public: void begin(); InputEvent update(uint32_t now); void calibrate(); private:
  int centerX=2048,centerY=2048; bool touchDown[4]={}; uint32_t lastEvent=0;
  InputEvent touchEvent();
};
