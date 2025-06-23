const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
    sender: { type: String, required: true },
    category: { type: String, required: true },
    status: { type: String, required: true },
    date: { type: Date, required: true },
    transNo: { type: String, required: true },
    message: { type: String, required: true }
}, { _id: false });


const propertySchema = new mongoose.Schema({
    status : { type: String, default : 'Active' },
    name : { type: String, required : true },
    address : { type: String, required : true},
    mapLink : { type : String, required : true },
    city : { type : String, required : true },
    description : { type: String, required : true },
    category : { type : String, default : 'default' },
    packageCapacity : {type: Number, required : true},
    maxCapacity : { type : Number, required : true },
    timeIn: { type: String, required: true, match: /^([0-1]\d|2[0-3]):([0-5]\d)$/ },
    timeOut: { type: String, required: true, match: /^([0-1]\d|2[0-3]):([0-5]\d)$/ },
    packagePrice : { type : Number, required : true },
    reservationFee : { type : Number, required : true },
    additionalPax : { type : Number, required : true },
    amenities : {
        type: [String],
        required: true
    },
    otherAmenities : {
        type: [String],
        required: true
    },
    discount : { type : Number, default : 0},
    rating : { type: Number, default : 0 },
    reports: {
        unsolved: [reportSchema],
        solved: [reportSchema]
    },
    photoLinks : {
        type: [String],
        required: true
    }
},{
    collection: 'property_tb',
    timestamps: true
})
module.exports = mongoose.model('property', propertySchema)