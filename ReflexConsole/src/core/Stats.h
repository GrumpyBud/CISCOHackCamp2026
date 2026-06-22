#pragma once
#include <Arduino.h>
struct SessionResult { uint16_t median=0; float spread=0; uint8_t lapses=0,falseStarts=0,correct=0,attempts=0,score=0; int16_t bias=0; };
struct Baseline { uint8_t quickSamples=0; float quickMedian=0,quickSpread=0,quickLapseRate=0,focusMedian=0,focusLapseRate=0,rhythmError=0; };
class Stats { public: uint32_t sessions=0; uint16_t personalBest=0; uint8_t scores[10]={}; uint8_t scoreCount=0; Baseline baseline; SessionResult last; uint8_t readiness(const SessionResult& r) const; void recordQuick(const SessionResult& r); void recordFocus(const SessionResult& r); void recordRhythm(const SessionResult& r); };
