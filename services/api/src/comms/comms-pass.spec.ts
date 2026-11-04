import { describe, expect, it } from 'vitest';
import { inLanguage, pollResults } from '../announcements/announcements.logic.js';
import { moderationFlag, overdueForEscalation } from '../messages/chat-rules.js';
import { sigV4 } from './channels.js';
import { channelChain, isStartWord, isStopWord, maskAddress, quietUntil, reportStatus, smsUnits, waParams } from './comms.logic.js';
import { startOfLocalDay } from './comms.service.js';
import { isSnsUrl, parseSes, parseSms, parseWhatsApp } from './webhooks.js';

describe('communication pass rules', () => {
  it('counts SMS parts the way operators bill them', () => {
    expect(smsUnits('a'.repeat(160))).toBe(1);
    expect(smsUnits('a'.repeat(161))).toBe(2); // 153 per part once it is long
    expect(smsUnits('a'.repeat(306))).toBe(2);
    expect(smsUnits('a'.repeat(307))).toBe(3);
    expect(smsUnits('€'.repeat(80))).toBe(1); // extension characters count twice: 160
    expect(smsUnits('€'.repeat(81))).toBe(2);
    expect(smsUnits('ನಾಳೆ ರಜೆ')).toBe(1); // Kannada is Unicode: 70 in one part
    expect(smsUnits('ಅ'.repeat(70))).toBe(1);
    expect(smsUnits('ಅ'.repeat(71))).toBe(2); // then 67 per part
    expect(smsUnits('ಅ'.repeat(135))).toBe(3);
  });

  it('builds the fallback chain without repeats', () => {
    expect(channelChain('whatsapp', ['sms', 'whatsapp', 'email'])).toEqual(['whatsapp', 'sms', 'email']);
    expect(channelChain('sms', [])).toEqual(['sms']);
  });

  it('waits out the quiet hours in the institution time zone, across midnight', () => {
    // 22:00 IST = 16:30 UTC; quiet 21-7 ends 07:00 IST = 01:30 UTC the next day.
    expect(quietUntil(new Date('2026-11-09T16:30:00Z'), 'Asia/Kolkata', 21, 7)?.toISOString()).toBe('2026-11-10T01:30:00.000Z');
    // 06:15 IST waits 45 minutes.
    expect(quietUntil(new Date('2026-11-10T00:45:00Z'), 'Asia/Kolkata', 21, 7)?.toISOString()).toBe('2026-11-10T01:30:00.000Z');
    expect(quietUntil(new Date('2026-11-10T04:30:00Z'), 'Asia/Kolkata', 21, 7)).toBeNull(); // 10:00 IST
    expect(quietUntil(new Date('2026-11-10T04:30:00Z'), 'Asia/Kolkata', 9, 9)).toBeNull(); // no window
    expect(quietUntil(new Date('2026-11-10T07:30:00Z'), 'Asia/Kolkata', 13, 14)?.toISOString()).toBe('2026-11-10T08:30:00.000Z'); // 13:00-14:00
    expect(startOfLocalDay(new Date('2026-11-10T04:30:00Z'), 'Asia/Kolkata').toISOString()).toBe('2026-11-09T18:30:00.000Z');
  });

  it('reads delivery reports from each provider and masks addresses', () => {
    expect(reportStatus('DELIVRD')).toBe('delivered');
    expect(reportStatus('1')).toBe('delivered');
    expect(reportStatus('16')).toBe('failed');
    expect(reportStatus('read')).toBe('read');
    expect(reportStatus('queued')).toBeNull();
    expect(maskAddress('+919845012345')).toBe('+91******2345');
    expect(maskAddress('ravi.kumar@college.in')).toBe('ra***@college.in');
    expect(parseSms('msg91', { data: [{ requestId: 'r1', report: [{ number: '91984', status: '1' }, { status: '2', desc: 'Absent subscriber' }] }] })).toEqual([
      { kind: 'report', messageId: 'r1', status: 'delivered', error: undefined, key: 'r1:delivered' },
      { kind: 'report', messageId: 'r1', status: 'failed', error: 'Absent subscriber', key: 'r1:failed' },
    ]);
    expect(parseSms('kaleyra', { message_id: 'k1', status: 'UNDELIV', description: 'DND' })[0]).toMatchObject({ messageId: 'k1', status: 'failed', error: 'DND' });
    expect(parseSms('gupshup', [{ externalId: 'g1', status: 'SUCCESS' }, { mobile: '919800000001', msg: 'STOP', msgid: 'm9' }])).toMatchObject([{ messageId: 'g1', status: 'delivered' }, { kind: 'reply', from: '919800000001', text: 'STOP', key: 'reply:m9' }]);
    const wa = parseWhatsApp({ entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.1', status: 'read' }], messages: [{ id: 'wamid.2', from: '919800000002', text: { body: 'Thank you' } }] } }] }] });
    expect(wa).toMatchObject([{ kind: 'report', messageId: 'wamid.1', status: 'read' }, { kind: 'reply', from: '919800000002', text: 'Thank you' }]);
  });

  it('turns SES bounces, complaints and the SNS handshake into events', () => {
    const bounce = JSON.stringify({ Type: 'Notification', MessageId: 'sns-1', Message: JSON.stringify({ notificationType: 'Bounce', mail: { messageId: 'ses-9' }, bounce: { bounceType: 'Permanent', bouncedRecipients: [{ emailAddress: 'Ravi@College.in', diagnosticCode: '550 no such user' }] } }) });
    expect(parseSes(bounce)).toEqual([
      { kind: 'bounce', email: 'ravi@college.in', permanent: true, messageId: 'ses-9', reason: '550 no such user', key: 'sns-1:0' },
      { kind: 'report', messageId: 'ses-9', status: 'bounced', error: 'Bounced', key: 'ses-9:bounced' },
    ]);
    expect(parseSes({ Type: 'Notification', MessageId: 's2', Message: JSON.stringify({ notificationType: 'Complaint', mail: { messageId: 'ses-1' }, complaint: { complainedRecipients: [{ emailAddress: 'a@b.in' }] } }) })).toMatchObject([{ kind: 'complaint', email: 'a@b.in' }]);
    expect(parseSes({ Type: 'SubscriptionConfirmation', MessageId: 's3', SubscribeURL: 'https://sns.ap-south-1.amazonaws.com/?Action=ConfirmSubscription' })).toMatchObject([{ kind: 'subscribe' }]);
    expect(isSnsUrl('https://sns.ap-south-1.amazonaws.com/?Action=Confirm')).toBe(true);
    expect(isSnsUrl('https://evil.example.com/sns.ap-south-1.amazonaws.com')).toBe(false);
    expect(isSnsUrl('http://sns.ap-south-1.amazonaws.com/')).toBe(false);
  });

  it('signs SES requests with AWS Signature Version 4', () => {
    const h = sigV4({ method: 'POST', host: 'email.ap-south-1.amazonaws.com', path: '/v2/email/outbound-emails', body: '{}', region: 'ap-south-1', service: 'ses', accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY', at: new Date('2026-11-09T10:00:00Z') });
    expect(h['x-amz-date']).toBe('20261109T100000Z');
    expect(h['x-amz-content-sha256']).toBe('44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a');
    expect(h.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20261109\/ap-south-1\/ses\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
    // The same request signs the same way.
    expect(sigV4({ method: 'POST', host: 'email.ap-south-1.amazonaws.com', path: '/v2/email/outbound-emails', body: '{}', region: 'ap-south-1', service: 'ses', accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY', at: new Date('2026-11-09T10:00:00Z') }).authorization).toBe(h.authorization);
  });

  it('honours STOP and START replies in English, Hindi and Kannada', () => {
    for (const w of ['STOP', 'stop.', ' Unsubscribe ', 'बंद', 'ನಿಲ್ಲಿಸಿ']) expect(isStopWord(w)).toBe(true);
    for (const w of ['Please stop sending homework late', 'stopwatch']) expect(isStopWord(w)).toBe(false);
    expect(isStartWord('START')).toBe(true);
    expect(waParams('Fee of {{amount}} for {{name}} is due. {{amount}}', { name: 'Asha', amount: '₹500' })).toEqual(['₹500', 'Asha']);
  });

  it('flags abusive language and private contacts given to students, and knows when to escalate', () => {
    expect(moderationFlag('You are an IDIOT', false)).toBe('abusive_language');
    expect(moderationFlag('Ye kya bewakoof baat hai', false)).toBe('abusive_language');
    expect(moderationFlag('Class notes are attached', false)).toBeNull();
    expect(moderationFlag('Call me on 98450 12345', true)).toBe('private_contact');
    expect(moderationFlag('Call me on 98450 12345', false)).toBeNull(); // between adults it is fine
    expect(moderationFlag('Mail me at deepa@gmail.com', true)).toBe('private_contact');
    expect(moderationFlag('Roll number 2025001234 is right', true)).toBeNull();
    const at = new Date('2026-11-09T10:00:00Z');
    expect(overdueForEscalation(at, null, new Date(at.getTime() + 48 * 3600_000), 48)).toBe(true);
    expect(overdueForEscalation(at, null, new Date(at.getTime() + 47 * 3600_000), 48)).toBe(false);
    expect(overdueForEscalation(at, new Date(at.getTime() + 60_000), new Date(at.getTime() + 72 * 3600_000), 48)).toBe(false);
    expect(overdueForEscalation(at, null, new Date(at.getTime() + 99 * 3600_000), 0)).toBe(false);
  });

  it('gives each reader their language and tallies a poll', () => {
    const a = { title: 'Holiday', body: 'Closed on Friday', translations: { kn: { title: 'ರಜೆ', body: 'ಶುಕ್ರವಾರ ರಜೆ' } } };
    expect(inLanguage(a, 'kn')).toEqual({ title: 'ರಜೆ', body: 'ಶುಕ್ರವಾರ ರಜೆ', language: 'kn' });
    expect(inLanguage(a, 'hi')).toEqual({ title: 'Holiday', body: 'Closed on Friday', language: 'en' });
    expect(pollResults(['Yes', 'No', 'Not sure'], [0, 0, 1])).toEqual([
      { option: 'Yes', votes: 2, pct: 66 },
      { option: 'No', votes: 1, pct: 33 },
      { option: 'Not sure', votes: 0, pct: 0 },
    ]);
  });
});
