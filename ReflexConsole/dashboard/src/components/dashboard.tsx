"use client";

import { useUser } from "@clerk/nextjs";
import { ChangeEvent, CSSProperties, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { exportFromFrames } from "@/lib/export";
import { DashboardSession, HealthLog, ReflexExport, TEST_TYPES, TestType } from "@/lib/types";

type SortKey = keyof Pick<DashboardSession, "sequence" | "test_type" | "score" | "median" | "spread" | "lapses" | "false_starts" | "attempts" | "correct" | "rhythm_bias">;
type ResearchConsent = { enabled: boolean; updated_at: string };
type ResearchProfile = { age_years: string; account_age_days: string; gender: string; handedness: string; notes: string };
type ResearchDataRow = { sequence: number; test_type: string; score: number; median_ms: number; spread_ms: number; lapses: number; false_starts: number; attempts: number; correct: number; rhythm_bias_ms: number; imported_at: string };
type SerialReader = ReadableStreamDefaultReader<Uint8Array>;
type BrowserSerialPort = { open(options: { baudRate: number }): Promise<void>; close(): Promise<void>; readable: ReadableStream<Uint8Array> | null; writable: WritableStream<Uint8Array> | null };
type BrowserSerial = { requestPort(): Promise<BrowserSerialPort> };
type BrowserBluetoothCharacteristic = {
  startNotifications(): Promise<void>;
  stopNotifications(): Promise<void>;
  writeValue(value: BufferSource): Promise<void>;
  addEventListener(type: "characteristicvaluechanged", listener: (event: Event) => void): void;
  removeEventListener(type: "characteristicvaluechanged", listener: (event: Event) => void): void;
};
type BrowserBluetoothService = { getCharacteristic(uuid: string): Promise<BrowserBluetoothCharacteristic> };
type BrowserBluetoothServer = { connected: boolean; connect(): Promise<BrowserBluetoothServer>; getPrimaryService(uuid: string): Promise<BrowserBluetoothService>; disconnect(): void };
type BrowserBluetoothDevice = { gatt?: BrowserBluetoothServer | null; addEventListener(type: "gattserverdisconnected", listener: (event: Event) => void): void; removeEventListener(type: "gattserverdisconnected", listener: (event: Event) => void): void };
type BrowserBluetoothRequestOptions = { filters: Array<{ services?: string[]; namePrefix?: string }>; optionalServices?: string[] };
type BrowserBluetooth = { requestDevice(options: BrowserBluetoothRequestOptions): Promise<BrowserBluetoothDevice> };

const EXPORT_PREFIX = "REFLEX_EXPORT ";
const EXPORT_COMMAND = "REFLEX_EXPORT_V1";
const BLE_SERVICE_UUID = "8f4f0001-b0bc-4cf0-a4f2-49e0e6a8c101";
const BLE_COMMAND_UUID = "8f4f0002-b0bc-4cf0-a4f2-49e0e6a8c101";
const BLE_DATA_UUID = "8f4f0003-b0bc-4cf0-a4f2-49e0e6a8c101";

const nice = (value: number | undefined, suffix = "") => value === undefined ? "—" : `${Math.round(value)}${suffix}`;
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;
const standardDeviation = (values: number[]) => {
  const mean = average(values);
  return mean === undefined || values.length < 2 ? undefined : Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
};
const weightedAverage = (items: { value: number | undefined; weight: number }[]) => {
  const valid = items.filter((item): item is { value: number; weight: number } => item.value !== undefined);
  const totalWeight = valid.reduce((sum, item) => sum + item.weight, 0);
  return totalWeight ? valid.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight : undefined;
};
const labels: Record<TestType, string> = { quick: "Quick", focus: "Focus", choice: "Choice", rhythm: "Rhythm", memory: "Memory" };
const tableLabels: Record<SortKey, string> = { sequence: "sequence", test_type: "test", score: "score", median: "median", spread: "spread", lapses: "lapses", false_starts: "false starts", attempts: "attempts", correct: "correct", rhythm_bias: "bias/span" };
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const pad = (value: number) => String(value).padStart(2, "0");
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};
const currentTime = () => {
  const now = new Date();
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
};
const automaticContext = () => {
  const hour = new Date().getHours();
  if (hour < 5 || hour >= 21) return "bedtime";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
};
const dateKey = (value: string) => value.slice(0, 10);
const blankHealthLog = (): HealthLog => ({
  log_date: today(),
  log_time: currentTime(),
  context: automaticContext(),
  wake_time: "07:00",
  sleep_hours: 7.5,
  sleep_quality: 7,
  stress: 4,
  mood: 7,
  exercise_minutes: 20,
  caffeine_mg: 120,
  caffeine_recent_mg: 0,
  hydration: 7,
  notes: "",
});
const blankResearchProfile = (): ResearchProfile => ({ age_years: "", account_age_days: "", gender: "", handedness: "", notes: "" });
const normalizeResearchProfile = (profile: Partial<ResearchProfile> | null | undefined): ResearchProfile => ({
  age_years: profile?.age_years ?? "",
  account_age_days: profile?.account_age_days ?? "",
  gender: profile?.gender ?? "",
  handedness: profile?.handedness ?? "",
  notes: profile?.notes ?? "",
});
const memoryTiles = [
  { id: 0, label: "A", name: "amber" },
  { id: 1, label: "B", name: "blue" },
  { id: 2, label: "C", name: "green" },
  { id: 3, label: "D", name: "rose" },
] as const;

function createExportAccumulator() {
  const decoder = new TextDecoder();
  let buffer = "";
  const frames: unknown[] = [];
  return {
    push(chunk: Uint8Array) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith(EXPORT_PREFIX)) continue;
        const frame = JSON.parse(line.slice(EXPORT_PREFIX.length));
        frames.push(frame);
        if ((frame as { type?: string }).type === "end") return exportFromFrames(frames);
      }
      return null;
    },
    flush() {
      if (!buffer) return null;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith(EXPORT_PREFIX)) continue;
        const frame = JSON.parse(line.slice(EXPORT_PREFIX.length));
        frames.push(frame);
        if ((frame as { type?: string }).type === "end") return exportFromFrames(frames);
      }
      return null;
    },
  };
}

