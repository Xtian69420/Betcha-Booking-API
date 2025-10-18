const Booking = require('../models/bookingModel');
const Property = require('../models/propertyModel');
const Guest = require('../models/guestModel');

exports.getAllPendingAndCompletedTransactionByProperties = async (req, res) => {
  try {
    const { propertyIds } = req.body; 

    if (!propertyIds || (Array.isArray(propertyIds) && propertyIds.length === 0)) {
      return res.status(400).json({ message: "No propertyId(s) provided." });
    }

    const ids = Array.isArray(propertyIds) ? propertyIds : [propertyIds];

    const bookings = await Booking.find({ propertyId: { $in: ids } }).lean();

    const pendingStatuses = ['Pending Payment', 'Reserved', 'Fully-Paid', 'Checked-In', 'Checked-Out', 'Transferred'];
    const completedStatuses = ['Completed', 'Cancel'];

    const formatBooking = (booking) => ({
      bookingId: booking._id,
      transNo: booking.transNo,
      nameOfGuest: booking.guestName,
      propertyName: booking.propertyName,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      paymentMode: booking.package?.modeOfPayment || 'N/A',
      totalAmount: booking.totalFee,
      status: booking.status
    });

    const pending = [];
    const completed = [];

    for (const booking of bookings) {
      if (pendingStatuses.includes(booking.status)) {
        pending.push(formatBooking(booking));
      } else if (completedStatuses.includes(booking.status)) {
        completed.push(formatBooking(booking));
      }
    }

    return res.status(200).json({ pending, completed });

  } catch (error) {
    console.error("Error fetching transactions by properties:", error);
    return res.status(500).json({ message: "Server error", error });
  }
};
