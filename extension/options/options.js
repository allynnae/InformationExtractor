const documentFileInput = document.getElementById("documentFile");
const documentList = document.getElementById("documentList");
const clearDataButton = document.getElementById("clearData");
const serverConfigButton = document.getElementById("openServerConfig");
const serverBaseUrlPreview = document.getElementById("serverBaseUrlPreview");
const toast = document.getElementById("toast");

const DEFAULT_SERVER = "http://localhost:3000";
let documents = [];
let toastTimer = null;
let serverBaseUrl = DEFAULT_SERVER;

const normalizeBaseUrl = value => {
  if (!value) return DEFAULT_SERVER;
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_SERVER;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
};

const storageGet = keys =>
  new Promise(resolve => chrome.storage.local.get(keys, resolve));

const storageSet = values =>
  new Promise(resolve => chrome.storage.local.set(values, resolve));

const storageRemove = keys =>
  new Promise(resolve => chrome.storage.local.remove(keys, resolve));

const showToast = message => {
  if (!message) {
    toast.hidden = true;
    toast.textContent = "";
    return;
  }

  toast.textContent = message;
  toast.hidden = false;

  if (toastTimer) {
    clearTimeout(toastTimer);
  }

  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 4000);
};

const renderDocuments = () => {
  documentList.innerHTML = "";

  if (!documents.length) {
    const empty = document.createElement("li");
    empty.className = "document";
    empty.textContent = "No documents stored yet.";
    documentList.appendChild(empty);
    return;
  }

  documents.forEach(doc => {
    const item = document.createElement("li");
    item.className = "document";

    const info = document.createElement("div");
    info.className = "document__info";

    const name = document.createElement("span");
    name.className = "document__name";
    name.textContent = doc.name || "Untitled document";

    const meta = document.createElement("span");
    meta.className = "document__meta";
    const sizeKb = doc.size ? `${Math.round(doc.size / 1024)} KB` : "Unknown size";
    meta.textContent = `${doc.type || "text"} - ${sizeKb}`;

    info.append(name, meta);

    const actions = document.createElement("div");
    actions.className = "document__actions";

    const removeButton = document.createElement("button");
    removeButton.className = "document__button";
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", () => {
      documents = documents.filter(item => item.id !== doc.id);
      storageSet({ documents }).then(() => {
        renderDocuments();
        showToast("Document removed.");
      });
    });

    actions.appendChild(removeButton);
    item.append(info, actions);
    documentList.appendChild(item);
  });
};

const updateServerPreview = () => {
  if (serverBaseUrlPreview) {
    serverBaseUrlPreview.textContent = serverBaseUrl || DEFAULT_SERVER;
  }
};

const readFileAsText = file =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Unable to read file."));
    reader.readAsText(file);
  });

const extractPdfText = async file => {
  const baseUrl = normalizeBaseUrl(serverBaseUrl);
  const formData = new FormData();
  formData.append("file", file);

  let response;
  try {
    response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/extract-pdf`, {
      method: "POST",
      body: formData
    });
  } catch (error) {
    throw new Error(
      `Cannot reach the server at ${baseUrl}. Start it with "npm run dev" and confirm the URL under Server settings.`
    );
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `PDF extraction failed with ${response.status}.`);
  }

  const data = await response.json();
  return (data.text || "").trim();
};

const handleDocumentUpload = async event => {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  try {
    const isPdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    showToast(`Processing ${file.name}...`);
    const content = isPdf ? await extractPdfText(file) : await readFileAsText(file);

    if (!content.trim()) {
      throw new Error("No text detected in the selected document.");
    }

    const docRecord = {
      id: crypto.randomUUID ? crypto.randomUUID() : `doc-${Date.now()}`,
      name: file.name,
      type: isPdf ? "pdf" : file.type || "text",
      size: file.size,
      content: content.slice(0, 20000)
    };

    documents = [...documents, docRecord];
    await storageSet({ documents });
    renderDocuments();
    showToast(`${file.name} stored.`);
  } catch (error) {
    console.error("Document upload failed", error);
    showToast(error.message || "Failed to process document.");
  } finally {
    event.target.value = "";
  }
};

const handleClearData = async () => {
  const confirmClear = window.confirm(
    "Remove all stored profile and documents? This action cannot be undone."
  );
  if (!confirmClear) {
    return;
  }

  await storageRemove(["documents", "serverBaseUrl"]);
  serverBaseUrl = DEFAULT_SERVER;
  updateServerPreview();
  documents = [];
  renderDocuments();
  showToast("All extension data cleared.");
};

const loadState = async () => {
  const state = await storageGet(["serverBaseUrl", "documents"]);
  serverBaseUrl = normalizeBaseUrl(state.serverBaseUrl || DEFAULT_SERVER);
  if (serverBaseUrl !== state.serverBaseUrl) {
    storageSet({ serverBaseUrl });
  }

  documents = Array.isArray(state.documents) ? state.documents : [];
  renderDocuments();
  updateServerPreview();
};

documentFileInput.addEventListener("change", handleDocumentUpload);
clearDataButton.addEventListener("click", event => {
  event.preventDefault();
  handleClearData();
});

if (serverConfigButton) {
  serverConfigButton.addEventListener("click", () => {
    window.location.href = "server.html";
  });
}

loadState();
