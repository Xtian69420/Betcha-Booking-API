const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    from: {
        fromId : { type: String, required: true },
        name : { type: String, required : true },
        role : { type: String, enum: ['admin', 'employee', 'guest'], required: true }
    },
    to : { 
        toId : { type: String, required: true }, 
        name: { type: String, required: true },
        role : { type: String, enum: ['admin', 'employee', 'guest'], required: true }
    },
    seen : { type: Boolean, default: false },
    dateTime : { type: Date }, 
    category : { type: String, enum: ['Cancellation Request', 'Message'], default: 'Message' },
    message : { type: String, required: true },

    // Optional cancellation fields
    approveCancel : { type: Boolean, default: false },
    transNo : { type: String },
    amountRefund : { type: Number },
    reasonToGuest : { type: String },
    numberEwalletBank : { type: String }
}, {
    collection: 'notification_tb',
    timestamps: true
});

module.exports = mongoose.model('notification', notificationSchema); 