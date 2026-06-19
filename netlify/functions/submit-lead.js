const CALENDLY_URL = "https://calendly.com/isaiah-royer/30min";
const HUBSPOT_CONTACTS_URL = "https://api.hubapi.com/crm/v3/objects/contacts";
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

const safeJsonStringify = (value) => JSON.stringify(value, null, 2);

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
    ai_error: ""
  };
};

const hasValue = (value) => clean(value) !== "";

const includesAny = (value, terms) => {
  const normalized = clean(value).toLowerCase();
  return terms.some((term) => normalized.includes(term));
};

const getTimelinePoints = (timeline) => {
  const normalized = clean(timeline).toLowerCase();

  if (!normalized) return 0;

  if (
    includesAny(normalized, ["0-3", "0 to 3", "asap", "immediate", "now", "right away", "30 day", "60 day", "90 day"]) ||
    /\b[123]\s*months?\b/.test(normalized) ||
    /\b[1-9]\s*weeks?\b/.test(normalized)
  ) {
    return 20;
  }

  if (
    includesAny(normalized, ["3-6", "3 to 6", "six months"]) ||
    /\b[456]\s*months?\b/.test(normalized)
  ) {
    return 15;
  }

  return 0;
};

const getRuleBasedLeadType = (lead) => {
  const intent = clean(lead.lead_intent);

  if (intent === "Buyer" || intent === "Seller" || intent === "Both") {
    return intent;
  }

  const hasBuyerDetails = [
    lead.buyer_property_use,
    lead.buyer_locations,
    lead.buyer_budget,
    lead.buyer_financing_status,
    lead.buyer_timeline,
    lead.buyer_has_agent,
    lead.buyer_home_priorities
  ].some(hasValue);
  const hasSellerDetails = [
    lead.seller_property_address,
    lead.seller_property_type,
    lead.seller_estimated_value,
    lead.seller_timeline,
    lead.seller_previously_listed,
    lead.seller_has_agent,
    lead.seller_motivation,
    lead.seller_next_destination
  ].some(hasValue);

  if (hasBuyerDetails && hasSellerDetails) return "Both";
  if (hasBuyerDetails) return "Buyer";
  if (hasSellerDetails) return "Seller";
  return "Unclear";
};

const scoreBuyer = (lead) => {
  let score = 0;

  if (hasValue(lead.buyer_budget)) score += 10;
  if (includesAny(lead.buyer_financing_status, ["pre-approved", "cash"])) score += 20;
  score += getTimelinePoints(lead.buyer_timeline);
  if (hasValue(lead.buyer_locations)) score += 10;
  if (clean(lead.buyer_has_agent).toLowerCase() === "no") score += 15;
  if (hasValue(lead.buyer_home_priorities)) score += 10;

  return score;
};

const scoreSeller = (lead) => {
  let score = 0;

  if (hasValue(lead.seller_property_address) || hasValue(lead.seller_property_type)) score += 15;
  if (hasValue(lead.seller_estimated_value)) score += 10;
  score += getTimelinePoints(lead.seller_timeline);
  if (hasValue(lead.seller_motivation)) score += 20;
  if (clean(lead.seller_has_agent).toLowerCase() === "no") score += 15;
  if (hasValue(lead.seller_next_destination)) score += 10;

  return score;
};

const scoreRelationship = (lead) => {
  let score = 0;

  if (hasValue(lead.about_self)) score += 5;
  if (hasValue(lead.one_to_three_year_goals)) score += 5;
  if (hasValue(lead.communication_preference)) score += 5;
  if (hasValue(lead.preferred_meeting_schedule)) score += 5;

  return score;
};

const compactList = (items) => items.filter(Boolean).join("; ");

const buildAiSummary = (lead, leadType, score, status) => {
  const buyerSummary = leadType === "Buyer" || leadType === "Both"
    ? compactList([
      hasValue(lead.buyer_budget) ? `budget ${clean(lead.buyer_budget)}` : "",
      hasValue(lead.buyer_locations) ? `interested in ${clean(lead.buyer_locations)}` : "",
      hasValue(lead.buyer_timeline) ? `moving timeline ${clean(lead.buyer_timeline)}` : "",
      hasValue(lead.buyer_financing_status) ? `financing status ${clean(lead.buyer_financing_status)}` : "",
      hasValue(lead.buyer_home_priorities) ? `priorities: ${clean(lead.buyer_home_priorities)}` : ""
    ])
    : "";
  const sellerSummary = leadType === "Seller" || leadType === "Both"
    ? compactList([
      hasValue(lead.seller_property_address) ? `property ${clean(lead.seller_property_address)}` : "",
      hasValue(lead.seller_property_type) ? `type ${clean(lead.seller_property_type)}` : "",
      hasValue(lead.seller_estimated_value) ? `estimated value ${clean(lead.seller_estimated_value)}` : "",
      hasValue(lead.seller_timeline) ? `selling timeline ${clean(lead.seller_timeline)}` : "",
      hasValue(lead.seller_motivation) ? `motivation: ${clean(lead.seller_motivation)}` : ""
    ])
    : "";
  const details = compactList([buyerSummary, sellerSummary]);

  return `${clean(lead.full_name)} is classified as ${leadType} with a rule-based score of ${score} and ${status} status.${details ? ` Key details: ${details}.` : " Limited qualification detail was provided."}`;
};

