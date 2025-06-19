const admin = require('../models/adminModel');
const guest = require('../models/guestModel')
const bcrypt = require('bcrypt');
const { google } = require('googleapis');
const fs = require('fs');
require('dotenv').config();

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/drive']
});

const drive = google.drive({ version: 'v3', auth });
const folderId = '1sL-VBECK9rMbBnJqxtL52IObJTrwysno';

exports.createAdmin = async (req, res) => {
  try {
    const { firstname, minitial, lastname, email, password } = req.body;

    const existingAdmin = await admin.findOne({ email });
    const existingGuest = await guest.findOne({ email });
    if (existingAdmin || existingGuest) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    let pfplink = '';
    if (req.file) {
      try {
        const fileMetadata = {
          name: `${Date.now()}-${req.file.originalname}`,
          parents: [folderId]
        };
        const media = {
          mimeType: req.file.mimetype,
          body: fs.createReadStream(req.file.path)
        };

        const file = await drive.files.create({
          resource: fileMetadata,
          media,
          fields: 'id'
        });

        const fileId = file.data.id;

        await drive.permissions.create({
          fileId,
          requestBody: {
            role: 'reader',
            type: 'anyone'
          }
        });

        pfplink = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1920-h1080`;

        fs.unlinkSync(req.file.path); // delete temp file
      } catch (uploadErr) {
        console.error('Google Drive Upload Error:', uploadErr);
        return res.status(500).json({ message: 'Failed to upload profile picture' });
      }
    }

    const newAdmin = new admin({
      firstname,
      minitial,
      lastname,
      email,
      password: hashedPassword,
      pfplink
    });

    await newAdmin.save();

    const { password: _, ...safeAdmin } = newAdmin.toObject();

    res.status(201).json({
      message: 'Admin account created successfully',
      admin: safeAdmin
    });

  } catch (error) {
    console.error('Create Admin Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

