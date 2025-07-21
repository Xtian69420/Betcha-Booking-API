const { createWorker } = require('tesseract.js');
const path = require('path');
const fs = require('fs');

exports.scanImageUpload = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    const imagePath = path.resolve(__dirname, '..', req.file.path);

    const worker = await createWorker('eng'); // No longer needs .load() or .loadLanguage()

    const {
      data: { text }
    } = await worker.recognize(imagePath);

    await worker.terminate();
    fs.unlinkSync(imagePath); // Delete uploaded image after processing

    let result;

    // First: Match "Ref. No." or "Reference No." style
    const refNoMatch = text.match(
      /(?:Ref(?:erence)?\.?\s*No\.?\s*[:\-]?\s*)([A-Z\d]{6,20})/i
    );

    if (refNoMatch) {
      result = refNoMatch[1].replace(/\s+/g, '');
    } else {
      // Second: Match "Reference ID"/"Ref. ID" with three space-separated blocks
      const refIdMatch = text.match(
        /(?:Reference\s*ID|Ref\.?\s*ID)[:\-]?\s*((?:[A-Z0-9]{3,4}\s*){3})/i
      );

      if (refIdMatch) {
        result = refIdMatch[1].replace(/\s+/g, '');
      } else {
        result = 'Ref. No. not found';
      }
    }

    res.json({ result, fullText: text });

  } catch (error) {
    console.error('OCR upload error:', error);
    res.status(500).json({ error: 'Failed to extract text from uploaded image' });
  }
};
