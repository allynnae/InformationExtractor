<template>
  <div class="min-h-screen bg-slate-100 text-slate-900 flex items-center justify-center px-6 py-12">
    <div class="w-full max-w-3xl flex flex-col items-center gap-10">
      <header class="w-full text-center space-y-3">
        <h1 class="text-4xl font-semibold text-sky-500">Information Extractor</h1>
      </header>

      <section class="w-full grid gap-6 rounded-3xl bg-white/90 p-8 shadow-xl ring-1 ring-slate-200 backdrop-blur">
        <p class="rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-500 ring-1 ring-sky-100 text-center">
          Upload documents, ask questions, and get answers right away.
        </p>
        <div class="grid gap-2">
          <label class="text-sm font-semibold text-slate-600">Documents</label>
          <label class="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-sky-500/80 bg-sky-500/10 px-6 py-8 text-center transition hover:border-sky-500 hover:bg-sky-500/20">
            <span class="pi pi-upload text-sky-500"></span>
            <span class="text-sm font-medium text-slate-600">Choose files to analyze</span>
            <span class="text-xs text-slate-500">You can add multiple files (txt, md, json, csv, log, html, xml, pdf)</span>
            <input
              ref="fileInput"
              type="file"
              multiple
              accept=".txt,.md,.json,.csv,.log,.html,.xml,.pdf,.cc"
              class="hidden"
              @change="onFileChange"
            />
          </label>
          <div v-if="selectedFiles.length" class="flex flex-wrap items-center gap-2">
            <div
              v-for="file in selectedFiles"
              :key="file.name + file.size + file.lastModified"
              class="flex items-center gap-2 rounded-full bg-sky-500/15 px-3 py-1 text-xs text-sky-800 ring-1 ring-sky-300"
            >
              <span class="pi pi-file text-sky-500"></span>
              <span class="font-medium">{{ file.name }}</span>
              <span class="text-slate-500">{{ formatSize(file.size) }}</span>
            </div>
          </div>
        </div>

        <div class="grid gap-1">
          <label class="text-sm font-semibold text-slate-600" for="question">Question</label>
          <textarea
            id="question"
            v-model="question"
            placeholder="What would you like to know?"
            rows="4"
            class="w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-700 shadow-inner outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500"
          ></textarea>
        </div>

        <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Button
            type="button"
            label="Ask"
            icon="pi pi-send"
            :loading="isLoading"
            class="w-full md:w-auto"
            @click="askQuestion"
          />
          <Button
            type="button"
            label="Clear"
            icon="pi pi-refresh"
            severity="secondary"
            outlined
            class="w-full md:w-auto"
            @click="resetForm"
          />
        </div>

        <Message
          v-if="statusMessage"
          :severity="statusSeverity"
          :closable="false"
          :class="statusSeverity === 'info' ? 'text-sky-500' : ''"
        >
          <template #messageicon>
            <span :class="infoIconClass" class="pi pi-info-circle"></span>
          </template>
          {{ statusMessage }}
        </Message>
      </section>

      <section
        v-if="answer"
        class="w-full rounded-3xl bg-white/90 p-8 shadow-xl ring-1 ring-slate-200 backdrop-blur"
      >
        <div class="mb-4 flex items-center gap-3">
          <span class="pi pi-comments text-sky-500"></span>
          <h2 class="text-2xl font-semibold text-slate-700">Answer</h2>
        </div>
        <pre class="whitespace-pre-wrap rounded-2xl bg-slate-50 p-6 text-sm leading-relaxed text-slate-700">
{{ answer }}
        </pre>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";

const selectedFiles = ref([]);
const question = ref("");
const fileContents = ref([]);
const fileInput = ref(null);
const statusMessage = ref("");
const statusSeverity = ref("info");
const isLoading = ref(false);
const answer = ref("");
const infoIconClass = computed(() =>
  statusSeverity.value === "info" ? "text-sky-500 me-1" : "text-inherit me-1"
);

const truncateContent = (text, limit = 4000) =>
  text.length > limit ? text.slice(0, limit) : text;

const setStatus = (message, severity = "info") => {
  statusMessage.value = message;
  statusSeverity.value = severity;
};

const clearStatus = () => {
  statusMessage.value = "";
};

const formatSize = bytes => {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const extractPdfText = async file => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/extract-pdf", {
    method: "POST",
    body: formData
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Failed to extract text from PDF.");
  }

  return (payload.text ?? "").trim();
};

const readFileContent = async file => {
  const lowerName = file.name.toLowerCase();
  if (file.type === "application/pdf" || lowerName.endsWith(".pdf")) {
    return await extractPdfText(file);
  }
  return await file.text();
};

const joinedContent = computed(() =>
  fileContents.value
    .map((text, index) => `Document ${index + 1}:\n${text}`)
    .join("\n\n---\n\n")
);

const resetForm = () => {
  question.value = "";
  selectedFiles.value = [];
  fileContents.value = [];
  answer.value = "";
  clearStatus();
  if (fileInput.value) {
    fileInput.value.value = "";
  }
};

const onFileChange = async event => {
  clearStatus();
  answer.value = "";
  const files = Array.from(event.target.files ?? []);

  if (!files.length) {
    if (!selectedFiles.value.length) {
      fileContents.value = [];
    }
    return;
  }

  const existingKeys = new Set(
    selectedFiles.value.map(file => `${file.name}-${file.size}-${file.lastModified}`)
  );
  const uniqueFiles = files.filter(file => {
    const key = `${file.name}-${file.size}-${file.lastModified}`;
    if (existingKeys.has(key)) {
      return false;
    }
    existingKeys.add(key);
    return true;
  });

  if (!uniqueFiles.length) {
    event.target.value = "";
    setStatus("Those files are already added.", "warn");
    return;
  }

  try {
    setStatus(
      `Reading ${uniqueFiles.length} document${uniqueFiles.length > 1 ? "s" : ""}...`,
      "info"
    );
    const texts = await Promise.all(uniqueFiles.map(readFileContent));
    selectedFiles.value = [...selectedFiles.value, ...uniqueFiles];
    fileContents.value = [...fileContents.value, ...texts];
    const total = selectedFiles.value.length;
    setStatus(`Loaded ${total} document${total > 1 ? "s" : ""}.`, "success");
  } catch (err) {
    setStatus(err.message || "Unable to read the documents.", "error");
  } finally {
    event.target.value = "";
  }
};

const askQuestion = async () => {
  answer.value = "";

  if (!fileContents.value.length) {
    setStatus("Select at least one document to analyze first.", "warn");
    return;
  }

  if (!question.value.trim()) {
    setStatus("Type a question about the documents.", "warn");
    return;
  }

  isLoading.value = true;
  setStatus("Processing...", "info");

  try {
    const response = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: truncateContent(joinedContent.value),
        question: question.value
      })
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      throw new Error(errorPayload.error || "Server returned an error.");
    }

    const data = await response.json();
    answer.value = data.answer?.trim() ?? "No response content.";
    setStatus("Response received.", "success");
  } catch (err) {
    setStatus(err.message || "Gemini request failed.", "error");
  } finally {
    isLoading.value = false;
  }
};

</script>
