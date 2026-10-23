// Zynetix panel platform (docs/zynetix/BOARD_PLAN.md, W4): board app updates and the panel home.

export const RELEASE_PLATFORMS = ['android', 'windows', 'macos', 'linux'] as const;
export type ReleasePlatform = (typeof RELEASE_PLATFORMS)[number];
export const RELEASE_CHANNELS = ['stable', 'beta'] as const;
export type ReleaseChannel = (typeof RELEASE_CHANNELS)[number];
export type UpdateState = 'pending' | 'offered' | 'downloading' | 'downloaded' | 'installing' | 'installed' | 'failed' | 'declined';
export const UPDATE_STATES: UpdateState[] = ['installed', 'installing', 'downloaded', 'downloading', 'offered', 'pending', 'declined', 'failed'];

export interface PanelRelease {
  id: string;
  scope: 'platform' | 'institution';
  platform: ReleasePlatform;
  version: string;
  channel: ReleaseChannel;
  notes: string | null;
  fileName: string | null;
  fileBytes: number | null;
  sha256: string | null;
  createdAt: string;
}

export interface RolloutBoard {
  deviceId: string;
  name: string;
  appVersion: string | null;
  lastSeenAt: string | null;
  state: UpdateState;
  error: string | null;
  updatedAt: string | null;
}

export interface Rollout {
  id: string;
  target: 'all' | 'selected';
  active: boolean;
  createdAt: string;
  stoppedAt: string | null;
  release: Pick<PanelRelease, 'id' | 'version' | 'platform' | 'channel' | 'scope'>;
  counts: Partial<Record<UpdateState, number>>;
  boards: RolloutBoard[];
}

export interface LauncherApp {
  package: string;
  label: string;
  iconUrl: string | null;
}

export interface PanelBoard {
  id: string;
  name: string;
  platform: string | null;
  appVersion: string | null;
  enrolled: boolean;
}

/** Common panel apps an admin can add with one tap. */
export const LAUNCHER_PRESETS: LauncherApp[] = [
  { package: 'com.android.chrome', label: 'Chrome', iconUrl: null },
  { package: 'com.google.android.apps.meetings', label: 'Google Meet', iconUrl: null },
  { package: 'com.android.vending', label: 'Play Store', iconUrl: null },
  { package: 'cn.wps.moffice_eng', label: 'WPS Office', iconUrl: null },
  { package: 'com.google.android.youtube', label: 'YouTube', iconUrl: null },
  { package: 'us.zoom.videomeetings', label: 'Zoom', iconUrl: null },
  { package: 'com.microsoft.teams', label: 'Microsoft Teams', iconUrl: null },
  { package: 'com.google.android.apps.docs', label: 'Google Drive', iconUrl: null },
];

const PACKAGE = /^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/;
const VERSION = /^v?\d+(\.\d+){0,3}([-.][0-9A-Za-z.]+)?(\+\d+)?$/;

export type PanelProblem = 'zx.p.err.package' | 'zx.p.err.label' | 'zx.p.err.icon' | 'zx.p.err.duplicate' | 'zx.p.err.tooMany';

/** What is wrong with a panel home list, if anything (the API checks the same). */
export function launcherProblem(apps: LauncherApp[]): PanelProblem | null {
  if (apps.length > 40) return 'zx.p.err.tooMany';
  const seen = new Set<string>();
  for (const a of apps) {
    if (!PACKAGE.test(a.package.trim())) return 'zx.p.err.package';
    if (!a.label.trim() || a.label.trim().length > 60) return 'zx.p.err.label';
    if (a.iconUrl && !/^https?:\/\/\S+$/.test(a.iconUrl.trim())) return 'zx.p.err.icon';
    if (seen.has(a.package.trim())) return 'zx.p.err.duplicate';
    seen.add(a.package.trim());
  }
  return null;
}

export const versionOk = (v: string) => VERSION.test(v.trim());

/** Which file types each platform's release takes in the upload picker. */
export function acceptFor(p: ReleasePlatform): string {
  return p === 'android' ? '.apk,application/vnd.android.package-archive' : '.zip,.msix,.msi,.exe,.dmg,.AppImage,application/zip';
}

/** The content type to upload a file with (browsers often leave APKs untyped). */
export function uploadType(file: { name: string; type: string }): string {
  const n = file.name.toLowerCase();
  if (n.endsWith('.apk')) return 'application/vnd.android.package-archive';
  if (n.endsWith('.zip')) return 'application/zip';
  if (n.endsWith('.dmg')) return 'application/x-apple-diskimage';
  if (n.endsWith('.msi')) return 'application/x-msi';
  if (n.endsWith('.msix')) return 'application/msix';
  if (n.endsWith('.exe')) return 'application/x-msdownload';
  return 'application/octet-stream';
}

/** "3 of 5 installed" and how many failed, for a rollout's row. */
export function rolloutProgress(r: Pick<Rollout, 'boards'>): { installed: number; total: number; failed: number; percent: number } {
  const total = r.boards.length;
  const installed = r.boards.filter((b) => b.state === 'installed').length;
  const failed = r.boards.filter((b) => b.state === 'failed').length;
  return { installed, total, failed, percent: total ? Math.round((installed * 100) / total) : 0 };
}

export function formatBytes(n: number | null): string {
  if (n === null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function stateTone(s: UpdateState): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  if (s === 'installed') return 'success';
  if (s === 'failed') return 'danger';
  if (s === 'declined') return 'warning';
  if (s === 'pending') return 'neutral';
  return 'info';
}
