const Payment = require('../models/paymentModel');
const mongoose = require('mongoose');
const { google } = require('googleapis');
const fs = require('fs');
require('dotenv').config();

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/drive'],
});

const drive = google.drive({ version: 'v3', auth });
const folderId = '1PMt8OR1KZfV_sEV809V-KqaMUwmPH44y';

exports.createPayment = async (req, res) => {
  try {
    const { paymentName, category } = req.body;

    if (!paymentName || typeof paymentName !== 'string') {
      return res.status(400).json({ message: 'Payment name is required and must be a string.' });
    }

    if (!category || typeof category !== 'string') {
      return res.status(400).json({ message: 'Category is required and must be a string.' });
    }

    const existingPayment = await Payment.findOne({ paymentName, category });
    if (existingPayment) {
      return res.status(400).json({ message: 'Payment name with this category already exists!' });
    }

    let qrPhotoLink = '';
    if (req.file) {
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

      qrPhotoLink = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1920-h1080`;

      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    }

    const newPayment = new Payment({
      paymentName,
      category,
      qrPhotoLink,
    });

    await newPayment.save();

    res.status(201).json({
      message: 'Payment successfully created!',
      newPayment,
    });
  } catch (err) {
    console.error('Error creating payment:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

exports.updatePayment = async (req, res) => {
  try {
    const { id } = req.params;

    let updateData = { ...req.body };

    if (req.file) {
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

      updateData.qrPhotoLink = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1920-h1080`;

      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    }

    const updated = await Payment.findByIdAndUpdate(id, updateData, { new: true });
    if (!updated) {
      return res.status(404).json({ message: 'Payment not found.' });
    }

    res.status(200).json({
      message: 'Payment updated successfully!',
      updated,
    });
  } catch (error) {
    console.error('Error updating payment:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
};

exports.displayAllPayment = async (req, res) => {
  try {
    const payments = await Payment.find();
    res.status(200).json(payments);
  } catch (error) {
    console.error('Error retrieving payments:', error);
    res.status(500).json({ message: 'Error retrieving payments', error: error.message });
  }
};

exports.displayByIdPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const foundPayment = await Payment.findById(id);
    if (!foundPayment) {
      return res.status(404).json({ message: 'Payment not found.' });
    }
    res.status(200).json(foundPayment);
  } catch (error) {
    console.error('Error retrieving payment by ID:', error);
    res.status(500).json({ message: 'Error retrieving payment', error: error.message });
  }
};

exports.deletePaymentById = async (req, res) => {
  try {
    const { id } = req.params;

    const payment = await Payment.findById(id);
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found.' });
    }

    await Payment.findByIdAndDelete(id);

    res.status(200).json({ message: 'Payment deleted successfully.' });
  } catch (error) {
    console.error('Error deleting payment:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
};

exports.updateActive = async (req, res) => {
  try {
    const { id } = req.params;

    const payment = await Payment.findById(id);
    
    if (!payment) {
      return res.status(404).json({ message: 'Payment method not found' });
    }

    // Toggle the active status
    payment.active = !payment.active;
    await payment.save();

    res.status(200).json({ 
      message: "Payment method active status updated successfully", 
      active: payment.active 
    });
  } catch (error) {
    console.error('Update Payment Active Status Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}