const buildRelationshipSummary = (lead) => {
  const profile = buildRelationshipProfile(lead);
  const details = compactList([
    profile.about_self ? `About: ${profile.about_self}` : "",
    profile.journey_prompt ? `Journey prompt: ${profile.journey_prompt}` : "",
    profile.one_to_three_year_goals ? `Goals: ${profile.one_to_three_year_goals}` : "",
    profile.process_priorities ? `Priorities: ${profile.process_priorities}` : "",
    profile.concerns_to_avoid ? `Concerns to avoid: ${profile.concerns_to_avoid}` : "",
    profile.ideal_outcome ? `Ideal outcome: ${profile.ideal_outcome}` : "",
    profile.communication_preference ? `Preferred communication: ${profile.communication_preference}` : "",
    profile.preferred_meeting_schedule ? `Preferred schedule: ${profile.preferred_meeting_schedule}` : "",
    profile.agent_notes ? `Agent notes: ${profile.agent_notes}` : ""
  ]);

  return details || "No relationship profile details were provided.";
};

const buildAgentFlowSummary = (lead, qualification, routing) => [
  "AgentFlow Qualification Summary",
  "",
  "Contact",
  `Name: ${clean(lead.full_name) || "Not provided"}`,
  `Email: ${clean(lead.email) || "Not provided"}`,
  `Phone: ${clean(lead.phone) || "Not provided"}`,
  `Brokerage: ${clean(lead.brokerage) || "Not provided"}`,
  `Lead Source: ${clean(lead.main_lead_source) || "Not provided"}`,
  `Submitted: ${clean(lead.timestamp) || new Date().toISOString()}`,
  "",
  "Qualification",
  `Lead Type: ${qualification.lead_type}`,
  `Lead Score: ${qualification.lead_score}`,
  `Status: ${qualification.qualification_status}`,
  `Recommended Next Action: ${qualification.recommended_next_action}`,
  `Calendly Routing: ${routing.shouldRedirectToCalendly ? "Automatic redirect" : routing.showCalendlyOption ? "Calendly offered" : "No forced scheduling"}`,
  "",
  "Summary",
  qualification.ai_summary,
  "",
  "Relationship Summary",
  qualification.relationship_summary,
  "",
  "Nurture Response",
  qualification.nurture_response,
  "",
  "Buyer Answers",
  `Property Use: ${clean(lead.buyer_property_use) || "Not provided"}`,
  `Locations: ${clean(lead.buyer_locations) || "Not provided"}`,
  `Budget: ${clean(lead.buyer_budget) || "Not provided"}`,
  `Financing: ${clean(lead.buyer_financing_status) || "Not provided"}`,
  `Timeline: ${clean(lead.buyer_timeline) || "Not provided"}`,
  `Working With Agent: ${clean(lead.buyer_has_agent) || "Not provided"}`,
  `Home Priorities: ${clean(lead.buyer_home_priorities) || "Not provided"}`,
  "",
  "Seller Answers",
  `Property: ${clean(lead.seller_property_address) || "Not provided"}`,
  `Property Type: ${clean(lead.seller_property_type) || "Not provided"}`,
  `Estimated Value: ${clean(lead.seller_estimated_value) || "Not provided"}`,
  `Timeline: ${clean(lead.seller_timeline) || "Not provided"}`,
  `Previously Listed: ${clean(lead.seller_previously_listed) || "Not provided"}`,
  `Working With Agent: ${clean(lead.seller_has_agent) || "Not provided"}`,
  `Motivation: ${clean(lead.seller_motivation) || "Not provided"}`,
  `Next Destination: ${clean(lead.seller_next_destination) || "Not provided"}`,
  "",
  "All About You",
  `About: ${clean(lead.about_self) || "Not provided"}`,
  `Journey Prompt: ${clean(lead.journey_prompt) || "Not provided"}`,
  `Goals: ${clean(lead.one_to_three_year_goals) || "Not provided"}`,
  `Process Priorities: ${clean(lead.process_priorities) || "Not provided"}`,
  `Concerns To Avoid: ${clean(lead.concerns_to_avoid) || "Not provided"}`,
  `Ideal Outcome: ${clean(lead.ideal_outcome) || "Not provided"}`,
  `Communication Preference: ${clean(lead.communication_preference) || "Not provided"}`,
  `Preferred Schedule: ${clean(lead.preferred_meeting_schedule) || "Not provided"}`,
  `Agent Notes: ${clean(lead.agent_notes) || "Not provided"}`
].join("\n");

