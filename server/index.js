import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import pdfParse from "pdf-parse";
import OpenAI from "openai";
import { randomUUID } from "crypto";

const app = express();
const initialPort = Number(process.env.PORT) || 3000;
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("Missing GEMINI_API_KEY environment variable. Set it before starting the server.");
  process.exit(1);
}

const client = new OpenAI({
  apiKey,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
});

const FALLBACK_ANSWER = "UNABLE TO IDENTIFY, USER INPUT REQUIRED";
const MAX_CONTEXT_CHARS = 20000;
const MAX_RESPONSE_CHARS = 100;
const MAX_RESPONSE_WORDS = 15;
const RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;

// Enhanced logging utility
const logSection = (title, content, requestId = "") => {
  const prefix = requestId ? `[${requestId}]` : "";
  console.log("\n" + "=".repeat(80));
  console.log(`${prefix} ${title}`);
  console.log("=".repeat(80));
  console.log(content);
  console.log("=".repeat(80) + "\n");
};

const sanitizeDocumentContent = content =>
  String(content ?? "")
    .replace(/\0/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .trim()
    .slice(0, MAX_CONTEXT_CHARS);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const shouldRetryError = error => {
  const status = error?.status ?? error?.response?.status;
  if (!status) return false;
  return status === 429 || status >= 500;
};

const withRetry = async (operation, { attempts = 3, baseDelay = 250, requestId = "" } = {}) => {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!shouldRetryError(error) || attempt === attempts) {
        break;
      }

      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.warn(
        `[LLM][${requestId}] Retry ${attempt}/${attempts} after ${delay}ms due to status ${
          error?.status ?? error?.response?.status ?? "unknown"
        }.`
      );
      await sleep(delay);
    }
  }
  throw lastError;
};

// More permissive answer validation
const normalizeAnswer = (rawAnswer, context, requestId) => {
  const safeRawAnswer = String(rawAnswer ?? "");
  console.log(`[${requestId}] 📥 RAW LLM RESPONSE: "${safeRawAnswer}"`);
  
  if (!safeRawAnswer) {
    console.log(`[${requestId}] VALIDATION: Empty response`);
    return FALLBACK_ANSWER;
  }

  // Take only the first line
  let answer = safeRawAnswer.split(/\r?\n/)[0].trim();
  
  // Remove quotes if present
  answer = answer.replace(/^["']|["']$/g, "");
  
  // Normalize whitespace
  answer = answer.replace(/\s+/g, " ").trim();

  if (!answer) {
    console.log(`[${requestId}] VALIDATION: Empty after normalization`);
    return FALLBACK_ANSWER;
  }

  // Check if it's explicitly the fallback
  if (answer === FALLBACK_ANSWER || answer.includes("UNABLE TO IDENTIFY")) {
    console.log(`[${requestId}] VALIDATION: Explicit fallback returned`);
    return FALLBACK_ANSWER;
  }

  // Check for phrases that indicate no answer
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

  const lowerAnswer = answer.toLowerCase();
  if (noAnswerPhrases.some(phrase => lowerAnswer.includes(phrase))) {
    console.log(`[${requestId}] VALIDATION: Contains "no answer" phrase`);
    return FALLBACK_ANSWER;
  }

  // Check length (more permissive now)
  if (answer.length > MAX_RESPONSE_CHARS) {
    console.log(`[${requestId}] VALIDATION: Too long (${answer.length} > ${MAX_RESPONSE_CHARS} chars)`);
    return FALLBACK_ANSWER;
  }

  const wordCount = answer.split(/\s+/).length;
  if (wordCount > MAX_RESPONSE_WORDS) {
    console.log(`[${requestId}] VALIDATION: Too many words (${wordCount} > ${MAX_RESPONSE_WORDS})`);
    return FALLBACK_ANSWER;
  }

  // Check for very long exact copies (50+ chars)
  if (answer.length > 50) {
    const answerLower = answer.toLowerCase();
    const contextLower = context.toLowerCase();
    if (contextLower.includes(answerLower)) {
      console.log(`[${requestId}]  VALIDATION: Possible document copy detected (allowing)`);
      // Allow it but warn
    }
  }

  console.log(`[${requestId}] VALIDATION PASSED: "${answer}" (${answer.length} chars, ${wordCount} words)`);
  return answer;
};

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

app.post("/api/extract-pdf", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No PDF file provided." });
    }

    const parsed = await pdfParse(req.file.buffer);
    const text = parsed.text?.trim();

    if (!text) {
      return res.status(400).json({ error: "Unable to extract text from the PDF." });
    }

    console.log(`PDF extracted successfully (${text.length} characters)`);
    res.json({ text });
  } catch (error) {
    console.error("PDF extraction failed:", error);
    res
      .status(500)
      .json({ error: error.message || "Unexpected error while extracting PDF text." });
  }
});

