const mongoose = require('mongoose');

const guestSchema = new mongoose.Schema({
    firstname: { type: String, required: true },
    minitial: { type: String },
    lastname: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phoneNumber: { type: Number, required: true },
    birthday: { type: Date, required: true },
    sex: { type: String, default: 'N/A' },
    pfplink: { type: String, default: 'https://drive.google.com/thumbnail?id=1jR18TOfk0Tx2ltegL6wFZ8M1Id0GdHhe&sz=w1920-h1080' },
    verified: { type: Boolean, default: true },
    userType: { type: String, default: 'guest' },
    warning: { type: Number, default: 0},
    archived: { type: Boolean, default: false },
}, {
  collection: 'guest_tb',
  timestamps: true
});

module.exports = mongoose.model('guest', guestSchema);