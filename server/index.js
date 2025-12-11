import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import pdfParse from "pdf-parse";
import OpenAI from "openai";
import ollama from "ollama";
import { randomUUID } from "crypto";

const app = express();

const initialPort = Number(process.env.PORT) || 3000;
const apiKey = process.env.GEMINI_API_KEY;

// Gemini client (Carson-Edits version — correct)
const client = apiKey
  ? new OpenAI({
      apiKey,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
    })
  : null;

if (!apiKey) {
  console.warn(
    "GEMINI_API_KEY is not set. The server will start, but /api/ask and /api/verify-answer requests will fail until the key is added."
  );
}

// ---------------- Carson-Edits Constants ----------------
const FALLBACK_ANSWER = "UNABLE TO IDENTIFY, USER INPUT REQUIRED";
const MAX_CONTEXT_CHARS = 20000;
const MAX_RESPONSE_CHARS = 300;
const MAX_RESPONSE_WORDS = 50;
const RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;

// ---------------- LLM Clients ----------------
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.1";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const shouldRetryError = error => {
  const status = error?.status ?? error?.response?.status;
  if (!status) return false;
  return status === 429 || status >= 500;
};

const withRetry = async (operation, { attempts = RETRY_ATTEMPTS, baseDelay = RETRY_BASE_DELAY_MS, requestId = "" }) => {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!shouldRetryError(error) || attempt === attempts) break;
      const delay = baseDelay * Math.pow(2, attempt - 1);

      console.warn(
        `[LLM][${requestId}] Retry ${attempt}/${attempts} after ${delay}ms due to error status ${
          error?.status ?? error?.response?.status ?? "unknown"
        }`
      );

      await sleep(delay);
    }
  }
  throw lastError;
};

const ollamaAsk = async (messages, requestId) => {
  console.log(`[${requestId}] Sending extraction to Ollama (${OLLAMA_MODEL})...`);
  const resp = await withRetry(
    () =>
      ollama.chat({
        model: OLLAMA_MODEL,
        messages,
        options: { temperature: 0.1, num_predict: 150, keep_alive: "5m" }
      }),
    { attempts: RETRY_ATTEMPTS, baseDelay: RETRY_BASE_DELAY_MS, requestId }
  );

  return resp.message?.content?.trim() ?? "";
};

const geminiVerify = async (messages, requestId) => {
  console.log(`[${requestId}] Sending verification to Gemini...`);
  const resp = await withRetry(
    () =>
      client.chat.completions.create({
        model: "gemini-2.0-flash",
        temperature: 0.0,
        max_tokens: 10,
        messages
      }),
    { attempts: RETRY_ATTEMPTS, baseDelay: RETRY_BASE_DELAY_MS, requestId }
  );
  return resp.choices?.[0]?.message?.content?.trim() ?? "";
};

// ---------------- Logging Utilities ----------------
const logSection = (title, content, requestId = "") => {
  const prefix = requestId ? `[${requestId}]` : "";
  console.log("\n" + "=".repeat(80));
  console.log(`${prefix} ${title}`);
  console.log("=".repeat(80));
  console.log(content);
  console.log("=".repeat(80) + "\n");
};

