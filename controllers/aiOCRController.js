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
    fs.unlinkSync(imagePath);

    let result = 'Reference number not found';
    let amount = null;

    const amountPatterns = [
      /Amount\s+(?:PHP\s*)?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/i,
      /Amount\s+(?:₱\s*)?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/i,
      /PHP\s+(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/i,
      /₱\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/i,
      /Sent\s+(?:PHP\s*)?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/i,
      /Total\s+Amount\s+Sent\s+[£₱]?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/i
    ];

    for (const regex of amountPatterns) {
      const match = text.match(regex);
      if (match && match[1]) {
        const extractedAmount = match[1].replace(/,/g, '');
        if (!isNaN(parseFloat(extractedAmount))) {
          amount = parseFloat(extractedAmount);
          break;
        }
      }
    }

    const patterns = [
      /Ref(?:erence)?\.?\s*No\.?\s*[:\-]?\s*([A-Z0-9 ]{6,})/i,
      /Ref(?:erence)?\.?\s*ID\s*[:\-]?\s*([A-Z0-9 ]{6,})/i
    ];

    for (const regex of patterns) {
      const match = text.match(regex);
      if (match && match[1]) {
        const ref = match[1]
          .trim()
          .split(/\s+/) 
          .filter(g => /^[A-Z0-9]+$/i.test(g)) 
          .slice(0, 3) 
          .join(''); 

        if (!/^\d{1,2}(st|nd|rd|th)?\s?[A-Z]+$/i.test(ref)) {
          result = ref.toUpperCase();
          break;
        }
      }
    }

    res.json({ result, amount, fullText: text });

  } catch (error) {
    console.error('OCR upload error:', error);
    res.status(500).json({ error: 'Failed to extract text from uploaded image' });
  }
};  

exports.ScanIDDriversLicense = async (req, res) => {
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
    fs.unlinkSync(imagePath); 

  let firstName = '';
  let lastName = '';
  let middleName = '';
  let birthday = '';
  let gender = '';

    const labelIndex = text.search(/Last\s*Name/i);
    if (labelIndex >= 0) {
      const afterLabel = text.slice(labelIndex).split("\n");

      const nameLine = afterLabel.find(line => {
        const clean = line.trim().split(/\s+/).map(w => w.replace(/[^A-Za-z]/g, ""));
        const capsWords = clean.filter(w => /^[A-Z]+$/.test(w));
        return capsWords.length >= 3;
      });

      if (nameLine) {
        const commaParts = nameLine.trim().split(',');
        
        if (commaParts.length >= 2) {
          const lastNamePart = commaParts[0].trim().replace(/[^A-Za-z\s-]/g, "");
          lastName = lastNamePart.split(/\s+/).map(word => 
            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
          ).join(' ');

          const firstMiddlePart = commaParts[1].trim().replace(/[^A-Za-z\s-]/g, "");
          const nameWords = firstMiddlePart.split(/\s+/).filter(word => word.length > 0);

          if (nameWords.length >= 1) {
            if (nameWords.length >= 3) {
              firstName = nameWords.slice(0, 2).map(word =>
                word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
              ).join(' ');
              
              middleName = nameWords.slice(2).map(word =>
                word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
              ).join(' ');
            } else if (nameWords.length === 2) {
              firstName = nameWords[0].charAt(0).toUpperCase() + nameWords[0].slice(1).toLowerCase();
              middleName = nameWords[1].charAt(0).toUpperCase() + nameWords[1].slice(1).toLowerCase();
            } else {
              firstName = nameWords[0].charAt(0).toUpperCase() + nameWords[0].slice(1).toLowerCase();
            }
          }
        } else {
          let words = nameLine
            .trim()
            .split(/\s+/)
            .map(w => w.replace(/[^A-Za-z]/g, ""))
            .filter(w => /^[A-Za-z]+$/.test(w));

          while (words.length && (words[0].length < 2 || /^[a-z]/.test(words[0]))) {
            words.shift();
          }

          if (words.length >= 3) {
            lastName = words[0].charAt(0).toUpperCase() + words[0].slice(1).toLowerCase();
            firstName = words[1].charAt(0).toUpperCase() + words[1].slice(1).toLowerCase();
            const originalWords = nameLine.trim().split(/\s+/).slice(2);
            middleName = originalWords.map(word =>
              word
                .split('-')
                .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
                .join('-')
            ).join(' ');
          }
        }
      }
    }

    let birthdayMatch = text.match(/\b(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/);
    if (birthdayMatch) {
      let year = parseInt(birthdayMatch[1], 10);
      let month = parseInt(birthdayMatch[2], 10);
      let day = parseInt(birthdayMatch[3], 10);

      if (
        year > 1900 &&
        year <= new Date().getFullYear() &&
        month >= 1 && month <= 12 &&
        day >= 1 && day <= 31
      ) {
        birthday = `${year.toString().padStart(4, "0")}/${month.toString().padStart(2, "0")}/${day.toString().padStart(2, "0")}`;
      }
    }

    const sexMatch = text.match(/Sex\s+([MF])\s/i) || text.match(/\bSex\s*[:\-]?\s*([MF])\b/i) || text.match(/\b([MF])\s+\d{4}\/\d{1,2}\/\d{1,2}/);
    if (sexMatch) {
      const sexCode = sexMatch[1].toUpperCase();
      gender = sexCode === 'M' ? 'Male' : 'Female';
    }

    res.json({
      birthday,
      firstName,
      lastName,
      middleName,
      gender,
      fullText: text
    });

  } catch (error) {
    console.error('Driver’s license scan error:', error);
    res.status(500).json({ error: 'Failed to scan driver’s license' });
  }
};
const FormData = require('form-data');
const axios = require('axios');

