const Tesseract = require('tesseract.js');
const pdfParse = require('pdf-parse');
const fs = require('fs');
const path = require('path');

/**
 * OCR Service
 * Extracts raw text from uploaded invoice files (PDF, JPG, PNG).
 *
 * Architecture note: This service acts as the text extraction layer.
 * For images, Tesseract.js is used (runs in Node via WebAssembly).
 * For PDFs, pdf-parse extracts embedded text without OCR.
 * If a PDF has no embedded text (scanned PDF), it falls back to a note
 * indicating that a pdf-to-image conversion step would be needed before OCR.
 */

/**
 * Extract text from an image file using Tesseract.js
 * @param {string} filePath - Absolute path to the image file
 * @returns {Promise<{text: string, confidence: number}>}
 */
async function extractTextFromImage(filePath) {
  try {
    const result = await Tesseract.recognize(filePath, 'eng', {
      logger: () => {} // suppress progress logs
    });

    const text = result.data.text || '';
    const confidence = result.data.confidence || 0;

    return { text, confidence };
  } catch (error) {
    throw new Error(`Tesseract OCR failed: ${error.message}`);
  }
}

/**
 * Extract text from a PDF file using pdf-parse
 * @param {string} filePath - Absolute path to the PDF file
 * @returns {Promise<{text: string, confidence: number}>}
 */
async function extractTextFromPDF(filePath) {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);

    const text = data.text || '';
    // pdf-parse returns embedded text, so confidence is high if text is found
    const confidence = text.trim().length > 50 ? 90 : 40;

    return { text, confidence };
  } catch (error) {
    throw new Error(`PDF parsing failed: ${error.message}`);
  }
}

/**
 * Main OCR function — dispatches to the correct extractor based on file type
 * @param {string} filePath - Absolute path to the uploaded file
 * @param {string} mimetype - MIME type of the file
 * @returns {Promise<{text: string, confidence: number, method: string}>}
 */
async function extractText(filePath, mimetype) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  if (mimetype === 'application/pdf') {
    const result = await extractTextFromPDF(filePath);
    return { ...result, method: 'pdf-parse' };
  }

  if (['image/jpeg', 'image/jpg', 'image/png', 'image/tiff'].includes(mimetype)) {
    const result = await extractTextFromImage(filePath);
    return { ...result, method: 'tesseract-ocr' };
  }

  throw new Error(`Unsupported file type: ${mimetype}`);
}

module.exports = { extractText, extractTextFromImage, extractTextFromPDF };
