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
    pfplink: { type: String },
    verified: { type: Boolean, default: false },
    userType: { type: String, default: 'guest' },
    warning: { type: Number, default: 0},
    archived: { type: Boolean, default: false },
}, {
  collection: 'guest_tb',
  timestamps: true
});

module.exports = mongoose.model('guest', guestSchema);