const mongoose = require('mongoose');

// Report Schema
const reportSchema = new mongoose.Schema({
    id: { type: Number },
    sender: { type: String, required: true },
    category: { type: String, required: true },
    status: { type: String, default: 'Unsolved' },
    date: { type: Date, required: true },
    transNo: { type: String, required: true },
    message: { type: String, required: true }
}, { _id: false });

// Calendar Schema
const calendarSchema = new mongoose.Schema({
    dates: {
        type: [Date],
        required: true
    },
    status: {
        type: String,
        enum: ['Active', 'Deactivated'],
        default: 'Active'
    }
}, { _id: false });

// Property Schema
const propertySchema = new mongoose.Schema({
    status: {
        type: String,
        enum: ['Active', 'Inactive', 'Archived'],
        default: 'Active'
    },
    name: { type: String, required: true },
    address: { type: String, required: true },
    mapLink: { type: String, required: true },
    city: { type: String, required: true },
    description: { type: String, required: true },
    category: {
        type: String,
        enum: ['Barkada', 'Couple', 'Family', 'Other'],
        default: 'Other'
    },
    packageCapacity: { type: Number, required: true },
    maxCapacity: { type: Number, required: true },
    timeIn: { type: String, required: true },
    timeOut: { type: String, required: true },
    packagePrice: { type: Number, required: true },
    reservationFee: { type: Number, required: true },
    additionalPax: { type: Number, required: true },
    amenities: {
        type: [String],
        required: true
    },
    otherAmenities: {
        type: [String],
        required: true
    },
    discount: { type: Number, default: 0 },
    rating: { type: Number, default: 0 },
    reports: {
        unsolved: { type: [reportSchema], default: [] },
        solved: { type: [reportSchema], default: [] }
    },
    photoLinks: {
        type: [String],
        required: true,
        default: []
    },
    maintenance: {
        type: [calendarSchema],
        default: []
    }
}, {
    collection: 'property_tb',
    timestamps: true
});

module.exports = mongoose.model('property', propertySchema);