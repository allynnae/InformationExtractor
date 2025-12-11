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

const collectText = node => {
  if (!node) return "";
  const raw =
    typeof node === "string" ? node : (node.innerText || node.textContent || "");
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.slice(0, 240);
};

const QUESTION_CONTAINER_SELECTORS = [
  "[role='listitem']",
  "[role='group']",
  "[role='radiogroup']",
  "[role='presentation']",
  "[data-params]",
  "section",
  "article",
  "fieldset",
  "li",
  ".question",
  ".freebirdFormviewerViewNumberedItemContainer",
  ".freebirdFormviewerViewItemsItemItem",
  ".form-question",
  ".form-group",
  ".field",
  ".QuestionContainer",
  ".FormQuestion"
];

const QUESTION_TEXT_SELECTORS = [
  "[role='heading']",
  "[aria-level]",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "legend",
  "label",
  "p",
  "strong",
  "b",
  ".question-title",
  ".prompt",
  ".title",
  ".M7eMe",
  ".aDTYNe",
  ".F9yp7e",
  ".Qr7Oae",
  ".l9xauj",
  "span"
];

const getAriaLinkedText = (element, attr) =>
  element
    .getAttribute(attr)
    ?.split(/\s+/)
    .map(id => document.getElementById(id))
    .filter(Boolean)
    .map(collectText)
    .filter(Boolean)
    .join(" ")
    .trim() || "";

const findSiblingLabel = element => {
  let sibling = element.previousElementSibling;
  let hops = 0;
  while (sibling && hops < 4) {
    if (sibling.tagName?.toLowerCase() === "label") {
      const text = collectText(sibling);
      if (text) return text;
    }
    sibling = sibling.previousElementSibling;
    hops += 1;
  }
  return "";
};

const getLabelText = element => {
  if (element.id) {
    const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
    const labelText = collectText(label);
    if (labelText) return labelText;
  }

  const closestLabel = element.closest("label");
  const closestLabelText = collectText(closestLabel);
  if (closestLabelText) return closestLabelText;

  const siblingLabel = findSiblingLabel(element);
  if (siblingLabel) return siblingLabel;

  const parentLabel = element.parentElement?.querySelector("label");
  const parentLabelText = collectText(parentLabel);
  if (parentLabelText) return parentLabelText;

  const ariaLabel = collectText(element.getAttribute("aria-label") || "");
  if (ariaLabel) return ariaLabel;

  const labelledBy = getAriaLinkedText(element, "aria-labelledby");
  if (labelledBy) return labelledBy;

  const describedBy = getAriaLinkedText(element, "aria-describedby");
  if (describedBy) return describedBy;

  return "";
};


const getNearbyText = element => {
  const snippets = new Set();

  const pushText = node => {
    const snippet = collectText(node);
    if (snippet) {
      snippets.add(snippet);
    }
  };

  // Immediate siblings or text blocks before the element
  let sibling = element.previousElementSibling;
  let hops = 0;
  while (sibling && hops < 4) {
    pushText(sibling);
    sibling = sibling.previousElementSibling;
    hops += 1;
  }

  // Include parent text and their headings
  let parent = element.parentElement;
  hops = 0;
  while (parent && hops < 4) {
    if (parent.matches("fieldset")) {
      pushText(parent.querySelector("legend"));
    }

    pushText(parent);
    pushText(parent.previousElementSibling);

    parent = parent.parentElement;
    hops += 1;
  }

  // Nearby headings/labels in the same section
  const container = element.closest(
    "section, article, fieldset, div[role='group'], div[role='region'], div[role='listitem']"
  );
  if (container) {
    const heading = container.querySelector("h1,h2,h3,h4,h5,h6,legend,label,strong");
    pushText(heading);
  }

  return Array.from(snippets)
    .filter(Boolean)
    .slice(0, 4)
    .join(" | ");
};

const getFormContext = element => {
  const form = element.form || element.closest("form");
  if (!form) return "";
  const heading = form.querySelector("h1,h2,h3,legend");
  if (heading?.innerText?.trim()) {
    return heading.innerText.trim().slice(0, 200);
  }
  const describedBy = getAriaLinkedText(form, "aria-labelledby");
  if (describedBy) return describedBy.slice(0, 200);
  return collectText(form).slice(0, 200);
};

const getQuestionText = element => {
  const deniedTokens = [/your answer/i, /response/i];
  const selectors = QUESTION_CONTAINER_SELECTORS.join(",");
  let container = selectors ? element.closest(selectors) : null;
  if (!container) {
    container = element.closest("div, section, article, li, td, th");
  }

  const scanContainer = node => {
    if (!node) {
      return "";
    }

    for (const selector of QUESTION_TEXT_SELECTORS) {
      const matches = node.querySelectorAll(selector);
      for (const candidate of matches) {
        const text = collectText(candidate);
        if (text && !deniedTokens.some(rx => rx.test(text))) {
          return text;
        }
      }
    }

    const fallback = collectText(node);
    if (fallback && !deniedTokens.some(rx => rx.test(fallback))) {
      return fallback;
    }

    return "";
  };

  let hops = 0;
  while (container && hops < 5) {
    const text = scanContainer(container);
    if (text && !deniedTokens.some(rx => rx.test(text))) {
      return text;
    }
    container = container.parentElement;
    hops += 1;
  }

  return "";
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

  const baseId = keyParts ? `field-${keyParts.slice(0, 48)}` : null;

  let fieldId = baseId ? baseId : `field-generated-${++fieldCounter}`;
  while (fieldRegistry.has(fieldId)) {
    fieldId = `${baseId || "field-generated"}-${++fieldCounter}`;
  }

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
    //   nearbyText: getNearbyText(element),
    //   formContext: getFormContext(element),
      questionText: getQuestionText(element)
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
