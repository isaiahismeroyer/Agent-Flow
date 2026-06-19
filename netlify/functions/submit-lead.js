const CALENDLY_URL = "https://calendly.com/isaiah-royer/30min";
const HUBSPOT_CONTACTS_URL = "https://api.hubapi.com/crm/v3/objects/contacts";
const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const RESEND_EMAILS_URL = "https://api.resend.com/emails";

const VALID_STATUSES = ["Hot", "Warm", "Cold", "Review Needed"];
const VALID_LEAD_TYPES = ["Buyer", "Seller", "Both", "Unclear"];

const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  },
  body: JSON.stringify(body)
});

const parseJsonBody = (body) => {
  try {
    return JSON.parse(body || "{}");
  } catch (error) {
    return null;
  }
};

const clean = (value) => String(value || "").trim();

const clampScore = (score) => {
  const number = Number.parseInt(score, 10);

  if (Number.isNaN(number)) {
    return 0;
  }

  return Math.min(100, Math.max(0, number));
};

const normalizeStatus = (status, score) => {
  const cleaned = clean(status);

  if (VALID_STATUSES.includes(cleaned)) {
    return cleaned;
  }

  if (score >= 75) return "Hot";
  if (score >= 45) return "Warm";
  return "Cold";
};

const normalizeLeadType = (leadType, fallbackIntent) => {
  const cleaned = clean(leadType);

  if (VALID_LEAD_TYPES.includes(cleaned)) {
    return cleaned;
  }

  if (fallbackIntent === "Buyer" || fallbackIntent === "Seller" || fallbackIntent === "Both") {
    return fallbackIntent;
  }

  return "Unclear";
};

const splitName = (fullName) => {
  const parts = clean(fullName).split(/\s+/).filter(Boolean);
  const firstname = parts.shift() || "";
  const lastname = parts.join(" ");

  return { firstname, lastname };
};

const validateLead = (lead) => {
  const requiredFields = [
    "full_name",
    "email",
    "phone",
    "lead_intent",
    "monthly_lead_volume",
    "main_lead_source"
  ];

  const missing = requiredFields.filter((field) => !clean(lead[field]));

  if (missing.length > 0) {
    return `Missing required field${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(lead.email))) {
    return "A valid email address is required.";
  }

  return null;
};

const filterEmptyProperties = (properties) => Object.fromEntries(
  Object.entries(properties).filter(([, value]) => value !== "")
);

const buildRelationshipProfile = (lead) => ({
  about_self: clean(lead.about_self),
  journey_prompt: clean(lead.journey_prompt),
  one_to_three_year_goals: clean(lead.one_to_three_year_goals),
  process_priorities: clean(lead.process_priorities),
  concerns_to_avoid: clean(lead.concerns_to_avoid),
  ideal_outcome: clean(lead.ideal_outcome),
  communication_preference: clean(lead.communication_preference),
  preferred_meeting_schedule: clean(lead.preferred_meeting_schedule),
  agent_notes: clean(lead.agent_notes)
});

const buildQualificationInput = (lead) => ({
  contact: {
    full_name: clean(lead.full_name),
    email: clean(lead.email).toLowerCase(),
    phone: clean(lead.phone),
    brokerage: clean(lead.brokerage),
    lead_intent: clean(lead.lead_intent),
    monthly_lead_volume: clean(lead.monthly_lead_volume),
    main_lead_source: clean(lead.main_lead_source),
    timestamp: clean(lead.timestamp)
  },
  buyer: {
    property_use: clean(lead.buyer_property_use),
    locations: clean(lead.buyer_locations),
    budget: clean(lead.buyer_budget),
    financing_status: clean(lead.buyer_financing_status),
    timeline: clean(lead.buyer_timeline),
    has_agent: clean(lead.buyer_has_agent),
    home_priorities: clean(lead.buyer_home_priorities)
  },
  seller: {
    property_address: clean(lead.seller_property_address),
    property_type: clean(lead.seller_property_type),
    estimated_value: clean(lead.seller_estimated_value),
    timeline: clean(lead.seller_timeline),
    previously_listed: clean(lead.seller_previously_listed),
    has_agent: clean(lead.seller_has_agent),
    motivation: clean(lead.seller_motivation),
    next_destination: clean(lead.seller_next_destination)
  },
  relationship: buildRelationshipProfile(lead)
});

const safeJsonStringify = (value) => JSON.stringify(value, null, 2);

const buildFallbackQualification = (lead, reason) => {
  const relationshipProfile = buildRelationshipProfile(lead);
  const relationshipDetails = Object.entries(relationshipProfile)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}: ${value}`)
    .join("; ");

  return {
    lead_type: normalizeLeadType(clean(lead.lead_intent), clean(lead.lead_intent)),
    lead_score: 0,
    qualification_status: "Review Needed",
    ai_summary: `AI qualification was unavailable. Manual review needed. Reason: ${reason || "Unknown error"}`,
    relationship_summary: relationshipDetails || "No relationship profile details were provided.",
    recommended_next_action: "Review the lead manually, confirm buyer or seller intent, and invite the lead to schedule a consultation if appropriate.",
    nurture_response: "Thanks for sharing your details. We received your information and will review it so we can recommend the best next step for your real estate goals.",
    ai_error: reason || ""
  };
};

