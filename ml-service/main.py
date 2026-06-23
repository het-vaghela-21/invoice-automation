import warnings
warnings.filterwarnings("ignore", message="X does not have valid feature names")

import io
import json
import os

import joblib
import numpy as np
import torch
from fastapi import FastAPI, File, HTTPException, UploadFile
from functools import lru_cache
from PIL import Image
from pdf2image import convert_from_bytes
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer, util
from transformers import LayoutLMv3ForTokenClassification, LayoutLMv3Processor
import easyocr

app = FastAPI(title="Invoice ML Service", version="2.0.0")

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# Poppler path for pdf2image on Windows
POPPLER_PATH = r"D:\poppler\poppler-25.07.0\Library\bin"

# Base directory (same folder as this file)
ML_BASE = os.path.dirname(os.path.abspath(__file__))

# ── LayoutLMv3 extraction model ───────────────────────────────────────────────
print("Loading LayoutLMv3...")
with open(os.path.join(ML_BASE, "label_map.json")) as f:
    label_map = json.load(f)
ID2LABEL = {int(k): v for k, v in label_map["id2label"].items()}

lmv3_processor = LayoutLMv3Processor.from_pretrained(
    os.path.join(ML_BASE, "layoutlmv3_invoice"), apply_ocr=False)
layoutlm = LayoutLMv3ForTokenClassification.from_pretrained(
    os.path.join(ML_BASE, "layoutlmv3_invoice"))
layoutlm = layoutlm.to(device)
layoutlm.eval()
print("LayoutLMv3 ready.")

print("Loading EasyOCR...")
ocr_reader = easyocr.Reader(["en"], gpu=torch.cuda.is_available())
print("EasyOCR ready.")

# ── Remaining models (unchanged) ──────────────────────────────────────────────
print("Loading anomaly model...")
anomaly_model  = joblib.load("models/anomaly_model.joblib")
anomaly_scaler = joblib.load("models/anomaly_scaler.joblib")

print("Loading matching model...")
matching_model = SentenceTransformer("models/embedding_model")

print("Loading confidence model...")
confidence_model  = joblib.load("models/confidence_model.joblib")
confidence_scaler = joblib.load("models/confidence_scaler.joblib")

print("All models loaded.")


# ── Request schemas ───────────────────────────────────────────────────────────

class AnomalyRequest(BaseModel):
    amount_zscore:            float
    amount_to_po_ratio:       float
    vendor_invoice_frequency: int
    days_since_last_invoice:  int
    line_item_count:          int
    amount_per_line_item:     float
    is_round_number:          int


class MatchRequest(BaseModel):
    name1: str
    name2: str


class ConfidenceRequest(BaseModel):
    label_proximity:         int
    pattern_match_count:     int
    appears_multiple_times:  int
    format_valid:            int
    value_length_norm:       float
    position_score:          float


# ── LayoutLMv3 helpers ────────────────────────────────────────────────────────

def run_ocr(image):
    img_w, img_h = image.size
    results = ocr_reader.readtext(np.array(image))
    words, bboxes = [], []
    for (box, text, conf) in results:
        if not text.strip():
            continue
        xs = [p[0] for p in box]
        ys = [p[1] for p in box]
        x0 = int(np.clip(min(xs) / img_w * 1000, 0, 1000))
        y0 = int(np.clip(min(ys) / img_h * 1000, 0, 1000))
        x1 = int(np.clip(max(xs) / img_w * 1000, 0, 1000))
        y1 = int(np.clip(max(ys) / img_h * 1000, 0, 1000))
        for word in text.split():
            words.append(word)
            bboxes.append([x0, y0, x1, y1])
    return words, bboxes


