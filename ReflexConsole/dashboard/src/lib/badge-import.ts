import { exportFromFrames } from "@/lib/export";
import { ReflexExport } from "@/lib/types";

export const BLE_SERVICE_UUID = "8f4f0001-b0bc-4cf0-a4f2-49e0e6a8c101";
export const BLE_COMMAND_UUID = "8f4f0002-b0bc-4cf0-a4f2-49e0e6a8c101";
export const BLE_DATA_UUID = "8f4f0003-b0bc-4cf0-a4f2-49e0e6a8c101";

const BLE_PREFIX = "REFLEX_EXPORT ";

export type BadgeImportProgress = {
  step: number;
  message: string;
};

type WebBluetoothRequestDeviceOptions = {
  filters?: Array<{ services?: string[]; namePrefix?: string }>;
  optionalServices?: string[];
};

type WebBluetoothCharacteristic = {
  properties: { writeWithoutResponse?: boolean };
  startNotifications(): Promise<void>;
  stopNotifications(): Promise<void>;
  writeValue(value: Uint8Array): Promise<void>;
  writeValueWithoutResponse?(value: Uint8Array): Promise<void>;
  addEventListener(type: "characteristicvaluechanged", listener: EventListener): void;
  removeEventListener(type: "characteristicvaluechanged", listener: EventListener): void;
};

type WebBluetoothService = {
  getCharacteristic(uuid: string): Promise<WebBluetoothCharacteristic>;
};

type WebBluetoothServer = {
  getPrimaryService(uuid: string): Promise<WebBluetoothService>;
  addEventListener(type: "gattserverdisconnected", listener: EventListener): void;
  removeEventListener(type: "gattserverdisconnected", listener: EventListener): void;
};

type WebBluetoothDevice = {
  name?: string;
  gatt?: {
    connect(): Promise<WebBluetoothServer | null>;
  };
  addEventListener?: (type: "gattserverdisconnected", listener: EventListener) => void;
  removeEventListener?: (type: "gattserverdisconnected", listener: EventListener) => void;
};

type WebBluetoothApi = {
  requestDevice(options: WebBluetoothRequestDeviceOptions): Promise<WebBluetoothDevice>;
};

type WebBluetoothNavigator = Navigator & {
  bluetooth?: WebBluetoothApi;
};

type CharacteristicValueChangedEvent = Event & {
  target: {
    value: DataView | null;
  } | null;
  currentTarget?: {
    value?: DataView | null;
  } | null;
  srcElement?: {
    value?: DataView | null;
  } | null;
};

function getCharacteristicValue(event: CharacteristicValueChangedEvent): DataView | null {
  const target = event.target ?? event.currentTarget ?? event.srcElement;
  return target?.value ?? null;
}

function isBleSupported() {
  return typeof window !== "undefined" && "bluetooth" in navigator && window.isSecureContext;
}

function fail(message: string): never {
  throw new Error(message);
}

type BleEventTarget = {
  addEventListener?: (type: string, listener: EventListener) => void;
  removeEventListener?: (type: string, listener: EventListener) => void;
  [key: string]: unknown;
};

function addBluetoothListener(target: unknown, type: string, listener: EventListener) {
  if (typeof target !== "object" || target === null) return;
  const targetObj = target as BleEventTarget;
  if (typeof targetObj.addEventListener === "function") {
    targetObj.addEventListener(type, listener);
    return;
  }
  const onProp = `on${type}`;
  if (onProp in targetObj) {
    targetObj[onProp] = listener;
  }
}

function removeBluetoothListener(target: unknown, type: string, listener: EventListener) {
  if (typeof target !== "object" || target === null) return;
  const targetObj = target as BleEventTarget;
  if (typeof targetObj.removeEventListener === "function") {
    targetObj.removeEventListener(type, listener);
    return;
  }
  const onProp = `on${type}`;
  if (onProp in targetObj) {
    targetObj[onProp] = null;
  }
}

