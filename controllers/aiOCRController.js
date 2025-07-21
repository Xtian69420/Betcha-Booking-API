const { createWorker } = require('tesseract.js');
const path = require('path');
const fs = require('fs');

exports.scanImageUpload = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    const imagePath = path.resolve(__dirname, '..', req.file.path);
    const worker = await createWorker('eng');
    const {
      data: { text }
    } = await worker.recognize(imagePath);

    await worker.terminate();
    fs.unlinkSync(imagePath); // Delete the uploaded file

    let result = 'Reference number not found';

    const patterns = [
      /Ref(?:erence)?\.?\s*No\.?\s*[:\-]?\s*([A-Z0-9 ]{6,})/i,
      /Ref(?:erence)?\.?\s*ID\s*[:\-]?\s*([A-Z0-9 ]{6,})/i
    ];

    for (const regex of patterns) {
      const match = text.match(regex);
      if (match && match[1]) {
        const ref = match[1]
          .trim()
          .split(/\s+/) // keep original grouping
          .filter(g => /^[A-Z0-9]+$/i.test(g)) // only valid groups
          .slice(0, 3) // max 3 groups
          .join(''); // no space in final result

        // Validate that it's not picking up a date (like 23NOVEMBER)
        if (!/^\d{1,2}(st|nd|rd|th)?\s?[A-Z]+$/i.test(ref)) {
          result = ref.toUpperCase();
          break;
        }
      }
    }


    res.json({ result, fullText: text });

  } catch (error) {
    console.error('OCR upload error:', error);
    res.status(500).json({ error: 'Failed to extract text from uploaded image' });
  }
};
