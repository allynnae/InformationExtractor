// ---------- Storage helpers ----------
const storageGet = keys =>
  new Promise(resolve => chrome.storage.local.get(keys, resolve));

const storageSet = values =>
  new Promise(resolve => chrome.storage.local.set(values, resolve));

const DEFAULT_SERVER = "http://localhost:3000";
const REQUEST_DELAY_MS = 400;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const getServerBaseUrl = async () => {
  const { serverBaseUrl } = await storageGet(["serverBaseUrl"]);
  const raw = (serverBaseUrl || DEFAULT_SERVER).trim();
  if (!raw) return DEFAULT_SERVER;
  return raw.replace(/\/+$/, "");
};

// ---------- Enhanced context preparation ----------
const getContextBundle = async () => {
  const { documents } = await storageGet(["documents"]);

  const parts = [];
  const docs = Array.isArray(documents) ? documents : [];
  
  console.log(`📚 Preparing context from ${docs.length} document(s)`);

  docs
    .filter(doc => doc?.content?.trim?.())
    .forEach((doc, index) => {
      const docName = doc.name || `Document ${index + 1}`;
      const content = doc.content.trim().slice(0, 6000);
      
      console.log(`  - ${docName}: ${content.length} chars`);
      
      parts.push(
        `=== ${docName.toUpperCase()} ===\n${content}\n=== END ${docName.toUpperCase()} ===`
      );
    });

  const fullContext = parts.join("\n\n");
  console.log(`Total context length: ${fullContext.length} characters`);
  
  return fullContext.slice(0, 16000);
};

// ---------- Enhanced question construction ----------
const buildFieldQuestion = (field) => {
  const parts = [];

  if (field.questionText) {
    parts.push(`Question: "${field.questionText}"`);
  }

  if (field.label && field.label !== field.questionText) {
    parts.push(`Field Label: "${field.label}"`);
  }

  if (field.placeholder) {
    parts.push(`Placeholder: "${field.placeholder}"`);
  }

  if (field.formContext) {
    parts.push(`Form: "${field.formContext}"`);
  }

  if (field.type) {
    parts.push(`Type: ${field.type}`);
  }

  if (field.name) {
    parts.push(`Name: ${field.name}`);
  }

  if (field.nearbyText) {
    parts.push(`Context: "${field.nearbyText}"`);
  }

  let mainQuestion = "";

  if (field.questionText) {
    mainQuestion = field.questionText;
  } else if (field.label) {
    mainQuestion = field.label;
  } else if (field.placeholder) {
    mainQuestion = `value for field with placeholder "${field.placeholder}"`;
  } else if (field.name) {
    mainQuestion = `value for field "${field.name}"`;
  } else {
    mainQuestion = "value for this field";
  }

  const fieldMetadata = parts.join("\n");

  const question = `${fieldMetadata}

Extract the specific value that answers: "${mainQuestion}"

Rules:
- Return ONLY the exact value (e.g., a name, number, date, or short phrase)
- Do NOT return full sentences or explanations
- Maximum 10 words
- If the answer is not explicitly in the documents, respond exactly: "UNABLE TO IDENTIFY, USER INPUT REQUIRED"`;

  return question;
};

// ---------- Enhanced server requests ----------
const requestCompletion = async ({ baseUrl, content, field }) => {
  const question = buildFieldQuestion(field);
  
  console.log("\n" + "─".repeat(60));
  console.log(`Processing field: ${field.fieldId}`);
  console.log("─".repeat(60));
  console.log("FIELD METADATA:");
  console.log(`  Question: ${field.questionText || "N/A"}`);
  console.log(`  Label: ${field.label || "N/A"}`);
  console.log(`  Type: ${field.type || "N/A"}`);
  console.log(`  Placeholder: ${field.placeholder || "N/A"}`);
  console.log("\nQUESTION SENT TO LLM:");
  console.log(question);
  console.log("─".repeat(60) + "\n");

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
    console.error(`Server error for field ${field.fieldId}:`, errPayload.error);
    throw new Error(errPayload.error || `Server returned ${response.status}`);
  }

  const data = await response.json();
  const answer = (data.answer || "").trim();
  
  console.log(`📝 ANSWER RECEIVED: "${answer}"`);
  
  return answer;
};

// ---------- Autofill workflow ----------
const runAutofill = async () => {
  console.log("\n" + "═".repeat(80));
  console.log("STARTING AUTOFILL PROCESS");
  console.log("═".repeat(80) + "\n");
  
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!tab?.id) {
    throw new Error("Unable to find the active tab.");
  }

  console.log(`Active tab: ${tab.title || tab.url}`);

  let fields;
  try {
    fields = await chrome.tabs.sendMessage(tab.id, {
      type: "collect-fields"
    });
    console.log(`Collected ${fields.length} fillable fields\n`);
  } catch (error) {
    console.error("Failed to collect fields:", error);
    throw new Error(
      "Unable to communicate with the page. Ensure the content script is allowed on this site."
    );
  }

  if (!Array.isArray(fields) || !fields.length) {
    throw new Error("No fillable fields detected on this page.");
  }

  console.log("DETECTED FIELDS:");
  fields.forEach((field, idx) => {
    console.log(`  ${idx + 1}. ${field.questionText || field.label || field.placeholder || field.fieldId}`);
  });
  console.log("");

  const context = await getContextBundle();

  if (!context.trim()) {
    throw new Error(
      "No profile or document data stored. Visit the extension options page to add information first."
    );
  }

  const baseUrl = await getServerBaseUrl();
  const results = [];
  const failures = [];

  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    console.log(`\n[${index + 1}/${fields.length}] Processing...`);
    
    try {
      const suggestion = await requestCompletion({
        baseUrl,
        content: context,
        field
      });

      if (suggestion && suggestion !== "UNABLE TO IDENTIFY, USER INPUT REQUIRED") {
        results.push({ fieldId: field.fieldId, value: suggestion });
        console.log(`SUCCESS: Will fill with "${suggestion}"`);
      } else {
        failures.push(field.fieldId);
        console.log(`SKIPPED: No matching data found`);
      }
    } catch (error) {
      failures.push(field.fieldId);
      console.error(`ERROR: ${error.message}`);
    }

    if (index < fields.length - 1) {
      await sleep(REQUEST_DELAY_MS);
    }
  }

  console.log("\n" + "═".repeat(80));
  console.log("AUTOFILL SUMMARY");
  console.log("═".repeat(80));
  console.log(`Total fields: ${fields.length}`);
  console.log(`Successfully filled: ${results.length}`);
  console.log(`Skipped/Failed: ${failures.length}`);
  console.log("═".repeat(80) + "\n");

  if (!results.length) {
    throw new Error("No suggestions returned for the detected fields. Check if your documents contain the required information.");
  }

  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: "apply-autofill",
      results
    });
    console.log("Autofill applied successfully!\n");
  } catch (error) {
    console.error("Failed to apply autofill:", error);
    throw new Error("Unable to apply autofill suggestions on this page.");
  }

  return {
    success: true,
    filled: results.length,
    skipped: failures.length
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
        console.error("\n" + "!".repeat(80));
        console.error("AUTOFILL FAILED");
        console.error("!".repeat(80));
        console.error(error.message);
        console.error("!".repeat(80) + "\n");
        
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
