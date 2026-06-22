#include "MathUtils.h"

#include <math.h>

namespace MathUtils {

float mean(const uint16_t* values, uint8_t count) {
  if (count == 0) return 0.0f;

  uint32_t sum = 0;
  for (uint8_t i = 0; i < count; ++i) sum += values[i];
  return static_cast<float>(sum) / count;
}

uint16_t median(uint16_t* values, uint8_t count) {
  if (count == 0) return 0;

  // Small fixed buffers make insertion sort simpler and cheaper than allocating.
  for (uint8_t i = 1; i < count; ++i) {
    const uint16_t value = values[i];
    int8_t j = i - 1;
    while (j >= 0 && values[j] > value) {
      values[j + 1] = values[j];
      --j;
    }
    values[j + 1] = value;
  }

  if (count & 1) return values[count / 2];
  return static_cast<uint16_t>((values[count / 2 - 1] + values[count / 2]) / 2);
}

float stddev(const uint16_t* values, uint8_t count, float average) {
  if (count < 2) return 0.0f;

  float sumSquares = 0.0f;
  for (uint8_t i = 0; i < count; ++i) {
    const float delta = values[i] - average;
    sumSquares += delta * delta;
  }
  return sqrtf(sumSquares / count);
}

uint8_t clampScore(float value) {
  if (value < 0.0f) return 0;
  if (value > 100.0f) return 100;
  return static_cast<uint8_t>(value + 0.5f);
}

float ema(float previous, float sample, float alpha) {
  return previous + (sample - previous) * alpha;
}

}  // namespace MathUtils
