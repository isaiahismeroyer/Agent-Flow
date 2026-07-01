# AgentFlow Stage 5.3 Command Center

Stage 5.3 adds an internal Command Center for lead activity, automation status, search, filters, and expandable lead details.

## What It Shows

The Command Center is available at:

```text
landing-page/dashboard.html
```

It shows:

- Overview stats for stored lead activity.
- Latest automation timeline.
- Searchable lead history.
- Filters for status and failures.
- Expandable details for each lead.

## Browser Storage

Lead activity is stored in browser `localStorage` after a successful form submission.

Storage key:

```text
agentflowLeadActivity
```

Only the latest 100 submissions are kept. Newest records appear first.

Stored records include:

- Full name
- Email
- Phone
- Lead type
- Lead score
- Qualification status
- Submitted timestamp
- HubSpot status
- Agent email status
- Lead email status
- SMS status
- Calendly routing status
- Warnings and errors
- Twilio status code
- Twilio error code
- Twilio error message
- Twilio message SID when available

## Demo Mode

If the current browser has no stored submissions, the Command Center shows demo data for Sarah Johnson:

- Lead Type: Buyer/Seller
- Score: Hot 91
- Budget: $700k
- Timeline: 60 days
- Next Action: Schedule Consultation
- HubSpot updated
- Agent email sent
- Lead email sent
- SMS sent
- Calendly booked

## Search And Filters

Search matches:

- Name
- Email
- Phone

Filters:

- All
- Hot
- Warm
- Cold
- Booked
- Not Booked
- Email Failed
- SMS Failed

## Backend Logging

The Netlify function logs major automation events:

- Lead received
- Qualification complete
- HubSpot contact saved or failed
- Agent notification email sent or failed
- Lead follow-up email sent or failed
- SMS triggered
- Twilio SMS sent or failed
- Calendly routing completed

Twilio success logs include:

- Message SID
- Message status
- HTTP status

Twilio failure logs include:

- HTTP status
- Error code
- Error message

## Known Limitations

The Command Center is browser-local. It does not show submissions from other devices or browsers.

Clearing browser storage removes the local history.

SMS remains asynchronous and non-blocking. Because the frontend response returns before Twilio finishes, final Twilio SID or error details may appear only in Netlify Function logs for live submissions.

For a shared team dashboard later, AgentFlow will need persistent storage such as a database, HubSpot activity records, or a logging/event table.

## Syntax Checks

Run:

```bash
node --check netlify/functions/submit-lead.js
node --check landing-page/script.js
```
