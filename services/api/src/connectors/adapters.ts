import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { assertSafeUrl } from './safe-url.js';

/** One outgoing call to an outside system. */
export interface HttpRequest {
  method: 'GET' | 'POST';
  url: string;
  headers?: Record<string, string>;
  body?: string;
}
export interface HttpResponse {
  status: number;
  text: string;
}

/** The only way the adapters reach the network. The e2e tests point the connector's URLs at a local server; nothing else is replaced. */
export abstract class ConnectorHttp {
  abstract request(r: HttpRequest): Promise<HttpResponse>;
}

@Injectable()
export class FetchHttp extends ConnectorHttp {
  async request(r: HttpRequest): Promise<HttpResponse> {
    assertSafeUrl(r.url);
    const res = await fetch(r.url, { method: r.method, headers: r.headers, body: r.body, redirect: 'manual', signal: AbortSignal.timeout(10_000) });
    return { status: res.status, text: await res.text() };
  }
}

export type TestResult = { status: 'ok' | 'failed'; message: string };
type Cfg = Record<string, string | string[] | undefined>;
const str = (c: Cfg, k: string) => (c[k] as string | undefined) ?? '';
const trimSlash = (u: string) => u.replace(/\/+$/, '');
const form = (o: Record<string, string>) => new URLSearchParams(o).toString();

export interface KohaBook {
  biblioId: string;
  title: string;
  author: string | null;
  isbn: string | null;
  publisher: string | null;
  year: string | null;
}
export interface KohaLoan {
  checkoutId: string;
  itemId: string | null;
  biblioId: string | null;
  checkedOutOn: string;
  dueOn: string;
  renewals: number;
  overdue: boolean;
}
export interface MeetingInfo {
  externalId: string;
  joinUrl: string;
  hostUrl: string | null;
}

/** The BI datasets an institution may export. Each is a fixed, read-only query: nothing else can be named in a signed URL. */
export const BI_DATASETS = ['students', 'fee_invoices', 'sponsor_invoices'] as const;
export type BiDataset = (typeof BI_DATASETS)[number];

/** Real adapters for the connector types: Koha, Zoom, Teams and the signed-URL BI export. */
@Injectable()
export class ConnectorAdapters {
  constructor(private readonly http: ConnectorHttp) {}

  private async json(r: HttpRequest, what: string): Promise<any> {
    let res: HttpResponse;
    try {
      res = await this.http.request(r);
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw new BadGatewayException(`${what}: could not reach the server (${(e as Error).message})`.slice(0, 300));
    }
    if (res.status < 200 || res.status >= 300) throw new BadGatewayException(`${what}: the server answered ${res.status}`);
    try {
      return res.text ? JSON.parse(res.text) : {};
    } catch {
      throw new BadGatewayException(`${what}: the server's answer was not understood`);
    }
  }

  async test(type: string, config: Cfg): Promise<TestResult> {
    try {
      if (type === 'library_koha') {
        await this.kohaToken(config);
        return { status: 'ok', message: 'Signed in to Koha' };
      }
      if (type === 'lms_video') {
        const token = await this.videoToken(config);
        if (str(config, 'provider') === 'zoom') await this.json({ method: 'GET', url: `${trimSlash(str(config, 'apiBaseUrl') || 'https://api.zoom.us/v2')}/users/me`, headers: { authorization: `Bearer ${token}` } }, 'Zoom');
        return { status: 'ok', message: `Signed in to ${str(config, 'provider') === 'zoom' ? 'Zoom' : 'Microsoft Teams'}` };
      }
      if (type === 'bi_export') {
        const sig = this.sign(str(config, 'signingSecret'), 'test', 'students', 1);
        if (!this.verify(str(config, 'signingSecret'), 'test', 'students', 1, sig)) return { status: 'failed', message: 'The signing secret did not work' };
        return { status: 'ok', message: `Signed export links are ready for: ${this.datasets(config).join(', ')}` };
      }
    } catch (e) {
      return { status: 'failed', message: (e as Error).message.slice(0, 300) };
    }
    return { status: 'failed', message: 'Not available in this build' };
  }

  // ----- Koha ---------------------------------------------------------------------------------------------

