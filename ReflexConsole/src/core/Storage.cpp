#include "Storage.h"
#include "../config/BuildConfig.h"
#include <Arduino.h>
#include <cstdarg>
#include <cstring>

namespace {
constexpr uint8_t HISTORY_SCHEMA_VERSION = 1;
}

bool Storage::begin(Stats&s){if(!prefs.begin("reflex",false)){DEBUGF("Preferences open failed\n");return false;} settings.sound=prefs.getBool("sound",true);settings.led=prefs.getBool("led",true);settings.length=prefs.getUChar("length",1);settings.quickTrials=prefs.getUChar("trials",10);settings.lapseMs=prefs.getUShort("lapse",500);s.sessions=prefs.getULong("sessions",0);s.personalBest=prefs.getUShort("best",0);s.scoreCount=prefs.getUChar("scoreN",0);prefs.getBytes("scores",s.scores,sizeof(s.scores));prefs.getBytes("last",&s.last,sizeof(s.last));s.baseline.quickSamples=prefs.getUChar("qN",0);s.baseline.quickMedian=prefs.getFloat("qMed",0);s.baseline.quickSpread=prefs.getFloat("qDev",0);s.baseline.quickLapseRate=prefs.getFloat("qLap",0);s.baseline.focusMedian=prefs.getFloat("fMed",0);s.baseline.focusLapseRate=prefs.getFloat("fLap",0);s.baseline.rhythmError=prefs.getFloat("rErr",0);
  // Legacy installs have no history version. Their aggregate data is left
  // untouched and the detail buffer intentionally starts empty.
  if(prefs.getUChar("histV",0)!=HISTORY_SCHEMA_VERSION){clearHistory();prefs.putUChar("histV",HISTORY_SCHEMA_VERSION);}else{historyCount=prefs.getUChar("histN",0);historyHead=prefs.getUChar("histH",0);nextSequence=prefs.getULong("histSeq",1);size_t expected=sizeof(history);if(historyCount>SESSION_HISTORY_CAPACITY||historyHead>=SESSION_HISTORY_CAPACITY||prefs.getBytesLength("history")!=expected){clearHistory();}else{prefs.getBytes("history",history,expected);if(!nextSequence)nextSequence=1;}}
  DEBUGF("Loaded baseline quick=%u %.1f; history=%u\n",s.baseline.quickSamples,s.baseline.quickMedian,historyCount);return true;}
void Storage::save(const Stats&s){prefs.putULong("sessions",s.sessions);prefs.putUShort("best",s.personalBest);prefs.putUChar("scoreN",s.scoreCount);prefs.putBytes("scores",s.scores,sizeof(s.scores));prefs.putBytes("last",&s.last,sizeof(s.last));prefs.putUChar("qN",s.baseline.quickSamples);prefs.putFloat("qMed",s.baseline.quickMedian);prefs.putFloat("qDev",s.baseline.quickSpread);prefs.putFloat("qLap",s.baseline.quickLapseRate);prefs.putFloat("fMed",s.baseline.focusMedian);prefs.putFloat("fLap",s.baseline.focusLapseRate);prefs.putFloat("rErr",s.baseline.rhythmError);}
void Storage::saveSettings(){prefs.putBool("sound",settings.sound);prefs.putBool("led",settings.led);prefs.putUChar("length",settings.length);prefs.putUChar("trials",settings.quickTrials);prefs.putUShort("lapse",settings.lapseMs);}
void Storage::saveHistory(){prefs.putUChar("histV",HISTORY_SCHEMA_VERSION);prefs.putUChar("histN",historyCount);prefs.putUChar("histH",historyHead);prefs.putULong("histSeq",nextSequence);prefs.putBytes("history",history,sizeof(history));}
void Storage::clearHistory(){historyCount=0;historyHead=0;nextSequence=1;memset(history,0,sizeof(history));saveHistory();}
void Storage::resetStats(Stats&s){s=Stats();save(s);clearHistory();}
void Storage::resetBaseline(Stats&s){s.baseline=Baseline();save(s);}
const char* Storage::testKindName(uint8_t kind){switch(static_cast<TestKind>(kind)){case TestKind::QUICK:return "quick";case TestKind::FOCUS:return "focus";case TestKind::CHOICE:return "choice";case TestKind::RHYTHM:return "rhythm";}return "unknown";}
void Storage::recordSession(TestKind kind,const SessionResult& result){SessionHistoryRecord& record=history[historyHead];record.sequence=nextSequence++;record.testKind=static_cast<uint8_t>(kind);record.score=result.score;record.median=result.median;record.spread=result.spread;record.lapses=result.lapses;record.falseStarts=result.falseStarts;record.attempts=result.attempts;record.correct=result.correct;record.bias=result.bias;historyHead=(historyHead+1)%SESSION_HISTORY_CAPACITY;if(historyCount<SESSION_HISTORY_CAPACITY)historyCount++;saveHistory();}
namespace {
void writeLine(Print& out, const char* fmt, ...) {
  char line[320];
  va_list args;
  va_start(args, fmt);
  vsnprintf(line, sizeof(line), fmt, args);
  va_end(args);
  out.print(line);
  out.print('\n');
}
}

void Storage::exportHistory() const{exportHistory(Serial);}
void Storage::exportHistory(Print& out) const{uint32_t start=0,end=0;if(historyCount){uint8_t first=(historyHead+SESSION_HISTORY_CAPACITY-historyCount)%SESSION_HISTORY_CAPACITY;start=history[first].sequence;end=history[(historyHead+SESSION_HISTORY_CAPACITY-1)%SESSION_HISTORY_CAPACITY].sequence;}uint64_t mac=ESP.getEfuseMac();char badgeId[17];snprintf(badgeId,sizeof(badgeId),"%04X%08X",(uint16_t)(mac>>32),(uint32_t)mac);writeLine(out,"REFLEX_EXPORT {\"type\":\"begin\",\"protocol\":1,\"firmware_version\":\"%s\",\"badge_id\":\"%s\",\"history_capacity\":%u,\"session_sequence_start\":%lu,\"session_sequence_end\":%lu,\"session_count\":%u}",FIRMWARE_VERSION,badgeId,SESSION_HISTORY_CAPACITY,(unsigned long)start,(unsigned long)end,historyCount);uint8_t first=(historyHead+SESSION_HISTORY_CAPACITY-historyCount)%SESSION_HISTORY_CAPACITY;for(uint8_t i=0;i<historyCount;i++){const SessionHistoryRecord& r=history[(first+i)%SESSION_HISTORY_CAPACITY];writeLine(out,"REFLEX_EXPORT {\"type\":\"session\",\"sequence\":%lu,\"test_type\":\"%s\",\"score\":%u,\"median\":%u,\"spread\":%.2f,\"lapses\":%u,\"false_starts\":%u,\"attempts\":%u,\"correct\":%u,\"rhythm_bias\":%d}",(unsigned long)r.sequence,testKindName(r.testKind),r.score,r.median,r.spread,r.lapses,r.falseStarts,r.attempts,r.correct,r.bias);}writeLine(out,"REFLEX_EXPORT {\"type\":\"end\",\"protocol\":1,\"session_count\":%u,\"session_sequence_start\":%lu,\"session_sequence_end\":%lu}",historyCount,(unsigned long)start,(unsigned long)end);}
