// Device (board) fleet management: health reports and remote actions.

export type KioskState = 'on' | 'off' | 'unknown';

/** What a board reports about itself every few minutes (POST /v1/devices/me/health). */
export interface DeviceHealth {
  os: string;
  osVersion?: string;
  appVersion?: string;
  kiosk: KioskState;
  storageFreeMb?: number;
  storageTotalMb?: number;
  /** Absent on panels without a battery. */
  battery?: { percent: number; charging: boolean };
  /** For example "Class 9A · Physics"; absent when no class is open. */
  currentClass?: string;
  locked?: boolean;
  /** What reports: a classroom board or IFP, or an edge compute box serving AI to boards. */
  deviceKind?: 'board' | 'ifp' | 'edge';
  /** Compute load now, in percent; absent when the device cannot measure it. */
  cpuPct?: number;
  gpuPct?: number;
  npuPct?: number;
  ramPct?: number;
  ramTotalMb?: number;
  diskPct?: number;
  cpuTempC?: number;
  gpuTempC?: number;
  /** On-device AI since the previous report: inferences run and their total time. */
  aiInferences?: number;
  aiInferenceMs?: number;
  uptimeS?: number;
}

export type DeviceActionType = 'lock' | 'unlock' | 'restart_app' | 'clear_pin_profiles' | 'message' | 'kiosk_policy' | 'rename_move' | 'unpair';
export type DeviceActionStatus = 'queued' | 'sent' | 'done' | 'failed';

export interface DeviceActionEvent {
  id: string;
  type: DeviceActionType;
  params: Record<string, unknown>;
}

export interface DeviceActionAck {
  id: string;
  ok: boolean;
  error?: string;
}