  private async kohaToken(c: Cfg): Promise<string> {
    const t = await this.json(
      { method: 'POST', url: `${trimSlash(str(c, 'baseUrl'))}/api/v1/oauth/token`, headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ grant_type: 'client_credentials', client_id: str(c, 'clientId'), client_secret: str(c, 'clientSecret') }) },
      'Koha sign-in',
    );
    if (!t.access_token) throw new BadGatewayException('Koha sign-in: no access token came back');
    return t.access_token as string;
  }

  /** Catalogue search by title or author. */
  async kohaSearch(c: Cfg, q: string): Promise<KohaBook[]> {
    const token = await this.kohaToken(c);
    const like = { '-like': `%${q}%` };
    const query = JSON.stringify({ '-or': [{ title: like }, { author: like }] });
    const rows = await this.json({ method: 'GET', url: `${trimSlash(str(c, 'baseUrl'))}/api/v1/biblios?_per_page=20&q=${encodeURIComponent(query)}`, headers: { authorization: `Bearer ${token}` } }, 'Koha search');
    return (Array.isArray(rows) ? rows : []).map((b: any) => ({
      biblioId: String(b.biblio_id ?? b.biblionumber ?? ''),
      title: String(b.title ?? ''),
      author: b.author ?? null,
      isbn: b.isbn ?? null,
      publisher: b.publisher ?? b.publisher_name ?? null,
      year: b.copyright_date != null ? String(b.copyright_date) : (b.publication_year ?? null),
    }));
  }

  /** The books a patron (by library card number) has out. */
  async kohaLoans(c: Cfg, cardNumber: string): Promise<{ patronId: string; loans: KohaLoan[] }> {
    const token = await this.kohaToken(c);
    const base = trimSlash(str(c, 'baseUrl'));
    const headers = { authorization: `Bearer ${token}` };
    const patrons = await this.json({ method: 'GET', url: `${base}/api/v1/patrons?cardnumber=${encodeURIComponent(cardNumber)}`, headers }, 'Koha patron lookup');
    const patron = Array.isArray(patrons) ? patrons[0] : undefined;
    if (!patron) throw new BadRequestException('No library member has that card number');
    const rows = await this.json({ method: 'GET', url: `${base}/api/v1/checkouts?patron_id=${encodeURIComponent(String(patron.patron_id))}`, headers: { ...headers, 'x-koha-embed': 'item' } }, 'Koha loans');
    const now = Date.now();
    return {
      patronId: String(patron.patron_id),
      loans: (Array.isArray(rows) ? rows : []).map((l: any) => ({
        checkoutId: String(l.checkout_id),
        itemId: l.item_id != null ? String(l.item_id) : null,
        biblioId: l.item?.biblio_id != null ? String(l.item.biblio_id) : null,
        checkedOutOn: String(l.checkout_date ?? l.issuedate ?? ''),
        dueOn: String(l.due_date ?? ''),
        renewals: Number(l.renewals_count ?? 0),
        overdue: !!l.due_date && Date.parse(l.due_date) < now,
      })),
    };
  }

  // ----- Zoom / Teams -------------------------------------------------------------------------------------

  private async videoToken(c: Cfg): Promise<string> {
    if (str(c, 'provider') === 'zoom') {
      const url = `${str(c, 'tokenUrl') || 'https://zoom.us/oauth/token'}?${form({ grant_type: 'account_credentials', account_id: str(c, 'accountId') })}`;
      const t = await this.json({ method: 'POST', url, headers: { authorization: `Basic ${Buffer.from(`${str(c, 'clientId')}:${str(c, 'clientSecret')}`).toString('base64')}` } }, 'Zoom sign-in');
      if (!t.access_token) throw new BadGatewayException('Zoom sign-in: no access token came back');
      return t.access_token as string;
    }
    const url = str(c, 'tokenUrl') || `https://login.microsoftonline.com/${encodeURIComponent(str(c, 'accountId'))}/oauth2/v2.0/token`;
    const t = await this.json(
      { method: 'POST', url, headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ grant_type: 'client_credentials', client_id: str(c, 'clientId'), client_secret: str(c, 'clientSecret'), scope: 'https://graph.microsoft.com/.default' }) },
      'Microsoft sign-in',
    );
    if (!t.access_token) throw new BadGatewayException('Microsoft sign-in: no access token came back');
    return t.access_token as string;
  }

  /** Creates a scheduled meeting for an online class. */
  async createMeeting(c: Cfg, m: { topic: string; startsAt: Date; durationMin: number }): Promise<MeetingInfo> {
    const token = await this.videoToken(c);
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    if (str(c, 'provider') === 'zoom') {
      const r = await this.json(
        { method: 'POST', url: `${trimSlash(str(c, 'apiBaseUrl') || 'https://api.zoom.us/v2')}/users/me/meetings`, headers, body: JSON.stringify({ topic: m.topic, type: 2, start_time: m.startsAt.toISOString().slice(0, 19) + 'Z', duration: m.durationMin, timezone: 'UTC' }) },
        'Zoom',
      );
      if (!r.id || !r.join_url) throw new BadGatewayException('Zoom: the meeting was not created');
      return { externalId: String(r.id), joinUrl: String(r.join_url), hostUrl: r.start_url ?? null };
    }
    const organizer = str(c, 'organizerId');
    if (!organizer) throw new BadRequestException('Add the organiser (user id or address) to the Teams connector first');
    const end = new Date(m.startsAt.getTime() + m.durationMin * 60_000);
    const r = await this.json(
      { method: 'POST', url: `${trimSlash(str(c, 'apiBaseUrl') || 'https://graph.microsoft.com/v1.0')}/users/${encodeURIComponent(organizer)}/onlineMeetings`, headers, body: JSON.stringify({ subject: m.topic, startDateTime: m.startsAt.toISOString(), endDateTime: end.toISOString() }) },
      'Teams',
    );
    if (!r.id || !r.joinWebUrl) throw new BadGatewayException('Teams: the meeting was not created');
    return { externalId: String(r.id), joinUrl: String(r.joinWebUrl), hostUrl: null };
  }

  // ----- BI export ----------------------------------------------------------------------------------------

  /** The datasets this connector offers: the whitelist, narrowed by the connector's own list when it has one. */
  datasets(c: Cfg): BiDataset[] {
    const chosen = (c.datasets as string[] | undefined) ?? [];
    return BI_DATASETS.filter((d) => chosen.length === 0 || chosen.includes(d));
  }

  sign(secret: string, connectorId: string, dataset: string, exp: number): string {
    return createHmac('sha256', secret).update(`${connectorId}.${dataset}.${exp}`).digest('hex');
  }

  verify(secret: string, connectorId: string, dataset: string, exp: number, sig: string): boolean {
    if (!/^[0-9a-f]{64}$/.test(sig)) return false;
    return timingSafeEqual(Buffer.from(this.sign(secret, connectorId, dataset, exp), 'hex'), Buffer.from(sig, 'hex'));
  }
}

/** One CSV cell: quoted when needed, and a leading = + - @ is neutralised so a spreadsheet never runs it as a formula. */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const toCsv = (header: string[], rows: unknown[][]): string => [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
