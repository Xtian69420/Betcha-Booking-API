const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
    firstname: { type: String, required: true },
    minitial: { type: String },
    lastname: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    pfplink: { type: String, default: 'https://drive.google.com/thumbnail?id=1jR18TOfk0Tx2ltegL6wFZ8M1Id0GdHhe&sz=w1920-h1080'},
    userType: { type: String, default: 'admin' },
}, {
  collection: 'admin_tb',
  timestamps: true
});

module.exports = mongoose.model('admin', adminSchema);