export async function readBadgeExport(onProgress?: (update: BadgeImportProgress) => void): Promise<ReflexExport> {
  if (!isBleSupported()) fail("Bluetooth import requires a secure browser with Web Bluetooth support.");
  const requestDevice = (navigator as WebBluetoothNavigator).bluetooth?.requestDevice;
  if (!requestDevice) fail("Bluetooth import is not available in this browser.");

  onProgress?.({ step: 0, message: "Requesting nearby badge..." });
  const device = await (navigator as WebBluetoothNavigator).bluetooth!.requestDevice({
    filters: [{ services: [BLE_SERVICE_UUID], namePrefix: "Reflex" }],
    optionalServices: [BLE_SERVICE_UUID],
  });

  onProgress?.({ step: 0, message: `Connecting to ${device.name ?? "badge"}...` });
  const server = await device.gatt?.connect();
  if (!server) fail("Badge disconnected before the GATT session opened.");

  const service = await server.getPrimaryService(BLE_SERVICE_UUID);
  const command = await service.getCharacteristic(BLE_COMMAND_UUID);
  const data = await service.getCharacteristic(BLE_DATA_UUID);

  const frames: unknown[] = [];
  const decoder = new TextDecoder();
  let buffer = "";
  let settled = false;
  let resolveExport: ((value: ReflexExport) => void) | null = null;
  let rejectExport: ((reason: Error) => void) | null = null;

  const exportPromise = new Promise<ReflexExport>((resolve, reject) => {
    resolveExport = resolve;
    rejectExport = reject;
  });

  let timeout: number | ReturnType<typeof setTimeout> | undefined;

  const resetExportTimeout = () => {
    if (timeout !== undefined) {
      clearTimeout(timeout as ReturnType<typeof setTimeout>);
    }
    timeout = window.setTimeout(() => abort("Timed out waiting for the badge export."), 60_000);
  };

  const cleanup = () => {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
    removeBluetoothListener(data, "characteristicvaluechanged", onValueChanged as EventListener);
    removeBluetoothListener(device, "gattserverdisconnected", onDisconnect);
    void data.stopNotifications().catch(() => {});
  };

  const abort = (message: string) => {
    if (settled) return;
    settled = true;
    cleanup();
    rejectExport?.(new Error(message));
  };

  const onDisconnect = () => abort("Badge disconnected during import.");

  function handleFrame(line: string) {
    if (!line.startsWith(BLE_PREFIX)) return;
    const payload = JSON.parse(line.slice(BLE_PREFIX.length)) as Record<string, unknown>;
    frames.push(payload);
    if (payload.type === "begin") {
      onProgress?.({ step: 1, message: `Badge ${String(payload.badge_id ?? "badge")} connected. Sending REFLEX_EXPORT_V1.` });
    } else if (payload.type === "session" && frames.length > 2) {
      onProgress?.({ step: 2, message: "Receiving structured history from badge..." });
    } else if (payload.type === "end") {
      const exportData = exportFromFrames(frames);
      settled = true;
      cleanup();
      resolveExport?.(exportData);
    }
  }

  function onValueChanged(event: CharacteristicValueChangedEvent) {
    const value = getCharacteristicValue(event);
    if (!value) return;
    buffer += decoder.decode(value, { stream: true });
    resetExportTimeout();
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) {
        try {
          handleFrame(line);
        } catch (error) {
          abort(error instanceof Error ? error.message : "Invalid export schema");
          return;
        }
        if (settled) return;
      }
      newlineIndex = buffer.indexOf("\n");
    }
  }

  addBluetoothListener(device, "gattserverdisconnected", onDisconnect);
  await data.startNotifications();
  addBluetoothListener(data, "characteristicvaluechanged", onValueChanged as EventListener);

  resetExportTimeout();
  onProgress?.({ step: 1, message: "Sending REFLEX_EXPORT_V1 to badge..." });
  const payload = new TextEncoder().encode("REFLEX_EXPORT_V1\n");
  try {
    if (command.properties.writeWithoutResponse) {
      await command.writeValueWithoutResponse!(payload);
    } else {
      await command.writeValue(payload);
    }
  } catch {
    abort("Export command failed.");
  }

  onProgress?.({ step: 2, message: "Waiting for structured history..." });
  return exportPromise;
}