exports.ScanIDPassport = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    const imagePath = path.resolve(__dirname, '..', req.file.path);
    const imageBase64 = fs.readFileSync(imagePath, { encoding: 'base64' });
    fs.unlinkSync(imagePath); 

    const formData = new FormData();
    formData.append('apikey', 'K85666349088957');
    formData.append('base64Image', `data:image/png;base64,${imageBase64}`);
    formData.append('language', 'eng');
    formData.append('isOverlayRequired', 'false');

    const response = await axios.post('https://api.ocr.space/parse/image', formData, {
      headers: formData.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    if (response.data.IsErroredOnProcessing) {
      return res.status(500).json({ error: response.data.ErrorMessage || 'OCR processing error' });
    }

    const parsedResults = response.data.ParsedResults;
    if (!parsedResults || parsedResults.length === 0) {
      return res.status(400).json({ error: 'No text parsed from image' });
    }

    const text = parsedResults[0].ParsedText;
    console.log('OCR Space text:', text);

    const lines = text
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.includes('P<') || l.match(/^[A-Z0-9<]{30,}$/));

    if (lines.length < 2) {
      return res.status(400).json({ error: 'MRZ lines not found' });
    }

    const line1 = lines[0];
    const line2 = lines[1];

    const namesPart = line1.slice(2);
    const [lastNameRaw, firstNamesRaw] = namesPart.split('<<');
    const lastName = lastNameRaw.replace(/</g, ' ').trim();
    const firstNames = firstNamesRaw ? firstNamesRaw.replace(/</g, ' ').trim() : '';

    const firstNamesArray = firstNames.split(/\s+/);
    const firstName = firstNamesArray[0] || '';
    const middleInitial = firstNamesArray.length > 1 ? firstNamesArray[1].charAt(0) : '';

    const birthdateRaw = line2.substring(6, 12);
    let year = parseInt(birthdateRaw.substring(0, 2), 10);
    const month = birthdateRaw.substring(2, 4);
    const day = birthdateRaw.substring(4, 6);

    const currentYear = new Date().getFullYear() % 100;
    const century = year > currentYear ? 1900 : 2000;
    year = century + year;
    const birthday = `${year}/${month}/${day}`;

    res.json({
      firstName,
      lastName,
      middleInitial,
      birthday,
      fullText: text,
    });

  } catch (error) {
    console.error('Passport scan error:', error);
    res.status(500).json({ error: 'Failed to scan passport' });
  }
};

exports.ScanIdPhilsys = async (req, res) => {
  try {

  } catch {
    
  }
}