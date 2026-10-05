import { describe, expect, it } from 'vitest';
import { errorText } from '@/i18n/errors';
import { MESSAGES } from '@/i18n/messages';
import { createT } from '@/i18n/translate';
import { changePasswordUrl, emailName, passwordIssue } from './password';

describe('passwordIssue', () => {
  const base = { current: 'Temp-pass-123', next: 'Blue-mango-tree-42', confirm: 'Blue-mango-tree-42', email: 'ravi.kumar@x.in' };

  it('accepts a good new password', () => {
    expect(passwordIssue(base)).toBeNull();
    expect(passwordIssue({ ...base, current: undefined, email: null })).toBeNull();
  });

  it('finds the first problem', () => {
    expect(passwordIssue({ ...base, current: '' })).toBe('missing');
    expect(passwordIssue({ ...base, confirm: '' })).toBe('missing');
    expect(passwordIssue({ ...base, next: 'short', confirm: 'short' })).toBe('tooShort');
    expect(passwordIssue({ ...base, confirm: 'Blue-mango-tree-43' })).toBe('mismatch');
    expect(passwordIssue({ ...base, next: base.current, confirm: base.current, current: base.current })).toBe('unchanged');
    expect(passwordIssue({ ...base, next: 'my-Ravi.Kumar-pw', confirm: 'my-Ravi.Kumar-pw' })).toBe('containsLogin');
  });

  it('ignores very short email names', () => {
    expect(passwordIssue({ ...base, email: 'ra@x.in', next: 'ra-ra-ra-ra-ra', confirm: 'ra-ra-ra-ra-ra' })).toBeNull();
    expect(emailName('office@sjc.in')).toBe('office');
    expect(emailName(null)).toBe('');
  });
});

describe('changePasswordUrl', () => {
  it('keeps a local next path only', () => {
    expect(changePasswordUrl('/timetable?x=1')).toBe('/account/password?next=%2Ftimetable%3Fx%3D1');
    expect(changePasswordUrl('/')).toBe('/account/password');
    expect(changePasswordUrl('//evil.example')).toBe('/account/password');
    expect(changePasswordUrl('https://evil.example')).toBe('/account/password');
    expect(changePasswordUrl(undefined)).toBe('/account/password');
  });
});

describe('password errors from the API', () => {
  it('are worded by code in every language', () => {
    const en = createT('en', MESSAGES.en);
    const hi = createT('hi', MESSAGES.hi);
    expect(errorText({ status: 403, code: 'WRONG_PASSWORD', message: 'Your current password is wrong' }, en)).toBe('Your current password is wrong.');
    expect(errorText({ status: 400, code: 'PASSWORD_TOO_WEAK', message: 'This password is too easy to guess' }, hi)).toBe(MESSAGES.hi['error.PASSWORD_TOO_WEAK']);
    expect(errorText({ status: 403, code: 'PASSWORD_CHANGE_REQUIRED', message: 'x' }, createT('kn', MESSAGES.kn))).toBe(MESSAGES.kn['error.PASSWORD_CHANGE_REQUIRED']);
  });
});
