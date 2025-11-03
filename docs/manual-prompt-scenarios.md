# Checkpoint 1 Manual Demo

## Goal
Demonstrate the feasibility of the scholarship and award assistant by running curated manual prompts that mirror real application tasks.

## How to Run the Demo
1. Start the development server (`npm run dev:full`) and open the web UI.
2. Upload the file(s) below as separate documents.
3. Paste the scenario's manual prompt into the question box and click **Ask**.
4. Compare the model's answer with the expected result and acceptance criteria.

## Global Output Acceptance Criteria
- Provide accurate information.
- If a requested field is not present, respond with `Not found in provided documents.` or something similar in that spot.
- Keep answers under 200 words unless the scenario specifies a stricter word limit.

---

## Test Cases

### TC1 - Leadership Highlight
**Document setup**
- Document 1 - `McKee Resume Fall 25.pdf`

**Manual prompt**
```
Describe a time when you demonstrated leadership abilities.
```

**Output**
```
As Section Leader for the Ohio University Marching 110, Allison led the mellophone section in marching techniques. 
```

### TC2 - Relevant Experience
**Document setup** 
- Document 1 - `McKee Resume Fall 25.pdf`

**Manual prompt**
```
Describe your relevant experience for the role of Software Engineer.
```

**Output**
```
Allison McKee has experience as a Software Engineer Intern at Diamond Power – Andritz where she modernized a legacy Historian system, conducted technical research and evaluation of hardware components, and developed detailed specification sheets. She also developed a Python-based program utilizing OCR and NLP to analyze high school and college transcripts as a Data Analyst at Ohio University. 
```

### TC3 - Lacking Info Test
**Document setup** 
- Document 1 - `McKee Resume Fall 25.pdf`

**Manual prompt**
```
Tell us about your experience using Photoshop.
```

**Output**
```
The document does not contain information about experience using Photoshop.
```