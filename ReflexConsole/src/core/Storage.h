#pragma once
#include <Preferences.h>
#include "Stats.h"
struct Settings { bool sound=true,led=true; uint8_t length=1,quickTrials=10; uint16_t lapseMs=500; };
class Storage { public: Settings settings; bool begin(Stats& stats); void save(const Stats& stats); void saveSettings(); void resetStats(Stats& stats); void resetBaseline(Stats& stats); private: Preferences prefs; };
