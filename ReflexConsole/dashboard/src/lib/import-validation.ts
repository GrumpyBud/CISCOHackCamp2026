import { parseBadgeExportStream, validateExport } from "@/lib/export";
import { DashboardSession, ReflexExport } from "@/lib/types";

export type ImportPreview = {
  ok: boolean;
  error?: string;
  exportData?: ReflexExport;
  badgeId?: string;
  firmwareVersion?: string;
  sessionCount?: number;
  duplicateCount?: number;
  newCount?: number;
};

export function previewImportPayload(value: unknown, existingSessions: DashboardSession[]): ImportPreview {
  try {
    const exportData = typeof value === "string" ? parseBadgeExportStream(value) : validateExport(value);
    const existingKeys = new Set(existingSessions.map((session) => `${session.badge_id}:${session.sequence}`));
    const duplicateCount = exportData.sessions.filter((session) => existingKeys.has(`${exportData.begin.badge_id}:${session.sequence}`)).length;
    return {
      ok: true,
      exportData,
      badgeId: exportData.begin.badge_id,
      firmwareVersion: exportData.begin.firmware_version,
      sessionCount: exportData.sessions.length,
      duplicateCount,
      newCount: exportData.sessions.length - duplicateCount,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid export schema" };
  }
}