def run_layoutlm(image, words, bboxes):
    if not words:
        return {}
    encoding = lmv3_processor(
        image.convert("RGB"), words, boxes=bboxes,
        truncation=True, padding="max_length",
        max_length=512, return_tensors="pt"
    )
    inputs_plain = lmv3_processor(
        image.convert("RGB"), words, boxes=bboxes,
        truncation=True, padding="max_length", max_length=512
    )
    word_id_list = inputs_plain.word_ids(0)
    encoding = {k: v.to(device) for k, v in encoding.items()}
    with torch.no_grad():
        outputs = layoutlm(**encoding)
    predictions = outputs.logits[0].argmax(dim=-1).cpu().numpy()

    # Walk the BIO sequence and collect only the FIRST complete span per entity
    # type. Concatenating every non-O token into one string (old approach) fuses
    # multiple spans and pollutes values with label text and unrelated words.
    grouped: dict = {}
    seen_word_ids: set = set()
    cur_entity: str | None = None
    cur_words: list = []

    def _flush():
        if cur_entity and cur_words and cur_entity not in grouped:
            grouped[cur_entity] = " ".join(cur_words)

    for idx, word_id in enumerate(word_id_list):
        if word_id is None or word_id >= len(words):
            _flush(); cur_entity = None; cur_words = []
            continue
        label = ID2LABEL.get(int(predictions[idx]), "O")
        if label.startswith("B-"):
            _flush()
            cur_entity = label[2:]
            cur_words = [] if word_id in seen_word_ids else [words[word_id]]
            seen_word_ids.add(word_id)
        elif label.startswith("I-") and label[2:] == cur_entity:
            if word_id not in seen_word_ids:
                cur_words.append(words[word_id])
                seen_word_ids.add(word_id)
        else:
            _flush(); cur_entity = None; cur_words = []
    _flush()
    return grouped


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "models_loaded": 4}


@app.post("/extract")
async def extract(file: UploadFile = File(...)):
    content = await file.read()
    try:
        if file.filename.lower().endswith(".pdf"):
            pages = convert_from_bytes(content, dpi=150, poppler_path=POPPLER_PATH)
            image = pages[0]
        else:
            image = Image.open(io.BytesIO(content)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read file: {e}")

    words, bboxes = run_ocr(image)
    if not words:
        raise HTTPException(status_code=422, detail="OCR extracted no text")

    grouped = run_layoutlm(image, words, bboxes)
    return {
        "grouped":      grouped,
        "word_count":   len(words),
        "entity_count": len(grouped),
    }


@app.post("/anomaly")
def anomaly(req: AnomalyRequest):
    features = np.array([[
        req.amount_zscore, req.amount_to_po_ratio,
        req.vendor_invoice_frequency, req.days_since_last_invoice,
        req.line_item_count, req.amount_per_line_item, req.is_round_number
    ]])
    scaled = anomaly_scaler.transform(features)
    raw_score = anomaly_model.decision_function(scaled)[0]
    score = float(np.clip(1 - (raw_score + 0.5), 0.0, 1.0))
    risk = "high" if score >= 0.7 else "medium" if score >= 0.4 else "low"
    return {"anomaly_score": round(score, 4), "risk_level": risk}


@lru_cache(maxsize=512)
def _embed(name: str):
    return matching_model.encode(name, convert_to_tensor=True)


@app.post("/match")
def match(req: MatchRequest):
    if not req.name1.strip() or not req.name2.strip():
        raise HTTPException(status_code=400, detail="names cannot be empty")
    emb1 = _embed(req.name1)
    emb2 = _embed(req.name2)
    sim = float(max(0.0, util.cos_sim(emb1, emb2).item()))
    return {"similarity": round(sim, 4), "is_match": sim >= 0.5,
            "name1": req.name1, "name2": req.name2}


@app.post("/confidence")
def confidence(req: ConfidenceRequest):
    features = np.array([[
        req.label_proximity, req.pattern_match_count,
        req.appears_multiple_times, req.format_valid,
        req.value_length_norm, req.position_score
    ]])
    scaled = confidence_scaler.transform(features)
    score = float(confidence_model.predict_proba(scaled)[0][1])
    return {"confidence": round(score, 4), "confidence_pct": round(score * 100, 1)}