const normalizeQualification = (qualification, lead) => {
  const score = clampScore(qualification && qualification.lead_score);
  const status = normalizeStatus(qualification && qualification.qualification_status, score);

  return {
    lead_type: normalizeLeadType(qualification && qualification.lead_type, clean(lead.lead_intent)),
    lead_score: score,
    qualification_status: status,
    ai_summary: clean(qualification && qualification.ai_summary) || "No AI summary was generated.",
    relationship_summary: clean(qualification && qualification.relationship_summary) || "No relationship summary was generated.",
    recommended_next_action: clean(qualification && qualification.recommended_next_action) || "Review the lead and follow up with the appropriate next step.",
    nurture_response: clean(qualification && qualification.nurture_response) || "Thanks for sharing your details. We will follow up with the best next step soon.",
    ai_error: clean(qualification && qualification.ai_error)
  };
};

const extractJsonObject = (content) => {
  const cleaned = clean(content);

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
      throw error;
    }

    return JSON.parse(match[0]);
  }
};

const buildQualificationPrompt = (lead) => `
You are AgentFlow, an AI real estate lead qualification assistant.

Analyze the submitted lead and return one valid JSON object only. Do not include markdown.

Classify the lead as Buyer, Seller, Both, or Unclear.
Score lead quality from 0 to 100.
Use these qualification statuses only: Hot, Warm, Cold, Review Needed.

Scoring guidance:
- Hot: 75-100, clear intent, near-term timeline, strong buyer or seller readiness, and enough details for an agent to act.
- Warm: 45-74, meaningful intent but missing urgency, readiness, or important details.
- Cold: 0-44, vague, early-stage, low intent, or mostly educational.
- Review Needed: only when the submitted details are too ambiguous to classify.

Buyer signals:
- Budget provided
- Pre-approved financing or cash buyer
- Defined timeline
- Specific location preferences
- Not currently represented by an agent
- Clear priorities and high intent

Seller signals:
- Property details provided
- Property value information available
- Defined selling timeline
- Strong motivation to sell
- Next home or destination context
- Not currently represented by an agent

Relationship signals:
- Completed All About You form
- Detailed responses
- Clear goals and motivation
- Readiness to engage with an agent

Return exactly this JSON shape:
{
  "lead_type": "Buyer",
  "lead_score": 82,
  "qualification_status": "Hot",
  "ai_summary": "Concise agent-facing summary.",
  "relationship_summary": "Concise personalization context for the agent.",
  "recommended_next_action": "Specific next action for the agent or system.",
  "nurture_response": "Helpful lead-facing response for warm/cold or early-stage leads."
}

Lead data:
${safeJsonStringify(buildQualificationInput(lead))}
`;

