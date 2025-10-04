const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    paymentName : { type: String },
    category : { type: String },
    qrPhotoLink : { type: String },
    active: { type : Boolean, deafult: true }
},{
    collection: 'payment_tb',
    timestamps: true
})
module.exports = mongoose.model('payment', paymentSchema)