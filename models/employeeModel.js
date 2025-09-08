const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
    firstname: { type: String, required: true },
    minitial: { type: String },
    lastname: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    pfplink: { type: String, default: 'https://drive.google.com/thumbnail?id=1jR18TOfk0Tx2ltegL6wFZ8M1Id0GdHhe&sz=w1920-h1080' },
    role: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'roles',
      required: true
    }],
    properties: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'property'
    }],
    userType: { type: String, default: 'employee' },
    status: { type: String, default: 'active' }
}, {
  collection: 'employee_tb',
  timestamps: true
});

module.exports = mongoose.model('employee', employeeSchema);