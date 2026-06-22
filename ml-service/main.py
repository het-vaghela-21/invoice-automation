import warnings
warnings.filterwarnings("ignore", message="X does not have valid feature names")

import spacy
import joblib
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Dict, Any
from sentence_transformers import SentenceTransformer, util

app = FastAPI(title="Invoice ML Service", version="1.0.0")

# Load all models at startup
print("Loading NER model...")
ner_model = spacy.load("models/ner_model")

print("Loading anomaly model...")
anomaly_model  = joblib.load("models/anomaly_model.joblib")
anomaly_scaler = joblib.load("models/anomaly_scaler.joblib")

print("Loading matching model...")
matching_model = SentenceTransformer("models/embedding_model")

print("Loading confidence model...")
confidence_model  = joblib.load("models/confidence_model.joblib")
confidence_scaler = joblib.load("models/confidence_scaler.joblib")

print("All models loaded.")


class ExtractRequest(BaseModel):
    text: str


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


@app.get("/health")
def health():
    return {"status": "ok", "models_loaded": 4}


@app.post("/extract")
def extract(req: ExtractRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="text cannot be empty")
    doc = ner_model(req.text)
    entities = [{"label": e.label_, "value": e.text,
                 "start": e.start_char, "end": e.end_char} for e in doc.ents]
    grouped: Dict[str, Any] = {}
    for ent in entities:
        if ent["label"] not in grouped:
            grouped[ent["label"]] = ent["value"]
    return {"entities": entities, "grouped": grouped, "entity_count": len(entities)}


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


@app.post("/match")
def match(req: MatchRequest):
    if not req.name1.strip() or not req.name2.strip():
        raise HTTPException(status_code=400, detail="names cannot be empty")
    emb1 = matching_model.encode(req.name1, convert_to_tensor=True)
    emb2 = matching_model.encode(req.name2, convert_to_tensor=True)
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
