# Notifications and availability

## Using the app

Open **Notifications** to send fee reminders to active students who have not paid for the current month. Each student receives their own fee, plan and seat details. You can also send a reminder from an individual unpaid student's row.

Write an announcement or alert and use its **Send to all** button. Both target all active students, including students who have already paid. **Save draft** keeps the message on the library server so you can return to it later. Only owners can send or edit broadcasts.

The current demo workspace labels these buttons **Simulate**. Demo actions record results without contacting any student's number. They exercise the same recipient selection and duplicate protection as live requests. Preview and Copy never send messages.

Identical announcements/alerts and fee reminders are limited to once per student per calendar day in India Standard Time. Repeated clicks and request retries do not send duplicates. Notification history distinguishes simulated, queued, sending, accepted, failed, skipped and unknown results. Accepted means the provider accepted the request; it does not confirm delivery. Check Twilio's console for delivery or read status. Failed or uncertain attempts are not automatically retried: verify the provider record before sending again on a later day.

## Connect WhatsApp through Twilio

1. Set up a Twilio account and approved WhatsApp sender. Obtain opt-in from the students receiving your messages, as required by your provider.
2. Create and obtain approval for fee, announcement and alert Content templates. The adapter sends three variables: `{{1}}` = student name, `{{2}}` = library name, `{{3}}` = the message. Example template wording: `Hello {{1}}, a fee reminder from {{2}}: {{3}}. Contact the library if you need help.` Use announcement/alert-specific wording for the other templates. Approval and acceptable variable content are determined by WhatsApp; template approval must be completed before live use. Variable whitespace is normalized to a single space.
3. In the local `.env` file, fill the following values without committing secrets:

   ```dotenv
   NOTIFICATIONS_ENABLED=true
   NOTIFICATION_CHANNEL=whatsapp
   TWILIO_ACCOUNT_SID=AC...
   TWILIO_AUTH_TOKEN=...
   TWILIO_FROM=+...
   TWILIO_FEE_TEMPLATE_SID=HX...
   TWILIO_ANNOUNCEMENT_TEMPLATE_SID=HX...
   TWILIO_ALERT_TEMPLATE_SID=HX...
   ```

   `TWILIO_FROM` is your registered sender with its country code, without a `whatsapp:` prefix. Student phones are saved as Indian 10-digit numbers and sent with `+91`. Credentials are used only by the backend.
4. Restart the API. For actual students, use a real workspace (`DEMO_MODE=false`) with a **new** database path as explained in [deployment](DEPLOYMENT.md). The existing demo database, including your edits, is preserved separately. Live messages are never sent from a demo workspace even when credentials are configured.
5. Validate your sender and templates with your own registered test recipient before adding the real student contacts. The assistant's automated tests use a simulated provider; no live messages were sent during implementation.

For SMS, set `NOTIFICATION_CHANNEL=sms` and configure an SMS-capable sender in `TWILIO_FROM`; WhatsApp Content IDs are not used. Your account must be enabled for the destination country and meet the provider's sender/template requirements. Provider fees and account setup are separate from the website.

The server stores each recipient in SQLite before sending. It resumes queued work on restart. An interrupted in-flight request becomes **unknown**, to avoid sending duplicates when the provider may have accepted a request before the connection failed. Use a single server instance, as required by the app's SQLite deployment. The full SQLite backup and the Settings JSON snapshot include notification history and drafts.

Sources: [Twilio Messages API](https://www.twilio.com/docs/messaging/api/message-resource), [WhatsApp templates and messaging window](https://www.twilio.com/docs/api/errors/63016), [message status meanings](https://www.twilio.com/docs/messaging/guides/outbound-message-status-in-status-callbacks).

## Library and student availability

**Timings & Plans → Edit opening hours** sets weekday and Sunday opening/closing times, including a closed-day option. The same configuration is editable in Settings. Same-day opening intervals are supported; overnight opening is not supported.

Use **Student Study Hours → Edit hours** to change a student's start time and daily duration in half-hour steps. A blank duration follows the membership plan. A custom duration may be shorter than, but never longer than, the plan. The end time is calculated automatically and may not go past midnight. Student profiles and the selected seat show the study window, and overtime uses the student's configured daily duration.

The availability date/time controls show opening status and scheduled student counts. This is a schedule estimate, not live attendance. Assigned seats remain reserved outside study windows; hourly seat sharing is not implemented. Study windows outside opening times are highlighted for review rather than silently changed. All times use India Standard Time.
