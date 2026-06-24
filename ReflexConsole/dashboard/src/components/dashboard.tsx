"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { exportFromFrames } from "@/lib/export";
import { DashboardSession, ReflexExport, TEST_TYPES, TestType } from "@/lib/types";

type SortKey = keyof Pick<DashboardSession, "sequence" | "test_type" | "score" | "median" | "spread" | "lapses" | "false_starts" | "attempts" | "correct" | "rhythm_bias">;
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
const labels: Record<TestType, string> = { quick: "Quick", focus: "Focus", choice: "Choice", rhythm: "Rhythm" };

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

export function Dashboard() {
  const [sessions, setSessions] = useState<DashboardSession[]>([]);
  const [testType, setTestType] = useState<"all" | TestType>("all");
  const [sort, setSort] = useState<{ key: SortKey; ascending: boolean }>({ key: "sequence", ascending: false });
  const [message, setMessage] = useState("Loading sessions…");
  const [importing, setImporting] = useState(false);

  const load = async (filter = testType) => {
    const response = await fetch(`/api/sessions${filter === "all" ? "" : `?testType=${filter}`}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not load sessions");
    setSessions(body.sessions);
    setMessage(body.sessions.length ? "" : "No cloud sessions yet. Import your badge history to begin.");
  };
  useEffect(() => { load().catch((error: Error) => setMessage(error.message)); }, [testType]);

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

  return <div className="dashboard">
    <section className="import-panel"><div><h2>Import from badge</h2><p>Desktop Chrome/Edge can import over Bluetooth LE or over USB. If transport fails, use the export file upload path.</p></div><div className="import-actions"><button onClick={importBluetooth} disabled={importing}>Bluetooth import</button><button className="secondary" onClick={importSerial} disabled={importing}>USB import</button><label className="secondary">Upload export<input type="file" accept="application/json,.json" onChange={uploadFile} disabled={importing} /></label></div></section>
    {message && <p className="notice" role="status">{message}</p>}
    <nav className="filters" aria-label="Test type filter"><button className={testType === "all" ? "active" : ""} onClick={() => setTestType("all")}>All tests</button>{TEST_TYPES.map((type) => <button key={type} className={testType === type ? "active" : ""} onClick={() => setTestType(type)}>{labels[type]}</button>)}</nav>
    <section className="metrics"><MetricCard label="Completed sessions" value={String(sessions.length)} detail={testType === "all" ? "Across all imported badges" : `${labels[testType]} only`} /><MetricCard label="Quick best" value={Number.isFinite(stats.quickBest) ? nice(stats.quickBest, " ms") : "—"} detail="Fastest non-zero Quick median" /><MetricCard label="Recent score" value={nice(stats.latest?.score)} detail={stats.latest ? `Session #${stats.latest.sequence}` : "No completed session"} /><MetricCard label="Test aggregate" value={nice(average(sessions.map((item) => item.score)))} detail="Average score in current filter" /></section>
    <p className="sequence-note">Charts are ordered by persistent session number, not real clock time.</p>
    <section className="charts"><LineChart title="Score" values={points.map((item) => ({ sequence: item.sequence, value: item.score }))} color="#70f0c0" /><LineChart title="Reaction / timing error" values={points.map((item) => ({ sequence: item.sequence, value: item.median }))} color="#82aaff" suffix=" ms" /><LineChart title="Consistency / spread" values={points.map((item) => ({ sequence: item.sequence, value: item.spread }))} color="#c79cff" suffix=" ms" /><LineChart title="Lapses and false starts" values={points.map((item) => ({ sequence: item.sequence, value: item.lapses + item.false_starts }))} color="#ff9f7a" /></section>
    <section className="aggregate"><h2>Test-specific aggregates</h2><div>{stats.byType.map(({ type, sessions: items }) => <article key={type}><strong>{labels[type]}</strong><span>{items.length} sessions</span><span>avg score {nice(average(items.map((item) => item.score)))}</span><span>avg median {nice(average(items.map((item) => item.median)), " ms")}</span></article>)}</div></section>
    <section className="table-section"><div className="table-heading"><div><h2>Session detail</h2><p>Latest 100 retained per badge; imports remain idempotent.</p></div><div><a className="secondary" href="/api/sessions/csv">Download CSV</a><button className="danger" onClick={removeHistory}>Delete cloud history</button></div></div><div className="table-wrap"><table><thead><tr>{(["sequence", "test_type", "score", "median", "spread", "lapses", "false_starts", "attempts", "correct", "rhythm_bias"] as SortKey[]).map((key) => <th key={key}><button onClick={() => toggleSort(key)}>{key.replaceAll("_", " ")}{sort.key === key ? (sort.ascending ? " ↑" : " ↓") : ""}</button></th>)}</tr></thead><tbody>{sorted.map((item) => <tr key={`${item.badge_id}-${item.sequence}`}><td>#{item.sequence}</td><td>{labels[item.test_type]}</td><td>{item.score}</td><td>{item.median} ms</td><td>{Math.round(item.spread)} ms</td><td>{item.lapses}</td><td>{item.false_starts}</td><td>{item.attempts}</td><td>{item.correct}</td><td>{item.rhythm_bias} ms</td></tr>)}{!sorted.length && <tr><td colSpan={10}>No matching sessions.</td></tr>}</tbody></table></div></section>
  </div>;
}
