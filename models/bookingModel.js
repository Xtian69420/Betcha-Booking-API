const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  transNo: { type: String, required: true },
  propertyName: { type: String, required: true },
  propertyId: { type: String, required: true },
  transfer: {
    isTransferred: { type: Boolean, default: false },
    propertyId: { type: String },
    propertyName : { type: String},
  },
  guestId: { type: String, required: true },
  guestName: { type: String, required: true },
  status: {
    type: String,
    enum: ['Pending Payment', 'Reserved', 'Fully-Paid', 'Checked-In', 'Checked-Out', 'Completed', 'Cancel', 'Transferred'],
    default: 'Cancel'
  },
  paymentCategory: { type: String, default: ''},
  reservationFee: { type: Number, required: true },
  packageFee: { type: Number, required: true },
  discount: { type: Number, default: 0 },
  additionalPaxPrice: { type: Number, required: true },
  additionalPax: { type: Number, default: 0 },

  reservation: {
    modeOfPayment: { type: String, default: 'Pending' },
    paymentNo: { type: String, default: 'Pending' },
    status: {type: String, default: 'Pending'},
    numberBankEwallets: {type: String, default: 'N/A'}
  },
  package: {
    modeOfPayment: { type: String, default: 'Pending' },
    paymentNo: { type: String, default: 'Pending' },
    status: {type: String, default: 'Pending'}, // Approve or Approved | Decline or Declined
    numberBankEwallets: {type: String, default: 'N/A'}
  },
  datesOfBooking: { type: [Date], required: true },
  totalFee: { type: Number, required: true },
  numOfDays: { type: Number, default: 0 },
  checkIn: { type: Date, required: true },
  checkOut: { type: Date, required: true },
  timeIn: { type: String, required: true },
  timeOut: { type: String, required: true },
  rating: { type: Number, default: 0 },
  refund: {
    // P kukunin kung ano yung merong value sa reservation and package, if G kukuhnin lang si (totalFee - reservationFee if merong laman si packageFee)
    refundAmount: { type: Number, default: 0 },
    approved: { type: Boolean, default: false } // toggle display sa guest my bookings
  }
}, {
  collection: 'booking_tb',
  timestamps: true
});

module.exports = mongoose.model('booking', bookingSchema);