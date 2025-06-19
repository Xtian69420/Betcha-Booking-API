const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
    firstname: { type: String, required: true },
    minitial: { type: String },
    lastname: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    pfplink: { type: String },
    userType: { type: String, default: 'admin' },
}, {
  collection: 'admin_tb',
  timestamps: true
});

module.exports = mongoose.model('admin', adminSchema);