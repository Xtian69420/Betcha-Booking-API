const guest = require('../models/guestModel');
const bcrypt = require('bcrypt');
const { google } = require('googleapis');
const fs = require('fs');
require('dotenv').config();

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
  },
  scopes: ['https://www.googleapis.com/auth/drive']
});

const drive = google.drive({ version: 'v3', auth });
const folderId = '1sL-VBECK9rMbBnJqxtL52IObJTrwysno';

exports.createGuest = async (req, res) => {
  try {
    const {
      firstname,
      minitial,
      lastname,
      email,
      password,
      phoneNumber,
      birthday,
      sex
    } = req.body;

    // Check if email is already registered
    const existingGuest = await guest.findOne({ email });
    if (existingGuest) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    // Hash password securely
    const hashedPassword = await bcrypt.hash(password, 10);

    // Upload profile picture to Google Drive
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

        // Make the uploaded file public
        await drive.permissions.create({
          fileId,
          requestBody: {
            role: 'reader',
            type: 'anyone'
          }
        });

        // Get thumbnail link
        pfplink = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1920-h1080`;

        // Delete local file after upload
        fs.unlinkSync(req.file.path);
      } catch (uploadErr) {
        console.error('Google Drive Upload Error:', uploadErr);
        return res.status(500).json({ message: 'Failed to upload profile picture' });
      }
    }

    // Create and save guest
    const newGuest = new guest({
      firstname,
      minitial,
      lastname,
      email,
      password: hashedPassword,
      phoneNumber,
      birthday: new Date(birthday), // Ensure birthday is a Date object
      sex,
      pfplink
    });

    await newGuest.save();

    // Exclude password in response
    const { password: _, ...safeGuest } = newGuest.toObject();

    res.status(201).json({
      message: 'Guest account created successfully',
      guest: safeGuest
    });

  } catch (error) {
    console.error('Create Guest Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.updateGuest = async (req, res) => {
  try {
    const { id } = req.params;
    const updateFields = req.body;

    if (!id) {
      return res.status(400).json({ message: 'Guest ID is required' });
    }

    if (!updateFields || Object.keys(updateFields).length === 0) {
      return res.status(400).json({ message: 'No information provided to update' });
    }

    const updatedGuest = await guest.findByIdAndUpdate(
      id,
      { $set: updateFields },
      { new: true }
    );

    if (!updatedGuest) {
      return res.status(404).json({ message: 'Guest not found' });
    }

    res.status(200).json({ message: 'Guest updated successfully', guest: updatedGuest });
  } catch (error) {
    console.error('Update Guest Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};


exports.guestDisplay = async (req, res) => {
  try {
    const guestId = req.params.id;

    // Find guest by ID
    const guestData = await guest.findById(guestId);

    if (!guestData) {
      return res.status(404).json({ message: 'Guest not found' });
    }

    res.status(200).json(guestData);
  } catch (error) {
    console.error('Display Guest Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getAllGuests = async (req, res) => {
  try {
    const guests = await guest.find();

    if (guests.length === 0) {
      return res.status(404).json({ message: 'No guest accounts found' });
    }

    res.status(200).json(guests);
  } catch (error) {
    console.error('Get All Guests Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.archiveGuest = async (req, res) => {
  try {
    const guestId = req.params.id;

    const updatedGuest = await guest.findByIdAndUpdate(
      guestId,
      { archived: true },
      { new: true }
    );

    if (!updatedGuest) {
      return res.status(404).json({ message: 'Guest not found' });
    }

    res.status(200).json({ message: 'Guest archived successfully', guest: updatedGuest });
  } catch (error) {
    console.error('Archive Guest Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.updateGuestPfp = async (req, res) => {
  try {
    const guestId = req.params.id;
    if (!req.file) return res.status(400).json({ message: 'No profile picture uploaded' });

    const guestUser = await guest.findById(guestId);
    if (!guestUser) return res.status(404).json({ message: 'Guest not found' });

    const fileMetadata = {
      name: `${Date.now()}-${req.file.originalname}`,
      parents: [folderId],
    };

    const media = {
      mimeType: req.file.mimetype,
      body: fs.createReadStream(req.file.path),
    };

    const file = await drive.files.create({
      resource: fileMetadata,
      media,
      fields: 'id',
    });

    const fileId = file.data.id;

    await drive.permissions.create({
      fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });

    const pfplink = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1920-h1080`;

    // Update DB
    guestUser.pfplink = pfplink;
    await guestUser.save();

    // Clean up local file
    fs.unlinkSync(req.file.path);

    res.status(200).json({
      message: 'Profile picture updated successfully',
      pfplink,
    });

  } catch (error) {
    console.error('Update Guest PFP Error:', error);
    res.status(500).json({ message: 'Failed to update profile picture' });
  }
};

exports.unarchiveGuest = async (req, res) => {
  try {
    const guestId = req.params.id;

    const guestUser = await guest.findById(guestId);
    if (!guestUser) {
      return res.status(404).json({ message: 'Guest not found' });
    }

    if (!guestUser.archived) {
      return res.status(400).json({ message: 'Guest is already active' });
    }

    guestUser.archived = false;
    await guestUser.save();

    res.status(200).json({ message: 'Guest unarchived successfully', guest: guestUser });
  } catch (error) {
    console.error('Unarchive Guest Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
