const mongoose = require('mongoose');

const faqSchema = new mongoose.Schema({
    question: { type: String, required: true },
    answer: { type: String, required: true },
    active: { type: Boolean, default: true }
},{
    collection: 'faq_tb',
    timestamps: true
})
module.exports = mongoose.model('faq', faqSchema)