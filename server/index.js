import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import pdfParse from "pdf-parse";
import OpenAI from "openai";

const app = express();
const initialPort = Number(process.env.PORT) || 3000;
const apiKey = process.env.GEMINI_API_KEY;
const client = apiKey
  ? new OpenAI({
      apiKey,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
    })
  : null;

if (!apiKey) {
  console.warn(
    "GEMINI_API_KEY is not set. The server will start, but /api/ask requests will fail until you add the key."
  );
}

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

    res.json({ text });
  } catch (error) {
    console.error("PDF extraction failed:", error);
    res
      .status(500)
      .json({ error: error.message || "Unexpected error while extracting PDF text." });
  }
});

app.post("/api/ask", async (req, res) => {
  try {
    if (!client) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is not set. Add it to your environment and restart the server to ask questions."
      });
    }

    const { content, question } = req.body || {};

    if (!content || !question) {
      return res.status(400).json({ error: "Both content and question are required." });
    }

    const rawContent = String(content ?? "");
    const cleanedContent = rawContent.replace(/\0/g, "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");

    console.log(
      `Incoming /api/ask request - question_len=${String(question ?? "").length}, content_len=${cleanedContent.length}`
    );

    const prompt = `
You are an assistant that helps users fill out applications by extracting information from documents provided by the user.
Document:
---
${cleanedContent.slice(0, 4000)}
---
Question: ${question}
Provide a concise and clear answer based only on the information in the document. Use first person when applicable.
    `;

    const completion = await client.chat.completions.create({
      model: "gemini-2.0-flash",
      temperature: 0.3,
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: prompt }
      ]
    });

    const answer = completion.choices?.[0]?.message?.content?.trim() ?? "";
    res.json({ answer });
  } catch (error) {
    console.error("Gemini request failed:", error);
    res.status(500).json({ error: error.message || "Unexpected server error." });
  }
});

const startServer = port => {
  const server = app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
  });

  server.on("error", err => {
    if (err.code === "EADDRINUSE") {
      const nextPort = port + 1;
      console.warn(`Port ${port} is in use. Trying http://localhost:${nextPort} instead...`);
      server.close(() => startServer(nextPort));
    } else {
      console.error("Server failed to start:", err);
      process.exit(1);
    }
  });
};

startServer(initialPort);
