const mongoose = require('mongoose');

const landingSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: { type: String, required: true },
    imageLink: { type: String, required: true }
},{
    collection: 'landing_tb',
    timestamps: true
})
module.exports = mongoose.model('landing', landingSchema)