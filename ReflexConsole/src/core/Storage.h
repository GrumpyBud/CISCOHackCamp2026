#pragma once
#include <Preferences.h>
#include "Stats.h"
#include "AppState.h"
class Print;

// Kept separate from SessionResult so existing `last` Preferences data remains
// binary-compatible with releases before detailed history was introduced.
constexpr uint8_t SESSION_HISTORY_CAPACITY = 100;
struct SessionHistoryRecord {
  uint32_t sequence = 0;
  uint8_t testKind = 0;
  uint8_t score = 0;
  uint16_t median = 0;
  float spread = 0;
  uint8_t lapses = 0;
  uint8_t falseStarts = 0;
  uint8_t attempts = 0;
  uint8_t correct = 0;
  int16_t bias = 0;
};

struct Settings { bool sound=true,led=true; uint8_t length=1,quickTrials=10; uint16_t lapseMs=500; };
class Storage {
 public:
  Settings settings;
  bool begin(Stats& stats);
  void save(const Stats& stats);
  void saveSettings();
  void resetStats(Stats& stats);
  void resetBaseline(Stats& stats);
  void recordSession(TestKind kind, const SessionResult& result);
  void exportHistory() const;
  void exportHistory(Print& out) const;

 private:
  Preferences prefs;
  SessionHistoryRecord history[SESSION_HISTORY_CAPACITY] = {};
  uint8_t historyCount = 0;
  uint8_t historyHead = 0;
  uint32_t nextSequence = 1;
  void saveHistory();
  void clearHistory();
  static const char* testKindName(uint8_t kind);
};
