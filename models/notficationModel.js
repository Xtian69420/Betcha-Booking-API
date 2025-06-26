const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
    email: { type: String, required: true },
    otp: { type: Number, required: true },
    expiresAt: { type: Date, required: true },
    isUsed: { type: Boolean, default: false },
},{
    collection: 'otp_tb',
    timestamps: true
})
module.exports = mongoose.model('otp', otpSchema)