const qualifyLeadWithAi = async (lead) => {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = clean(process.env.AI_MODEL) || "gpt-4o-mini";

  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY.");
  }

  const aiResponse = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: "You qualify real estate leads for AgentFlow and return strict JSON only."
        },
        {
          role: "user",
          content: buildQualificationPrompt(lead)
        }
      ]
    })
  });

  const aiData = await aiResponse.json().catch(() => ({}));

  if (!aiResponse.ok) {
    throw new Error(aiData.error && aiData.error.message ? aiData.error.message : "OpenAI qualification failed.");
  }

  const content = aiData.choices && aiData.choices[0] && aiData.choices[0].message && aiData.choices[0].message.content;

  if (!content) {
    throw new Error("OpenAI response did not include qualification content.");
  }

  return normalizeQualification(extractJsonObject(content), lead);
};

const getQualification = async (lead) => {
  try {
    return await qualifyLeadWithAi(lead);
  } catch (error) {
    console.error("AI qualification failed:", error.message || error);
    return normalizeQualification(buildFallbackQualification(lead, error.message), lead);
  }
};

const buildContactProperties = (lead, qualification) => {
  const { firstname, lastname } = splitName(lead.full_name);
  const relationshipProfile = buildRelationshipProfile(lead);
  const nurtureStage = qualification.qualification_status === "Hot"
    ? ""
    : `Stage 2 ${qualification.qualification_status} Nurture`;

  const standardProperties = {
    email: clean(lead.email).toLowerCase(),
    firstname,
    lastname,
    phone: clean(lead.phone),
    company: clean(lead.brokerage),
    lifecyclestage: "lead"
  };

  const customProperties = {
    monthly_lead_volume: clean(lead.monthly_lead_volume),
    main_lead_source: clean(lead.main_lead_source),
    page_url: clean(lead.page_url),
    agentflow_timestamp: clean(lead.timestamp),
    agentflow_lead_type: qualification.lead_type,
    agentflow_lead_score: String(qualification.lead_score),
    agentflow_qualification_status: qualification.qualification_status,
    agentflow_ai_summary: qualification.ai_summary,
    agentflow_relationship_summary: qualification.relationship_summary,
    agentflow_recommended_next_action: qualification.recommended_next_action,
    agentflow_nurture_response: qualification.nurture_response,
    agentflow_relationship_profile: safeJsonStringify(relationshipProfile),
    agentflow_nurture_stage: nurtureStage,
    buyer_property_use: clean(lead.buyer_property_use),
    buyer_locations: clean(lead.buyer_locations),
    buyer_budget: clean(lead.buyer_budget),
    buyer_financing_status: clean(lead.buyer_financing_status),
    buyer_timeline: clean(lead.buyer_timeline),
    buyer_has_agent: clean(lead.buyer_has_agent),
    buyer_home_priorities: clean(lead.buyer_home_priorities),
    seller_property_address: clean(lead.seller_property_address),
    seller_property_type: clean(lead.seller_property_type),
    seller_estimated_value: clean(lead.seller_estimated_value),
    seller_timeline: clean(lead.seller_timeline),
    seller_previously_listed: clean(lead.seller_previously_listed),
    seller_has_agent: clean(lead.seller_has_agent),
    seller_motivation: clean(lead.seller_motivation),
    seller_next_destination: clean(lead.seller_next_destination),
    about_self: clean(lead.about_self),
    journey_prompt: clean(lead.journey_prompt),
    one_to_three_year_goals: clean(lead.one_to_three_year_goals),
    process_priorities: clean(lead.process_priorities),
    concerns_to_avoid: clean(lead.concerns_to_avoid),
    ideal_outcome: clean(lead.ideal_outcome),
    communication_preference: clean(lead.communication_preference),
    preferred_meeting_schedule: clean(lead.preferred_meeting_schedule),
    agent_notes: clean(lead.agent_notes)
  };

  return { standardProperties, customProperties };
};

