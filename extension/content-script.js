const SUPPORTED_INPUT_TYPES = new Set([
  "text",
  "email",
  "tel",
  "url",
  "search",
  "password",
  "number",
  "date",
  "datetime-local",
  "month",
  "time",
  "week"
]);

const fieldRegistry = new Map();
let fieldCounter = 0;

const isElementVisible = element => {
  const style = window.getComputedStyle(element);
  return (
    style &&
    style.visibility !== "hidden" &&
    style.display !== "none" &&
    element.offsetParent !== null
  );
};

const getLabelText = element => {
  if (element.id) {
    const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
    if (label?.innerText) {
      return label.innerText.trim();
    }
  }

  const closestLabel = element.closest("label");
  if (closestLabel?.innerText) {
    return closestLabel.innerText.trim();
  }

  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) {
    return ariaLabel.trim();
  }

  const describedBy = element
    .getAttribute("aria-describedby")
    ?.split(/\s+/)
    .map(id => document.getElementById(id))
    .filter(Boolean)
    .map(el => el.innerText.trim())
    .filter(Boolean)
    .join(" ");

  return describedBy || "";
};

const getNearbyText = element => {
  let walker = element.parentElement;
  const texts = [];
  let hops = 0;

  while (walker && hops < 3) {
    const text = walker.innerText?.trim();
    if (text) {
      texts.push(text);
    }
    walker = walker.parentElement;
    hops += 1;
  }

  return texts.join(" | ").slice(0, 200);
};

const deriveFieldId = element => {
  if (element.dataset.autofillFieldId) {
    return element.dataset.autofillFieldId;
  }

  const keyParts = [
    element.id,
    element.name,
    element.getAttribute("aria-label"),
    element.placeholder
  ]
    .filter(Boolean)
    .join("|")
    .replace(/\s+/g, "-")
    .toLowerCase();

  const fieldId = keyParts
    ? `field-${keyParts.slice(0, 48)}`
    : `field-generated-${++fieldCounter}`;

  element.dataset.autofillFieldId = fieldId;
  fieldRegistry.set(fieldId, element);
  return fieldId;
};

const collectFormFields = () => {
  fieldRegistry.clear();
  fieldCounter = 0;
  const candidates = Array.from(
    document.querySelectorAll("input, textarea, select")
  );

  const fields = [];

  candidates.forEach(element => {
    if (!isElementVisible(element) || element.disabled) {
      return;
    }

    if (element.matches("input")) {
      const type = (element.type || "text").toLowerCase();
      if (type === "hidden" || type === "file" || type === "button" || type === "submit") {
        return;
      }

      if (!SUPPORTED_INPUT_TYPES.has(type)) {
        return;
      }
    }

    const fieldId = deriveFieldId(element);

    fields.push({
      fieldId,
      tagName: element.tagName.toLowerCase(),
      type: element.type || "",
      name: element.name || "",
      placeholder: element.placeholder || "",
      ariaLabel: element.getAttribute("aria-label") || "",
      label: getLabelText(element),
      nearbyText: getNearbyText(element)
    });
  });

  return fields;
};

const setElementValue = (element, value) => {
  const tag = element.tagName.toLowerCase();

  if (tag === "select") {
    const optionMatch =
      Array.from(element.options).find(
        option =>
          option.value.toLowerCase() === value.toLowerCase() ||
          option.text.toLowerCase() === value.toLowerCase()
      ) || null;

    if (optionMatch) {
      element.value = optionMatch.value;
    } else {
      element.value = value;
    }
  } else if (tag === "input") {
    const type = (element.type || "text").toLowerCase();
    if (type === "number") {
      const numeric = value.replace(/[^\d.-]/g, "");
      element.value = numeric;
    } else {
      element.value = value;
    }
  } else {
    element.value = value;
  }

  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.dispatchEvent(new Event("blur", { bubbles: true }));
};

const applyAutofill = results => {
  results.forEach(({ fieldId, value }) => {
    const element = fieldRegistry.get(fieldId) ||
      document.querySelector(`[data-autofill-field-id="${CSS.escape(fieldId)}"]`);

    if (!element || typeof value !== "string" || !value.trim()) {
      return;
    }

    setElementValue(element, value.trim());
  });
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "collect-fields") {
    try {
      const fields = collectFormFields();
      sendResponse(fields);
    } catch (error) {
      console.warn("Field collection failed", error);
      sendResponse([]);
    }
    return true;
  }

  if (message?.type === "apply-autofill") {
    try {
      applyAutofill(message.results || []);
      sendResponse({ success: true });
    } catch (error) {
      console.error("Unable to apply autofill", error);
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }

  return undefined;
});
