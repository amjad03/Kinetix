# Communication: user guide

For the principal and administrators, heads of department, the accounts office, teachers, families and students.
API in `services/api/src/comms`, `src/announcements`, `src/messages`; the completeness audit is
`docs/requirements/COMMUNICATION_COMPLETENESS.md`; screenshots in `docs/demo/screens/communication/`. Demo logins:
`principal`, `accounts`, `hod.commerce`, `deepa.nair`, `parent.bcom` (with `@soundarya.demo.zynetix.in` and the demo
password).

## Who sees what

- **Principal and administrators**: everything below, including channels, credits, the consent register, chat
  moderation and emergencies.
- **Head of department**: notices and campaigns to their own department, its programmes and classes, picked people
  and their own saved lists; they see their own and their department's messages, sends and costs. They cannot send
  to the whole institution, a whole role, a hostel or a bus route, and cannot send an emergency.
- **Accounts office**: Communication → Message credits (balances, top-ups, corrections, the ledger) and the cost report.
- **Teachers**: notices and family chat in the Teacher App, with do-not-disturb.
- **Families and students**: notices (in their language, with polls), chat, RSVPs and their own channel choices in the
  apps.

## Notices (Communication → Messages)

1. **Channels**: boards (the smart-board notice board), the Teacher, Student and Parent apps.
2. **Send to**: everyone; whole **roles** (all parents, all teachers, the accounts office…); departments; programmes;
   classes; **hostels** (residents, their parents and the wardens); **bus routes** (riders, their parents, staff
   riders); **saved lists** from the communication engine; or picked people. The composer shows how many people each
   app reaches before you send.
3. **Also in Hindi and Kannada**: write the title and message in either language; every reader gets the language they
   chose in their app, everyone else the English. Phone alerts use the reader's language too.
4. **Quick poll**: a question with two to six choices, an optional closing time, and whether readers see the results
   after answering. The notice's detail shows the tally and the share of recipients who answered.
5. **Also by SMS, WhatsApp or email**: pick a registered template (its `{{title}}` and `{{body}}` are filled from the
   notice) and what to try if that channel fails. The detail shows sent, delivered, failed and the cost.
6. **Priority**: normal; important (pinned and pushed until acknowledged or expired); **emergency** (principal and
   administrators only): goes now (it cannot be scheduled), is pushed even when the institution has switched
   announcement alerts off, ignores quiet hours and staff do-not-disturb, is shown on boards as an emergency, and must
   be acknowledged.
7. Schedule, expiry, attachments, read and acknowledgement tracking, reminders to those who have not read, recall,
   duplicate and drafts work as before.

## Channels, credits and the engine (Communication → Communication engine)

- **Templates**: one per key, channel and language. An SMS template needs its **DLT template id** (19 digits), the
  **DLT header** it is registered under and the **content type** (transactional, service implicit or explicit,
  promotional). A WhatsApp template names the **approved WhatsApp template** and its language. Changes to the text or
  the DLT id are kept in History.
- **Campaigns**: a template, a saved audience, optional variables and a send time or repeat; **If that fails, try**
  sets the fallback chain (for example WhatsApp → SMS → email). Each person is worked along the chain: someone who has
  not opted in to WhatsApp gets the SMS; someone who opted out of SMS gets the email; an operator failure reported
  later sends the next channel at the next run.
- **Before every hand-over** the engine checks: the person's choice for the channel (WhatsApp needs an opt-in), the
  do-not-contact list, whether the channel is switched on, the **quiet hours** (Module settings → Communication; the
  message waits until they end), the **hourly and daily caps** (the message waits), and the **credits** (a channel
  with a price is prepaid; without enough credits the message moves to the next channel). An emergency campaign
  ignores quiet hours, caps, credits and opt-outs (DPDP Act s.7: safety and medical emergencies) but never a bounced
  or invalid address, and WhatsApp still needs the opt-in.
