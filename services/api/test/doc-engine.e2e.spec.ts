import type { INestApplication } from '@nestjs/common';
import { DOC_TYPES, PRESET_STYLES, type DocLayout } from '@zynetix/shared';
import argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/db/schema.js';
import { demoAssets } from '../src/documents/demo-assets.js';
import { createApp, createTenant, FixedClock, ownerPool, pdfText } from './helpers.js';

const binary = (res: { on: (e: string, f: (c?: Buffer) => void) => void }, cb: (e: Error | null, b: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c) => chunks.push(c!));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

describe('branding, document templates and the register of issued documents', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  const clock = new FixedClock(new Date('2026-10-20T04:30:00Z'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  const ids: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const get = (who: string, url: string) => http().get(url).set(auth(who));
  const getBin = (who: string, url: string) => http().get(url).set(auth(who)).buffer(true).parse(binary);
  const post = (who: string, url: string, body: object = {}) => http().post(url).set(auth(who)).send(body);
  const put = (who: string, url: string, body: object = {}) => http().put(url).set(auth(who)).send(body);
  const audited = async (action: string) => (await owner.query('select count(*)::int as n from audit_log where tenant_id = $1 and action = $2', [t.tenantId, action])).rows[0].n as number;
  const token = (verifyUrl: string) => verifyUrl.split('/').pop()!;

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    const [acct] = await db.insert(s.users).values({ tenantId: t.tenantId, fullName: 'Anil Accounts', email: 'anil@docs.in', passwordHash: await argon2.hash('pw') }).returning();
    await db.insert(s.userRoles).values({ tenantId: t.tenantId, userId: acct.id, role: 'accountant' });
    app = await createApp(clock);
    tokens = {
      principal: await login(t.slug, t.principal.email!),
      accountant: await login(t.slug, acct.email!),
      teacher: await login(t.slug, t.teacher.email!),
      parent: await login(t.slug, t.guardian.email!),
      outsider: await login(other.slug, other.principal.email!),
    };
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  describe('branding', () => {
    it('starts from the default palette and fonts, and only administrators change it', async () => {
      const b = (await get('principal', '/v1/admin/branding').expect(200)).body;
      expect(b).toMatchObject({ palette: { primary: '#1f3a5f', paper: '#ffffff' }, fonts: { heading: 'noto-serif', body: 'noto-sans' }, assets: {}, signatories: {} });
      await put('teacher', '/v1/admin/branding', { tagline: 'x' }).expect(403);
      await put('accountant', '/v1/admin/branding', { tagline: 'x' }).expect(403);
      await put('principal', '/v1/admin/branding', { palette: { primary: 'blue' } }).expect(400);
      await put('principal', '/v1/admin/branding', { fonts: { heading: 'comic-sans' } }).expect(400);
      await put('principal', '/v1/admin/branding', { gstin: '12345' }).expect(400);
      const saved = (
        await put('principal', '/v1/admin/branding', {
          palette: { primary: '#123456', accent: '#B23A48' },
          fonts: { heading: 'playfair', body: 'poppins' },
          tagline: 'Affiliated to Bangalore University',
          gstin: '29aabts1234k1z9',
          signatories: { principal: { name: 'Dr. Meena Rao', designation: 'Principal' }, controller: { name: 'Dr. K. Prakash', designation: 'Controller of Examinations' } },
        }).expect(200)
      ).body;
      expect(saved).toMatchObject({ palette: { primary: '#123456', accent: '#b23a48', secondary: '#9a7b3c' }, fonts: { heading: 'playfair', body: 'poppins' }, gstin: '29AABTS1234K1Z9', signatories: { principal: { name: 'Dr. Meena Rao', hasSignature: false } } });
      expect(await audited('branding.updated')).toBe(1);
    });

    it('takes logos, crest, seal and signatures as images, normalised to PNG; the public sees only the public ones', async () => {
      const a = await demoAssets();
      await put('principal', '/v1/admin/branding/assets/logo', { contentType: 'text/plain', contentBase64: Buffer.from('hello world').toString('base64') }).expect(400);
      await put('principal', '/v1/admin/branding/assets/logo', { contentType: 'image/png', contentBase64: Buffer.from('not really a png at all').toString('base64') }).expect(400);
      await put('principal', '/v1/admin/branding/assets/banner', { contentType: 'image/png', contentBase64: a.logo.toString('base64') }).expect(404);
      await put('principal', '/v1/admin/branding/assets/logo', { contentType: 'image/png', contentBase64: a.logo.toString('base64') }).expect(200);
      await put('principal', '/v1/admin/branding/assets/emblem', { contentType: 'image/png', contentBase64: a.emblem.toString('base64') }).expect(200);
      // A signature scanned on white paper: the paper becomes transparent.
      const jpeg = await (await import('sharp')).default(a.signatures.principal).flatten({ background: '#ffffff' }).jpeg().toBuffer();
      const b = (await put('principal', '/v1/admin/branding/assets/signature:principal', { contentType: 'image/jpeg', contentBase64: jpeg.toString('base64') }).expect(200)).body;
      expect(b.assets.logo).toMatchObject({ contentType: 'image/png', width: 400 });
      expect(b.signatories.principal).toMatchObject({ name: 'Dr. Meena Rao', hasSignature: true });
      const sig = (await getBin('principal', '/v1/admin/branding/assets/signature:principal').expect(200)).body as Buffer;
      const meta = await (await import('sharp')).default(sig).metadata();
      expect(meta.hasAlpha).toBe(true);

      const pub = (await http().get(`/v1/public/branding/${t.slug}`).expect(200)).body;
      expect(pub).toMatchObject({ slug: t.slug, palette: { primary: '#123456' }, fonts: { heading: 'playfair' }, tagline: 'Affiliated to Bangalore University' });
      expect(pub.assets.logo).toMatch(new RegExp(`^/v1/public/branding/${t.slug}/logo\\?v=[0-9a-f]{12}$`));
      expect(pub.assets).not.toHaveProperty('signature:principal');
      const logo = await http().get(pub.assets.logo).buffer(true).parse(binary).expect(200);
      expect(logo.headers['content-type']).toBe('image/png');
      expect(logo.headers['cache-control']).toContain('public');
      await http().get(`/v1/public/branding/${t.slug}/signature:principal`).expect(404);
      await http().get(`/v1/public/branding/${t.slug}/seal`).expect(404);
      await http().get('/v1/public/branding/no-such-place').expect(404);
      await get('outsider', '/v1/admin/branding/assets/logo').expect(404);
    });

    it('removes an image', async () => {
      const a = await demoAssets();
      await put('principal', '/v1/admin/branding/assets/favicon', { contentType: 'image/png', contentBase64: a.logo.toString('base64') }).expect(200);
      const b = (await http().delete('/v1/admin/branding/assets/favicon').set(auth('principal')).expect(200)).body;
      expect(b.assets.favicon).toBeUndefined();
      await http().delete('/v1/admin/branding/assets/favicon').set(auth('principal')).expect(404);
    });
  });

  describe('templates', () => {
    it('lists four presets for every document type, Classic the default until one is chosen', async () => {
      const all = (await get('accountant', '/v1/documents/designs').expect(200)).body as { id: string; docType: string; system: boolean; isDefault: boolean; style: string }[];
      expect(all).toHaveLength(DOC_TYPES.length * 4);
      for (const ty of DOC_TYPES) {
        const mine = all.filter((x) => x.docType === ty);
        expect(mine.map((x) => x.style)).toEqual([...PRESET_STYLES]);
        expect(mine.filter((x) => x.isDefault).map((x) => x.id)).toEqual([`preset:${ty}:classic`]);
      }
      await get('teacher', '/v1/documents/designs').expect(403);
      await get('accountant', '/v1/documents/designs?docType=nope').expect(404);
      const b = (await get('accountant', '/v1/documents/designs/bindings/fee_receipt').expect(200)).body;
      expect(b.bindings.map((x: { key: string }) => x.key)).toEqual(expect.arrayContaining(['receipt.amount', 'receipt.amountWords', 'fee.lines', 'student.name', 'verify.url']));
    });

    it('renders every preset of every document type as PDF, and previews as PNG and SVG', async () => {
      for (const ty of DOC_TYPES)
        for (const st of PRESET_STYLES) {
          const res = await getBin('accountant', `/v1/documents/designs/preset:${ty}:${st}/preview.pdf`).expect(200);
          expect(res.headers['content-type']).toBe('application/pdf');
          expect((res.body as Buffer).subarray(0, 8).toString('latin1'), `${ty} ${st}`).toBe('%PDF-1.7');
        }
      const png = await getBin('accountant', '/v1/documents/designs/preset:student_id_card:modern/preview.png?side=back&width=320').expect(200);
      expect(png.headers['content-type']).toBe('image/png');
      expect((png.body as Buffer).subarray(1, 4).toString('latin1')).toBe('PNG');
      const svg = (await getBin('accountant', '/v1/documents/designs/preset:marks_card:heritage/preview.svg?animate=1').expect(200)).body.toString('utf8');
      expect(svg).toContain('<svg');
      expect(svg).toContain('kx-shimmer');
      await getBin('accountant', '/v1/documents/designs/preset:marks_card:heritage/preview.gif').expect(404);
      await getBin('accountant', '/v1/documents/designs/preset:marks_card:baroque/preview.png').expect(404);
    });

    it('restyles every template when the palette changes', async () => {
      const before = (await getBin('accountant', '/v1/documents/designs/preset:bonafide_certificate:modern/preview.svg').expect(200)).body.toString('utf8');
      expect(before).toContain('#123456');
      await put('principal', '/v1/admin/branding', { palette: { primary: '#0b6e4f' } }).expect(200);
      const after = (await getBin('accountant', '/v1/documents/designs/preset:bonafide_certificate:modern/preview.svg').expect(200)).body.toString('utf8');
      expect(after).toContain('#0b6e4f');
      expect(after).not.toContain('#123456');
    });

    it('duplicates a preset, saves versions, restores one and deletes', async () => {
      await post('accountant', '/v1/documents/designs', { from: 'preset:fee_receipt:modern' }).expect(403);
      await put('principal', '/v1/documents/designs/preset:fee_receipt:modern', { name: 'Mine' }).expect(409);
      const copy = (await post('principal', '/v1/documents/designs', { from: 'preset:fee_receipt:modern', name: 'Receipt with stamp' }).expect(201)).body;
      expect(copy).toMatchObject({ docType: 'fee_receipt', name: 'Receipt with stamp', system: false, style: 'modern', basedOn: 'preset:fee_receipt:modern', version: 1, isDefault: false });
      ids.receiptTpl = copy.id;
      const layout = copy.layout as DocLayout;
      layout.sides[0].elements.push({ id: 'paid-stamp', type: 'text', x: 120, y: 60, w: 50, h: 12, text: 'PAID', style: { font: 'heading', sizePt: 22, weight: 700, color: 'accent', align: 'center', lineHeight: 1 }, vAlign: 'middle', fit: 'none', rotationDeg: -12, opacity: 0.8 });
      const v2 = (await put('principal', `/v1/documents/designs/${copy.id}`, { layout, note: 'Added a PAID stamp' }).expect(200)).body;
      expect(v2.version).toBe(2);
      expect(v2.layout.sides[0].elements.find((e: { id: string }) => e.id === 'paid-stamp')).toBeTruthy();
      await put('principal', `/v1/documents/designs/${copy.id}`, { layout: { ...layout, docType: 'marks_card' } }).expect(400);
      await put('principal', `/v1/documents/designs/${copy.id}`, { layout: { ...layout, sides: [{ id: 'page', elements: [{ id: 'x', type: 'text' }] }] } }).expect(400);
      const v3 = (await put('principal', `/v1/documents/designs/${copy.id}`, { name: 'Receipt (stamped)' }).expect(200)).body;
      expect(v3).toMatchObject({ version: 3, name: 'Receipt (stamped)' });
      const versions = (await get('accountant', `/v1/documents/designs/${copy.id}/versions`).expect(200)).body;
      expect(versions.map((v: { version: number }) => v.version)).toEqual([3, 2, 1]);
      expect(versions[1]).toMatchObject({ note: 'Added a PAID stamp', createdBy: t.principal.fullName });
      const restored = (await post('principal', `/v1/documents/designs/${copy.id}/versions/1/restore`).expect(200)).body;
      expect(restored).toMatchObject({ version: 4, name: 'Receipt with stamp' });
      expect(restored.layout.sides[0].elements.find((e: { id: string }) => e.id === 'paid-stamp')).toBeUndefined();
      await post('principal', `/v1/documents/designs/${copy.id}/versions/9/restore`).expect(404);
      // The unsaved layout preview the editor uses.
      const pv = await http().post('/v1/documents/designs/preview').set(auth('principal')).send({ layout, format: 'pdf' }).buffer(true).parse(binary).expect(200);
      expect(pdfText(pv.body as Buffer)).toContain('PAID');
      await get('outsider', `/v1/documents/designs/${copy.id}`).expect(404);
      const throwaway = (await post('principal', '/v1/documents/designs', { from: copy.id }).expect(201)).body;
      expect(throwaway.name).toBe('Receipt with stamp copy'); // the restored version brought its name back
      await http().delete(`/v1/documents/designs/${throwaway.id}`).set(auth('principal')).expect(204);
      await get('accountant', `/v1/documents/designs/${throwaway.id}`).expect(404);
      await http().delete('/v1/documents/designs/preset:fee_receipt:classic').set(auth('principal')).expect(409);
      expect(await audited('doc_template.updated')).toBe(3);
    });

    it('gives the editor what it needs: layout issues by path, groups, real people to preview with, and the fonts', async () => {
      const copy = (await post('principal', '/v1/documents/designs', { from: 'preset:student_id_card:modern', name: 'Editor card' }).expect(201)).body;
      const layout = copy.layout as DocLayout;
      // An invalid layout comes back with every issue and where it is.
      const broken = structuredClone(layout);
      (broken.sides[0].elements[1] as { x: unknown }).x = 'left';
      (broken.sides[1].elements[0] as { opacity: number }).opacity = 3;
      const bad = (await put('principal', `/v1/documents/designs/${copy.id}`, { layout: broken }).expect(400)).body;
      expect(bad.code).toBe('LAYOUT_INVALID');
      expect(bad.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: ['sides', 0, 'elements', 1, 'x'] }), expect.objectContaining({ path: ['sides', 1, 'elements', 0, 'opacity'] })]));
      expect((await http().post('/v1/documents/designs/preview').set(auth('principal')).send({ layout: broken, format: 'png' }).expect(400)).body.code).toBe('LAYOUT_INVALID');
      // Grouped elements keep their group through a save.
      layout.sides[0].elements[1].group = 'g1';
      layout.sides[0].elements[2].group = 'g1';
      const saved = (await put('principal', `/v1/documents/designs/${copy.id}`, { layout, note: 'Grouped the header' }).expect(200)).body;
      expect(saved.layout.sides[0].elements.filter((e: { group?: string }) => e.group === 'g1')).toHaveLength(2);

      // Search people, then preview with one of them instead of the sample student.
      const kids = (await get('accountant', '/v1/documents/designs/subjects?kind=student&q=student a').expect(200)).body;
      expect(kids[0]).toMatchObject({ type: 'student', id: t.students[0].id, name: 'Student A' });
      const staff = (await get('accountant', `/v1/documents/designs/subjects?kind=staff&q=${encodeURIComponent(t.teacher.fullName.slice(0, 5))}`).expect(200)).body;
      expect(staff.map((x: { id: string }) => x.id)).toContain(t.teacher.id);
      await get('accountant', '/v1/documents/designs/subjects?kind=parents').expect(400);
      await get('teacher', '/v1/documents/designs/subjects?kind=student').expect(403);
      expect((await get('accountant', `/v1/documents/designs/subjects/student/${t.students[0].id}`).expect(200)).body.student).toMatchObject({ name: 'Student A', rollNo: t.students[0].rollNo });
      expect((await get('accountant', `/v1/documents/designs/subjects/staff/${t.teacher.id}`).expect(200)).body.staff).toMatchObject({ name: t.teacher.fullName });
      await get('accountant', `/v1/documents/designs/subjects/student/${crypto.randomUUID()}`).expect(404);
      await get('accountant', `/v1/documents/designs/subjects/guardian/${t.students[0].id}`).expect(404);
      const real = await http().post('/v1/documents/designs/preview').set(auth('principal')).send({ layout, format: 'pdf', subject: { type: 'student', id: t.students[0].id } }).buffer(true).parse(binary).expect(200);
      const text = pdfText(real.body as Buffer);
      expect(text).toContain('Student A');
      expect(text).not.toContain('Ananya');
      await http().post('/v1/documents/designs/preview').set(auth('principal')).send({ layout, format: 'pdf', subject: { type: 'staff', id: t.teacher.id } }).expect(400);
      await http().post('/v1/documents/designs/preview').set(auth('principal')).send({ layout, format: 'pdf', subject: { type: 'student', id: crypto.randomUUID() } }).expect(404);
      expect((await get('outsider', '/v1/documents/designs/subjects?kind=student&q=student').expect(200)).body.map((x: { id: string }) => x.id)).not.toContain(t.students[0].id);

      // The faces the PDF embeds, for the canvas.
      const font = await getBin('accountant', '/v1/documents/designs/fonts/NotoSerif-Regular.ttf').expect(200);
      expect(font.headers['content-type']).toBe('font/ttf');
      expect((font.body as Buffer).length).toBeGreaterThan(10_000);
      await getBin('accountant', '/v1/documents/designs/fonts/..%2F..%2Fpackage.json').expect(404);
      await getBin('accountant', '/v1/documents/designs/fonts/Comic.ttf').expect(404);
      await http().delete(`/v1/documents/designs/${copy.id}`).set(auth('principal')).expect(204);
    });

    it('sets the default per document type, which every generator then uses', async () => {
      await put('principal', '/v1/documents/designs/defaults/marks_card', { templateId: ids.receiptTpl }).expect(400);
      const list = (await put('principal', '/v1/documents/designs/defaults/fee_receipt', { templateId: ids.receiptTpl }).expect(200)).body;
      expect(list.filter((x: { isDefault: boolean }) => x.isDefault).map((x: { id: string }) => x.id)).toEqual([ids.receiptTpl]);
      await put('principal', '/v1/documents/designs/defaults/student_id_card', { templateId: 'preset:student_id_card:heritage' }).expect(200);
      const cards = (await get('accountant', '/v1/documents/designs?docType=student_id_card').expect(200)).body;
      expect(cards.find((x: { isDefault: boolean }) => x.isDefault).id).toBe('preset:student_id_card:heritage');
    });
  });

  describe('issuing, verifying and revoking', () => {
    it('records a fee receipt when it is printed, with a QR that verifies its fields and signature', async () => {
      const [inv] = await db.insert(s.feeInvoices).values({ tenantId: t.tenantId, studentId: t.students[0].id, sectionId: t.section.id, batchId: crypto.randomUUID(), invoiceNo: 'INV/2026-27/00007', title: 'Semester 3 tuition', amountPaise: 45_000_00, paidPaise: 20_000_00, dueOn: '2026-11-01', createdBy: t.principal.id }).returning();
      const [pay] = await db.insert(s.feePayments).values({ tenantId: t.tenantId, invoiceId: inv.id, studentId: t.students[0].id, amountPaise: 20_000_00, method: 'upi', status: 'paid', receiptNo: 'RCT/2026-27/00042', paidAt: new Date('2026-10-19T08:00:00Z'), reference: 'UPI 4281' }).returning();
      ids.payment = pay.id;
      ids.invoice = inv.id;
      const pdf = (await getBin('parent', `/v1/documents/fee-receipts/${pay.id}.pdf`).expect(200)).body as Buffer;
      const text = pdfText(pdf);
      // The institution's own template (the stamped copy, now the default) prints it.
      for (const x of ['RCT/2026-27/00042', 'Student A', 'Rupees Twenty Thousand Only', 'Fingerprint']) expect(text).toContain(x);
      // Printing again gives the same record.
      await getBin('accountant', `/v1/documents/fee-receipts/${pay.id}.pdf`).expect(200);
      const issued = (await get('accountant', '/v1/documents/issued?docType=fee_receipt').expect(200)).body;
      expect(issued).toHaveLength(1);
      expect(issued[0]).toMatchObject({ docType: 'fee_receipt', serial: 'RCT/2026-27/00042', status: 'valid', subjectName: 'Student A', title: 'Fee Receipt' });
      expect(text).toContain(issued[0].fingerprint);
      ids.receiptDoc = issued[0].id;
      ids.receiptToken = token(issued[0].verifyUrl);
      const v = (await http().get(`/v1/public/verify/${t.slug}/${ids.receiptToken}`).expect(200)).body;
      expect(v).toMatchObject({ status: 'valid', docType: 'fee_receipt', serial: 'RCT/2026-27/00042', subjectName: 'Student A', signatureValid: true, fingerprint: issued[0].fingerprint, palette: { primary: '#0b6e4f' } });
      expect(v.logo).toMatch(/^\/v1\/public\/branding\//);
      expect(v.fields).toEqual(expect.arrayContaining([{ label: 'Amount', value: 'Rs. 20,000.00' }]));
      expect((await http().get(`/v1/public/verify/${other.slug}/${ids.receiptToken}`).expect(200)).body).toEqual({ status: 'not_found' });
      await get('teacher', '/v1/documents/issued').expect(403);
      expect(await audited('document.issued')).toBe(1);
    });

    it('prints a GST-ready invoice and ID card sheets through the engine', async () => {
      const inv = pdfText((await getBin('parent', `/v1/documents/fee-invoices/${ids.invoice}.pdf`).expect(200)).body as Buffer);
      for (const x of ['INV/2026-27/00007', '999293', 'Exempt', 'Semester 3 tuition']) expect(inv).toContain(x);
      const cards = (await getBin('accountant', `/v1/documents/id-cards/students.pdf?sectionId=${t.section.id}`).expect(200)).body as Buffer;
      expect(pdfText(cards)).toContain('Student B');
      expect((await get('accountant', '/v1/documents/issued?docType=student_id_card').expect(200)).body).toHaveLength(3);
    });

    it('shows tampering with the recorded data as a failed signature check', async () => {
      await owner.query(`update issued_documents set payload = jsonb_set(payload, '{receipt,amount}', '"Rs. 90,000.00"') where id = $1`, [ids.receiptDoc]);
      expect((await http().get(`/v1/public/verify/${t.slug}/${ids.receiptToken}`).expect(200)).body).toMatchObject({ status: 'valid', signatureValid: false });
      await owner.query(`update issued_documents set payload = jsonb_set(payload, '{receipt,amount}', '"Rs. 20,000.00"') where id = $1`, [ids.receiptDoc]);
      expect((await http().get(`/v1/public/verify/${t.slug}/${ids.receiptToken}`).expect(200)).body.signatureValid).toBe(true);
    });

    it('reissues a copy with a new QR (the old one superseded) and revokes with a reason', async () => {
      await post('accountant', `/v1/documents/issued/${ids.receiptDoc}/reissue`).expect(403);
      const fresh = (await post('principal', `/v1/documents/issued/${ids.receiptDoc}/reissue`).expect(200)).body;
      expect(fresh).toMatchObject({ status: 'valid', serial: 'RCT/2026-27/00042-R2' });
      expect((await http().get(`/v1/public/verify/${t.slug}/${ids.receiptToken}`).expect(200)).body.status).toBe('superseded');
      await post('principal', `/v1/documents/issued/${ids.receiptDoc}/revoke`, { reason: 'Replaced' }).expect(409);
      await post('principal', `/v1/documents/issued/${fresh.id}/revoke`, { reason: 'no' }).expect(400);
      const revoked = (await post('principal', `/v1/documents/issued/${fresh.id}/revoke`, { reason: 'Payment reversed by the bank' }).expect(200)).body;
      expect(revoked).toMatchObject({ status: 'revoked', revokedReason: 'Payment reversed by the bank' });
      const v = (await http().get(`/v1/public/verify/${t.slug}/${token(fresh.verifyUrl)}`).expect(200)).body;
      expect(v).toMatchObject({ status: 'revoked', revokedReason: 'Payment reversed by the bank', revokedOn: '20 October 2026' });
      const copy = pdfText((await getBin('accountant', `/v1/documents/issued/${fresh.id}/pdf`).expect(200)).body as Buffer);
      expect(copy).toContain('REVOKED');
      expect((await get('accountant', '/v1/documents/issued?status=revoked').expect(200)).body.map((d: { id: string }) => d.id)).toEqual([fresh.id]);
      expect(await audited('document.revoked')).toBe(1);
      expect(await audited('document.reissued')).toBe(1);
    });
  });
});
