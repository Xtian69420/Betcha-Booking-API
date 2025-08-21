const mongoose = require('mongoose');

const guestWarningSchema = new mongoose.Schema({
    guestId : { type: String, required: true },
    reason : { type: String, required: true },
    transNo : { type: String, required: true },
    reportedBy : { type: String, required : true }
}, {
  collection: 'guestWarning_tb',
  timestamps: true
});

module.exports = mongoose.model('guestWarning', guestWarningSchema);