// ---------------- Document Sanitization ----------------
const sanitizeDocumentContent = content =>
  String(content ?? "")
    .replace(/\0/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .trim()
    .slice(0, MAX_CONTEXT_CHARS);

// ---------------- Answer Normalization ----------------
const normalizeAnswer = (rawAnswer, context, requestId) => {
  const safe = String(rawAnswer ?? "");
  console.log(`[${requestId}] RAW LLM RESPONSE: "${safe}"`);

  if (!safe.trim()) return FALLBACK_ANSWER;

  let answer = safe.split("\n")[0].trim();
  answer = answer.replace(/^["']|["']$/g, "").replace(/\s+/g, " ").trim();

  if (!answer) return FALLBACK_ANSWER;

  const lower = answer.toLowerCase();
  const noAnswerPhrases = [
    "not found",
    "not provided",
    "not mentioned",
    "not specified",
    "no information",
    "cannot determine",
    "unable to find",
    "not available",
    "not present",
    "does not contain",
    "i don't see",
    "i cannot find"
  ];

  if (noAnswerPhrases.some(phrase => lower.includes(phrase))) return FALLBACK_ANSWER;

  if (answer.length > MAX_RESPONSE_CHARS) return FALLBACK_ANSWER;
  if (answer.split(/\s+/).length > MAX_RESPONSE_WORDS) return FALLBACK_ANSWER;

  return answer;
};

// ---------------- Express Setup ----------------
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// ---------------- PDF Extraction ----------------
app.post("/api/extract-pdf", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No PDF file provided." });

    const parsed = await pdfParse(req.file.buffer);
    const text = parsed.text?.trim();

    if (!text) return res.status(400).json({ error: "Unable to extract text from the PDF." });

    console.log(`PDF extracted (${text.length} chars)`);
    res.json({ text });
  } catch (err) {
    console.error("PDF extraction failed:", err);
    res.status(500).json({ error: err.message || "Unexpected error extracting PDF" });
  }
});

// ---------------- MAIN EXTRACTION ENDPOINT ----------------
app.post("/api/ask", async (req, res) => {
  let requestId = randomUUID().split("-")[0];

  try {
    const { content, question } = req.body || {};
    if (!content || !question)
      return res.status(400).json({ error: "Both content and question are required." });

    const cleanedContent = sanitizeDocumentContent(content);
    const trimmedQuestion = String(question).trim();

    logSection(
      "INCOMING REQUEST",
      `Request ID: ${requestId}\n\nQUESTION:\n${trimmedQuestion}\n\nCONTEXT LENGTH: ${cleanedContent.length}`,
      requestId
    );

    const systemPrompt = `You are a form-filling assistant... (unchanged)`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Documents:\n${cleanedContent}` },
      { role: "user", content: `${trimmedQuestion}\n\nExtract ONLY the value.` }
    ];

    const rawAnswer = await ollamaAsk(messages, requestId);
    const answer = normalizeAnswer(rawAnswer, cleanedContent, requestId);

    return res.json({ answer });
  } catch (error) {
    console.error(`[${requestId}] ERROR`, error);
    res.status(500).json({ error: error.message || "Unexpected server error." });
  }
});

// ---------------- VERIFICATION ENDPOINT ----------------
app.post("/api/verify-answer", async (req, res) => {
  let requestId = randomUUID().split("-")[0];

  try {
    const { content, question, answer } = req.body || {};
    if (!content || !question || !answer)
      return res.status(400).json({ error: "Content, question, and answer are required." });

    const cleaned = sanitizeDocumentContent(content);

    const messages = [
      {
        role: "system",
        content: "You are a verifier. Respond with only CORRECT or INCORRECT."
      },
      {
        role: "user",
        content: `CONTEXT:\n${cleaned}\n\nQUESTION:\n${question}\n\nANSWER:\n${answer}`
      }
    ];

    const verificationResult = await geminiVerify(messages, requestId);
    const isCorrect = verificationResult.toUpperCase().includes("CORRECT");

    return res.json({ isCorrect, verificationResult });
  } catch (error) {
    console.error(`[${requestId}] VERIFICATION ERROR`, error);
    res.status(500).json({ error: error.message || "Unexpected verification error." });
  }
});

// ---------------- Start Server ----------------
const startServer = port => {
  const server = app.listen(port, () => {
    console.log(`\nServer running on http://localhost:${port}`);
  });

  server.on("error", err => {
    if (err.code === "EADDRINUSE") {
      const next = port + 1;
      console.warn(`Port ${port} in use, trying ${next}...`);
      server.close(() => startServer(next));
    } else {
      console.error("Server failed to start:", err);
      process.exit(1);
    }
  });
};

startServer(initialPort);
