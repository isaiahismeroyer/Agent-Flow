# AgentFlow Stage 5 SMS Setup

Stage 5.2 adds automatic lead-facing SMS follow-up after a lead is qualified, saved to HubSpot, emailed, and routed by status.

## Required Stack

- Landing Page
- Netlify
- HubSpot
- Calendly
- Resend
- Twilio

## Netlify Environment Variables

Stage 5.2 uses these Twilio variables:

```text
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=your_twilio_phone_number
```

The Twilio phone number should be the claimed sending number in E.164 format, such as `+15551234567`.

## SMS Behavior

Hot leads:

- Receive an immediate SMS follow-up.
- SMS includes the Calendly scheduling link.
- Frontend still redirects to Calendly.

Warm leads:

- Receive an immediate SMS follow-up.
- SMS includes Calendly as an optional next step.
- Frontend still shows the Calendly option without forcing a redirect.

Cold leads:

- Receive an immediate nurture SMS.
- SMS does not push a forced Calendly scheduling step.
- Frontend still shows the nurture response without forced scheduling.

Review Needed leads:

- Receive the warm-style SMS with Calendly as an optional next step.
- Frontend still shows the manual review routing message.

## Failure Behavior

SMS sending is asynchronous and non-blocking.

If Twilio fails or takes several seconds:

- HubSpot contact creation/update still succeeds if HubSpot is available.
- AgentFlow team notification still attempts to send independently.
- Lead-facing email still attempts to send independently.
- Calendly routing still works.
- The frontend still receives the normal success response.
- SMS failures are logged in Netlify Function logs only.

The response includes:

```text
smsSent
smsWarning
```

`smsSent` means the SMS send was triggered asynchronously. It does not confirm final Twilio delivery.

## Twilio Trial Limitation

Twilio trial accounts can usually only send SMS messages to verified recipient phone numbers.

For real US customer messaging, AgentFlow will need A2P 10DLC registration before production SMS outreach at normal scale.

## Manual Test Checklist

Hot lead:

1. Submit a lead with enough buyer or seller score to reach `Hot`.
2. Confirm the HubSpot contact is created or updated.
3. Confirm the AgentFlow team notification arrives.
4. Confirm the lead-facing email arrives with the Calendly link.
5. Confirm the frontend redirects to Calendly.
6. Confirm the lead receives an SMS with the Calendly link, or check Netlify logs for a Twilio trial/verification warning.

Warm lead:

1. Submit a lead with score `45-74`.
2. Confirm the HubSpot contact is created or updated.
3. Confirm the AgentFlow team notification arrives.
4. Confirm the lead-facing email arrives with an optional Calendly link.
5. Confirm the frontend shows the Calendly option without forcing a redirect.
6. Confirm the lead receives an SMS with the optional Calendly link, or check Netlify logs for a Twilio trial/verification warning.

Cold lead:

1. Submit a lead with score `0-44`.
2. Confirm the HubSpot contact is created or updated.
3. Confirm the AgentFlow team notification arrives.
4. Confirm the lead-facing nurture email arrives.
5. Confirm the frontend does not force Calendly scheduling.
6. Confirm the lead receives a softer nurture SMS without a forced Calendly push, or check Netlify logs for a Twilio trial/verification warning.

SMS failure:

1. Temporarily remove or break one Twilio environment variable.
2. Submit a test lead.
3. Confirm HubSpot still saves the lead.
4. Confirm emails still attempt independently.
5. Confirm the frontend still returns the correct Hot/Warm/Cold routing behavior.
6. Check Netlify Function logs for the SMS warning.

## Syntax Checks

Run:

```bash
node --check netlify/functions/submit-lead.js
```
