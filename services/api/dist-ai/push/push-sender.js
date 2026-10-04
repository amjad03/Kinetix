import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Logger } from '@nestjs/common';
/** Delivers pushes to phones. */
export class PushSender {
}
/** No push provider configured: notifications still appear in the apps' inboxes. */
export class NoPushSender extends PushSender {
    constructor() {
        super(...arguments);
        this.configured = false;
    }
    async send(messages) {
        return messages.map(() => 'failed');
    }
}
/**
 * Firebase Cloud Messaging (HTTP v1). Android and iOS can only be woken through their
 * platform push services, so this is the one hop outside India; it carries ids only.
 */
export class FcmPushSender extends PushSender {
    constructor(serviceAccount) {
        super();
        this.configured = true;
        this.log = new Logger(FcmPushSender.name);
        const json = serviceAccount.trim().startsWith('{') ? serviceAccount : readFileSync(serviceAccount, 'utf8');
        this.account = JSON.parse(json);
    }
    async send(messages) {
        const auth = await this.accessToken();
        const url = `https://fcm.googleapis.com/v1/projects/${this.account.project_id}/messages:send`;
        return Promise.all(messages.map(async (m) => {
            const res = await fetch(url, {
                method: 'POST',
                headers: { authorization: `Bearer ${auth}`, 'content-type': 'application/json' },
                body: JSON.stringify({
                    message: {
                        token: m.token,
                        notification: { title: m.title, body: m.body },
                        data: m.data,
                        android: { priority: 'high', notification: { channel_id: 'kinetix_updates' } },
                        apns: { payload: { aps: { sound: 'default' } } },
                    },
                }),
            }).catch(() => null);
            if (!res)
                return 'failed';
            if (res.ok)
                return 'sent';
            const text = await res.text();
            if (res.status === 404 || text.includes('UNREGISTERED') || text.includes('INVALID_ARGUMENT'))
                return 'invalid-token';
            this.log.warn(`FCM ${res.status}: ${text.slice(0, 200)}`);
            return 'failed';
        }));
    }
    /** OAuth access token from the service account (a signed JWT exchanged at Google). */
    async accessToken() {
        if (this.token && this.token.expires > Date.now() + 60_000)
            return this.token.value;
        const now = Math.floor(Date.now() / 1000);
        const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
        const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
            iss: this.account.client_email,
            scope: 'https://www.googleapis.com/auth/firebase.messaging',
            aud: 'https://oauth2.googleapis.com/token',
            iat: now,
            exp: now + 3600,
        })}`;
        const signature = createSign('RSA-SHA256').update(unsigned).sign(this.account.private_key).toString('base64url');
        const res = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
        });
        if (!res.ok)
            throw new Error(`FCM auth failed: ${res.status}`);
        const body = (await res.json());
        this.token = { value: body.access_token, expires: Date.now() + body.expires_in * 1000 };
        return body.access_token;
    }
}
//# sourceMappingURL=push-sender.js.map