function transportErrorMessage(kind: "bluetooth" | "serial", error: unknown) {
  const fallback = kind === "bluetooth" ? "Bluetooth import failed. Use the export file upload instead." : "Serial import failed. Use the export file upload instead.";
  if (!(error instanceof Error)) return fallback;
  const message = error.message.toLowerCase();
  if (error.name === "AbortError") return kind === "bluetooth" ? "No Bluetooth device was selected." : "No serial port was selected.";
  if (error.name === "NotFoundError") return kind === "bluetooth" ? "No matching Bluetooth badge was found. Make sure the badge is powered on and nearby." : "No matching serial port was found. Plug in the badge and try again.";
  if (error.name === "NotAllowedError") return kind === "bluetooth" ? "Chrome blocked Bluetooth access. Reopen the browser prompt and allow the badge." : "Chrome blocked serial access. Reopen the browser prompt and allow the badge.";
  if (message.includes("failed to open serial port") || message.includes("networkerror") || message.includes("invalidstateerror")) {
    return kind === "bluetooth"
      ? "Could not connect to the badge over Bluetooth. Keep the badge nearby, turn Bluetooth on, and retry. You can always use export file upload instead."
      : "Could not open the badge serial port. Make sure the badge is connected, close any serial monitor using the port, and retry. You can always use export file upload instead.";
  }
  return `${kind === "bluetooth" ? "Bluetooth" : "Serial"} import failed: ${error.message}. Use the export file upload instead.`;
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <section className="metric-card"><p>{label}</p><strong>{value}</strong><span>{detail}</span></section>;
}

