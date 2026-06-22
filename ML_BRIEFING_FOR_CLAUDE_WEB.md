# Briefing for Claude Web — AI/ML Intern Project Guide

> **Status: IMPLEMENTED.** The four ML features described here have since been built (`ml-service/`) and integrated into the Node backend as an optional, fallback-safe layer. This file is kept as the original design brief / background. For how it actually works now, see [`docs/ARCHITECTURE.md §14`](docs/ARCHITECTURE.md#14-aiml-layer-integrated-optional-at-runtime), [`RUNNING.md`](RUNNING.md), and the AI/ML section of the [`README`](README.md). Note one detail this brief gets wrong about the *original* code: vendor matching was substring-based, not Levenshtein — the ML `/match` endpoint now supplements that substring match rather than replacing a Levenshtein one.

Paste this entire document as your first message into Claude web. Everything Claude needs to know is below.

---

## Who I am and what I need

I am an AI/ML intern working on a one-month internship project. I have already built a full-stack invoice automation system (described below). Now I need to add genuine AI/ML components to it so I can present this as an AI/ML intern project to my mentor. I need you to guide me through building 4 specific ML features — **one at a time, step by step, very slowly and in detail**. Do not jump ahead. Do not give me everything at once. Walk me through each step like I am learning, explain WHY we are doing each thing, and wait for me to confirm before moving to the next step.

We will work through these features in a separate chat (this one) and later I will integrate the results into my main project. The main integration will be handled separately. For now, focus entirely on helping me build and understand each ML feature.

---

## The Project — Invoice Automation System

### What it does
An internal enterprise tool for finance teams to process supplier invoices end-to-end:
1. Finance team uploads a PDF invoice
2. System runs OCR (pdf-parse) to extract raw text from the PDF
3. Regex patterns extract fields: vendor name, invoice number, total amount, date, PO number, GST number, bank account
4. A human reviewer verifies/corrects the extracted fields
5. System matches the invoice against a Purchase Order (PO) in the database using fuzzy string matching (Levenshtein distance)
6. Invoice is either auto-approved (passed) or flagged for review if amounts don't match or vendor names differ

### Tech stack (existing, already built)
- **Backend:** Node.js + Express REST API (port 5000)
- **Frontend:** React + Vite + Tailwind CSS (port 5173)  
- **Database:** MongoDB with Mongoose
- **OCR:** pdf-parse (Node.js library — gives raw text from PDF)
- **Current extraction:** Regex patterns in `extractionService.js`
- **Current matching:** Levenshtein fuzzy string distance
- **Current confidence scores:** Hardcoded numbers (e.g., `confidence: 85` is just a constant, not learned)
- **Auth:** JWT, role-based (admin / accountant / viewer)
- **PDF viewer:** react-pdf with colour-coded annotation overlay showing extracted fields

### Key data models
```
Invoice: {
  status: uploaded | ocr_extracted | pending_review | review_required | passed | rejected,
  uploadedFile: { filename, mimetype, size },
  extractedData: {
    vendorName:    { value, confidence },
    invoiceNumber: { value, confidence },
    totalAmount:   { value, confidence },
    invoiceDate:   { value, confidence },
    poNumber:      { value, confidence },
    gstNumber:     { value, confidence },
    bankAccount:   { value, confidence },
  },
  validationResult: {
    status: passed | review_required,
    matchScore: 0-100,
    discrepancies: [{ field, expected, actual, severity }]
  },
  vendor: ref → Vendor,
  purchaseOrder: ref → PurchaseOrder,
}

Vendor: { name, email, requiredFields: [{ fieldKey, fieldLabel }] }

PurchaseOrder: { poNumber, vendor, totalAmount, currency, status }
```

### The existing problem (why ML is needed)
- **Extraction is brittle:** The regex approach breaks on any invoice that doesn't follow expected patterns. It has no ability to generalise to new invoice formats.
- **Matching is naive:** Levenshtein distance compares characters, not meaning. "TechCorp Solutions" vs "Tech Corp Soln." fails.
- **Confidence is fake:** Every vendor name gets `confidence: 70` regardless of how clear or ambiguous the extraction was. It is a hardcoded constant.
- **No fraud/anomaly detection:** An invoice for 10× the usual amount from a vendor gets the same treatment as a normal one.

---

## The 4 AI/ML Features We Are Building

These will all live in a **Python FastAPI microservice** (`ml-service/`) that the existing Node.js backend calls via HTTP. This is the standard production pattern for serving ML models alongside a non-Python backend.

### Feature 1 — Named Entity Recognition (NER) for invoice field extraction
**Goal:** Replace the regex `extractionService.js` with a trained spaCy NER model that learns to find invoice entities from text.

**Custom entities the model learns:**
- `VENDOR` — the supplier company name
- `INV_NUM` — the invoice number / reference
- `AMOUNT` — the total payable amount
- `INV_DATE` — the invoice date
- `PO_NUM` — the purchase order number
- `GST_NUM` — the GST/tax registration number
- `BANK_ACC` — the bank account number

**The plan:**
1. Write a Python script that **generates synthetic annotated invoice training data** (varied formats, vendors, layouts) — this gives us labelled examples without manual annotation
2. Convert this data into **spaCy's training format** (DocBin with entity spans)
3. **Train a spaCy NER pipeline** in Google Colab (uses GPU for speed)
4. Evaluate: precision, recall, F1 per entity class — these are the real metrics to show the mentor
5. Save/export the trained model
6. Build a FastAPI endpoint `/extract` that loads the model and returns extracted entities
7. Later: Node.js backend calls this instead of the regex file

**Why this is real ML work:**  
We are building a dataset, defining a model architecture (spaCy's transition-based NER), running a training loop with evaluation, measuring performance metrics, and deploying it. This is end-to-end supervised NLP.

---

### Feature 2 — Anomaly Detection for suspicious invoices
**Goal:** Train an Isolation Forest to give every invoice an anomaly score (0–1) flagging statistically unusual invoices for extra scrutiny.

**Features we engineer from each invoice:**
- `amount_zscore` — how many standard deviations is this amount from this vendor's historical average?
- `amount_to_po_ratio` — invoice amount ÷ PO amount (>1.1 is suspicious)
- `vendor_invoice_frequency` — how many invoices from this vendor in the last 30 days?
- `days_since_last_invoice` — gap from previous invoice (0 = possible duplicate submission)
- `line_item_count` — number of line items
- `amount_per_line_item` — total ÷ line items (unusually high = suspicious)
- `is_round_number` — round amounts like 10000.00 are a fraud signal

**The plan:**
1. Generate synthetic invoice history data — "normal" invoices + deliberate anomalies (split billing, amount inflation, rapid resubmission)
2. Train `IsolationForest` from scikit-learn in Colab, tune the `contamination` parameter
3. Plot anomaly score distribution and example flagged invoices
4. Export the trained model with `joblib`
5. Build a FastAPI endpoint `/anomaly` that takes invoice features and returns a score + risk level (low/medium/high)
6. Later: add `anomalyScore` and `riskLevel` fields to the Invoice model, shown as a badge in the UI

**Why this is real ML work:**  
Unsupervised learning, feature engineering, hyperparameter tuning, model evaluation with precision/recall on held-out anomalies.

---

### Feature 3 — Semantic vendor/PO matching with sentence embeddings
**Goal:** Replace Levenshtein string distance with semantic vector similarity for vendor name matching.

**The approach:**
- Use `sentence-transformers` (`all-MiniLM-L6-v2`) to embed vendor names into 384-dimensional vectors
- Match by cosine similarity instead of character edit distance
- Optional fine-tuning step: create positive/negative vendor name pairs and fine-tune with contrastive loss on invoice domain data — this is the "we trained something" angle

**Why this is better:**
- "TechCorp Solutions" and "Tech Corp Soln." are far apart by edit distance but close in embedding space
- Handles abbreviations, reorderings, and common vendor name variations

**The plan:**
1. Understand sentence embeddings and cosine similarity
2. Load a pre-trained sentence-transformer model
3. Create a vendor name similarity dataset (pairs: same vendor / different vendor)
4. Fine-tune with `sentence-transformers` `CosineSimilarityLoss` in Colab
5. Evaluate: precision@1 comparison old vs new
6. Build FastAPI endpoint `/match` that takes two names and returns similarity score
7. Later: Node.js calls this during PO matching step

---

### Feature 4 — Learned confidence scoring (replaces hardcoded values)
**Goal:** Train a binary classifier that predicts whether an extracted field value is actually correct, replacing the fake hardcoded confidence constants.

**Input features for the classifier (per extracted field):**
- Was a label keyword found within N characters of the value? (e.g., "Invoice No:" before the number)
- How many different regex patterns matched (0, 1, or 2+)?
- Does the value appear more than once in the document?
- Is the value format valid for its type? (date is a real date, amount is numeric, GST matches GST pattern)
- Length of the matched value (very short values are often wrong)
- Position in document (header-area fields are more reliable)

**The plan:**
1. Create a labelled dataset of (extracted field, features) → correct/incorrect
2. Train logistic regression + a small neural net, compare
3. Show calibration curve (does a predicted 80% confidence mean the extraction is right 80% of the time?)
4. Export model
5. Build FastAPI endpoint `/confidence` 
6. Later: replaces the hardcoded confidence values in `extractionService.js`

---

## Architecture of the Python ML Microservice

```
ml-service/
├── main.py                  # FastAPI app, route definitions
├── models/
│   ├── ner_model/           # Exported spaCy NER model directory
│   ├── anomaly_model.joblib # Trained Isolation Forest
│   ├── embedding_model/     # Fine-tuned sentence-transformer
│   └── confidence_model.joblib  # Trained classifier
├── services/
│   ├── extraction.py        # NER inference logic
│   ├── anomaly.py           # Anomaly scoring logic
│   ├── matching.py          # Embedding similarity logic
│   └── confidence.py        # Confidence prediction logic
├── requirements.txt
└── training/                # Colab notebooks live here (exported)
    ├── 01_ner_training.ipynb
    ├── 02_anomaly_training.ipynb
    ├── 03_embedding_training.ipynb
    └── 04_confidence_training.ipynb
```

**FastAPI endpoints (all POST, all return JSON):**
- `POST /extract` — takes `{ "text": "..." }`, returns extracted entities with confidence
- `POST /anomaly` — takes `{ "features": {...} }`, returns `{ "score": 0.73, "risk": "high" }`
- `POST /match` — takes `{ "name1": "...", "name2": "..." }`, returns `{ "similarity": 0.94 }`
- `POST /confidence` — takes `{ "field": "...", "features": {...} }`, returns `{ "confidence": 0.81 }`
- `GET /health` — returns `{ "status": "ok" }`

---

## How to guide me

1. **Start with Feature 1 (NER).** This is the most impactful and foundational. Features 2, 3, 4 build on the same ML service.

2. **Go one small step at a time.** For example, do not give me the entire training script at once. First explain what spaCy NER is and how it works, then help me write the data generator, then help me understand the data format, then write the training config, etc.

3. **Explain the WHY behind each decision.** I need to be able to explain this to my mentor. If we choose a certain architecture or hyperparameter, tell me why.

4. **Assume I will run training in Google Colab.** All training notebooks should be written for Colab (GPU runtime, Google Drive for saving models). Guide me on Colab setup when we get there.

5. **After each step, pause and ask me if I understood / if it ran correctly** before moving on.

6. **When a feature is fully working** (data generated, model trained, FastAPI endpoint running, tested with a sample request), mark it complete and then ask if I am ready to move to the next feature.

7. **For the integration back into the project** — do not worry about that now. I will handle integration in a separate terminal session. Just make sure each FastAPI endpoint is clean and well-tested in isolation.

---

## Start here

Begin by introducing Feature 1 (NER model). Give me:
- A plain English explanation of what NER is and why spaCy is a good choice for this (2-3 paragraphs, mentor-explainable level)
- What Google Colab setup I need (runtime type, packages to install)
- Then stop and wait for me to confirm I have Colab open before giving me any code
