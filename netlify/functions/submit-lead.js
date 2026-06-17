const CALENDLY_URL = "https://calendly.com/isaiah-royer/30min";
const HUBSPOT_CONTACTS_URL = "https://api.hubapi.com/crm/v3/objects/contacts";

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

const buildContactProperties = (lead) => {
  const { firstname, lastname } = splitName(lead.full_name);

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
    agentflow_timestamp: clean(lead.timestamp)
  };

  return { standardProperties, customProperties };
};

const filterEmptyProperties = (properties) => Object.fromEntries(
  Object.entries(properties).filter(([, value]) => value !== "")
);

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

  try {
    const { standardProperties, customProperties } = buildContactProperties(lead);
    const contact = await upsertHubSpotContact(
      filterEmptyProperties(standardProperties),
      customProperties,
      token
    );

    return jsonResponse(200, {
      success: true,
      contact,
      calendlyUrl: CALENDLY_URL
    });
  } catch (error) {
    return jsonResponse(502, {
      success: false,
      error: error.message || "Unable to save lead."
    });
  }
};
