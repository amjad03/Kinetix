// Communication pass: channel registration and credits, the send log, consent per channel and the cost report.

export const PAID_CHANNELS = ['sms', 'whatsapp', 'email'] as const;
export const DLT_CONTENT_TYPES = ['transactional', 'service_implicit', 'service_explicit', 'promotional'] as const;
export const FALLBACK_CHANNELS = ['in_app', 'whatsapp', 'sms', 'email'] as const;

/** One channel's provider and the institution's registration (GET /v1/comms/channels). */
export interface ChannelRow {
  channel: 'sms' | 'whatsapp' | 'email' | 'push';
  provider: string;
  connected: boolean;
  enabled: boolean;
  senderId: string;
  dltEntityId: string;
  unitCostPaise: number;
  hourlyLimit: number;
  dailyLimit: number;
  lowBalanceUnits: number;
  reportUrl: string | null;
  updatedAt: string | null;
}

/** Credits on a paid channel (GET /v1/comms/credits). */
export interface CreditRow {
  channel: 'sms' | 'whatsapp' | 'email';
  prepaid: boolean;
  balance: number;
  unitCostPaise: number;
  lowBalanceUnits: number;
  low: boolean;
  spentUnitsThisMonth: number;
  spentPaiseThisMonth: number;
  toppedUpPaise: number;
  lastTopUp: string | null;
}

export interface SummaryCounts {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  suppressed: number;
  deferred: number;
  units: number;
  costPaise: number;
}

/** Delivery, read and cost by channel and department (GET /v1/comms/reports/summary). */
export interface CommsSummary {
  from: string;
  to: string;
  total: { sent: number; delivered: number; failed: number; costPaise: number };
  byChannel: (SummaryCounts & { channel: string })[];
  byDepartment: (SummaryCounts & { departmentId: string | null; department: string })[];
  byDay: { day: string; sent: number; delivered: number; costPaise: number }[];
  apps: { departmentId: string | null; department: string; channel: string; sent: number; delivered: number; read: number; acknowledged: number }[];
}

/** Whole percent, rounded down (0 of nothing is 0). */
export const share = (n: number, of: number) => (of > 0 ? Math.floor((n * 100) / of) : 0);

/** The app notices of a department added up across the apps. */
export function appTotals(rows: CommsSummary['apps']): { department: string; sent: number; delivered: number; read: number; acknowledged: number }[] {
  const by = new Map<string, { department: string; sent: number; delivered: number; read: number; acknowledged: number }>();
  for (const r of rows) {
    const k = r.departmentId ?? '';
    const e = by.get(k) ?? { department: r.department, sent: 0, delivered: 0, read: 0, acknowledged: 0 };
    e.sent += r.sent;
    e.delivered += r.delivered;
    e.read += r.read;
    e.acknowledged += r.acknowledged;
    by.set(k, e);
  }
  return [...by.values()].sort((a, b) => b.sent - a.sent || a.department.localeCompare(b.department));
}
