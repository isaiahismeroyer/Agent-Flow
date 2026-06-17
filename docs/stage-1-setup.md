# AgentFlow Stage 1 Setup

Stage 1 lets a realtor submit the AgentFlow demo form, save their information to HubSpot, and redirect to Calendly.

## Required Accounts

- HubSpot Free CRM
- Calendly
- Netlify

## Netlify Environment Variables

Add this variable in Netlify:

```text
HUBSPOT_ACCESS_TOKEN=your_hubspot_private_app_token
```

Where to add it:

1. Open the Netlify site.
2. Go to Site configuration.
3. Go to Environment variables.
4. Add `HUBSPOT_ACCESS_TOKEN`.
5. Redeploy the site after saving.

The Calendly URL is currently hardcoded in the Netlify Function:

```text
https://calendly.com/isaiah-royer/30min
```

No HubSpot token is used or exposed in frontend code.

## HubSpot Private App Setup

Create a HubSpot Private App and give it CRM contact permissions.

Required scope:

```text
crm.objects.contacts.write
```

Recommended scope for contact lookup/update:

```text
crm.objects.contacts.read
```

The function creates or updates contacts by email.

## HubSpot Properties

The function sends these standard HubSpot contact properties:

```text
email
firstname
lastname
phone
company
lifecyclestage
```

The function also attempts to send these custom properties:

```text
monthly_lead_volume
main_lead_source
page_url
agentflow_timestamp
```

Create those custom contact properties in HubSpot before going live. If they do not exist, HubSpot may reject the submission with an unknown property error.

Suggested property types:

```text
monthly_lead_volume: single-line text or dropdown
main_lead_source: single-line text or dropdown
page_url: single-line text
agentflow_timestamp: single-line text
```

## Calendly Setup

Calendly booking URL:

```text
https://calendly.com/isaiah-royer/30min
```

Recommended Calendly event settings:

- Event name: AgentFlow Demo
- Duration: 30 minutes
- Add email reminders
- Add a question for current CRM or lead source if useful

## Local Testing

Install and use the Netlify CLI:

```bash
npm install -g netlify-cli
cd /home/isaiahismeroyer/AgentFlow
netlify dev
```

Before testing locally, add the environment variable for the local shell:

```bash
export HUBSPOT_ACCESS_TOKEN=your_hubspot_private_app_token
netlify dev
```

Then open the local Netlify URL, usually:

```text
http://localhost:8888
```

Test steps:

1. Open the AgentFlow homepage.
2. Fill out the demo form.
3. Submit the form.
4. Confirm the form shows a loading state.
5. Confirm a HubSpot contact is created or updated.
6. Confirm the browser redirects to Calendly.

## Live Testing

After deploying to Netlify:

1. Confirm `HUBSPOT_ACCESS_TOKEN` exists in Netlify environment variables.
2. Trigger a new deploy.
3. Open the live AgentFlow site.
4. Submit a test lead with a unique email address.
5. Confirm the contact appears in HubSpot.
6. Confirm the browser redirects to:

```text
https://calendly.com/isaiah-royer/30min
```

## Troubleshooting

If the form shows a HubSpot property error, create the missing custom property in HubSpot or remove that property from the function.

If the form shows a missing token error, confirm `HUBSPOT_ACCESS_TOKEN` is set in Netlify and redeploy.

If the function works locally but not live, check Netlify Function logs for the `submit-lead` function.