- **Channels and credits** tab: each channel's provider (MSG91, Kaleyra or Gupshup for SMS; the WhatsApp Cloud API;
  Amazon SES or the mail relay), the DLT entity id and header, the WhatsApp phone number id, the from-address, the
  price per message, the caps, and the **delivery-report address** to give the provider (it also receives STOP
  replies and SES bounces). Balances per channel with this month's spend; **Add credits** records a top-up with its
  invoice reference, or a correction with a reason.
- **Reports** tab: for any period (IST dates), sent, delivered, read, failed, held back and waited, units and cost by
  channel; cost by the sender's department; notices in the apps by department (reached, opened, read, acknowledged);
  and a day-by-day line. Every table exports to CSV.
- **Send log**: every hand-over and hold-back, with the channel, the fallback step, the masked number or address, the
  provider, the status from the delivery report, units, cost, department and reason; filters, search, CSV and Excel
  export. It is the audit trail of sends: it cannot be deleted (the retention rule clears old entries).

## Consent per channel (Communication → Consent register)

- People choose in the apps (Profile → Privacy → Messages from the school): SMS, WhatsApp, email and phone alerts.
  Notices in the app and emergencies always arrive.
- A **STOP** reply (or बंद, ನಿಲ್ಲಿಸಿ) by SMS or WhatsApp turns that channel off; START turns it back on. An email
  marked as spam stops email.
- The office records a choice made on a signed form or by phone with a note (**Record a choice**). Every choice is
  kept, with the privacy-notice version, as proof.
- Email bounces (SES permanent bounces) put the address on the do-not-contact list automatically.

## Family chat (Communication → Parent messages)

- **Language filter**: abusive words (English and Hindi or Kannada typed in Latin letters) and a teacher giving a
  student a private phone number or email flag the message for review; nothing is blocked.
- **Report**: either side reports a message (abusive, harassment, spam, inappropriate, shares private details,
  something else). Leaders are told.
- **Moderation** tab (principal and administrators): each report with the message, sender and conversation;
  **Dismiss**, **Warn in the thread**, **Remove message** (both sides see "removed"; leaders still see the text) or
  **Stop sender writing** (for 7, 30 or 90 days or until lifted). Every decision is audited.
- **Pause the family's messages**: a teacher stops a family writing to them for a time; the family can still reach
  the office. Leaders see every pause and can lift it.
- **Escalate to head of department**: the family (Parent App → the chat's menu) or the teacher hands the conversation
  to the teacher's head of department (the principal when the teacher is the head); the head can read and answer. A
  family's message to a teacher unanswered for **48 hours** (Settings tab, 0 turns it off) goes to the head
  automatically, once.
- **Do not disturb**: in the ERP (moon button) or the Teacher App (Messages → bed icon), until a time, with a note
  and optional own chat hours. Families are told when to expect a reply; the phone gets no chat alerts.
- **Retention**: Settings → Retention → *Family chat messages* deletes messages older than the days chosen, except
  messages under an open report.

## Events calendar with RSVP (Calendar)

An event can ask for replies: going, maybe or not going, by a closing date, with a venue and a number of places
(guests count). Families answer on the event in the Parent App and can add guests; the list shows the totals, and
**Who is coming** lists every reply with an export.

## Parent-teacher meetings (Parent-teacher meetings)

After the meeting the teacher records whether the family came, the minutes and the agreed action points (**Write
minutes**); the family is told the action points in the Parent App. The **Meeting report** tab shows per teacher the
slots, bookings, attendance, no-shows and minutes written.

## Providers (operators)

Set in the API environment: `COMMS_SMS_PROVIDER` = `msg91`, `kaleyra` or `gupshup` with its credentials;
`WHATSAPP_PROVIDER=meta` with `WHATSAPP_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`; `SES_REGION` with the SES keys (or
`MAIL_WEBHOOK_URL` for a relay); `FCM_SERVICE_ACCOUNT` for phone alerts. The institution's DLT entity id, header and
WhatsApp number id are entered in the ERP. Give each provider the delivery-report address from the Channels tab.