app.post("/api/ask", async (req, res) => {
  let requestId = null;
  try {
    const { content, question } = req.body || {};

    if (!content || !question) {
      return res.status(400).json({ error: "Both content and question are required." });
    }

    const cleanedContent = sanitizeDocumentContent(content);
    const trimmedQuestion = String(question ?? "").trim();
    requestId = randomUUID().split('-')[0];

    // Log the incoming request
    logSection(
      "📥 INCOMING REQUEST",
      `Request ID: ${requestId}\n\n` +
      `QUESTION:\n${trimmedQuestion}\n\n` +
      `CONTEXT LENGTH: ${cleanedContent.length} characters\n\n` +
      `CONTEXT PREVIEW (first 1000 chars):\n${cleanedContent.slice(0, 1000)}...`,
      requestId
    );

    // Simplified, more effective system prompt
    const systemPrompt = `You are a form-filling assistant. Extract specific values from the provided documents to answer questions.

STRICT RULES:
1. Answer with ONLY the extracted value - nothing else
2. Keep answers short: typically 1-5 words
3. Never explain, never add context
4. If you cannot find the exact information, respond with: "${FALLBACK_ANSWER}"

EXAMPLES:
Question: "What is your name?"
Good: "John Smith"
Bad: "The name in the document is John Smith"

Question: "What is your email?"
Good: "john@example.com"
Bad: "Based on the document, the email appears to be john@example.com"

Question: "What is your phone number?"
Good: "555-1234"
Bad: "The phone number provided is 555-1234"`;

    const messages = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Here are the documents containing information:\n\n${cleanedContent}`
      },
      {
        role: "user",
        content: `${trimmedQuestion}\n\nExtract ONLY the value. If not found, respond: ${FALLBACK_ANSWER}`
      }
    ];

    console.log(`[${requestId}] Sending to Gemini...`);

    const startTime = Date.now();
    const completion = await withRetry(
      () =>
        client.chat.completions.create({
          model: "gemini-2.0-flash",
          temperature: 0.1,
          max_tokens: 150,
          messages
        }),
      { attempts: RETRY_ATTEMPTS, baseDelay: RETRY_BASE_DELAY_MS, requestId }
    );
    const duration = Date.now() - startTime;

    const rawAnswer = completion.choices?.[0]?.message?.content?.trim() ?? "";
    
    // Log the complete response
    console.log(`[${requestId}] Response time: ${duration}ms`);
    console.log(`[${requestId}] Model: ${completion.model}`);
    console.log(`[${requestId}] Finish reason: ${completion.choices?.[0]?.finish_reason}`);

    const answer = normalizeAnswer(rawAnswer, cleanedContent, requestId);

    // Final result
    const status = answer === FALLBACK_ANSWER ? "NO MATCH" : "MATCH FOUND";
    logSection(
      `${status}`,
      `Question: ${trimmedQuestion.slice(0, 200)}\n\n` +
      `Answer: "${answer}"\n\n` +
      `Length: ${answer.length} chars, ${answer.split(/\s+/).length} words`,
      requestId
    );

    return res.json({ answer });
  } catch (error) {
    const prefix = requestId ? `[${requestId}]` : "[ERROR]";
    console.error(`\n${"!".repeat(80)}`);
    console.error(`${prefix} ERROR`);
    console.error(`${"!".repeat(80)}`);
    console.error(error);
    console.error(`${"!".repeat(80)}\n`);

    const status = error?.status ?? error?.response?.status;
    if (status === 429) {
      return res.status(429).json({
        error: "Rate limited. Please wait and try again."
      });
    }

    res.status(500).json({ error: error.message || "Unexpected server error." });
  }
});

const startServer = port => {
  const server = app.listen(port, () => {
    console.log("\n" + "=".repeat(80));
    console.log(`🚀 AUTOFILL SERVER STARTED`);
    console.log("=".repeat(80));
    console.log(`URL: http://localhost:${port}`);
    console.log(`Model: gemini-2.0-flash`);
    console.log(`Max response: ${MAX_RESPONSE_WORDS} words, ${MAX_RESPONSE_CHARS} chars`);
    console.log(`Logging: ENABLED (detailed diagnostic mode)`);
    console.log("=".repeat(80) + "\n");
  });

  server.on("error", err => {
    if (err.code === "EADDRINUSE") {
      const nextPort = port + 1;
      console.warn(`Port ${port} in use. Trying port ${nextPort}...`);
      server.close(() => startServer(nextPort));
    } else {
      console.error("Server failed to start:", err);
      process.exit(1);
    }
  });
};

startServer(initialPort);