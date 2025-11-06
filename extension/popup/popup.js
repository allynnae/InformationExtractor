const runButton = document.getElementById("runAutofill");
const optionsButton = document.getElementById("openOptions");
const statusContainer = document.getElementById("statusContainer");
const statusMessage = document.getElementById("statusMessage");

const setStatus = (message, type = "info") => {
  if (!message) {
    statusContainer.hidden = true;
    statusMessage.textContent = "";
    return;
  }

  statusContainer.hidden = false;
  statusMessage.textContent = message;
  statusMessage.dataset.type = type;
};

const runAutofill = async () => {
  runButton.disabled = true;
  setStatus("Running autofill...");

  try {
    const response = await chrome.runtime.sendMessage({ type: "run-autofill" });

    if (response?.success) {
      setStatus(`Filled ${response.filled} field(s).`, "success");
    } else {
      throw new Error(response?.error || "Autofill failed.");
    }
  } catch (error) {
    console.error("Autofill failed", error);
    setStatus(error.message || "Unable to autofill this page.", "error");
  } finally {
    runButton.disabled = false;
  }
};

runButton.addEventListener("click", () => {
  runAutofill();
});

optionsButton.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});
