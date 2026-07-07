import { BadgeDevice, DashboardSession, DemoData, HealthLog, ImportBatch, ResearchPreviewRow, TEST_TYPES, TestType } from "@/lib/types";

function isoDay(daysAgo: number, hour = 16, minute = 12) {
  const date = new Date(Date.UTC(2026, 6, 7, hour, minute));
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString();
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function wave(index: number, scale: number) {
  return Math.sin(index * 0.72) * scale + Math.cos(index * 0.31) * scale * 0.55;
}

function makeSession(sequence: number, daysAgo: number, test_type: TestType, badge_id: string, firmware_version: string): DashboardSession {
  const improvement = (34 - daysAgo) * 1.4;
  const noisy = wave(sequence, 12) + (sequence % 11 === 0 ? 36 : 0);
  const accuracyBase = test_type === "choice" ? 78 + improvement * 0.16 + wave(sequence, 4) : 0;
  const memorySpan = test_type === "memory" ? clamp(Math.round(4 + improvement / 18 + wave(sequence, 0.8)), 3, 9) : 0;
  const rhythmError = test_type === "rhythm" ? clamp(44 - improvement * 0.42 + Math.abs(wave(sequence, 7)), 8, 72) : 0;
  const median =
    test_type === "memory" ? clamp(760 - improvement * 2 + noisy * 5, 420, 1100)
    : test_type === "rhythm" ? rhythmError
    : clamp(305 - improvement + noisy, 185, 410);
  const spread = clamp(54 - improvement * 0.35 + Math.abs(wave(sequence, 8)), 18, 95);
  const lapses = clamp(Math.round((daysAgo > 22 ? 2 : 1) + (sequence % 9 === 0 ? 2 : 0) + Math.max(0, wave(sequence, 0.7))), 0, 6);
  const false_starts = clamp(Math.round((sequence % 13 === 0 ? 2 : 0) + Math.max(0, wave(sequence, 0.35))), 0, 4);
  const attempts = test_type === "memory" ? 8 : test_type === "rhythm" ? 24 : test_type === "choice" ? 30 : 20;
  const correct = test_type === "choice" ? Math.round(attempts * clamp(accuracyBase, 65, 98) / 100)
    : test_type === "memory" ? clamp(memorySpan + 2, 3, attempts)
    : attempts - false_starts;
  const score =
    test_type === "choice" ? clamp(Math.round(accuracyBase - lapses * 3 - false_starts * 2), 45, 99)
    : test_type === "rhythm" ? clamp(Math.round(96 - rhythmError * 0.8 - Math.abs(wave(sequence, 3))), 42, 98)
    : test_type === "memory" ? clamp(Math.round(54 + memorySpan * 6 - false_starts * 2 + wave(sequence, 3)), 45, 99)
    : clamp(Math.round(92 - (median - 190) * 0.14 - spread * 0.18 - lapses * 4 - false_starts * 2), 38, 99);

  return {
    type: "session",
    sequence,
    test_type,
    score,
    median: Math.round(median),
    spread: Math.round(spread),
    lapses,
    false_starts,
    attempts,
    correct,
    rhythm_bias: test_type === "rhythm" ? Math.round(wave(sequence, 16)) : test_type === "memory" ? memorySpan : 0,
    badge_id,
    firmware_version,
    timestamp: isoDay(daysAgo, 8 + (sequence % 10), (sequence * 7) % 60),
    imported_at: isoDay(Math.min(daysAgo, 1), 16, 12),
  };
}

function buildSessions() {
  const sessions: DashboardSession[] = [];
  let sequence = 128;
  for (let daysAgo = 34; daysAgo >= 0; daysAgo--) {
    const count = daysAgo % 6 === 0 ? 5 : daysAgo % 4 === 0 ? 2 : 3;
    for (let slot = 0; slot < count; slot++) {
      const type = TEST_TYPES[(daysAgo + slot) % TEST_TYPES.length];
      const badge = daysAgo > 19 && slot % 3 === 0 ? "RC-31B8" : "RC-7F3A";
      const firmware = daysAgo > 23 ? "v0.4.0" : daysAgo > 10 ? "v0.4.1" : "v0.4.2";
      sessions.push(makeSession(sequence++, daysAgo, type, badge, firmware));
    }
  }
  return sessions.sort((a, b) => new Date(b.timestamp ?? b.imported_at).getTime() - new Date(a.timestamp ?? a.imported_at).getTime());
}

function buildHealthLogs(): HealthLog[] {
  const logs: HealthLog[] = [];
  for (let daysAgo = 34; daysAgo >= 0; daysAgo--) {
    if ([3, 8, 14, 21, 29].includes(daysAgo)) continue;
    const date = isoDay(daysAgo).slice(0, 10);
    const sleep = clamp(7.2 + wave(daysAgo, 0.9) - (daysAgo % 12 === 0 ? 1.4 : 0), 4.8, 9.2);
    const recentCaffeine = daysAgo % 5 === 0 ? 180 : daysAgo % 3 === 0 ? 80 : 0;
    logs.push({
      id: 500 + daysAgo,
      log_date: date,
      log_time: "08:10",
      context: "morning",
      wake_time: daysAgo % 9 === 0 ? "06:20" : "07:05",
      sleep_hours: Math.round(sleep * 10) / 10,
      sleep_quality: clamp(Math.round(sleep + wave(daysAgo, 1.2)), 3, 10),
      stress: clamp(Math.round(5 + wave(daysAgo, 1.7)), 1, 10),
      mood: clamp(Math.round(7 + wave(daysAgo, 1.2)), 2, 10),
      exercise_minutes: daysAgo % 4 === 0 ? 45 : daysAgo % 7 === 0 ? 0 : 20,
      caffeine_mg: Math.max(120, recentCaffeine),
      caffeine_recent_mg: recentCaffeine,
      hydration: clamp(Math.round(7 + wave(daysAgo, 1.1)), 3, 10),
      notes: daysAgo % 10 === 0 ? "Late night before check-in; interpret performance gently." : "",
      created_at: isoDay(daysAgo, 8, 12),
      updated_at: isoDay(daysAgo, 8, 12),
    });
    if (daysAgo % 6 === 0) {
      logs.push({
        id: 800 + daysAgo,
        log_date: date,
        log_time: "14:30",
        context: "afternoon",
        wake_time: "07:05",
        sleep_hours: Math.round(sleep * 10) / 10,
        sleep_quality: clamp(Math.round(sleep + wave(daysAgo, 1.2)), 3, 10),
        stress: clamp(Math.round(6 + wave(daysAgo + 2, 1.5)), 1, 10),
        mood: clamp(Math.round(6 + wave(daysAgo, 1.1)), 2, 10),
        exercise_minutes: daysAgo % 4 === 0 ? 45 : 20,
        caffeine_mg: Math.max(220, recentCaffeine + 80),
        caffeine_recent_mg: 80,
        hydration: clamp(Math.round(6 + wave(daysAgo, 1.4)), 3, 10),
        notes: "",
        created_at: isoDay(daysAgo, 14, 30),
        updated_at: isoDay(daysAgo, 14, 30),
      });
    }
  }
  return logs.sort((a, b) => `${b.log_date}T${b.log_time}`.localeCompare(`${a.log_date}T${a.log_time}`));
}

function buildDevices(sessions: DashboardSession[]): BadgeDevice[] {
  return ["RC-7F3A", "RC-31B8"].map((badge_id) => {
    const badgeSessions = sessions.filter((session) => session.badge_id === badge_id);
    const latest = badgeSessions[0];
    return {
      badge_id,
      firmware_version: latest?.firmware_version ?? "v0.4.2",
      last_import_at: latest?.imported_at ?? isoDay(1),
      history_capacity: 100,
      retained_sessions: Math.min(100, badgeSessions.length),
      export_schema: "REFLEX_EXPORT_V1",
      import_status: badge_id === "RC-7F3A" ? "Healthy" : "Old import",
      data_completeness: badge_id === "RC-7F3A" ? 94 : 77,
    };
  });
}

function buildImportBatches(): ImportBatch[] {
  return [
    { id: "imp-1042", badge_id: "RC-7F3A", firmware_version: "v0.4.2", imported_at: isoDay(0, 16, 12), new_sessions: 24, duplicate_sessions: 6, retained_sessions: 100, history_capacity: 100, status: "Complete" },
    { id: "imp-1031", badge_id: "RC-7F3A", firmware_version: "v0.4.1", imported_at: isoDay(8, 18, 2), new_sessions: 31, duplicate_sessions: 2, retained_sessions: 93, history_capacity: 100, status: "Complete" },
    { id: "imp-1019", badge_id: "RC-31B8", firmware_version: "v0.4.0", imported_at: isoDay(19, 11, 24), new_sessions: 18, duplicate_sessions: 0, retained_sessions: 54, history_capacity: 100, status: "Complete" },
  ];
}

function buildResearchRows(sessions: DashboardSession[]): ResearchPreviewRow[] {
  return sessions.slice(0, 6).map((session) => ({
    user_hash: "sha256:user:91fd...c2a9",
    badge_hash: session.badge_id === "RC-7F3A" ? "sha256:badge:7f3a...84bc" : "sha256:badge:31b8...d091",
    test_type: session.test_type,
    timestamp_bucket: (session.timestamp ?? session.imported_at).slice(0, 10),
    score: session.score,
    median_reaction_ms: ["quick", "focus", "choice"].includes(session.test_type) ? session.median : null,
    spread_ms: ["quick", "focus"].includes(session.test_type) ? session.spread : null,
    lapses: session.lapses,
    accuracy: session.test_type === "choice" ? Math.round((session.correct / Math.max(1, session.attempts)) * 100) : null,
    rhythm_timing_error_ms: session.test_type === "rhythm" ? session.median : null,
    memory_best_span: session.test_type === "memory" ? session.rhythm_bias : null,
    firmware_version: session.firmware_version ?? "v0.4.2",
    export_schema: "REFLEX_EXPORT_V1" as const,
  }));
}

export function createDemoData(): DemoData {
  const sessions = buildSessions();
  return {
    sessions,
    healthLogs: buildHealthLogs(),
    devices: buildDevices(sessions),
    importBatches: buildImportBatches(),
    researchRows: buildResearchRows(sessions),
  };
}

export const demoData = createDemoData();
