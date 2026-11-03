import { describe, expect, it } from 'vitest';
import { isDepthPath } from './depth';
import { isLhtPath, isLhtRead, LHT_GROUPS, PARAM_ACTIONS, sourcesFor } from './lht';
import { copyFileQuery, isLibraryPassPost, isLibraryPassRead, kioskTags, libraryFilePath, opacApiQuery, opacHref, opacState } from './library-pass';

const ID = '5b0c2a1e-1111-4222-8333-944455556666';

describe('library pass paths', () => {
  it('lets the desks send only the library pass commands', () => {
    expect(isLibraryPassPost('/v1/library/overdue-notices/run')).toBe(true);
    expect(isLibraryPassPost(`/v1/library/members/${ID}/fines-to-fees`)).toBe(true);
    expect(isLibraryPassPost(`/v1/library/exits/staff/${ID}/clear`)).toBe(true);
    expect(isLibraryPassPost(`/v1/library/loans/${ID}/renew`)).toBe(true);
    expect(isLibraryPassPost('/v1/library/members/../../fees/fines-to-fees')).toBe(false);
    expect(isLibraryPassPost('/v1/library/overdue-notices/run?x=1')).toBe(false);
    expect(isLhtPath('/v1/library/overdue-notices/run')).toBe(true);
    expect(isDepthPath(`/v1/library/members/${ID}/fines-to-fees`)).toBe(true);
    expect(isDepthPath(`/v1/library/no-dues/${ID}/clear`)).toBe(true);
    expect(isDepthPath('/v1/fees/invoices')).toBe(false);
  });

  it('reads the rules preview only for a card and a known material', () => {
    expect(isLibraryPassRead('/v1/library/rules/preview?memberCode=MEM-0001&material=book')).toBe(true);
    expect(isLhtRead('/v1/library/rules/preview?memberCode=R1&material=reference')).toBe(true);
    expect(isLibraryPassRead('/v1/library/rules/preview?memberCode=R1&material=weapon')).toBe(false);
    expect(isLibraryPassRead('/v1/library/rules/preview?memberCode=a b&material=book')).toBe(false);
  });

  it('builds the label and RFID file requests from clean filters only', () => {
    expect(copyFileQuery({ from: 'ACC-0001', to: 'ACC-0040', kind: 'spine' })).toBe('from=ACC-0001&to=ACC-0040&kind=spine');
    expect(copyFileQuery({ from: '<script>', since: '2026-10-01' })).toBe('since=2026-10-01');
    expect(libraryFilePath('library-po', ID, new URLSearchParams())).toBe(`/v1/library/purchase-orders/${ID}/pdf`);
    expect(libraryFilePath('library-po', 'nope', new URLSearchParams())).toBeNull();
    expect(libraryFilePath('copy-labels', 'x', new URLSearchParams('from=ACC-0001&labels=barcode'))).toBe('/v1/library/copies/labels.pdf?from=ACC-0001&kind=barcode');
    expect(libraryFilePath('rfid-list', 'x', new URLSearchParams())).toBe('/v1/library/copies/rfid.csv');
    expect(libraryFilePath('other', ID, new URLSearchParams())).toBeNull();
  });
});

describe('OPAC state', () => {
  it('reads the URL, dropping malformed facet values', () => {
    const s = opacState({ q: '  accounting ', field: 'author', sort: 'bogus', page: '3', subject: 'Commerce', decade: '19x0', branch: 'not-a-uuid', available: 'true' });
    expect(s).toEqual({ q: 'accounting', field: 'author', sort: 'title', available: true, page: 3, facets: { subject: 'Commerce' } });
    expect(opacApiQuery(s)).toBe('q=accounting&field=author&available=true&page=3&subject=Commerce');
  });

  it('links a facet on and off and goes back to the first page', () => {
    const s = opacState({ q: 'tax', page: '4', material: 'book' });
    expect(opacHref(s, { facets: { language: 'Kannada' } })).toBe('/library/opac?q=tax&material=book&language=Kannada');
    expect(opacHref(s, { facets: { material: '' } })).toBe('/library/opac?q=tax');
    expect(opacHref(s, { page: 5 })).toBe('/library/opac?q=tax&page=5&material=book');
  });
});

describe('kiosk and record lists', () => {
  it('takes up to ten clean tags from a reader', () => {
    expect(kioskTags('ACC-0001\nACC-0002, ACC-0001 ;<b>')).toEqual(['ACC-0001', 'ACC-0002']);
    expect(kioskTags(Array.from({ length: 14 }, (_, i) => `T${i}`).join(' '))).toHaveLength(10);
  });

  it('shows the new library lists and asks for their action inputs', () => {
    const lists = LHT_GROUPS.library.flatMap((g) => g.entities);
    for (const e of ['library-circ-rules', 'library-vendors', 'library-purchase-orders', 'library-invoices', 'library-binding', 'library-eresource-usage']) expect(lists).toContain(e);
    expect(PARAM_ACTIONS['library-invoices'].paid.find((f) => f.name === 'paymentRef')?.required).toBe(true);
    expect(sourcesFor('library-acquisitions')).toEqual(expect.arrayContaining(['orders', 'branches']));
  });
});
