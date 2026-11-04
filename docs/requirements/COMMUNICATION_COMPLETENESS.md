# Communication: completeness against Linways, Camu, school and college communication tools and the checklist (section 16)

Audit of `docs/research/MODULE_DEPTH_CHECKLIST.md` section 16, `COMMUNICATION_NOTIFICATION_DETAILED_SPEC.md`, the
communication pass brief, and the rules that apply to an Indian institution messaging families: TRAI's Telecom
Commercial Communications Customer Preference Regulations (DLT: a registered principal entity, headers and content
templates, content types, promotional text not to numbers on DND), WhatsApp Business policy (approved templates, opt-in,
honouring STOP), the DPDP Act 2023 (consent per purpose, withdrawal as easy as giving it, records of consent; s.7
legitimate uses for medical emergencies and disasters) and email sender practice (stop mailing hard bounces and
complaints). Peers checked: Linways (Communications, Messagebox), Camu (notices with acknowledgement, parent app, SMS
and email), and dedicated tools (circulars with read receipts and translations, polls, event RSVPs, PTM booking, chat
moderation and office hours, fallback chains with delivery and cost reports).

Checked in code and against the Soundarya seed: API calls on a seeded database (port 4350; the probe of the starting
point is in the pass notes), the ERP (port 3350) driven by Playwright at 1280px and 390px as the principal, a head of
department and the accountant (`apps/erp/scripts/comms-qa.mjs`: 19 pages × 2 widths load with no error state, no
sideways scroll and no console errors), and widget tests in the Parent, Student and Teacher apps.

**Before** is commit `35214ce` (the branch when this pass started). Status words: **Done** (built and tested before),
**Built** (missing before, built now), **Deepened** (partial before, gaps closed now), **Fixed** (broken before).
Migrations: `0212_comms_channels_compliance`, `0213_comms_engagement_safety`.

## Notices and circulars

| Item | Before | After | Evidence |
| --- | --- | --- | --- |
| Notices to everyone, departments, programmes, classes and picked people, to boards and the three apps | Done | Done | `announcements.service.ts` `resolve`; e2e `communication` |
| Notices to whole roles (all parents, teachers, an office) | Missing | Built | audience `roles`; e2e `communication-pass` "sends notices to whole roles…" (parents 2, teachers and heads 3) |
| Notices to hostel residents (and wardens) and bus-route riders | Missing | Built | audience `hostels`, `routes`; same e2e (the father of the hostel resident; the mother of the rider) |
| Notices to saved custom lists | Missing (lists existed only in the engine) | Built | audience `lists` → `audienceUsers`; same e2e |
| Scheduling, expiry, attachments, drafts, recall, duplicate, reminders | Done | Done | e2e `communication` |
| Read receipts and acknowledgement per person and app | Done | Done | `announcement_recipients`; e2e `communication` |
| Translations (en/hi/kn), each reader in their language | Missing | Built | 0213 `announcements.translations`; `inLanguage`; inbox `language`; e2e "…in their language…" (Kannada reader gets the Kannada title); ERP composer "Also in Hindi and Kannada" |
| Staff circulars with acknowledgement tracking | Done | Done | seed "Staff meeting: NAAC peer team visit" (ack 70%) |
| Notice board on the smart board | Done | Deepened | boards channel → broadcast; emergency notices reach boards as `emergency` (e2e checks `broadcasts.priority`) |
| Head of department limited to their department | Broken (an HOD could preview and send to the whole institution and read every notice and campaign; probe: preview `{scope: all}` reached 53 teachers and 106 parents) | Fixed | `assertAudience`, `loadFor`, `hodScope`; e2e "a head of department only to their own" (403 for all, roles, others' lists; 404 for the principal's notice) |

## Channels

