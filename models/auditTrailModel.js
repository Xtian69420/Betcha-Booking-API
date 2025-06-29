const mongoose = require('mongoose');

const auditTrailSchema = new mongoose.Schema({
    refNo: { type: Number, required: true },
    dateTime: { type: Date }, 
    userId: { type: String, required: true },
    userType: { type: String, required: true },
    activity: { type: String, required: true }
}, {
    collection: 'auditTrail_tb',
    timestamps: true
});

module.exports = mongoose.model('auditTrail', auditTrailSchema);