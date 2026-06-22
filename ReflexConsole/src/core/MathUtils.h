#pragma once

#include <Arduino.h>

namespace MathUtils {
float mean(const uint16_t* values, uint8_t count);
uint16_t median(uint16_t* values, uint8_t count);
float stddev(const uint16_t* values, uint8_t count, float average);
uint8_t clampScore(float value);
float ema(float previous, float sample, float alpha);
}  // namespace MathUtils
