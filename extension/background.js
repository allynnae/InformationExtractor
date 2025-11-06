// ---------- Storage helpers ----------
const storageGet = keys =>
  new Promise(resolve => chrome.storage.local.get(keys, resolve));

const storageSet = values =>
  new Promise(resolve => chrome.storage.local.set(values, resolve));

const DEFAULT_SERVER = "http://localhost:3000";

const getServerBaseUrl = async () => {
  const { serverBaseUrl } = await storageGet(["serverBaseUrl"]);
  const raw = (serverBaseUrl || DEFAULT_SERVER).trim();
  if (!raw) return DEFAULT_SERVER;
  return raw.replace(/\/+$/, "");
};

// ---------- Context preparation ----------
const getContextBundle = async () => {
  const { documents } = await storageGet(["documents"]);

  const parts = [];

  const docs = Array.isArray(documents) ? documents : [];
  docs
    .filter(doc => doc?.content?.trim?.())
    .forEach((doc, index) => {
      const suffix = doc.name ? ` (${doc.name})` : "";
      parts.push(
        `Document ${index + 1}${suffix}:\n${doc.content.trim().slice(0, 6000)}`
      );
    });

  return parts.join("\n\n---\n\n").slice(0, 16000);
};

// ---------- Server requests ----------
const requestCompletion = async ({ baseUrl, content, field }) => {
  const fieldSummary = [
    field.label ? `Label: ${field.label}` : "",
    field.placeholder ? `Placeholder: ${field.placeholder}` : "",
    field.name ? `Name attribute: ${field.name}` : "",
    field.type ? `Input type: ${field.type}` : "",
    field.ariaLabel ? `Aria label: ${field.ariaLabel}` : "",
    field.nearbyText ? `Nearby text: ${field.nearbyText}` : ""
  ]
    .filter(Boolean)
    .join("\n");

  const question = `Form field description:\n${
    fieldSummary || "No metadata"
  }\n\nProvide the most appropriate single-field answer drawn from the provided profile and documents. Respond with only the value that should be inserted into the field.`;

  const response = await fetch(`${baseUrl}/api/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content,
      question
    })
  });

  if (!response.ok) {
    const errPayload = await response.json().catch(() => ({}));
    throw new Error(errPayload.error || `Server returned ${response.status}`);
  }

  const data = await response.json();
  return (data.answer || "").trim();
};

// ---------- Autofill workflow ----------
const runAutofill = async () => {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!tab?.id) {
    throw new Error("Unable to find the active tab.");
  }

  let fields;
  try {
    fields = await chrome.tabs.sendMessage(tab.id, {
      type: "collect-fields"
    });
  } catch (error) {
    throw new Error(
      "Unable to communicate with the page. Ensure the content script is allowed on this site."
    );
  }

  if (!Array.isArray(fields) || !fields.length) {
    throw new Error("No fillable fields detected on this page.");
  }

  const context = await getContextBundle();

  if (!context.trim()) {
    throw new Error(
      "No profile or document data stored. Visit the extension options page to add information first."
    );
  }

  const baseUrl = await getServerBaseUrl();
  const results = [];

  for (const field of fields) {
    try {
      const suggestion = await requestCompletion({
        baseUrl,
        content: context,
        field
      });

      if (suggestion) {
        results.push({ fieldId: field.fieldId, value: suggestion });
      }
    } catch (error) {
      console.warn("Completion failed for field", field, error);
    }
  }

  if (!results.length) {
    throw new Error("No suggestions returned for the detected fields.");
  }

  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: "apply-autofill",
      results
    });
  } catch (error) {
    throw new Error("Unable to apply autofill suggestions on this page.");
  }

  return {
    success: true,
    filled: results.length
  };
};

// ---------- Message handling ----------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "run-autofill") {
    (async () => {
      try {
        const outcome = await runAutofill();
        sendResponse(outcome);
      } catch (error) {
        sendResponse({
          success: false,
          error: error.message || "Autofill failed."
        });
      }
    })();

    return true;
  }

  return undefined;
});
