#pragma once
#include <Arduino.h>

namespace Pins {
constexpr uint8_t DISPLAY_SCLK = 18;
constexpr uint8_t DISPLAY_MOSI = 23;
constexpr uint8_t DISPLAY_RST = 25;
constexpr uint8_t DISPLAY_DC = 26;
constexpr uint8_t DISPLAY_CS = 19;
constexpr uint8_t DISPLAY_BL = 5;

constexpr uint8_t JOY_X = 34;
constexpr uint8_t JOY_Y = 35;

// External joystick switch. Wire switch between GPIO4 and GND.
constexpr uint8_t JOY_CLICK = 4;

// IMU I2C pins. Keep these reserved for the motion sensor.
constexpr uint8_t IMU_SDA = 21;
constexpr uint8_t IMU_SCL = 32;

// Capacitive pad used as right click. GPIO27 maps to touch pad T7.
constexpr uint8_t RIGHT_CLICK_TOUCH = 27;

constexpr uint8_t LED = 22;
constexpr uint8_t BUZZER = 9;

constexpr uint8_t ANALOG_INPUTS[] = {36, 39};
constexpr size_t ANALOG_INPUT_COUNT = sizeof(ANALOG_INPUTS) / sizeof(ANALOG_INPUTS[0]);
constexpr uint8_t MONITOR_PINS[] = {2, 4, 12, 13, 14, 15, 21, 22, 27, 32, 34, 35, 36, 39};
constexpr size_t MONITOR_PIN_COUNT = sizeof(MONITOR_PINS) / sizeof(MONITOR_PINS[0]);

inline bool isTftPin(uint8_t pin) {
  return pin == DISPLAY_SCLK || pin == DISPLAY_MOSI || pin == DISPLAY_RST || pin == DISPLAY_DC || pin == DISPLAY_CS || pin == DISPLAY_BL;
}

inline bool isInputOnly(uint8_t pin) { return pin == 34 || pin == 35 || pin == 36 || pin == 39; }

inline bool isAdcCapable(uint8_t pin) {
  return pin == 32 || pin == 33 || pin == 34 || pin == 35 || pin == 36 || pin == 39;
}

inline bool isReserved(uint8_t pin) {
  return isTftPin(pin) || pin == JOY_X || pin == JOY_Y || pin == JOY_CLICK || pin == RIGHT_CLICK_TOUCH || pin == LED ||
         pin == IMU_SDA || pin == IMU_SCL;
}
}