| Item | Before | After | Evidence |
| --- | --- | --- | --- |
| SMS through DLT-registered templates with the template id | Done | Deepened | template `dltHeader`, `dltContentType`; channel `dltEntityId`, header; sent to the provider with the header and entity id (e2e asserts `header: SIMSBL`, `entityId`) |
| A second SMS provider | Missing (MSG91 only) | Built | `KaleyraTextSender`, `GupshupTextSender` (`COMMS_SMS_PROVIDER`); their delivery reports parsed (`webhooks.ts`, unit tests) |
| WhatsApp Business templates with opt-in | Partial (an unconfigured stub; no opt-in) | Built | `MetaWhatsAppSender` (Cloud API template messages, phone number id per institution); opt-in required even in an emergency; e2e "works each delivery along WhatsApp, SMS and email…" |
| Email over SES/SMTP with bounce handling | Partial (a relay only; no bounces) | Built | `SesMailer` (SES v2, Signature V4, unit-tested), relay kept for SMTP; SNS bounces and complaints → do-not-contact and opt-out; e2e "…stops email to a bounced address…" |
| Push to the apps | Done | Deepened | push respects the person's push opt-out, staff do-not-disturb for chat and the quiet hours (waits until they end); an emergency always rings (`push.service.ts`) |
| Fallback chain | Missing | Built | campaign `fallback`; delivery `step`; a delivery report of failure moves to the next channel at the next run; e2e (WhatsApp → SMS → email for three people; failed WhatsApp → SMS) |
| Per-message cost | Missing | Built | `smsUnits` (GSM-7 160/153, Unicode 70/67; unit-tested), price per channel, cost on deliveries, campaigns and the log; e2e figures 80 + 25 + 0 = 105 paise, then 130 |
| Delivery reports (DLR) from providers, applied once | Missing | Built | `POST /v1/comms/webhooks/:provider/:tenant/:token`; `comm_webhook_events` makes repeats no-ops; e2e (second identical report: `applied: 0`; wrong token or tenant 404) |
| Two-way SMS/WhatsApp replies captured into a conversation | Partial (WhatsApp into staff chat threads only) | Deepened | replies from a parent's number go into their latest open family conversation, staff told; e2e "…by SMS…" |

## Two-way messaging

| Item | Before | After | Evidence |
| --- | --- | --- | --- |
| Teacher–parent and teacher–student chat, office threads, ticks, office hours, close/resolve/mute/assign, safeguarding reads | Done | Done | e2e `communication`, `comms-depth` (verified) |
| Moderation: language filter, reports, leaders' decisions | Missing | Built | `moderationFlag` (abusive words, private contact to a student; unit-tested), `message_reports`, `GET/POST moderation`; ERP Moderation tab; e2e "moderates family chat…" |
| Removed messages | Missing | Built | `messages.hidden_at`; families see "removed", leaders the text and the flag; e2e |
| Block / report | Missing | Built | `chat_blocks` (to one member of staff or everywhere, with an end date), report endpoint; e2e (blocked family 403, lift) |
| Escalation to the head of department | Missing | Built | `ChatSafetyService.escalate`; by the family or the teacher, and hourly after 48 h unanswered (setting); e2e (head reads and replies; 47 h no, 49 h yes, once); Parent App chat menu |
| Office hours / do-not-disturb per member of staff | Partial (institution office hours only) | Built | `chat_availability`; families told `away`; no chat push; ERP moon button, Teacher App sheet; e2e and widget test |
| Retention of chat | Missing | Built | retention target `family_chat` (keeps messages under an open report) and `comm_send_log`; e2e dry run |

## Polls, events, emergencies, PTM

