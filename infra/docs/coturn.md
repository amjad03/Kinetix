# coturn for screen sharing

Screen sharing (WebRTC) sends video straight from the sender to the board. On the school LAN this needs
nothing. Across networks (a student at home is not supported; a phone on mobile data, guest Wi-Fi with
client isolation) it needs STUN, and often TURN. Run coturn in India (same region as the API).

## API settings

| Variable | Meaning |
|---|---|
| `CAST_STUN_URLS` | Comma-separated, e.g. `stun:turn.school.example:3478` |
| `CAST_TURN_URLS` | e.g. `turn:turn.school.example:3478?transport=udp,turns:turn.school.example:5349?transport=tcp` |
| `CAST_TURN_SECRET` | The same value as coturn's `static-auth-secret` |
| `CAST_TURN_TTL_S` | Credential lifetime, default 3600 |

The API hands each sender and board time-limited credentials (`username = expiry:userId`,
`credential = base64(HMAC-SHA1(secret, username))`) when a cast starts. Nothing static is shipped in apps.

## turnserver.conf

```
listening-port=3478
tls-listening-port=5349
fingerprint
use-auth-secret
static-auth-secret=<same as CAST_TURN_SECRET>
realm=turn.school.example
cert=/etc/letsencrypt/live/turn.school.example/fullchain.pem
pkey=/etc/letsencrypt/live/turn.school.example/privkey.pem
no-multicast-peers
no-cli
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
min-port=49160
max-port=49200
```

If the relay must reach boards on a private network, remove the matching `denied-peer-ip` line for that range
only. Open UDP/TCP 3478, TCP 5349 and UDP 49160-49200 on the host. Keep the relay off the public internet
list of open resolvers: it only accepts credentials the API issued.

## Check

`turnutils_uclient -u <username> -w <credential> turn.school.example` with a credential from the API, or the
Trickle ICE page with the same values: a `relay` candidate means TURN works.
