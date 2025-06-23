const Property = require('../models/propertyModel');
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
const folderId = '1YxNjOLL7IPrPsb2ELXfCVZQhb8UHkAFV';

exports.createProperty = async (req, res) => {
  try {
    const {
      name, address, mapLink, city, description, category,
      packageCapacity, maxCapacity, timeIn, timeOut,
      packagePrice, reservationFee, additionalPax,
      discount, rating, calendarList
    } = req.body;

    const rawAmenities = req.body.amenities;
    const rawOtherAmenities = req.body.otherAmenities;

    if (!req.files || req.files.length === 0)
      return res.status(400).json({ error: 'At least one photo is required.' });

    if (req.files.length > 10)
      return res.status(400).json({ error: 'Maximum of 10 photos allowed.' });

    const photoLinks = [];
    for (const file of req.files) {
      const fileMetaData = {
        name: file.originalname,
        parents: [folderId]
      };

      const media = {
        mimeType: file.mimetype,
        body: fs.createReadStream(file.path)
      };

      const driveResponse = await drive.files.create({
        resource: fileMetaData,
        media: media,
        fields: 'id'
      });

      const fileId = driveResponse.data.id;
      const thumbnailLink = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1920-h1080`;
      photoLinks.push(thumbnailLink);

      fs.unlinkSync(file.path);
    }

    const processedAmenities = Array.isArray(rawAmenities)
      ? rawAmenities
      : typeof rawAmenities === 'string'
        ? rawAmenities.split(',').map(item => item.trim())
        : [];

    const processedOtherAmenities = Array.isArray(rawOtherAmenities)
      ? rawOtherAmenities
      : typeof rawOtherAmenities === 'string'
        ? rawOtherAmenities.split(',').map(item => item.trim())
        : [];

    const newProperty = new Property({
      name,
      address,
      mapLink,
      city,
      description,
      category,
      packageCapacity,
      maxCapacity,
      timeIn,
      timeOut,
      packagePrice,
      reservationFee,
      additionalPax,
      discount: discount || 0,
      rating: rating || 0,
      amenities: processedAmenities,
      otherAmenities: processedOtherAmenities,
      photoLinks,
      calendarListId: calendarList // <-- fixed
    });

    const savedProperty = await newProperty.save();
    res.status(201).json(savedProperty);
  } catch (err) {
    console.error('Error creating property:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

exports.displayAllProperty = async (req, res) => {
  try {
    const properties = await Property.find();
    res.status(200).json(properties);
  } catch (err) {
    console.error('Error retrieving all properties:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

exports.displayByIdProperty = async (req, res) => {
  try {
    const { id } = req.params;
    const property = await Property.findById(id);

    if (!property) {
      return res.status(404).json({ error: 'Property not found.' });
    }
    res.status(200).json(property);
  } catch (err) {
    console.error('Error retrieving property by ID:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};


exports.updateProperty = async (req, res) => {
  try {
    const { id } = req.params;

    const updates = {};


    for (let key in req.body) {
      let value = req.body[key];

      const numberFields = [
        'packageCapacity', 'maxCapacity', 'packagePrice',
        'reservationFee', 'additionalPax', 'discount', 'rating'
      ];
      if (numberFields.includes(key)) {
        updates[key] = Number(value);
        continue;
      }

      if (['amenities', 'otherAmenities'].includes(key)) {
        updates[key] = typeof value === 'string'
          ? value.split(',').map(item => item.trim())
          : value;
        continue;
      }

    if (['timeIn', 'timeOut'].includes(key)) {
        updates[key] = value;
        continue;
    }


      updates[key] = value;
    }

    const updatedProperty = await Property.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true
    });

    if (!updatedProperty) {
      return res.status(404).json({ error: 'Property not found.' });
    }

    return res.status(200).json(updatedProperty);
  } catch (err) {
    console.error('Error updating property:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
};

exports.updatePhotoProperty = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'At least one photo is required.' });
    }

    if (req.files.length > 10) {
      return res.status(400).json({ error: 'Maximum of 10 photos allowed.' });
    }

    const photoLinks = [];

    for (const file of req.files) {
      const fileMetaData = {
        name: file.originalname,
        parents: [folderId]
      };

      const media = {
        mimeType: file.mimetype,
        body: fs.createReadStream(file.path)
      };

      const driveResponse = await drive.files.create({
        resource: fileMetaData,
        media: media,
        fields: 'id'
      });

      const fileId = driveResponse.data.id;
      const link = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1920-h1080`;
      photoLinks.push(link);

      fs.unlinkSync(file.path);
    }

    const updated = await Property.findByIdAndUpdate(id, { photoLinks }, { new: true });

    if (!updated) {
      return res.status(404).json({ error: 'Property not found.' });
    }

    res.status(200).json(updated);
  } catch (err) {
    console.error('Error updating photos:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

exports.createReport = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const { sender, category, status, date, transNo, message } = req.body;

    if (!['Solved', 'Unsolved'].includes(status)) {
      return res.status(400).json({ error: "Status must be either 'Solved' or 'Unsolved'." });
    }

    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({ error: 'Property not found.' });
    }

    const targetReports = status === 'Solved' ? property.reports.solved : property.reports.unsolved;

    // Determine new report ID by finding max existing ID and adding 1
    const maxId = targetReports.length > 0
      ? Math.max(...targetReports.map(r => r.id || 0))
      : 0;

    const newReport = {
      id: maxId + 1,
      sender,
      category,
      status,
      date: date ? new Date(date) : new Date(),
      transNo,
      message
    };

    // Append the new report
    if (status === 'Solved') {
      property.reports.solved.push(newReport);
    } else {
      property.reports.unsolved.push(newReport);
    }

    await property.save();

    res.status(200).json({ message: 'Report added successfully.', report: newReport });
  } catch (err) {
    console.error('Error appending report:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

exports.editReportStatus = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const { id, status, newStatus } = req.body;

    if (!['Solved', 'Unsolved'].includes(status) || !['Solved', 'Unsolved'].includes(newStatus)) {
      return res.status(400).json({ error: "Status and newStatus must be either 'Solved' or 'Unsolved'." });
    }

    if (status === newStatus) {
      return res.status(400).json({ error: 'No status change detected.' });
    }

    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({ error: 'Property not found.' });
    }

    const sourceArray = status === 'Solved' ? property.reports.solved : property.reports.unsolved;
    const targetArray = newStatus === 'Solved' ? property.reports.solved : property.reports.unsolved;

    const reportIndex = sourceArray.findIndex(r => r.id === id);
    if (reportIndex === -1) {
      return res.status(404).json({ error: `Report with id ${id} not found in ${status} list.` });
    }

    const report = sourceArray[reportIndex];
    report.status = newStatus;

    sourceArray.splice(reportIndex, 1);
    targetArray.push(report);

    await property.save();
    res.status(200).json({ message: 'Report status updated successfully.', updatedReport: report });
  } catch (err) {
    console.error('Error updating report status:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

exports.deleteReport = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const { id, status } = req.body; 

    if (!['Solved', 'Unsolved'].includes(status)) {
      return res.status(400).json({ error: "Status must be either 'Solved' or 'Unsolved'." });
    }

    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({ error: 'Property not found.' });
    }

    const targetArray = status === 'Solved' ? property.reports.solved : property.reports.unsolved;
    const reportIndex = targetArray.findIndex(r => r.id === id);

    if (reportIndex === -1) {
      return res.status(404).json({ error: `Report with id ${id} not found in ${status.toLowerCase()} list.` });
    }

    targetArray.splice(reportIndex, 1);
    await property.save();

    res.status(200).json({ message: `Report with id ${id} deleted successfully.` });
  } catch (err) {
    console.error('Error deleting report:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

exports.editPropertyStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required.' });
    }

    const updatedProperty = await Property.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    );

    if (!updatedProperty) {
      return res.status(404).json({ error: 'Property not found.' });
    }

    res.status(200).json({ message: 'Property status updated successfully.', property: updatedProperty });
  } catch (err) {
    console.error('Error updating property status:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};
