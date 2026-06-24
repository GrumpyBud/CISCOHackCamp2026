#pragma once
#include <Arduino.h>
#include "AppState.h"
class InputManager { public: void begin(); InputEvent update(uint32_t now); private:
  bool touchDown[8]={};
  InputEvent touchEvent();
};
