# Multi-Document Information Extractor

A web application that uses large language models to automatically extract information from multiple documents and answer user-defined questions.

---

## Overview

Searching for information across multiple documents is time-consuming and often requires reasoning beyond simple keyword matching. This project presents an application that uses large language models to automate information extraction from multiple documents. The system reads documents in various formats, processes user-defined questions, and outputs structured answers with source attribution. Performance is tracked using Weights and Biases.

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
- Research paper analysis
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

Run the development server:
```bash
npm run dev:full
```

### Accessing the Interface

After running the command above, copy the local URL displayed in the terminal:
```
➜  Local:   http://localhost:5173/
```

Paste this link into your preferred browser to access the application.
