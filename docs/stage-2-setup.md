# AgentFlow Stage 2 Setup

Stage 2 adds free rule-based lead qualification for real estate buyer, seller, and buyer/seller leads.

## Required Stack

- Landing Page
- Netlify
- HubSpot
- Calendly
- Resend

## Netlify Environment Variables

Keep all Stage 1 and Stage 1.1 variables:

```text
HUBSPOT_ACCESS_TOKEN=your_hubspot_private_app_token
RESEND_API_KEY=your_resend_api_key
LEAD_NOTIFICATION_TO=isaiah_receiving_email@example.com
LEAD_NOTIFICATION_FROM=AgentFlow <verified_sender@example.com>
```

No OpenAI API key, AI model, or paid AI billing is required for Stage 2.

## Stage 2 User Flow

1. A lead submits the AgentFlow form.
2. The form collects contact details, lead intent, buyer details, seller details, and relationship profile data.
3. Buyer questions show for Buyer and Both leads.
4. Seller questions show for Seller and Both leads.
5. Relationship questions show for every lead.
6. The Netlify Function scores the lead with deterministic buyer, seller, and relationship rules.
7. The function saves or updates the contact in HubSpot.
8. The function sends a Resend notification to the AgentFlow team.
9. The frontend routes the lead based on qualification status.

## Qualification Outputs

The rule-based qualification produces the same output fields used by the frontend, HubSpot, and notification email:

```text
Lead Type
Lead Score
Qualification Status
AI Summary
Relationship Summary
Recommended Next Action
Nurture Response
```

Allowed lead types:

```text
Buyer
Seller
Both
Unclear
```

Allowed qualification statuses:

```text
Hot
Warm
Cold
Review Needed
```

Lead score is clamped from `0` to `100`.

Stage 2 normally returns `Hot`, `Warm`, or `Cold`. `Review Needed` remains supported as a stored status for future manual review workflows, but the free rule-based scorer does not require an AI failure fallback.

## Rule-Based Scoring

Buyer signals:

```text
Budget provided: +10
Financing pre-approved or cash: +20
Timeline 0-3 months: +20
Timeline 3-6 months: +15
Specific locations provided: +10
Not currently working with agent: +15
Home priorities provided: +10
```

Seller signals:

```text
Property address/details provided: +15
Estimated value provided: +10
Timeline 0-3 months: +20
Timeline 3-6 months: +15
Strong motivation provided: +20
Not currently working with agent: +15
Next destination provided: +10
```

Relationship signals:

```text
About self provided: +5
Goals provided: +5
Communication preference provided: +5
Preferred meeting schedule provided: +5
```

Qualification status:

```text
Hot: 75-100
Warm: 45-74
Cold: 0-44
```

## Routing Logic

Hot leads:

- Show a success message.
- Redirect to Calendly automatically.
- Update HubSpot.
- Notify the AgentFlow team.

Warm leads:

- Show a nurture response.
- Offer a Calendly scheduling link.
- Update HubSpot.
- Notify the AgentFlow team.
- Store a nurture stage in HubSpot.

Cold leads:

- Show an educational nurture response.
- Do not force Calendly scheduling.
- Update HubSpot.
- Notify the AgentFlow team.
- Store a nurture stage in HubSpot.

Review Needed:

- Reserved for future manual review workflows.
- Save the lead in HubSpot.
- Notify the AgentFlow team.
- Allow the lead to schedule on Calendly.

## Recommended HubSpot Custom Properties

Create these contact properties in HubSpot before going live.

Stage 2 qualification properties:

```text
agentflow_lead_type
agentflow_lead_score
agentflow_qualification_status
agentflow_ai_summary
agentflow_relationship_summary
agentflow_recommended_next_action
agentflow_nurture_response
agentflow_relationship_profile
agentflow_nurture_stage
```

Buyer properties:

```text
buyer_property_use
buyer_locations
buyer_budget
buyer_financing_status
buyer_timeline
buyer_has_agent
buyer_home_priorities
```

Seller properties:

```text
seller_property_address
seller_property_type
seller_estimated_value
seller_timeline
seller_previously_listed
seller_has_agent
seller_motivation
seller_next_destination
```

Relationship profile properties:

```text
about_self
journey_prompt
one_to_three_year_goals
process_priorities
concerns_to_avoid
ideal_outcome
communication_preference
preferred_meeting_schedule
agent_notes
```

Suggested HubSpot field types:

```text
agentflow_lead_type: dropdown or single-line text
agentflow_lead_score: number
agentflow_qualification_status: dropdown or single-line text
agentflow_ai_summary: multi-line text
agentflow_relationship_summary: multi-line text
agentflow_recommended_next_action: multi-line text
agentflow_nurture_response: multi-line text
agentflow_relationship_profile: multi-line text
agentflow_nurture_stage: single-line text or dropdown
buyer/seller/relationship fields: single-line text or multi-line text based on expected length
```

If a custom HubSpot property does not exist, the function still saves the core contact and records the custom property warning in the response.

## Local Testing

Before testing locally, export all required variables:

```bash
export HUBSPOT_ACCESS_TOKEN=your_hubspot_private_app_token
export RESEND_API_KEY=your_resend_api_key
export LEAD_NOTIFICATION_TO=isaiah_receiving_email@example.com
export LEAD_NOTIFICATION_FROM='AgentFlow <verified_sender@example.com>'
netlify dev
```

Then open:

```text
http://localhost:8888
```

## Manual Test Cases

Buyer Hot:

- Select Buyer.
- Provide budget, pre-approval/cash buyer, specific locations, near-term timeline, and clear home priorities.
- Expected result: Hot lead, HubSpot updated, Resend notification sent, Calendly redirect.

Seller Hot:

- Select Seller.
- Provide property details, estimated value, near-term timeline, strong motivation, and agent status.
- Expected result: Hot lead, HubSpot updated, Resend notification sent, Calendly redirect.

Both:

- Select Both.
- Complete buyer and seller details.
- Expected result: Lead Type should be Both unless AI has a clear reason to classify otherwise.

Warm:

- Provide meaningful details with a softer or longer timeline.
- Expected result: Calendly option shown, no forced redirect, nurture stage saved.

Cold:

- Provide vague or early-stage details.
- Expected result: nurture response shown, no forced redirect, nurture stage saved.

AI failure:

- No AI service is used in the free Stage 2 build.
- Expected result: submissions qualify through deterministic rules without OpenAI billing or quota.

## Syntax Checks

Run:

```bash
node --check netlify/functions/submit-lead.js
node --check landing-page/script.js
```