const buildLeadNotificationText = (lead, qualification, routing) => [
  "New AgentFlow lead submitted.",
  "",
  `Full Name: ${clean(lead.full_name) || "Not provided"}`,
  `Email: ${clean(lead.email) || "Not provided"}`,
  `Phone: ${clean(lead.phone) || "Not provided"}`,
  `Brokerage: ${clean(lead.brokerage) || "Not provided"}`,
  `Monthly Lead Volume: ${clean(lead.monthly_lead_volume) || "Not provided"}`,
  `Lead Source: ${clean(lead.main_lead_source) || "Not provided"}`,
  `Timestamp: ${clean(lead.timestamp) || new Date().toISOString()}`,
  "",
  "AI Qualification",
  `Lead Type: ${qualification.lead_type}`,
  `Lead Score: ${qualification.lead_score}`,
  `Qualification Status: ${qualification.qualification_status}`,
  `AI Summary: ${qualification.ai_summary}`,
  `Relationship Summary: ${qualification.relationship_summary}`,
  `Recommended Next Action: ${qualification.recommended_next_action}`,
  `Nurture Response: ${qualification.nurture_response}`,
  `Calendly Routing: ${routing.shouldRedirectToCalendly ? "Automatic redirect" : routing.showCalendlyOption ? "Calendly offered" : "No forced scheduling"}`,
  qualification.ai_error ? `AI Warning: ${qualification.ai_error}` : ""
].filter((line) => line !== "").join("\n");

const sendLeadNotification = async (lead, qualification, routing) => {
  const apiKey = process.env.RESEND_API_KEY;
  const notificationTo = process.env.LEAD_NOTIFICATION_TO;
  const notificationFrom = process.env.LEAD_NOTIFICATION_FROM;

  if (!apiKey || !notificationTo || !notificationFrom) {
    throw new Error(
      "Email notification is not configured. Missing RESEND_API_KEY, LEAD_NOTIFICATION_TO, or LEAD_NOTIFICATION_FROM."
    );
  }

  const emailResponse = await fetch(RESEND_EMAILS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: notificationFrom,
      to: [notificationTo],
      subject: `${qualification.qualification_status} AgentFlow Lead: ${clean(lead.full_name) || clean(lead.email)} - Score ${qualification.lead_score}`,
      text: buildLeadNotificationText(lead, qualification, routing)
    })
  });

  const emailData = await emailResponse.json().catch(() => ({}));

  if (!emailResponse.ok) {
    throw new Error(emailData.message || "Lead notification email failed.");
  }

  return emailData;
};

const updateHubSpotContact = async (contactId, properties, token) => {
  const saveResponse = await fetch(`${HUBSPOT_CONTACTS_URL}/${contactId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ properties })
  });

  const saveData = await saveResponse.json().catch(() => ({}));

  if (!saveResponse.ok) {
    throw new Error(saveData.message || "HubSpot contact update failed.");
  }

  return saveData;
};

const createHubSpotContact = async (properties, token) => {
  const saveResponse = await fetch(HUBSPOT_CONTACTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ properties })
  });

  const saveData = await saveResponse.json().catch(() => ({}));

  if (!saveResponse.ok) {
    throw new Error(saveData.message || "HubSpot contact create failed.");
  }

  return saveData;
};

const upsertHubSpotContact = async (standardProperties, customProperties, token) => {
  const searchResponse = await fetch(`${HUBSPOT_CONTACTS_URL}/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      filterGroups: [
        {
          filters: [
            {
              propertyName: "email",
              operator: "EQ",
              value: standardProperties.email
            }
          ]
        }
      ],
      properties: ["email"],
      limit: 1
    })
  });

  const searchData = await searchResponse.json().catch(() => ({}));

  if (!searchResponse.ok) {
    throw new Error(searchData.message || "HubSpot contact lookup failed.");
  }

  const existingContactId = searchData.results && searchData.results[0] && searchData.results[0].id;
  const saveData = existingContactId
    ? await updateHubSpotContact(existingContactId, standardProperties, token)
    : await createHubSpotContact(standardProperties, token);

  const custom = filterEmptyProperties(customProperties);
  let customPropertiesSaved = false;
  let customPropertiesWarning = "";

  if (Object.keys(custom).length > 0) {
    try {
      await updateHubSpotContact(saveData.id, custom, token);
      customPropertiesSaved = true;
    } catch (error) {
      customPropertiesWarning = error.message;
    }
  }

  return {
    id: saveData.id,
    operation: existingContactId ? "updated" : "created",
    customPropertiesSaved,
    customPropertiesWarning
  };
};

