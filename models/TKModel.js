const mongoose = require('mongoose');

const TKSchema = new mongoose.Schema({
  ticketNumber: { type: Number, required: true, unique: true },
  category: { type: String, required: true },
  customerServiceAgentId: { type: String, required: true },
  status: {
    type: String,
    enum: ['queue', 'in-progress', 'requesting refund', 'resolved', 'closed'],
    default: 'queue'
  },
  senderId: { type: String, required: true },
  messages: [
    {
      userId: { type: String, required: true },
      userName: { type: String, required: true },
      userLevel: {
        type: String,
        enum: ['Guest', 'Admin', 'Employee'],
        required: true
      },
      message: { type: String, required: true },
      dateTime: { type: Date }
    }
  ]
}, {
  collection: 'TK_tb',
  timestamps: true
});

module.exports = mongoose.model('TK', TKSchema);
