# AgentFlow Stage 3 Setup

Stage 3 adds automated lead-facing follow-up emails after a lead is qualified, saved to HubSpot, and routed by status.

## Required Stack

- Landing Page
- Netlify
- HubSpot
- Calendly
- Resend

## Netlify Environment Variables

Stage 3 uses the existing Resend variables:

```text
RESEND_API_KEY=your_resend_api_key
LEAD_NOTIFICATION_FROM=AgentFlow <verified_sender@example.com>
LEAD_NOTIFICATION_TO=isaiah_receiving_email@example.com
```

`LEAD_NOTIFICATION_FROM` is used as the sender for both AgentFlow team notifications and lead-facing follow-up emails. The sender address must be verified in Resend.

No new environment variables are required for Stage 3.

## Email Behavior

Hot leads:

- Receive an immediate follow-up email.
- Email includes the Calendly scheduling link.
- Frontend still redirects to Calendly.

Warm leads:

- Receive an immediate follow-up email.
- Email includes Calendly as an optional next step.
- Frontend still shows the Calendly option without forcing a redirect.

Cold leads:

- Receive an immediate nurture email.
- Email does not push a forced Calendly scheduling step.
- Frontend still shows the nurture response without forced scheduling.

## Failure Behavior

Lead-facing follow-up email failures are non-blocking.

If a lead-facing email fails:

- HubSpot contact creation/update still succeeds if HubSpot is available.
- AgentFlow team notification still attempts to send independently.
- Calendly routing still works.
- The frontend still receives a success response.
- The response includes:

```text
leadFollowUpSent
leadFollowUpWarning
```

Team notification failures remain separate and are reported with:

```text
notificationSent
notificationWarning
```

## Manual Test Checklist

Hot lead:

1. Submit a lead with enough buyer or seller score to reach `Hot`.
2. Confirm the HubSpot contact is created or updated.
3. Confirm the AgentFlow team notification arrives.
4. Confirm the lead-facing email arrives with the Calendly link.
5. Confirm the frontend redirects to Calendly.

Warm lead:

1. Submit a lead with score `45-74`.
2. Confirm the HubSpot contact is created or updated.
3. Confirm the AgentFlow team notification arrives.
4. Confirm the lead-facing email arrives with an optional Calendly link.
5. Confirm the frontend shows the Calendly option without forcing a redirect.

Cold lead:

1. Submit a lead with score `0-44`.
2. Confirm the HubSpot contact is created or updated.
3. Confirm the AgentFlow team notification arrives.
4. Confirm the lead-facing nurture email arrives.
5. Confirm the frontend does not force Calendly scheduling.

Email failure:

1. Temporarily break the Resend API key or sender value.
2. Submit a test lead.
3. Confirm HubSpot still saves the lead.
4. Confirm the frontend still returns the correct Hot/Warm/Cold routing behavior.
5. Check Netlify Function logs for lead follow-up or notification warnings.

## Optional HubSpot Tracking Properties

Stage 3 does not require new HubSpot properties.

If follow-up tracking is needed later, create:

```text
agentflow_follow_up_email_sent
agentflow_follow_up_email_type
agentflow_follow_up_email_warning
```

Suggested field types:

```text
agentflow_follow_up_email_sent: single checkbox or single-line text
agentflow_follow_up_email_type: dropdown or single-line text
agentflow_follow_up_email_warning: multi-line text
```

## Syntax Checks

Run:

```bash
node --check netlify/functions/submit-lead.js
node --check landing-page/script.js
```
