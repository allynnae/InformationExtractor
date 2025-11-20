const serverBaseUrlInput = document.getElementById("serverBaseUrl");
const serverForm = document.getElementById("serverForm");
const backButton = document.getElementById("backToSettings");
const toast = document.getElementById("toast");

const DEFAULT_SERVER = "http://localhost:3000";
let toastTimer = null;

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
  }, 3500);
};

const loadServerBaseUrl = async () => {
  const state = await storageGet(["serverBaseUrl"]);
  const baseUrl = normalizeBaseUrl(state.serverBaseUrl || DEFAULT_SERVER);
  serverBaseUrlInput.value = baseUrl;

  if (baseUrl !== state.serverBaseUrl) {
    storageSet({ serverBaseUrl: baseUrl });
  }
};

const saveServerBaseUrl = async () => {
  const normalized = normalizeBaseUrl(serverBaseUrlInput.value);
  serverBaseUrlInput.value = normalized;
  await storageSet({ serverBaseUrl: normalized });
  showToast("Server URL saved.");
};

serverForm.addEventListener("submit", event => {
  event.preventDefault();
  saveServerBaseUrl();
});

serverBaseUrlInput.addEventListener("change", saveServerBaseUrl);
serverBaseUrlInput.addEventListener("blur", saveServerBaseUrl);

backButton.addEventListener("click", () => {
  window.location.href = "options.html";
});

loadServerBaseUrl();
