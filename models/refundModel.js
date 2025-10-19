const mongoose = require('mongoose');

const refundSchema = new mongoose.Schema({
    bookingId : { type: mongoose.Schema.Types.ObjectId, ref: 'booking', required: true },
    guestId: { type: mongoose.Schema.Types.ObjectId, ref: 'guest', required: true },
    amount: { type: String, required: true },
    image: { type: String, required: true }
},{
    collection: 'refund_tb',
    timestamps: true
})
module.exports = mongoose.model('refund', refundSchema)