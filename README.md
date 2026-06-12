# Invoice Automation System

A MERN stack invoice automation system inspired by Microsoft Dynamics 365 Finance Central. Handles invoice upload, OCR extraction, structured field extraction, and validation against Purchase Orders.

## Architecture

```
Frontend (React + Vite + Tailwind) → Backend (Express + MongoDB)
                                          ├── OCR: Tesseract.js (images) / pdf-parse (PDFs)
                                          ├── Extraction: Heuristic regex (LayoutLMv3 integration point)
                                          └── Validation: PO matching + SHA-256 duplicate detection
```

## Features

- **Vendor Management** — Register and manage vendors
- **Purchase Orders** — Create POs with line items, auto-generated PO numbers
- **Invoice Upload** — Drag & drop PDF/JPG/PNG upload
- **OCR Pipeline** — Tesseract.js for images, pdf-parse for PDFs
- **Field Extraction** — Invoice number, vendor, dates, amounts, line items with confidence scores
- **PO Validation** — Match score, discrepancy detection, 5% amount tolerance
- **Duplicate Detection** — SHA-256 file hash + invoice number uniqueness
- **Dashboard** — Stats, charts, recent activity

## LayoutLMv3 Integration

The `extractionService.js` contains a heuristic extraction layer designed to be swapped with a Python LayoutLMv3 microservice:

```
POST /api/ml/extract
Body: { text: string, fileBase64?: string }
Response: { fields: ExtractedData }
```

## Quick Start

```bash
# Install dependencies
cd backend && npm install
cd ../frontend && npm install

# Seed sample data (requires MongoDB)
cd backend && npm run seed

# Run backend
npm run dev  # port 5000

# Run frontend
cd ../frontend && npm run dev  # port 5173
```

**Demo credentials:** `admin@company.com` / `admin123`

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/login | Login |
| GET/POST | /api/vendors | List / Create vendors |
| GET/POST | /api/purchase-orders | List / Create POs |
| POST | /api/invoices | Upload & process invoice |
| GET | /api/invoices/:id | Invoice detail with OCR + validation |
| POST | /api/invoices/:id/reprocess | Rerun OCR + validation |
| GET | /api/dashboard/stats | Dashboard statistics |
