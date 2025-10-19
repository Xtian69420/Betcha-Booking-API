const Refund = require ('../models/refundModel.js');
const Booking = require('../models/bookingModel.js');
const Guest = require('../models/guestModel.js');
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

exports.createRefund = async (req, res) => {
    try {
        const { bookingId, guestId, amount } = req.body;

        if (!bookingId) {
            return res.status(400).json({ message: 'Booking ID is required.' });
        }
        if (!mongoose.Types.ObjectId.isValid(bookingId)) {
            return res.status(400).json({ message: 'Invalid booking ID format.' });
        }

        if (!guestId) {
            return res.status(400).json({ message: 'Guest ID is required.' });
        }
        if (!mongoose.Types.ObjectId.isValid(guestId)) {
            return res.status(400).json({ message: 'Invalid guest ID format.' });
        }

        if (!amount) {
            return res.status(400).json({ message: 'Amount is required.' });
        }

        const booking = await Booking.findById(bookingId);
        if (!booking) {
            return res.status(404).json({ message: 'Booking not found.' });
        }

        const guest = await Guest.findById(guestId);
        if (!guest) {
            return res.status(404).json({ message: 'Guest not found.' });
        }

        let imageLink = '';
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

            imageLink = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1920-h1080`;

            if (fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
        } else {
            return res.status(400).json({ message: 'Refund proof image is required.' });
        }

        const newRefund = new Refund({
            bookingId,
            guestId,
            amount,
            image: imageLink
        });

        await newRefund.save();

        res.status(201).json({
            message: 'Refund request successfully created!',
            refund: newRefund,
        });
    } catch (err) {
        console.error('Error creating refund:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
}

exports.getAllRefund = async (req, res) => {
    try {
        const refunds = await Refund.find()
            .populate('bookingId', 'transNo propertyName totalFee status checkIn checkOut')
            .populate('guestId', 'firstname lastname email phoneNumber')
            .sort({ createdAt: -1 });

        res.status(200).json(refunds);
    } catch (err) {
        console.error('Error retrieving refunds:', err);
        res.status(500).json({ message: 'Error retrieving refunds', error: err.message });
    }
}

exports.getRefundByGuest = async (req, res) => {
    try {
        const { guestId } = req.params;

        if (!guestId) {
            return res.status(400).json({ message: 'Guest ID is required.' });
        }
        
        if (!mongoose.Types.ObjectId.isValid(guestId)) {
            return res.status(400).json({ message: 'Invalid guest ID format.' });
        }

        const refunds = await Refund.find({ guestId })
            .populate('bookingId', 'transNo propertyName totalFee status checkIn checkOut')
            .populate('guestId', 'firstname lastname email phoneNumber')
            .sort({ createdAt: -1 });

        res.status(200).json(refunds);
    } catch (err) {
        console.error('Error retrieving refunds by guest:', err);
        res.status(500).json({ message: 'Error retrieving refunds', error: err.message });
    }
}

exports.getRefundById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({ message: 'Refund ID is required.' });
        }
        
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid refund ID format.' });
        }

        const refund = await Refund.findById(id)
            .populate('bookingId', 'transNo propertyName totalFee status checkIn checkOut guestName')
            .populate('guestId', 'firstname lastname email phoneNumber pfplink');

        if (!refund) {
            return res.status(404).json({ message: 'Refund not found.' });
        }

        res.status(200).json(refund);
    } catch (err) {
        console.error('Error retrieving refund by ID:', err);
        res.status(500).json({ message: 'Error retrieving refund', error: err.message });
    }
}