const getRecommendedNextAction = (status) => {
  if (status === "Hot") {
    return "Prioritize immediate follow-up, confirm the lead's goals, and use the Calendly booking as the next step.";
  }

  if (status === "Warm") {
    return "Offer the Calendly link, answer open questions, and place the lead into a nurture sequence.";
  }

  return "Send helpful educational follow-up, clarify timeline and motivation, and continue nurturing until intent increases.";
};

const getNurtureResponse = (leadType, status) => {
  if (status === "Hot") {
    return "Thanks for sharing your details. Based on your answers, scheduling a consultation is the best next step so we can talk through your real estate goals.";
  }

  if (status === "Warm") {
    return `Thanks for sharing your ${leadType.toLowerCase()} details. You have a solid starting point, and a quick consultation can help clarify timing, priorities, and the best next step.`;
  }

  return "Thanks for sharing your details. Based on where you are in the process, the best next step is to keep learning, clarify your timeline and goals, and reconnect when you are closer to making a move.";
};

const getQualification = (lead) => {
  const leadType = getRuleBasedLeadType(lead);
  const relationshipScore = scoreRelationship(lead);
  const buyerScore = leadType === "Buyer" || leadType === "Both" ? scoreBuyer(lead) : 0;
  const sellerScore = leadType === "Seller" || leadType === "Both" ? scoreSeller(lead) : 0;
  const score = clampScore(buyerScore + sellerScore + relationshipScore);
  const status = normalizeStatus("", score);

  return normalizeQualification({
    lead_type: leadType,
    lead_score: score,
    qualification_status: status,
    ai_summary: buildAiSummary(lead, leadType, score, status),
    relationship_summary: buildRelationshipSummary(lead),
    recommended_next_action: getRecommendedNextAction(status),
    nurture_response: getNurtureResponse(leadType, status)
  }, lead);
};

const buildContactProperties = (lead, qualification, routing) => {
  const { firstname, lastname } = splitName(lead.full_name);
  const relationshipProfile = buildRelationshipProfile(lead);
  const agentflowSummary = buildAgentFlowSummary(lead, qualification, routing);
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
    agentflow_summary: agentflowSummary,
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
  "AgentFlow Qualification",
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

const saveHubSpotFallbackSummary = async (contactId, summary, token) => {
  const fallbackProperties = ["message", "agentflow_summary"];
  let lastWarning = "";

  for (const propertyName of fallbackProperties) {
    try {
      await updateHubSpotContact(contactId, { [propertyName]: summary }, token);

      return {
        saved: true,
        propertyName,
        warning: ""
      };
    } catch (error) {
      lastWarning = `${propertyName}: ${error.message}`;
    }
  }

  return {
    saved: false,
    propertyName: "",
    warning: lastWarning || "Unable to save AgentFlow summary fallback."
  };
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
  let fallbackSummarySaved = false;
  let fallbackSummaryProperty = "";
  let fallbackSummaryWarning = "";

  if (Object.keys(custom).length > 0) {
    try {
      await updateHubSpotContact(saveData.id, custom, token);
      customPropertiesSaved = true;
    } catch (error) {
      customPropertiesWarning = error.message;

      if (custom.agentflow_summary) {
        const fallback = await saveHubSpotFallbackSummary(saveData.id, custom.agentflow_summary, token);
        fallbackSummarySaved = fallback.saved;
        fallbackSummaryProperty = fallback.propertyName;
        fallbackSummaryWarning = fallback.warning;
      }
    }
  }

  return {
    id: saveData.id,
    operation: existingContactId ? "updated" : "created",
    customPropertiesSaved,
    customPropertiesWarning,
    fallbackSummarySaved,
    fallbackSummaryProperty,
    fallbackSummaryWarning
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
    const { standardProperties, customProperties } = buildContactProperties(lead, qualification, routing);
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
