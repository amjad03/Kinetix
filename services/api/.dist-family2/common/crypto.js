import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
export function hmac(secret, value) {
    return createHmac('sha256', secret).update(value).digest('base64url');
}
export function safeEqual(a, b) {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    return ab.length === bb.length && timingSafeEqual(ab, bb);
}
export function randomDigits(length) {
    let out = '';
    for (let i = 0; i < length; i++)
        out += randomInt(0, 10).toString();
    return out;
}
export function randomToken(bytes = 16) {
    return randomBytes(bytes).toString('base64url');
}
/** Human-friendly enrolment code without ambiguous characters, e.g. "KX-7HQM-3RTP". */
export function enrollmentCode() {
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const group = () => Array.from({ length: 4 }, () => alphabet[randomInt(0, alphabet.length)]).join('');
    return `KX-${group()}-${group()}`;
}
//# sourceMappingURL=crypto.js.map