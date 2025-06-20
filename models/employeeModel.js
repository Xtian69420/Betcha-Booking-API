const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
    firstname: { type: String, required: true },
    minitial: { type: String },
    lastname: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    pfplink: { type: String },
    role: { type: string },
    userType: { type: String, default: 'employee' },
}, {
  collection: 'employee_tb',
  timestamps: true
});

module.exports = mongoose.model('employee', employeeSchema);