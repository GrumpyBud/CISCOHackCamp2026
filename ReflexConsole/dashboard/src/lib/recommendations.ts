import { average, baselineSessions, sessionsSince } from "@/lib/analytics";
import { DashboardSession, HealthLog, TestType } from "@/lib/types";

export type TrainingSuggestion = {
  signal: string;
  suggestedAction: string;
  testType: TestType | "context";
  evidence: string;
  goal: string;
  confidence: "Strong" | "Moderate" | "Limited";
};

export function buildTrainingSuggestions(sessions: DashboardSession[], healthLogs: HealthLog[]): TrainingSuggestion[] {
  if (!sessions.length) return [];
  const recent = sessionsSince(sessions, 7);
  const baseline = baselineSessions(sessions);
  const recentLapses = average(recent.map((session) => session.lapses));
  const baselineLapses = average(baseline.map((session) => session.lapses));
  const recentFalseStarts = average(recent.map((session) => session.false_starts));
  const baselineFalseStarts = average(baseline.map((session) => session.false_starts));
  const recentChoice = recent.filter((session) => session.test_type === "choice");
  const baselineChoice = baseline.filter((session) => session.test_type === "choice");
  const recentChoiceAccuracy = average(recentChoice.map((session) => session.correct / Math.max(1, session.attempts) * 100));
  const baselineChoiceAccuracy = average(baselineChoice.map((session) => session.correct / Math.max(1, session.attempts) * 100));
  const recentRhythm = recent.filter((session) => session.test_type === "rhythm");
  const recentMemory = recent.filter((session) => session.test_type === "memory");
  const healthDays = new Set(healthLogs.slice(0, 10).map((log) => log.log_date)).size;
  const suggestions: TrainingSuggestion[] = [];

  if (healthDays < 5) {
    suggestions.push({
      signal: "Missing health context",
      suggestedAction: "Log context before interpreting readiness",
      testType: "context",
      evidence: `${healthDays} of the last 10 days include context logs.`,
      goal: "Improve data confidence for baseline comparisons.",
      confidence: "Limited",
    });
  }

  if (recent.length < 8) {
    suggestions.push({
      signal: "Low recent sample size",
      suggestedAction: "Collect another short badge session",
      testType: "quick",
      evidence: `${recent.length} sessions are available in the last 7 days.`,
      goal: "Increase confidence before drawing stronger conclusions.",
      confidence: "Limited",
    });
  }

  if (recentLapses > baselineLapses + 0.45) {
    suggestions.push({
      signal: "Lapses above baseline",
      suggestedAction: "Run a Focus Test",
      testType: "focus",
      evidence: `Recent lapses average ${recentLapses.toFixed(1)} vs baseline ${baselineLapses.toFixed(1)}.`,
      goal: "Reduce missed responses while keeping pace steady.",
      confidence: recent.length >= 12 ? "Moderate" : "Limited",
    });
  }

  if (recentFalseStarts > baselineFalseStarts + 0.25) {
    suggestions.push({
      signal: "False starts rising",
      suggestedAction: "Run a Quick Test with slower start discipline",
      testType: "quick",
      evidence: `False starts average ${recentFalseStarts.toFixed(1)} vs baseline ${baselineFalseStarts.toFixed(1)}.`,
      goal: "Trade a little speed for cleaner starts.",
      confidence: "Moderate",
    });
  }

  if (recentChoice.length >= 2 && recentChoiceAccuracy < baselineChoiceAccuracy - 3) {
    suggestions.push({
      signal: "Choice accuracy dip",
      suggestedAction: "Run a Choice Test emphasizing accuracy before speed",
      testType: "choice",
      evidence: `Recent accuracy is ${recentChoiceAccuracy.toFixed(1)}% vs baseline ${baselineChoiceAccuracy.toFixed(1)}%.`,
      goal: "Recover button-mapping accuracy before pushing response time.",
      confidence: "Moderate",
    });
  }

  const rhythmBias = average(recentRhythm.map((session) => Math.abs(session.rhythm_bias)));
  if (recentRhythm.length >= 2 && rhythmBias > 18) {
    suggestions.push({
      signal: "Rhythm bias elevated",
      suggestedAction: "Retest with Rhythm Test",
      testType: "rhythm",
      evidence: `Recent rhythm bias averages ${Math.round(rhythmBias)} ms.`,
      goal: "Check whether timing bias persists across another session.",
      confidence: "Moderate",
    });
  }

  const spans = recentMemory.map((session) => session.rhythm_bias);
  if (spans.length >= 2 && Math.max(...spans) - Math.min(...spans) >= 3) {
    suggestions.push({
      signal: "Memory span unstable",
      suggestedAction: "Run a Memory Test",
      testType: "memory",
      evidence: `Recent best spans range from ${Math.min(...spans)} to ${Math.max(...spans)}.`,
      goal: "Collect a cleaner span estimate.",
      confidence: "Moderate",
    });
  }

  if (!suggestions.some((suggestion) => suggestion.testType !== "context")) {
    suggestions.push({
      signal: "Balanced recent signals",
      suggestedAction: "Run a Quick Test",
      testType: "quick",
      evidence: "Recent score, lapse, and accuracy signals are close to baseline.",
      goal: "Maintain a lightweight trend checkpoint.",
      confidence: recent.length >= 12 ? "Strong" : "Moderate",
    });
  }

  return suggestions.slice(0, 5);
}
