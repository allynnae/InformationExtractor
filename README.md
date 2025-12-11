# Multi-Document Information Extractor

Searching for information across multiple documents is time-consuming and often requires reasoning beyond simple keyword matching. This project presents an application that uses large language models to automate information extraction from multiple documents. The system reads documents in various formats, processes user-defined questions, and outputs structured answers with source attribution. Performance is tracked using Weights and Biases.

---

## Documentation

- [PowerPoint Proposal](https://catmailohio-my.sharepoint.com/:p:/g/personal/am893120_ohio_edu/ERL8YD0zg0dKpSmRaD6P0_IB15sRSAr17Pw7vXwrnDd3mg?e=4Cocvk)
- [Research Paper](https://www.overleaf.com/read/jjyqfqyvwchx#e1557a)

---

## Features

- **Multi-format file support**: Process txt, md, json, csv, log, html, xml, and pdf files
- **LLM-powered**: Uses Gemini for intelligent question answering
- **Fast processing**: Handles multiple documents in an efficient manner
- **Performance tracking**: Integrated W&B logging for metrics
- **Simple UI**: Easy-to-use user interface

---

## Use Cases

- Scholarship and award applications
- Technical documentation search
- Resume and CV screening

---

## Prerequisites

### System Requirements

Update system and install dependencies:
```bash
sudo apt update
sudo apt install -y curl
```

### Node.js Installation

Install Node.js (version 22):
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

Verify installation:
```bash
node -v
npm -v
```

### API Key Setup

Export your Gemini API key:
```bash
export GEMINI_API_KEY=yourkey
```

---

## Installation

Install project dependencies:
```bash
npm install
```

---

## Usage

### Starting the Application

Run this in the background before going to the extension:
```bash
npm run dev 
```

### Accessing the Interface
- Load the extension in Chrome: visit `chrome://extensions`, enable **Developer mode**, and click **Load unpacked**. Select the `extension/` directory. I recommend pinning it to your toolbar for easy access.
- Configure your data: open the extension popup and choose and upload the documents you want the assistant to use.
- Autofill a form: navigate to an application page, click the extension’s toolbar icon, and press **Autofill this page** to populate the detected fields using your stored documents.

---

## ASSURE-inspired Demo

Use the new ASSURE-style harness to mirror the process described in [ASSURE: Metamorphic Testing for AI-powered Browser Extensions (arXiv:2507.05307)](https://arxiv.org/pdf/2507.05307). The demo showcases:
- **Test case generation** - curated scenarios in `tests/assure-demo.js` automatically create baseline + metamorphic variants (document shuffles, paraphrased prompts, injected distractors).
- **Automated execution** - every variant is sent to `/api/ask` so you can observe how the model behaves under controlled perturbations.
- **Validation pipeline** - lexical/keyword invariants and security guards check consistency instead of relying on brittle exact matches.

### Run the demo
1. Export `GEMINI_API_KEY` and start the API server: `npm run dev:server`.
2. (Optional) Point to a different server with `ASSURE_SERVER_URL=http://localhost:4000`.
3. From another terminal run `npm run demo:assure`.
4. Review the PASS/FAIL report printed to the console. The script exits with code `1` if any invariant fails, making it easy to wire into CI.

---

## Checkpoint 1 Manual Demo Scenarios
- See `tests/prompt-scenarios-allison.md` for curated manual prompts and acceptance criteria.