function LineChart({ title, values, color, suffix = "" }: { title: string; values: { sequence: number; value: number }[]; color: string; suffix?: string }) {
  const width = 600, height = 180, pad = 18;
  const valid = values.filter((point) => Number.isFinite(point.value));
  const min = Math.min(...valid.map((point) => point.value), 0);
  const max = Math.max(...valid.map((point) => point.value), 1);
  const range = max - min || 1;
  const points = valid.map((point, index) => {
    const x = pad + (valid.length < 2 ? (width - pad * 2) / 2 : index * (width - pad * 2) / (valid.length - 1));
    const y = height - pad - ((point.value - min) / range) * (height - pad * 2);
    return `${x},${y}`;
  }).join(" ");
  return <section className="chart"><div className="chart-heading"><h2>{title}</h2><span>{valid.length ? `${nice(min, suffix)}–${nice(max, suffix)}` : "No data"}</span></div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title} ordered by session number`}>
      <line x1={pad} x2={width - pad} y1={height - pad} y2={height - pad} className="axis" />
      {points && <polyline points={points} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />}
    </svg>
  </section>;
}

function pearson(pairs: { x: number; y: number }[]) {
  if (pairs.length < 4) return undefined;
  const xMean = average(pairs.map((point) => point.x)) ?? 0;
  const yMean = average(pairs.map((point) => point.y)) ?? 0;
  const numerator = pairs.reduce((sum, point) => sum + (point.x - xMean) * (point.y - yMean), 0);
  const xVariance = pairs.reduce((sum, point) => sum + (point.x - xMean) ** 2, 0);
  const yVariance = pairs.reduce((sum, point) => sum + (point.y - yMean) ** 2, 0);
  const denominator = Math.sqrt(xVariance * yVariance);
  return denominator ? numerator / denominator : undefined;
}

function CorrelationRow({ label, value, detail }: { label: string; value: number | undefined; detail: string }) {
  const strength = value === undefined ? "Not enough overlap" : Math.abs(value) >= .45 ? "Strong signal" : Math.abs(value) >= .25 ? "Possible signal" : "Weak signal";
  return <article><strong>{label}</strong><span>{value === undefined ? "—" : value.toFixed(2)}</span><p>{strength}. {detail}</p></article>;
}

function ModelFactor({ label, value, detail }: { label: string; value: number | undefined; detail: string }) {
  return <article><div><strong>{label}</strong><span>{nice(value)}</span></div><meter min="0" max="100" value={value ?? 0} /><p>{detail}</p></article>;
}

export function Dashboard() {
  const [sessions, setSessions] = useState<DashboardSession[]>([]);
  const [healthLogs, setHealthLogs] = useState<HealthLog[]>([]);
  const [healthForm, setHealthForm] = useState<HealthLog>(() => blankHealthLog());
  const [researchConsent, setResearchConsent] = useState<ResearchConsent>({ enabled: true, updated_at: "" });
  const [researchProfile, setResearchProfile] = useState<ResearchProfile>(() => blankResearchProfile());
  const [researchDataRows, setResearchDataRows] = useState<ResearchDataRow[]>([]);
  const [researchDataMessage, setResearchDataMessage] = useState("");
  const [testType, setTestType] = useState<"all" | TestType>("all");
  const [sort, setSort] = useState<{ key: SortKey; ascending: boolean }>({ key: "sequence", ascending: false });
  const [message, setMessage] = useState("Loading sessions…");
  const [healthMessage, setHealthMessage] = useState("");
  const [researchMessage, setResearchMessage] = useState("");
  const [importing, setImporting] = useState(false);
  const [memoryLevel, setMemoryLevel] = useState(3);
  const [memorySequence, setMemorySequence] = useState<number[]>([]);
  const [memoryInput, setMemoryInput] = useState<number[]>([]);
  const [playIndex, setPlayIndex] = useState(-1);
  const [isShowingSequence, setIsShowingSequence] = useState(false);
  const [memoryStatus, setMemoryStatus] = useState("Start with a short visual sequence, then repeat it from memory.");
  const [memoryStats, setMemoryStats] = useState({ attempts: 0, streak: 0, best: 0 });
  const { user, isLoaded } = useUser();

  const accountAgeDays = useMemo(() => {
    if (!user?.createdAt) return null;
    const createdAt = new Date(user.createdAt);
    if (Number.isNaN(createdAt.getTime())) return null;
    return Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / 86_400_000));
  }, [user?.createdAt]);

  const load = useCallback(async (filter = testType) => {
    const response = await fetch(`/api/sessions${filter === "all" ? "" : `?testType=${filter}`}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not load sessions");
    setSessions(body.sessions);
    setMessage(body.sessions.length ? "" : "No cloud sessions yet. Import your badge history to begin.");
  }, [testType]);
  useEffect(() => { load().catch((error: Error) => setMessage(error.message)); }, [load]);

  const loadHealth = useCallback(async () => {
    const response = await fetch("/api/health", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not load health logs");
    setHealthLogs(body.logs);
  }, []);
  useEffect(() => { loadHealth().catch((error: Error) => setHealthMessage(error.message)); }, [loadHealth]);

  const loadResearchConsent = useCallback(async () => {
    const response = await fetch("/api/research-consent", { cache: "no-store" });
    const text = await response.text();
    let body: { error?: string; consent?: ResearchConsent; profile?: Partial<ResearchProfile> } | null = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { error: text || "Could not load research contribution setting" }; }
    if (!response.ok) throw new Error(body?.error || "Could not load research contribution setting");
    const resolvedProfile = normalizeResearchProfile({
      ...body?.profile,
      account_age_days: body?.profile?.account_age_days ?? (accountAgeDays?.toString() ?? ""),
    });
    setResearchConsent(body?.consent ?? { enabled: true, updated_at: "" });
    setResearchProfile(resolvedProfile);
  }, [accountAgeDays]);
  useEffect(() => { loadResearchConsent().catch((error: Error) => setResearchMessage(error.message)); }, [loadResearchConsent]);

  const loadResearchData = useCallback(async () => {
    const response = await fetch("/api/research-data", { cache: "no-store" });
    const text = await response.text();
    let body: { error?: string; sessions?: ResearchDataRow[] } | null = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { error: text || "Could not load research data" }; }
    if (!response.ok) throw new Error(body?.error || "Could not load research data");
    setResearchDataRows(body?.sessions ?? []);
  }, []);
  useEffect(() => { loadResearchData().catch((error: Error) => setResearchDataMessage(error.message)); }, [loadResearchData]);

  useEffect(() => {
    if (!isLoaded || !accountAgeDays || researchProfile.account_age_days) return;
    setResearchProfile((current) => ({ ...current, account_age_days: String(accountAgeDays) }));
  }, [accountAgeDays, isLoaded, researchProfile.account_age_days]);

  useEffect(() => {
    if (!isShowingSequence || !memorySequence.length) return undefined;
    setPlayIndex(0);
    let finishTimer: number | undefined;
    const interval = window.setInterval(() => {
      setPlayIndex((current) => {
        if (current >= memorySequence.length - 1) {
          window.clearInterval(interval);
          finishTimer = window.setTimeout(() => {
            setPlayIndex(-1);
            setIsShowingSequence(false);
            setMemoryStatus("Repeat the sequence.");
          }, 360);
          return current;
        }
        return current + 1;
      });
    }, 650);
    return () => {
      window.clearInterval(interval);
      if (finishTimer !== undefined) window.clearTimeout(finishTimer);
    };
  }, [isShowingSequence, memorySequence]);

  const importExport = async (payload: ReflexExport) => {
    setImporting(true); setMessage("Importing…");
    try {
      const response = await fetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Import failed");
      await load();
      setMessage(`Imported ${body.imported} sessions from ${body.badgeId}. Re-imports are safe.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Import failed"); }
    finally { setImporting(false); }
  };

  const uploadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try { await importExport(JSON.parse(await file.text()) as ReflexExport); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not read export file"); }
  };

  const importSerial = async () => {
    if (!window.isSecureContext) { setMessage("Web Serial requires HTTPS. Use the export file upload instead."); return; }
    const serial = (navigator as Navigator & { serial?: BrowserSerial }).serial;
    if (!serial) { setMessage("Web Serial requires desktop Chrome or Edge. Use the export file upload instead."); return; }
    setImporting(true); setMessage("Waiting for badge export…");
    let port: BrowserSerialPort | undefined;
    let reader: SerialReader | undefined;
    try {
      port = await serial.requestPort();
      await port.open({ baudRate: 115200 });
      const writer = port.writable?.getWriter();
      if (!writer) throw new Error("Badge serial output is unavailable");
      await writer.write(new TextEncoder().encode(`${EXPORT_COMMAND}\n`));
      writer.releaseLock();
      reader = port.readable?.getReader();
      if (!reader) throw new Error("Badge serial input is unavailable");
      const parser = createExportAccumulator();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const payload = parser.push(value);
        if (payload) { await importExport(payload); return; }
      }
      const payload = parser.flush();
      if (payload) { await importExport(payload); return; }
      throw new Error("Badge disconnected before completing its export");
    } catch (error) { setMessage(transportErrorMessage("serial", error)); }
    finally { if (reader) reader.releaseLock(); if (port) await port.close().catch(() => undefined); setImporting(false); }
  };

  const importBluetooth = async () => {
    if (!window.isSecureContext) { setMessage("Web Bluetooth requires HTTPS. Use the export file upload instead."); return; }
    const bluetooth = (navigator as Navigator & { bluetooth?: BrowserBluetooth }).bluetooth;
    if (!bluetooth) { setMessage("Web Bluetooth requires desktop Chrome or Edge. Use the export file upload instead."); return; }
    setImporting(true); setMessage("Waiting for badge export…");
    let device: BrowserBluetoothDevice | undefined;
    let server: BrowserBluetoothServer | undefined;
    let data: BrowserBluetoothCharacteristic | undefined;
    let listener: ((event: Event) => void) | undefined;
    let disconnectListener: ((event: Event) => void) | undefined;
    try {
      device = await bluetooth.requestDevice({ filters: [{ services: [BLE_SERVICE_UUID], namePrefix: "Reflex" }], optionalServices: [BLE_SERVICE_UUID] });
      server = await device.gatt?.connect();
      if (!server) throw new Error("Could not connect to the badge over Bluetooth");
      const service = await server.getPrimaryService(BLE_SERVICE_UUID);
      const command = await service.getCharacteristic(BLE_COMMAND_UUID);
      data = await service.getCharacteristic(BLE_DATA_UUID);
      const parser = createExportAccumulator();
      const ready = new Promise<ReflexExport>((resolve, reject) => {
        disconnectListener = () => reject(new Error("Badge disconnected before completing its export"));
        listener = (event: Event) => {
          try {
            const target = event.target as { value?: DataView } | null;
            if (!target?.value) return;
            const chunk = new Uint8Array(target.value.buffer, target.value.byteOffset, target.value.byteLength);
            const payload = parser.push(chunk) ?? parser.flush();
            if (payload) resolve(payload);
          } catch (error) {
            reject(error instanceof Error ? error : new Error("Bluetooth import failed"));
          }
        };
        device?.addEventListener("gattserverdisconnected", disconnectListener);
        data?.addEventListener("characteristicvaluechanged", listener);
      });
      await data.startNotifications();
      await command.writeValue(new TextEncoder().encode(`${EXPORT_COMMAND}\n`));
      const payload = await ready;
      await importExport(payload);
    } catch (error) { setMessage(transportErrorMessage("bluetooth", error)); }
    finally {
      if (device && disconnectListener) device.removeEventListener("gattserverdisconnected", disconnectListener);
      if (data && listener) data.removeEventListener("characteristicvaluechanged", listener);
      if (data) await data.stopNotifications().catch(() => undefined);
      server?.disconnect();
      setImporting(false);
    }
  };

  const removeHistory = async () => {
    if (!window.confirm("Delete all cloud history for this account? This cannot be undone and does not affect your badge.")) return;
    const response = await fetch("/api/history", { method: "DELETE" });
    if (!response.ok) { setMessage("Could not delete cloud history"); return; }
    setSessions([]); setMessage("Cloud history deleted. Badge history is unchanged.");
  };

  const updateHealthField = (field: keyof HealthLog, value: string) => {
    setHealthForm((current) => ({
      ...current,
      [field]: field === "notes" || field === "log_date" || field === "log_time" || field === "context" || field === "wake_time" ? value : Number(value),
    }));
  };

  const saveHealthLog = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setHealthMessage("Saving health context…");
    try {
      const payload = { ...healthForm, log_date: today(), log_time: currentTime(), context: automaticContext(), caffeine_mg: caffeineTotal };
      const response = await fetch("/api/health", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not save health log");
      await loadHealth();
      setHealthForm((current) => ({ ...current, log_date: today(), log_time: currentTime(), context: automaticContext(), notes: "" }));
      setHealthMessage(`Added ${body.log.context} context for ${body.log.log_date} at ${body.log.log_time}.`);
    } catch (error) {
      setHealthMessage(error instanceof Error ? error.message : "Could not save health log");
    }
  };

  const saveResearchSettings = async (enabled: boolean, profile: ResearchProfile = researchProfile) => {
    setResearchMessage("Saving research settings…");
    try {
      const nextProfile = {
        ...profile,
        account_age_days: profile.account_age_days || (accountAgeDays?.toString() ?? ""),
      };
      const response = await fetch("/api/research-consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, profile: nextProfile }),
      });
      const text = await response.text();
      let body: { error?: string; consent?: ResearchConsent; profile?: Partial<ResearchProfile> } | null = null;
      try { body = text ? JSON.parse(text) : null; } catch { body = { error: text || "Could not save research settings" }; }
      if (!response.ok) throw new Error(body?.error || "Could not save research settings");
      setResearchConsent(body?.consent ?? { enabled, updated_at: "" });
      setResearchProfile(normalizeResearchProfile({ ...body?.profile, account_age_days: body?.profile?.account_age_days ?? nextProfile.account_age_days }));
      setResearchMessage(enabled ? "Research contribution enabled for future imports." : "Research contribution disabled.");
    } catch (error) {
      setResearchMessage(error instanceof Error ? error.message : "Could not save research settings");
    }
  };

  const toggleResearchConsent = async (enabled: boolean) => {
    await saveResearchSettings(enabled, researchProfile);
  };

  const updateResearchProfileField = (field: keyof ResearchProfile, value: string) => {
    setResearchProfile((current) => ({ ...current, [field]: value }));
  };

  const saveResearchProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await saveResearchSettings(researchConsent.enabled, researchProfile);
  };

  const skipResearchProfile = async () => {
    const skippedProfile = blankResearchProfile();
    setResearchProfile(skippedProfile);
    await saveResearchSettings(researchConsent.enabled, skippedProfile);
  };

  const startMemoryRound = () => {
    const sequence = Array.from({ length: memoryLevel }, () => Math.floor(Math.random() * memoryTiles.length));
    setMemorySequence(sequence);
    setMemoryInput([]);
    setIsShowingSequence(true);
    setMemoryStatus(`Watch ${memoryLevel} steps.`);
  };

  const chooseMemoryTile = (tile: number) => {
    if (isShowingSequence || !memorySequence.length) return;
    const next = [...memoryInput, tile];
    setMemoryInput(next);
    const expected = memorySequence[next.length - 1];
    if (tile !== expected) {
      setMemoryStats((current) => ({ attempts: current.attempts + 1, streak: 0, best: Math.max(current.best, current.streak) }));
      setMemoryLevel((current) => Math.max(3, current - 1));
      setMemoryStatus(`Sequence missed at step ${next.length}. Slow down, breathe, and try again.`);
      setMemorySequence([]);
      setMemoryInput([]);
      return;
    }
    if (next.length === memorySequence.length) {
      setMemoryStats((current) => ({ attempts: current.attempts + 1, streak: current.streak + 1, best: Math.max(current.best, current.streak + 1) }));
      setMemoryLevel((current) => Math.min(9, current + 1));
      setMemoryStatus("Clean recall. Next round adapts up by one step.");
      setMemorySequence([]);
      setMemoryInput([]);
    }
  };

  const stats = useMemo(() => ({
    latest: sessions.slice().sort((a, b) => b.sequence - a.sequence)[0],
    quickBest: Math.min(...sessions.filter((item) => item.test_type === "quick" && item.median > 0).map((item) => item.median)),
    byType: TEST_TYPES.map((type) => ({ type, sessions: sessions.filter((item) => item.test_type === type) })),
  }), [sessions]);
  const sorted = useMemo(() => sessions.slice().sort((left, right) => {
    const a = left[sort.key], b = right[sort.key]; const direction = sort.ascending ? 1 : -1;
    return (typeof a === "string" ? a.localeCompare(String(b)) : Number(a) - Number(b)) * direction;
  }), [sessions, sort]);
  const points = sessions.slice().sort((a, b) => a.sequence - b.sequence);
  const toggleSort = (key: SortKey) => setSort((current) => ({ key, ascending: current.key === key ? !current.ascending : true }));
  const caffeineLoggedToday = useMemo(() => healthLogs
    .filter((log) => log.log_date === today())
    .reduce((sum, log) => sum + log.caffeine_recent_mg, 0), [healthLogs]);
  const caffeineMinimum = clamp(caffeineLoggedToday + healthForm.caffeine_recent_mg, 0, 1200);
  const caffeineTotal = Math.max(healthForm.caffeine_mg, caffeineMinimum);

  const brainHealth = useMemo(() => {
    const ordered = sessions.slice().sort((a, b) => a.sequence - b.sequence);
    const recent = ordered.slice(-6);
    const previous = ordered.slice(-18, -6);
    const reference = ordered.slice(0, Math.max(0, ordered.length - recent.length)).slice(-20);
    const latestHealth = healthLogs.slice().sort((a, b) => `${b.log_date} ${b.log_time}`.localeCompare(`${a.log_date} ${a.log_time}`))[0];
    const recentScore = average(recent.map((item) => item.score));
    const previousScore = average(previous.map((item) => item.score));
    const accuracy = average(recent.filter((item) => item.attempts > 0).map((item) => item.correct / item.attempts * 100));
    const lapsePressure = average(recent.map((item) => item.lapses + item.false_starts)) ?? 0;
    const consistency = average(recent.map((item) => item.spread));
    const recentMedian = average(recent.filter((item) => item.median > 0).map((item) => item.median));
    const referenceMedian = average((reference.length ? reference : ordered).filter((item) => item.median > 0).map((item) => item.median));
    const referenceSpread = average((reference.length ? reference : ordered).map((item) => item.spread));
    const recentCv = recentMedian ? (consistency ?? 0) / recentMedian : undefined;
    const responseSpeed = recentMedian ? 1000 / recentMedian : undefined;
    const sleepAdjustment = latestHealth ? clamp((latestHealth.sleep_hours - 7) * 3 + (latestHealth.sleep_quality - 6) * 1.5, -12, 10) : 0;
    const stressAdjustment = latestHealth ? clamp((5 - latestHealth.stress) * 2, -12, 8) : 0;
    const movementAdjustment = latestHealth ? clamp(latestHealth.exercise_minutes / 15, 0, 6) : 0;
    const recentCaffeinePenalty = latestHealth ? clamp(latestHealth.caffeine_recent_mg / 75, 0, 8) : 0;
    const speedComponent = recentMedian && referenceMedian ? clamp(82 + ((referenceMedian - recentMedian) / referenceMedian) * 120, 0, 100) : recentScore;
    const consistencyComponent = consistency !== undefined && referenceSpread !== undefined ? clamp(82 + ((referenceSpread - consistency) / Math.max(referenceSpread, 1)) * 80, 0, 100) : undefined;
    const lapseComponent = clamp(100 - lapsePressure * 18, 0, 100);
    const accuracyComponent = accuracy;
    const memoryItems = recent.filter((item) => item.test_type === "memory");
    const memoryComponent = memoryItems.length ? average(memoryItems.map((item) => item.score)) : undefined;
    const contextComponent = latestHealth ? clamp(72 + sleepAdjustment + stressAdjustment + movementAdjustment - recentCaffeinePenalty + (latestHealth.hydration - 6) * 1.5, 0, 100) : undefined;
    const readiness = clamp(weightedAverage([
      { value: speedComponent, weight: .24 },
      { value: consistencyComponent, weight: .18 },
      { value: lapseComponent, weight: .17 },
      { value: accuracyComponent, weight: .16 },
      { value: memoryComponent, weight: .1 },
      { value: contextComponent, weight: .15 },
    ]) ?? 0, 0, 100);
    const strain = clamp(100 - readiness + lapsePressure * 4 + (latestHealth?.stress ?? 5) * 2, 0, 100);
    const trend = previousScore === undefined || recentScore === undefined ? undefined : recentScore - previousScore;
    const expectedScore = previousScore ?? average(reference.map((item) => item.score)) ?? recentScore;
    const observedMinusExpected = recentScore !== undefined && expectedScore !== undefined ? recentScore - expectedScore : undefined;
    const scoreSpread = standardDeviation(recent.map((item) => item.score)) ?? 14;
    const uncertainty = clamp(18 - Math.sqrt(ordered.length) * 1.4 + scoreSpread / 4 + (latestHealth ? 0 : 4), 6, 24);
    const readinessRange = { low: clamp(readiness - uncertainty, 0, 100), high: clamp(readiness + uncertainty, 0, 100) };
    const confidence = ordered.length >= 20 && latestHealth ? "Higher" : ordered.length >= 8 ? "Moderate" : "Low";
    const dailyHealth = new Map<string, HealthLog[]>();
    for (const log of healthLogs) dailyHealth.set(log.log_date, [...(dailyHealth.get(log.log_date) ?? []), log]);
    const healthByDate = new Map([...dailyHealth.entries()].map(([day, logs]) => [day, {
      ...logs[0],
      sleep_hours: average(logs.map((log) => log.sleep_hours)) ?? logs[0].sleep_hours,
      sleep_quality: average(logs.map((log) => log.sleep_quality)) ?? logs[0].sleep_quality,
      stress: average(logs.map((log) => log.stress)) ?? logs[0].stress,
      mood: average(logs.map((log) => log.mood)) ?? logs[0].mood,
      exercise_minutes: average(logs.map((log) => log.exercise_minutes)) ?? logs[0].exercise_minutes,
      caffeine_mg: Math.max(...logs.map((log) => log.caffeine_mg), logs.reduce((sum, log) => sum + log.caffeine_recent_mg, 0)),
      caffeine_recent_mg: average(logs.map((log) => log.caffeine_recent_mg)) ?? logs[0].caffeine_recent_mg,
      hydration: average(logs.map((log) => log.hydration)) ?? logs[0].hydration,
    }]));
    const paired = ordered.map((session) => ({ session, health: healthByDate.get(dateKey(session.imported_at)) })).filter((item): item is { session: DashboardSession; health: HealthLog } => Boolean(item.health));
    const correlations = {
      sleep: pearson(paired.map((item) => ({ x: item.health.sleep_hours, y: item.session.score }))),
      stress: pearson(paired.map((item) => ({ x: item.health.stress, y: item.session.score }))),
      exercise: pearson(paired.map((item) => ({ x: item.health.exercise_minutes, y: item.session.score }))),
      caffeine: pearson(paired.map((item) => ({ x: item.health.caffeine_recent_mg || item.health.caffeine_mg, y: item.session.score }))),
    };
    const weakestType = TEST_TYPES.map((type) => {
      const items = ordered.filter((item) => item.test_type === type);
      return { type, score: average(items.slice(-5).map((item) => item.score)) ?? 101 };
    }).sort((a, b) => a.score - b.score)[0];
    const insights = [];
    if (!ordered.length) insights.push("Import badge sessions to unlock personalized trend analysis.");
    if (ordered.length > 0 && ordered.length < 8) insights.push("Collect at least 8 mixed sessions before trusting trend direction.");
    if (trend !== undefined && trend <= -6) insights.push(`Recent score is down ${Math.abs(Math.round(trend))} points versus the prior window. Favor recovery, sleep, and lower-pressure practice today.`);
    if (trend !== undefined && trend >= 6) insights.push(`Recent score is up ${Math.round(trend)} points versus the prior window. Keep the same training load for one more cycle before increasing difficulty.`);
    if (lapsePressure >= 2) insights.push("Lapses and false starts are elevated. Use shorter blocks and add a 60-second reset between tests.");
    if ((consistency ?? 0) > 180) insights.push("Timing spread is high, which usually points to consistency rather than raw speed. Rhythm and focus drills should be prioritized.");
    if (latestHealth && latestHealth.sleep_hours < 6.5) insights.push("Sleep logged below 6.5 hours. Treat today's cognitive scores as recovery-sensitive.");
    if (latestHealth && latestHealth.caffeine_recent_mg > 250) insights.push("Recent caffeine is high. Compare today against similar caffeine timing before treating a score change as readiness.");
    if (!latestHealth) insights.push("Add today's sleep, stress, movement, caffeine, and hydration to make readiness more useful.");
    if (weakestType && weakestType.score < 75) insights.push(`${labels[weakestType.type]} is the current lowest-scoring mode. The training plan should start there.`);
    const dataQualityFlags = [];
    if (ordered.length < 8) dataQualityFlags.push("Low session count");
    if (!reference.length) dataQualityFlags.push("No prior baseline window");
    if (!latestHealth) dataQualityFlags.push("No recent health check-in");
    if (!memoryItems.length) dataQualityFlags.push("No recent memory session");
    if ((recentCv ?? 0) > .6) dataQualityFlags.push("High timing variability");
    return {
      recentScore, previousScore, accuracy, consistency, readiness, strain, trend, latestHealth, pairedCount: paired.length, correlations, weakestType, insights: insights.slice(0, 5),
      expectedScore, observedMinusExpected, readinessRange, confidence, responseSpeed, recentCv, dataQualityFlags,
      components: [
        { label: "Speed", value: speedComponent, detail: recentMedian ? `${Math.round(recentMedian)} ms recent median` : "Needs valid reaction sessions" },
        { label: "Consistency", value: consistencyComponent, detail: recentCv !== undefined ? `RT CV ${recentCv.toFixed(2)}` : "Needs timing spread" },
        { label: "Lapse control", value: lapseComponent, detail: `${lapsePressure.toFixed(1)} lapses/false starts per recent session` },
        { label: "Accuracy", value: accuracyComponent, detail: "Correct responses on valid attempts" },
        { label: "Memory", value: memoryComponent, detail: memoryItems.length ? "Recent memory session scores" : "Run Memory Test to include this factor" },
        { label: "Context", value: contextComponent, detail: latestHealth ? `${latestHealth.context} check-in, recent caffeine ${latestHealth.caffeine_recent_mg} mg` : "Add a health check-in" },
      ],
    };
  }, [healthLogs, sessions]);

  return <div className="dashboard">
    <section className="import-panel"><div><h2>Import from badge</h2><p>Desktop Chrome/Edge can import over Bluetooth LE or over USB. If transport fails, use the export file upload path.</p></div><div className="import-actions"><button onClick={importBluetooth} disabled={importing}>Bluetooth import</button><button className="secondary" onClick={importSerial} disabled={importing}>USB import</button><label className="secondary">Upload export<input type="file" accept="application/json,.json" onChange={uploadFile} disabled={importing} /></label></div></section>
    {message && <p className="notice" role="status">{message}</p>}

    <section className="brain-command">
      <div className="command-copy">
        <p className="eyebrow">BRAIN HEALTH COMMAND CENTER</p>
        <h2>Readiness, training, and health context in one place</h2>
        <p>Reflex Console combines badge timing data with self-reported sleep, stress, movement, caffeine, and hydration. It is a personal wellness and training tool, not a medical diagnosis.</p>
      </div>
      <div className="readiness-ring" aria-label={`Readiness score ${Math.round(brainHealth.readiness)} out of 100`} style={{ "--ready": `${brainHealth.readiness}%` } as CSSProperties}>
        <strong>{Math.round(brainHealth.readiness)}</strong>
        <span>readiness</span>
      </div>
    </section>

    <section className="metrics brain-metrics">
      <MetricCard label="Brain readiness" value={nice(brainHealth.readiness)} detail="Score, consistency, lapses, and latest health context" />
      <MetricCard label="Expected delta" value={brainHealth.observedMinusExpected === undefined ? "—" : `${brainHealth.observedMinusExpected > 0 ? "+" : ""}${Math.round(brainHealth.observedMinusExpected)}`} detail={`Expected recent score ${nice(brainHealth.expectedScore)}`} />
      <MetricCard label="Recent accuracy" value={nice(brainHealth.accuracy, "%")} detail="Correct responses across recent valid attempts" />
      <MetricCard label="Confidence" value={brainHealth.confidence} detail={`Readiness range ${nice(brainHealth.readinessRange.low)}-${nice(brainHealth.readinessRange.high)}`} />
    </section>

    <section className="model-panel">
      <div className="section-heading"><div><h2>Readiness model</h2><p>Transparent within-person baseline, inspired by PVT-style speed, variability, lapse, and context features.</p></div><span>{brainHealth.dataQualityFlags.length ? brainHealth.dataQualityFlags.join(" / ") : "No quality flags"}</span></div>
      <div className="model-grid">{brainHealth.components.map((component) => <ModelFactor key={component.label} {...component} />)}</div>
      <div className="model-footnotes"><span>Response speed {brainHealth.responseSpeed === undefined ? "—" : `${brainHealth.responseSpeed.toFixed(2)}/s`}</span><span>Health overlap {brainHealth.pairedCount}</span><span>Cognitive strain {nice(brainHealth.strain)}</span></div>
    </section>

    <section className="workspace-grid">
      <section className="memory-trainer">
        <div className="section-heading"><div><h2>Adaptive memory trainer</h2><p>Visual sequence recall adjusts after each round.</p></div><button onClick={startMemoryRound} disabled={isShowingSequence}>{memorySequence.length ? "Replay round" : "New round"}</button></div>
        <div className="memory-board" aria-label="Memory sequence buttons">{memoryTiles.map((tile) => <button key={tile.id} type="button" className={`memory-tile ${tile.name} ${playIndex >= 0 && memorySequence[playIndex] === tile.id ? "lit" : ""}`} onClick={() => chooseMemoryTile(tile.id)} disabled={isShowingSequence}>{tile.label}</button>)}</div>
        <p className="memory-status">{memoryStatus}</p>
        <div className="training-stats"><span>Level {memoryLevel}</span><span>Attempts {memoryStats.attempts}</span><span>Streak {memoryStats.streak}</span><span>Best {memoryStats.best}</span></div>
      </section>

      <section className="training-plan">
        <div className="section-heading"><div><h2>Today's training plan</h2><p>Generated from your recent weakest signal.</p></div><span>{brainHealth.latestHealth ? brainHealth.latestHealth.log_date : "No log today"}</span></div>
        <ol>
          <li><strong>Prime:</strong> 2 minutes of easy rhythm tapping to settle timing variability.</li>
          <li><strong>Train:</strong> 4 rounds of {brainHealth.weakestType ? labels[brainHealth.weakestType.type] : "Focus"} work, stopping if lapses climb.</li>
          <li><strong>Recall:</strong> 3 memory-trainer rounds at level {memoryLevel}, then stop before fatigue.</li>
          <li><strong>Review:</strong> Log sleep, stress, movement, caffeine, and hydration before comparing scores.</li>
        </ol>
      </section>
    </section>

    <section className="health-grid">
      <form className="health-form" onSubmit={saveHealthLog}>
        <div className="section-heading"><div><h2>Daily health context</h2><p>Check-ins use your system date and time; context is labeled automatically.</p></div><button type="submit">Add context</button></div>
        <div className="auto-context"><span>{today()}</span><span>{currentTime()}</span><span>{automaticContext()}</span></div>
        <div className="form-grid">
          <label>Wake time<input type="time" value={healthForm.wake_time} onChange={(event) => updateHealthField("wake_time", event.target.value)} /></label>
          <label>Sleep hours<input type="number" min="0" max="16" step=".1" value={healthForm.sleep_hours} onChange={(event) => updateHealthField("sleep_hours", event.target.value)} /></label>
          <label>Sleep quality<input type="range" min="1" max="10" value={healthForm.sleep_quality} onChange={(event) => updateHealthField("sleep_quality", event.target.value)} /><span>{healthForm.sleep_quality}/10</span></label>
          <label>Stress<input type="range" min="1" max="10" value={healthForm.stress} onChange={(event) => updateHealthField("stress", event.target.value)} /><span>{healthForm.stress}/10</span></label>
          <label>Mood<input type="range" min="1" max="10" value={healthForm.mood} onChange={(event) => updateHealthField("mood", event.target.value)} /><span>{healthForm.mood}/10</span></label>
          <label>Exercise minutes<input type="number" min="0" max="600" value={healthForm.exercise_minutes} onChange={(event) => updateHealthField("exercise_minutes", event.target.value)} /></label>
          <label>Total caffeine mg<input type="number" min={caffeineMinimum} max="1200" value={caffeineTotal} onChange={(event) => updateHealthField("caffeine_mg", event.target.value)} /><span>Minimum from today's logs: {caffeineMinimum} mg</span></label>
          <label>Recent caffeine mg<input type="number" min="0" max="1200" value={healthForm.caffeine_recent_mg} onChange={(event) => updateHealthField("caffeine_recent_mg", event.target.value)} /></label>
          <label>Hydration<input type="range" min="1" max="10" value={healthForm.hydration} onChange={(event) => updateHealthField("hydration", event.target.value)} /><span>{healthForm.hydration}/10</span></label>
        </div>
        <label className="notes-field">Notes<textarea value={healthForm.notes} onChange={(event) => updateHealthField("notes", event.target.value)} placeholder="Medication changes, illness, travel, unusual fatigue, training notes" /></label>
        {healthMessage && <p className="notice compact" role="status">{healthMessage}</p>}
      </form>

      <section className="insights-panel">
        <div className="section-heading"><div><h2>Personal insights</h2><p>Rules-based signals from recent sessions and logs.</p></div><a className="secondary" href="/api/sessions/csv">Download CSV</a></div>
        <ul>{brainHealth.insights.map((insight) => <li key={insight}>{insight}</li>)}</ul>
        <div className="correlations">
          <CorrelationRow label="Sleep x score" value={brainHealth.correlations.sleep} detail="Positive values mean higher sleep aligned with higher score." />
          <CorrelationRow label="Stress x score" value={brainHealth.correlations.stress} detail="Negative values can suggest stress-sensitive performance." />
          <CorrelationRow label="Exercise x score" value={brainHealth.correlations.exercise} detail="Looks for import-day movement association." />
          <CorrelationRow label="Caffeine x score" value={brainHealth.correlations.caffeine} detail="Useful for spotting overuse or timing effects." />
        </div>
      </section>
    </section>

    <details className="settings-panel">
      <summary>Data & privacy settings</summary>
      <section className="research-panel">
        <section className="settings-stack">
          <div className="section-heading"><div><h2>User setup</h2><p>Optional, non-invasive profile details that help research analysis. Leave any field blank if you prefer not to share it.</p></div></div>
          <form className="health-form settings-form" onSubmit={saveResearchProfile}>
            <div className="form-grid">
              <label>Age<input type="number" min="1" max="120" value={researchProfile.age_years} onChange={(event) => updateResearchProfileField("age_years", event.target.value)} placeholder="Optional" /></label>
              <label>Gender<select value={researchProfile.gender} onChange={(event) => updateResearchProfileField("gender", event.target.value)}>
                <option value="">Prefer not to say</option>
                <option value="woman">Woman</option>
                <option value="man">Man</option>
                <option value="non-binary">Non-binary</option>
                <option value="another">Another identity</option>
              </select></label>
              <label>Dominant hand<select value={researchProfile.handedness} onChange={(event) => updateResearchProfileField("handedness", event.target.value)}>
                <option value="">Prefer not to say</option>
                <option value="right">Right</option>
                <option value="left">Left</option>
                <option value="ambidextrous">Ambidextrous</option>
              </select></label>
              <div className="read-only-field"><span>Account age</span><strong>{isLoaded && accountAgeDays !== null ? `${accountAgeDays} days` : researchProfile.account_age_days ? `${researchProfile.account_age_days} days` : "Not available yet"}</strong></div>
            </div>
            <label className="notes-field">Extra context<textarea value={researchProfile.notes} onChange={(event) => updateResearchProfileField("notes", event.target.value)} placeholder="Optional: beginner, recent injury, ADHD, migraines, etc." /></label>
            <div className="settings-actions">
              <div className="settings-actions-group">
                <button type="submit">Save profile</button>
                <button type="button" className="secondary" onClick={skipResearchProfile}>Skip for now</button>
              </div>
              <p className="settings-help">These details stay optional and are only used for aggregate research summaries.</p>
            </div>
          </form>
        </section>
        <section className="settings-stack">
          <div>
            <h2>Research contribution</h2>
            <p>Optional and enabled by default. When enabled, future imports copy badge session metrics into a shared research table using salted SHA-256 pseudonymous user and badge hashes. Health check-ins, notes, email, name, and Clerk account IDs are not copied.</p>
          </div>
          <label className="consent-toggle"><input type="checkbox" checked={researchConsent.enabled} onChange={(event) => toggleResearchConsent(event.target.checked)} /> Contribute pseudonymous session metrics from future imports</label>
          {researchMessage && <p className="notice compact" role="status">{researchMessage}</p>}
        </section>
        <section className="settings-stack">
          <div className="section-heading"><div><h2>Research data viewer</h2><p>Recent pseudonymous session rows stored for your account.</p></div></div>
          {researchDataMessage && <p className="notice compact" role="status">{researchDataMessage}</p>}
          {researchDataRows.length ? <div className="table-wrap"><table><thead><tr><th>Test</th><th>Score</th><th>Median</th><th>Spread</th><th>Imported</th></tr></thead><tbody>{researchDataRows.map((row) => <tr key={`${row.sequence}-${row.imported_at}`}><td>{row.test_type}</td><td>{row.score}</td><td>{row.median_ms} ms</td><td>{row.spread_ms} ms</td><td>{new Date(row.imported_at).toLocaleString()}</td></tr>)}</tbody></table></div> : <p>No research rows yet. Import a badge session with research contribution enabled to populate this view.</p>}
        </section>
      </section>
    </details>

    <nav className="filters" aria-label="Test type filter"><button className={testType === "all" ? "active" : ""} onClick={() => setTestType("all")}>All tests</button>{TEST_TYPES.map((type) => <button key={type} className={testType === type ? "active" : ""} onClick={() => setTestType(type)}>{labels[type]}</button>)}</nav>
    <section className="metrics"><MetricCard label="Completed sessions" value={String(sessions.length)} detail={testType === "all" ? "Across all imported badges" : `${labels[testType]} only`} /><MetricCard label="Quick best" value={Number.isFinite(stats.quickBest) ? nice(stats.quickBest, " ms") : "—"} detail="Fastest non-zero Quick median" /><MetricCard label="Recent score" value={nice(stats.latest?.score)} detail={stats.latest ? `Session #${stats.latest.sequence}` : "No completed session"} /><MetricCard label="Test aggregate" value={nice(average(sessions.map((item) => item.score)))} detail="Average score in current filter" /></section>
    <p className="sequence-note">Charts are ordered by persistent session number, not real clock time.</p>
    <section className="charts"><LineChart title="Score" values={points.map((item) => ({ sequence: item.sequence, value: item.score }))} color="#70f0c0" /><LineChart title="Reaction / timing error" values={points.map((item) => ({ sequence: item.sequence, value: item.median }))} color="#82aaff" suffix=" ms" /><LineChart title="Consistency / spread" values={points.map((item) => ({ sequence: item.sequence, value: item.spread }))} color="#c79cff" suffix=" ms" /><LineChart title="Lapses and false starts" values={points.map((item) => ({ sequence: item.sequence, value: item.lapses + item.false_starts }))} color="#ff9f7a" /></section>
    <section className="aggregate"><h2>Test-specific aggregates</h2><div>{stats.byType.map(({ type, sessions: items }) => <article key={type}><strong>{labels[type]}</strong><span>{items.length} sessions</span><span>avg score {nice(average(items.map((item) => item.score)))}</span><span>avg median {nice(average(items.map((item) => item.median)), " ms")}</span></article>)}</div></section>
    <section className="table-section"><div className="table-heading"><div><h2>Session detail</h2><p>Latest 100 retained per badge; imports remain idempotent.</p></div><div><a className="secondary" href="/api/sessions/csv">Download CSV</a><button className="danger" onClick={removeHistory}>Delete cloud history</button></div></div><div className="table-wrap"><table><thead><tr>{(["sequence", "test_type", "score", "median", "spread", "lapses", "false_starts", "attempts", "correct", "rhythm_bias"] as SortKey[]).map((key) => <th key={key}><button onClick={() => toggleSort(key)}>{tableLabels[key]}{sort.key === key ? (sort.ascending ? " ↑" : " ↓") : ""}</button></th>)}</tr></thead><tbody>{sorted.map((item) => <tr key={`${item.badge_id}-${item.sequence}`}><td>#{item.sequence}</td><td>{labels[item.test_type]}</td><td>{item.score}</td><td>{item.median} ms</td><td>{Math.round(item.spread)} ms</td><td>{item.lapses}</td><td>{item.false_starts}</td><td>{item.attempts}</td><td>{item.correct}</td><td>{item.test_type === "memory" ? item.rhythm_bias : `${item.rhythm_bias} ms`}</td></tr>)}{!sorted.length && <tr><td colSpan={10}>No matching sessions.</td></tr>}</tbody></table></div></section>
  </div>;
}
