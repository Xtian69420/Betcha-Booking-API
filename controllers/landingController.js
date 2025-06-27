const landing = require('../models/landingModel');
const Booking = require('../models/bookingModel');
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

const folderId = '1iQ003kR1GdXch2uDXSEeB5pPWrV7bJ1k';

exports.createLanding = async (req, res) => {
  try {
    const { title, content } = req.body;

    if (!title || !content) {
      return res.status(400).json({ message: 'Title and content are required.' });
    }

    let imageLink = '';

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

        imageLink = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1920-h1080`;

        fs.unlinkSync(req.file.path);

      } catch (uploadErr) {
        console.error('Google Drive Upload Error:', uploadErr);
        return res.status(500).json({ message: 'Failed to upload image to Drive' });
      }
    } else {
      return res.status(400).json({ message: 'Image is required.' });
    }

    const newLanding = new landing({
      title,
      content,
      imageLink
    });

    await newLanding.save();

    res.status(201).json({
      message: 'Landing content created successfully',
      landing: newLanding
    });

  } catch (error) {
    console.error('Create Landing Error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.updateLanding = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content } = req.body;

    const existingLanding = await landing.findById(id);
    if (!existingLanding) {
      return res.status(404).json({ message: 'Landing content not found' });
    }

    let updatedFields = {};

    if (title) updatedFields.title = title;
    if (content) updatedFields.content = content;

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

        const newImageLink = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1920-h1080`;
        updatedFields.imageLink = newImageLink;

        fs.unlinkSync(req.file.path);

      } catch (uploadErr) {
        console.error('Google Drive Upload Error:', uploadErr);
        return res.status(500).json({ message: 'Failed to upload new image' });
      }
    }

    const updatedLanding = await landing.findByIdAndUpdate(id, updatedFields, { new: true });

    res.status(200).json({
      message: 'Landing content updated successfully',
      landing: updatedLanding
    });

  } catch (error) {
    console.error('Update Landing Error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.getHowManyDaysofBooked = async (req, res) => {
  try {

    const bookings = await Booking.find({
      status: { $nin: ['Cancel', 'Pending Payment'] }
    });

    let totalDaysBooked = 0;

    bookings.forEach(booking => {
      totalDaysBooked += booking.datesOfBooking.length;
    });

    return res.status(200).json({
      message: 'Total number of booked days calculated successfully.',
      totalDaysBooked
    });

  } catch (error) {
    console.error('Error calculating booked days:', error);
    res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
};