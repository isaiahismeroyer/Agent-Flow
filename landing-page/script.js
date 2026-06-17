const demoForm = document.querySelector("#demo-form");
const formStatus = document.querySelector("#form-status");

const setFormStatus = (message, type) => {
  if (!formStatus) return;
  formStatus.textContent = message;
  formStatus.className = `form-status ${type ? `form-status-${type}` : ""}`.trim();
};

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

    setFormStatus("Saving your details before opening the demo calendar.", "loading");

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

      setFormStatus("Success. Redirecting you to the demo calendar now.", "success");

      window.setTimeout(() => {
        window.location.href = result.calendlyUrl;
      }, 900);
    } catch (error) {
      setFormStatus(error.message, "error");

      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = defaultButtonText;
      }
    }
  });
}
