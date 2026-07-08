#include "Storage.h"
#include "../config/BuildConfig.h"

#include <Arduino.h>
#include <cstdarg>
#include <cstring>

namespace {
constexpr uint8_t HISTORY_SCHEMA_VERSION = 1;

void readBytesOrZero(Preferences& prefs, const char* key, void* destination, size_t size) {
  if (prefs.getBytesLength(key) == size) {
    prefs.getBytes(key, destination, size);
  } else {
    memset(destination, 0, size);
  }
}

bool validQuickTrials(uint8_t value) {
  return value == 5 || value == 10 || value == 20;
}

bool validLength(uint8_t value) {
  return value <= 2;
}

bool validLapseMs(uint16_t value) {
  return value >= 250 && value <= 2000;
}

void writeLine(Print& out, const char* fmt, ...) {
  char line[320];
  va_list args;
  va_start(args, fmt);
  vsnprintf(line, sizeof(line), fmt, args);
  va_end(args);
  out.print(line);
  out.print('\n');
}
}  // namespace

bool Storage::begin(Stats& s) {
  if (!prefs.begin("reflex", false)) {
    DEBUGF("Preferences open failed\n");
    return false;
  }

  settings.sound = prefs.getBool("sound", true);
  settings.led = prefs.getBool("led", true);
  settings.length = prefs.getUChar("length", 1);
  settings.quickTrials = prefs.getUChar("trials", 10);
  settings.lapseMs = prefs.getUShort("lapse", 500);

  if (!validLength(settings.length)) settings.length = 1;
  if (!validQuickTrials(settings.quickTrials)) settings.quickTrials = 10;
  if (!validLapseMs(settings.lapseMs)) settings.lapseMs = 500;

  s.sessions = prefs.getULong("sessions", 0);
  s.personalBest = prefs.getUShort("best", 0);
  s.memoryBest = prefs.getUChar("memBest", 0);
  s.scoreCount = prefs.getUChar("scoreN", 0);

  if (s.scoreCount > sizeof(s.scores) / sizeof(s.scores[0])) {
    s.scoreCount = 0;
  }

  readBytesOrZero(prefs, "scores", s.scores, sizeof(s.scores));
  readBytesOrZero(prefs, "last", &s.last, sizeof(s.last));

  s.baseline.quickSamples = prefs.getUChar("qN", 0);
  s.baseline.quickMedian = prefs.getFloat("qMed", 0);
  s.baseline.quickSpread = prefs.getFloat("qDev", 0);
  s.baseline.quickLapseRate = prefs.getFloat("qLap", 0);
  s.baseline.focusMedian = prefs.getFloat("fMed", 0);
  s.baseline.focusLapseRate = prefs.getFloat("fLap", 0);
  s.baseline.rhythmError = prefs.getFloat("rErr", 0);

  // Legacy installs have no history version. Their aggregate data is left
  // untouched and the detail buffer intentionally starts empty.
  if (prefs.getUChar("histV", 0) != HISTORY_SCHEMA_VERSION) {
    clearHistory();
    prefs.putUChar("histV", HISTORY_SCHEMA_VERSION);
  } else {
    historyCount = prefs.getUChar("histN", 0);
    historyHead = prefs.getUChar("histH", 0);
    nextSequence = prefs.getULong("histSeq", 1);

    const size_t expectedHistorySize = sizeof(history);
    const bool historyMetadataInvalid =
        historyCount > SESSION_HISTORY_CAPACITY ||
        historyHead >= SESSION_HISTORY_CAPACITY ||
        prefs.getBytesLength("history") != expectedHistorySize;

    if (historyMetadataInvalid) {
      clearHistory();
    } else {
      prefs.getBytes("history", history, expectedHistorySize);
      if (nextSequence == 0) nextSequence = 1;
    }
  }

  DEBUGF(
      "Loaded baseline quick=%u %.1f; history=%u\n",
      s.baseline.quickSamples,
      s.baseline.quickMedian,
      historyCount
  );

  return true;
}

void Storage::save(const Stats& s) {
  prefs.putULong("sessions", s.sessions);
  prefs.putUShort("best", s.personalBest);
  prefs.putUChar("memBest", s.memoryBest);
  prefs.putUChar("scoreN", s.scoreCount);
  prefs.putBytes("scores", s.scores, sizeof(s.scores));
  prefs.putBytes("last", &s.last, sizeof(s.last));

  prefs.putUChar("qN", s.baseline.quickSamples);
  prefs.putFloat("qMed", s.baseline.quickMedian);
  prefs.putFloat("qDev", s.baseline.quickSpread);
  prefs.putFloat("qLap", s.baseline.quickLapseRate);
  prefs.putFloat("fMed", s.baseline.focusMedian);
  prefs.putFloat("fLap", s.baseline.focusLapseRate);
  prefs.putFloat("rErr", s.baseline.rhythmError);
}

