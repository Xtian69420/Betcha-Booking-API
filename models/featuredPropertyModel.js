const mongoose = require('mongoose');

const featuredPropertySchema = new mongoose.Schema({
    number: { type: Number },
    propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'property', required: true }

},{
    collection: 'featuredProperty_tb',
    timestamps: true
})
module.exports = mongoose.model('featuredProperty', featuredPropertySchema)