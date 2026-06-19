const demoForm = document.querySelector("#demo-form");
const formStatus = document.querySelector("#form-status");
const leadIntent = document.querySelector("#lead-intent");
const buyerSection = document.querySelector("#buyer-section");
const sellerSection = document.querySelector("#seller-section");
const calendlyOption = document.querySelector("#calendly-option");
const calendlyLink = document.querySelector("#calendly-link");

const setFormStatus = (message, type) => {
  if (!formStatus) return;
  formStatus.textContent = message;
  formStatus.className = `form-status ${type ? `form-status-${type}` : ""}`.trim();
};

const setCalendlyOption = (url, isVisible) => {
  if (!calendlyOption || !calendlyLink) return;
  calendlyLink.href = url || calendlyLink.href;
  calendlyOption.hidden = !isVisible;
};

const updateConditionalSections = () => {
  const intent = leadIntent ? leadIntent.value : "";
  const showBuyer = intent === "Buyer" || intent === "Both";
  const showSeller = intent === "Seller" || intent === "Both";

  if (buyerSection) {
    buyerSection.hidden = !showBuyer;
  }

  if (sellerSection) {
    sellerSection.hidden = !showSeller;
  }
};

if (leadIntent) {
  leadIntent.addEventListener("change", updateConditionalSections);
  updateConditionalSections();
}

if (demoForm) {
  const pageUrlField = demoForm.querySelector('input[name="page_url"]');
  const timestampField = demoForm.querySelector('input[name="timestamp"]');
  const submitButton = demoForm.querySelector('button[type="submit"]');
  const defaultButtonText = submitButton ? submitButton.textContent : "";

  if (pageUrlField) {
    pageUrlField.value = window.location.href;
  }

  demoForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (timestampField) {
      timestampField.value = new Date().toISOString();
    }

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Submitting...";
    }

    setCalendlyOption("", false);
    setFormStatus("Reviewing your details and preparing the next step.", "loading");

    try {
      const formData = new FormData(demoForm);
      const payload = Object.fromEntries(formData.entries());

      const response = await fetch("/.netlify/functions/submit-lead", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Unable to submit your details. Please try again.");
      }

      const calendlyUrl = result.calendlyUrl || (calendlyLink ? calendlyLink.href : "");
      const qualificationStatus = result.qualificationStatus || "Review Needed";
      const userMessage = result.userMessage || result.nurtureResponse || "Your details were received. We will review them and follow up soon.";

      setFormStatus(userMessage, "success");

      if (qualificationStatus === "Hot" && result.shouldRedirectToCalendly && calendlyUrl) {
        window.setTimeout(() => {
          window.location.href = calendlyUrl;
        }, 1200);
        return;
      }

      if ((qualificationStatus === "Warm" || qualificationStatus === "Review Needed") && calendlyUrl) {
        setCalendlyOption(calendlyUrl, true);
      }

      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = defaultButtonText;
      }
    } catch (error) {
      setFormStatus(error.message, "error");

      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = defaultButtonText;
      }
    }
  });
}
