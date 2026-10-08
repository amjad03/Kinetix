import { describe, expect, it } from 'vitest';
import { canSee, homeFor, sectionOf } from './access';
import { certActions, docDownload, fieldLines, fileSize, parseFieldLines, vaultFileProblem, vaultQuery } from './documents';

describe('documents access', () => {
  it('opens Documents to the office roles only', () => {
    for (const r of ['principal', 'tenant_admin', 'accountant', 'hr_manager']) expect(canSee([r], 'documents')).toBe(true);
    for (const r of ['hod', 'teacher', 'librarian']) expect(canSee([r], 'documents')).toBe(false);
    expect(sectionOf('/documents/vault')).toBe('documents');
    expect(sectionOf('/verify/abc/def')).toBeNull();
    expect(homeFor(['accountant'])).toBe('/');
  });
});

describe('certificate actions', () => {
  it('walks requested → approved → issued → revoked', () => {
    const approver = { approver: true, office: true };
    expect(certActions('requested', approver)).toMatchObject({ approve: true, reject: true, issue: false, pdf: false });
    expect(certActions('approved', approver)).toMatchObject({ approve: false, issue: true, revoke: false });
    expect(certActions('issued', approver)).toMatchObject({ revoke: true, pdf: true, issue: false });
    expect(certActions('revoked', approver)).toMatchObject({ revoke: false, pdf: true });
    expect(certActions('rejected', approver)).toEqual({ approve: false, reject: false, issue: false, revoke: false, pdf: false });
  });
  it('keeps decisions to approvers and issuing to the office', () => {
    expect(certActions('requested', { approver: false, office: true }).approve).toBe(false);
    expect(certActions('approved', { approver: false, office: true }).issue).toBe(true);
    expect(certActions('approved', { approver: false, office: false }).issue).toBe(false);
  });
});

describe('vault uploads', () => {
  it('accepts PDF, JPEG and PNG up to 10 MB', () => {
    expect(vaultFileProblem({ type: 'application/pdf', size: 1000 })).toBeNull();
    expect(vaultFileProblem({ type: 'image/png', size: 10 * 1024 * 1024 })).toBeNull();
    expect(vaultFileProblem({ type: 'image/gif', size: 1000 })).toBe('type');
    expect(vaultFileProblem({ type: 'image/jpeg', size: 10 * 1024 * 1024 + 1 })).toBe('size');
    expect(vaultFileProblem({ type: 'image/jpeg', size: 0 })).toBe('empty');
  });
  it('builds the upload query, leaving out blank details', () => {
    const q = new URLSearchParams(vaultQuery({ ownerType: 'staff', ownerId: 'u1', title: ' Offer letter ', category: 'Offer Letter', visibility: 'owner', expiresOn: '' }));
    expect(Object.fromEntries(q)).toEqual({ ownerType: 'staff', ownerId: 'u1', title: 'Offer letter', category: 'offer_letter', visibility: 'owner' });
    expect(new URLSearchParams(vaultQuery({ ownerType: 'student', ownerId: 's1', title: 'T', category: 'x1', visibility: 'staff', expiresOn: '2027-01-31', replacesId: 'd1' })).get('replacesId')).toBe('d1');
  });
  it('shows sizes', () => {
    expect(fileSize(500)).toBe('1 KB');
    expect(fileSize(2048)).toBe('2 KB');
    expect(fileSize(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});

describe('template fields', () => {
  it('round-trips the editor’s lines', () => {
    const f = parseFieldLines('reasonForLeaving:Reason for leaving:required\nremarks:Remarks');
    expect(f).toEqual([{ key: 'reasonForLeaving', label: 'Reason for leaving', required: true }, { key: 'remarks', label: 'Remarks', required: false }]);
    expect(fieldLines(f!)).toBe('reasonForLeaving:Reason for leaving:required\nremarks:Remarks');
  });
  it('refuses bad keys, missing labels and repeats', () => {
    expect(parseFieldLines('1bad:Label')).toBeNull();
    expect(parseFieldLines('a')).toBeNull();
    expect(parseFieldLines('a:A\na:B')).toBeNull();
    expect(parseFieldLines('')).toEqual([]);
  });
  it('builds download links', () => {
    expect(docDownload.certificate('c1')).toBe('/api/download?kind=certificate&id=c1');
    expect(docDownload.staff).toBe('/api/download?kind=id-staff');
  });
});