const buildRouting = (qualification) => {
  if (qualification.qualification_status === "Hot") {
    return {
      shouldRedirectToCalendly: true,
      showCalendlyOption: true,
      userMessage: "You look like a strong fit for a real estate consultation. Redirecting you to the demo calendar now."
    };
  }

  if (qualification.qualification_status === "Warm") {
    return {
      shouldRedirectToCalendly: false,
      showCalendlyOption: true,
      userMessage: `${qualification.nurture_response}\n\nYou can also schedule a demo now if you are ready to talk through your next step.`
    };
  }

  if (qualification.qualification_status === "Review Needed") {
    return {
      shouldRedirectToCalendly: false,
      showCalendlyOption: true,
      userMessage: "Your details were received. We will review them manually and follow up with the best next step. You can also schedule a demo now if you prefer."
    };
  }

  return {
    shouldRedirectToCalendly: false,
    showCalendlyOption: false,
    userMessage: qualification.nurture_response
  };
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, { success: true });
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { success: false, error: "Method not allowed." });
  }

  const token = process.env.HUBSPOT_ACCESS_TOKEN;

  if (!token) {
    return jsonResponse(500, {
      success: false,
      error: "HubSpot is not configured. Missing HUBSPOT_ACCESS_TOKEN."
    });
  }

  const lead = parseJsonBody(event.body);

  if (!lead) {
    return jsonResponse(400, { success: false, error: "Invalid JSON request body." });
  }

  const validationError = validateLead(lead);

  if (validationError) {
    return jsonResponse(400, { success: false, error: validationError });
  }

  const qualification = await getQualification(lead);
  const routing = buildRouting(qualification);

  try {
    const { standardProperties, customProperties } = buildContactProperties(lead, qualification);
    const contact = await upsertHubSpotContact(
      filterEmptyProperties(standardProperties),
      customProperties,
      token
    );
    let notificationSent = false;
    let notificationWarning = "";

    try {
      await sendLeadNotification(lead, qualification, routing);
      notificationSent = true;
    } catch (error) {
      notificationWarning = error.message || "Lead notification email failed.";
      console.error("Lead notification failed:", notificationWarning);
    }

    return jsonResponse(200, {
      success: true,
      contact,
      notificationSent,
      notificationWarning,
      leadType: qualification.lead_type,
      leadScore: qualification.lead_score,
      qualificationStatus: qualification.qualification_status,
      aiSummary: qualification.ai_summary,
      relationshipSummary: qualification.relationship_summary,
      recommendedNextAction: qualification.recommended_next_action,
      nurtureResponse: qualification.nurture_response,
      shouldRedirectToCalendly: routing.shouldRedirectToCalendly,
      showCalendlyOption: routing.showCalendlyOption,
      userMessage: routing.userMessage,
      calendlyUrl: CALENDLY_URL
    });
  } catch (error) {
    return jsonResponse(502, {
      success: false,
      error: error.message || "Unable to save lead."
    });
  }
};
