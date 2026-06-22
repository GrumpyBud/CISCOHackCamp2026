#pragma once
#include <Arduino.h>
template <typename T> inline T clampValue(T value, T low, T high) { return value < low ? low : (value > high ? high : value); }
inline float adcToVolts(uint16_t raw) { return (static_cast<float>(raw) * 3.3f) / 4095.0f; }