| Item | Before | After | Evidence |
| --- | --- | --- | --- |
| Surveys (course, teacher, infrastructure feedback; anonymity; analysis) | Done | Done | `surveys` module, e2e `surveys-tasks` |
| Polls to families and staff | Partial (classroom answer-card polls only) | Built | notice poll (2–6 choices, closing time, results after answering); `announcement_poll_votes`; e2e (tallies 0/1/1, closed poll 409); Parent, Student and Teacher apps vote (widget tests) |
| Events calendar with RSVP | Missing (campus events took student registrations only) | Built | 0213 `calendar_events.rsvp/rsvp_by/capacity/venue`, `calendar_event_rsvps`; places with guests, closing date; e2e "collects RSVPs…" (capacity 3: 2 + 1 refused, 2 + 1 + maybe); ERP list; Parent App buttons (widget test) |
| Emergency broadcast overriding do-not-disturb | Partial (board-only emergency alerts) | Built | notice priority `emergency` (leaders only, not schedulable, pushed through the institution's switches, pinned, acknowledged) and emergency campaigns (quiet hours, caps, credits, opt-outs ignored); e2e both |
| Parent–teacher meeting slot booking | Done | Deepened | minutes, attendance and action points after the meeting, shared with the family; meeting report per teacher; e2e "records PTM minutes…"; seeded past PTM |
| Scheduled messages and recurring reminders | Done | Done | e2e `comms-depth` |
| Event-driven notifications with per-kind switches | Done | Done | `notificationPrefs` |

## Compliance and controls

| Item | Before | After | Evidence |
| --- | --- | --- | --- |
| DPDP consent and opt-out per channel | Missing (consent per purpose only) | Built | `comm_channel_prefs` (append-only, notice version, source app/erp/reply/import); apps' "Messages from the school"; office records paper forms; register and history (kit list); e2e "keeps the consent register…" |
| STOP replies honoured | Missing | Built | `isStopWord` (en/hi/kn); e2e (mother's STOP → SMS off) |
| Do-not-contact list | Done | Deepened | checked per channel in the chain; DND and opt-out overridden only by an emergency |
| Quiet hours | Partial (only refused scheduling a campaign in them) | Built | sends that fall in them wait until they end (`quietUntil`, unit-tested); e2e (22:00 IST → 07:00 next day) |
| Rate limits per institution | Missing | Built | hourly and daily caps per channel; e2e (cap 1/hour defers the second) |
| Credit balances per institution | Missing | Built | `comm_credit_ledger` (top-ups, spends, corrections; never below zero); out of credits → next channel; e2e; ERP Channels and credits, Message credits page for the accountant |
| Audit trail of every send | Partial (an audit entry per campaign) | Built | `comm_send_log` row per hand-over and hold-back (masked address, provider id, status, units, cost, department, sender); kit list (filters, export, not deletable); e2e |

## Reports

| Item | Before | After | Evidence |
| --- | --- | --- | --- |
| Delivery, read and cost by channel | Partial (counts per campaign) | Built | `GET /v1/comms/reports/summary`; ERP Reports tab; e2e (SMS 125 paise, WhatsApp 80, email 0; ledger spends equal 205) |
| By department | Missing | Built | department of the sender on campaigns, notices and the log; e2e and seed (Commerce, Computer Applications, the office) |
| Notices read by department | Missing | Built | same report, `apps` |
| Survey participation and feedback analysis | Done | Done | surveys results |

## Hardening

| Item | Before | After | Evidence |
| --- | --- | --- | --- |
| Role checks and tenant isolation on new endpoints | n/a | Built | e2e "refuses other roles and other institutions everywhere"; regenerated `AUTHZ_MATRIX.md`, `role-matrix.md` |
| Validation of every body and query | n/a | Built | Zod bodies (DLT ids and headers, WhatsApp names, caps, credits, polls, translations, RSVPs, moderation) |
| Money in integer paise, dates in IST | n/a | Built | `cost_paise`, `amount_paise`; report periods `+05:30`, quiet hours and caps in the institution's time zone |
| Webhooks idempotent and authenticated | n/a | Built | secret per channel in the URL (timing-safe), `comm_webhook_events`; SNS confirmation only on Amazon hosts |
| No PII in logs | Partial | Deepened | the console SMS sender logs the length, not the text; the send log stores masked addresses |
| Paged lists on the server | Partial | Built | send log, ledger, consent register, moderation queue paged; poll tallies and campaign outcomes for a page of notices in a few queries |

## Counts

Items above: 50. Before: Done 14, Partial 11, Missing 20, Broken 1, and 4 hardening items new to this pass. After: all 50 Done, Built, Deepened or Fixed.

Tests: API e2e `communication-pass` 16 (new), unit `comms-pass.spec` 9 (new); regression `communication` 11, `comms-depth` 4,
`chat` 6, `push` 4, `school-diary-ptm` 22, `polls` 6, `rls` 6, `admissions-desk` 15, `admissions-pass` 8, the static scans
548; ERP vitest 498; Parent App 260 (5 new), Student App 371 (2 new), Teacher App 308 (2 new); ERP and API `tsc` clean;
Playwright 38 page checks.

## Not done

- No SMTP client of our own: SMTP stays behind the mail relay (`MAIL_WEBHOOK_URL`); SES is sent directly.
- Live provider calls were not made from the sandbox: MSG91, Kaleyra, Gupshup, Meta and SES adapters are tested by
  their request shapes and the parsers of their callbacks, not against the providers' servers.
- WhatsApp template approval itself happens in Meta's Business Manager; the ERP records the approved name.
