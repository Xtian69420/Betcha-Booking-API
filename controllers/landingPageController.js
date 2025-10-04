const landing = require('../models/landingModel');
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
    const { title, content, txtColor, featured } = req.body;

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
          requestBody: { role: 'reader', type: 'anyone' }
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

    let parsedFeatured = [];
    if (featured) {
      try {
        parsedFeatured = typeof featured === "string" ? JSON.parse(featured) : featured;
        if (!Array.isArray(parsedFeatured)) parsedFeatured = [parsedFeatured];
      } catch (err) {
        return res.status(400).json({ message: "Invalid featured format, must be array or JSON string." });
      }
    }

    const newLanding = new landing({
      title,
      content,
      imageLink,
      txtColor: txtColor || 'White',
      featured: parsedFeatured
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

    let updateData = {};

    const { title, content, txtColor, featured } = req.body;
    if (title) updateData.title = title;
    if (content) updateData.content = content;
    if (txtColor) updateData.txtColor = txtColor;

    if (featured) {
      try {
        let parsedFeatured = typeof featured === "string" ? JSON.parse(featured) : featured;
        if (!Array.isArray(parsedFeatured)) parsedFeatured = [parsedFeatured];
        updateData.featured = parsedFeatured;
      } catch (err) {
        return res.status(400).json({ message: "Invalid featured format, must be array or JSON string." });
      }
    }

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
          requestBody: { role: 'reader', type: 'anyone' }
        });

        updateData.imageLink = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1920-h1080`;

        fs.unlinkSync(req.file.path);

      } catch (uploadErr) {
        console.error('Google Drive Upload Error:', uploadErr);
        return res.status(500).json({ message: 'Failed to upload image to Drive' });
      }
    }

    const updatedLanding = await landing.findByIdAndUpdate(id, updateData, {
      new: true, runValidators: true
    });

    if (!updatedLanding) {
      return res.status(404).json({ message: 'Landing not found' });
    }

    res.status(200).json({
      message: 'Landing content updated successfully',
      landing: updatedLanding
    });

  } catch (error) {
    console.error('Update Landing Error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

const property = require('../models/propertyModel');

exports.getLandingById = async (req, res) => {
  try {
    const { id } = req.params;
    const foundLanding = await landing.findById(id)
      .populate('featured');

    if (!foundLanding) {
      return res.status(404).json({ message: 'Landing not found' });
    }

    res.status(200).json(foundLanding);

  } catch (error) {
    console.error('Get Landing By ID Error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.deleteLanding = async (req, res) => {
  try {
    const { id } = req.params;

    const deletedLanding = await landing.findByIdAndDelete(id);

    if (!deletedLanding) {
      return res.status(404).json({ message: "Landing not found" });
    }

    res.status(200).json({ 
      message: "Landing deleted successfully", 
      deletedLanding 
    });
  } catch (err) {
    console.error("Delete Landing Error:", err);
    res.status(500).json({ error: "Failed to delete landing" });
  }
};