void Storage::saveSettings() {
  prefs.putBool("sound", settings.sound);
  prefs.putBool("led", settings.led);
  prefs.putUChar("length", settings.length);
  prefs.putUChar("trials", settings.quickTrials);
  prefs.putUShort("lapse", settings.lapseMs);
}

void Storage::saveHistory() {
  prefs.putUChar("histV", HISTORY_SCHEMA_VERSION);
  prefs.putUChar("histN", historyCount);
  prefs.putUChar("histH", historyHead);
  prefs.putULong("histSeq", nextSequence);
  prefs.putBytes("history", history, sizeof(history));
}

void Storage::clearHistory() {
  historyCount = 0;
  historyHead = 0;
  nextSequence = 1;
  memset(history, 0, sizeof(history));
  saveHistory();
}

void Storage::resetStats(Stats& s) {
  s = Stats();
  save(s);
  clearHistory();
}

void Storage::resetBaseline(Stats& s) {
  s.baseline = Baseline();
  save(s);
}

const char* Storage::testKindName(uint8_t kind) {
  switch (static_cast<TestKind>(kind)) {
    case TestKind::QUICK:
      return "quick";
    case TestKind::FOCUS:
      return "focus";
    case TestKind::CHOICE:
      return "choice";
    case TestKind::RHYTHM:
      return "rhythm";
    case TestKind::MEMORY:
      return "memory";
  }

  return "unknown";
}

void Storage::recordSession(TestKind kind, const SessionResult& result) {
  SessionHistoryRecord& record = history[historyHead];

  record.sequence = nextSequence++;
  if (nextSequence == 0) nextSequence = 1;

  record.testKind = static_cast<uint8_t>(kind);
  record.score = result.score;
  record.median = result.median;
  record.spread = result.spread;
  record.lapses = result.lapses;
  record.falseStarts = result.falseStarts;
  record.attempts = result.attempts;
  record.correct = result.correct;
  record.bias = result.bias;

  historyHead = (historyHead + 1) % SESSION_HISTORY_CAPACITY;
  if (historyCount < SESSION_HISTORY_CAPACITY) {
    historyCount++;
  }

  saveHistory();
}

void Storage::exportHistory() const {
  exportHistory(Serial);
}

void Storage::exportHistory(Print& out) const {
  uint32_t start = 0;
  uint32_t end = 0;

  const uint8_t firstIndex =
      historyCount == 0
          ? 0
          : (historyHead + SESSION_HISTORY_CAPACITY - historyCount) % SESSION_HISTORY_CAPACITY;

  if (historyCount > 0) {
    start = history[firstIndex].sequence;
    end = history[(historyHead + SESSION_HISTORY_CAPACITY - 1) % SESSION_HISTORY_CAPACITY].sequence;
  }

  const uint64_t mac = ESP.getEfuseMac();
  char badgeId[17];
  snprintf(
      badgeId,
      sizeof(badgeId),
      "%04X%08X",
      static_cast<uint16_t>(mac >> 32),
      static_cast<uint32_t>(mac)
  );

  writeLine(
      out,
      "REFLEX_EXPORT {\"type\":\"begin\",\"protocol\":1,\"firmware_version\":\"%s\",\"badge_id\":\"%s\",\"history_capacity\":%u,\"session_sequence_start\":%lu,\"session_sequence_end\":%lu,\"session_count\":%u}",
      FIRMWARE_VERSION,
      badgeId,
      SESSION_HISTORY_CAPACITY,
      static_cast<unsigned long>(start),
      static_cast<unsigned long>(end),
      historyCount
  );

  for (uint8_t i = 0; i < historyCount; i++) {
    const uint8_t index = (firstIndex + i) % SESSION_HISTORY_CAPACITY;
    const SessionHistoryRecord& record = history[index];

    writeLine(
        out,
        "REFLEX_EXPORT {\"type\":\"session\",\"sequence\":%lu,\"test_type\":\"%s\",\"score\":%u,\"median\":%u,\"spread\":%.2f,\"lapses\":%u,\"false_starts\":%u,\"attempts\":%u,\"correct\":%u,\"rhythm_bias\":%d}",
        static_cast<unsigned long>(record.sequence),
        testKindName(record.testKind),
        record.score,
        record.median,
        static_cast<double>(record.spread),
        record.lapses,
        record.falseStarts,
        record.attempts,
        record.correct,
        record.bias
    );
  }

  writeLine(
      out,
      "REFLEX_EXPORT {\"type\":\"end\",\"protocol\":1,\"session_count\":%u,\"session_sequence_start\":%lu,\"session_sequence_end\":%lu}",
      historyCount,
      static_cast<unsigned long>(start),
      static_cast<unsigned long>(end)
  );
}
