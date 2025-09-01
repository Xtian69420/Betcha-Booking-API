const booking = require('../models/bookingModel');
const Counter = require('../models/counterModel');
const Property = require('../models/propertyModel');
const mongoose = require('mongoose');

exports.createBooking = async (req, res) => {
  try {
    const {
      propertyId,
      guestId,
      guestName,
      datesOfBooking,
      additionalPax = 0
    } = req.body;

    if (!propertyId || !guestId || !guestName || !datesOfBooking) {
      return res.status(400).json({ message: 'Missing required fields.' });
    }

    if (!Array.isArray(datesOfBooking) || datesOfBooking.length === 0) {
      return res.status(400).json({ message: 'datesOfBooking must be a non-empty array.' });
    }

    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({ message: 'Property not found.' });
    }

    const {
      name: propertyName,
      reservationFee,
      packagePrice: packageFee,
      discount,
      additionalPax: additionalPaxPrice,
      timeIn,
      timeOut,
      maintenance
    } = property;

    const existingBookings = await booking.find({ 
      propertyId,
      status: { $nin: ['Cancel', 'cancel', 'Cancelled'] } // Exclude cancelled bookings
    });

    const allBookedDates = existingBookings.flatMap(b =>
      b.datesOfBooking.map(d => d.toISOString().slice(0, 10))
    );
    const allMaintenanceDates = maintenance
      .filter(m => m.status !== 'Deactivated') // Exclude deactivated maintenance
      .flatMap(m => m.dates.map(d => d.toISOString().slice(0, 10)));

    const conflictDates = datesOfBooking.filter(date =>
      allBookedDates.includes(new Date(date).toISOString().slice(0, 10)) ||
      allMaintenanceDates.includes(new Date(date).toISOString().slice(0, 10))
    );

    if (conflictDates.length > 0) {
      return res.status(400).json({
        message: 'Some of the selected dates are already booked or under maintenance.',
        conflictDates
      });
    }

    const counter = await Counter.findOneAndUpdate(
      { name: 'booking' },
      { $inc: { value: 1 } },
      { new: true, upsert: true }
    );
    const transNo = counter.value.toString().padStart(9, '0');

    const sortedDates = datesOfBooking
      .map(d => new Date(d))
      .sort((a, b) => a - b);
    const checkIn = sortedDates[0];
    const checkOut = sortedDates[sortedDates.length - 1];

    const numOfDays = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24)) + 1;
    if (numOfDays <= 0) {
      return res.status(400).json({ message: 'Invalid booking date range.' });
    }

    const discountedPackageFee = packageFee - (packageFee * discount / 100);
    const totalFee = reservationFee + (discountedPackageFee * numOfDays) + (additionalPax * additionalPaxPrice);

    const newBooking = new booking({
      transNo,
      propertyId,
      propertyName,
      guestId,
      guestName,
      reservationFee,
      packageFee,
      discount,
      additionalPax,
      additionalPaxPrice,
      datesOfBooking,
      totalFee,
      numOfDays,
      checkIn,
      checkOut,
      timeIn,
      timeOut
    });

    await newBooking.save();

    res.status(201).json({
      message: 'Booking created successfully.',
      booking: newBooking
    });

  } catch (err) {
    console.error('Error creating booking:', err);
    res.status(500).json({ message: 'Internal server error.' });
  }
};

exports.getAllBookings = async (req, res) => {
  try {
    const bookings = await booking.find().sort({ createdAt: -1 });

    res.status(200).json({
      message: 'All bookings retrieved successfully.',
      bookings
    });
  } catch (error) {
    console.error('Error fetching all bookings:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
};


exports.updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = [
      'Pending Payment',
      'Reserved',
      'Fully-Paid',
      'Checked-In',
      'Checked-Out',
      'Completed',
      'Cancel'
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status value.' });
    }

    const updatedBooking = await booking.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );

    if (!updatedBooking) {
      return res.status(404).json({ message: 'Booking not found.' });
    }

    res.status(200).json({
      message: 'Booking status updated successfully.',
      booking: updatedBooking
    });
  } catch (err) {
    console.error('Error updating booking status:', err);
    res.status(500).json({ message: 'Internal server error.' });
  }
};

exports.displayByStatus = async (req, res) => {
  try {
    const { status } = req.params;

    const validStatuses = [
      'Pending Payment',
      'Reserved',
      'Fully-Paid',
      'Checked-In',
      'Checked-Out',
      'Completed',
      'Cancel'
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status value.' });
    }

    const bookingsByStatus = await booking.find({ status });

    res.status(200).json({
      message: `Bookings with status '${status}' retrieved successfully.`,
      bookings: bookingsByStatus
    });
  } catch (err) {
    console.error('Error retrieving bookings by status:', err);
    res.status(500).json({ message: 'Internal server error.' });
  }
};

exports.getBookingsByPropertyId = async (req, res) => {
  try {
    const { propertyId } = req.params;

    if (!propertyId) {
      return res.status(400).json({ message: 'Property ID is required.' });
    }

    const bookings = await booking.find({ propertyId });

    if (!bookings || bookings.length === 0) {
      return res.status(404).json({ message: 'No bookings found for this property.' });
    }

    res.status(200).json({
      message: `Bookings for property ID ${propertyId} retrieved successfully.`,
      bookings
    });
  } catch (err) {
    console.error('Error fetching bookings by propertyId:', err);
    res.status(500).json({ message: 'Internal server error.' });
  }
};

const guest = require('../models/guestModel');
// Reservation Payment
exports.reservationPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { modeOfPayment, paymentNo, numberBankEwallets } = req.body;

    if (!modeOfPayment || !paymentNo) {
      return res.status(400).json({ message: 'Mode of payment and payment number are required.' });
    }

    const updatedBooking = await booking.findByIdAndUpdate(
      id,
      {
        $set: {
          'reservation.modeOfPayment': modeOfPayment,
          'reservation.paymentNo': paymentNo,
          'reservation.numberBankEwallets': numberBankEwallets || 'N/A',
          paymentCategory: 'Reservation'
        }
      },
      { new: true }
    );

    if (!updatedBooking) return res.status(404).json({ message: 'Booking not found.' });

    const guestData = await guest.findById(updatedBooking.guestId);
    const guestEmail = guestData?.email || 'N/A';

    res.status(200).json({
      message: 'Reservation payment updated successfully.',
      guestEmail,
      booking: updatedBooking
    });

  } catch (error) {
    console.error('Error updating reservation payment:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
};

// Package Payment
exports.packagePayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { modeOfPayment, paymentNo, numberBankEwallets } = req.body;

    if (!modeOfPayment || !paymentNo) {
      return res.status(400).json({ message: 'Mode of payment and payment number are required.' });
    }

    const updatedBooking = await booking.findByIdAndUpdate(
      id,
      {
        $set: {
          'package.modeOfPayment': modeOfPayment,
          'package.paymentNo': paymentNo,
          'package.numberBankEwallets': numberBankEwallets || 'N/A',
          paymentCategory: 'Full-Payment'
        }
      },
      { new: true }
    );

    if (!updatedBooking) return res.status(404).json({ message: 'Booking not found.' });

    const guestData = await guest.findById(updatedBooking.guestId);
    const guestEmail = guestData?.email || 'N/A';

    res.status(200).json({
      message: 'Package payment updated successfully.',
      guestEmail,
      booking: updatedBooking
    });

  } catch (error) {
    console.error('Error updating package payment:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
};

// Full Payment
exports.fullPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { modeOfPayment, paymentNo, numberBankEwallets } = req.body;

    if (!modeOfPayment || !paymentNo) {
      return res.status(400).json({ message: 'Mode of payment and payment number are required.' });
    }

    const updatedBooking = await booking.findByIdAndUpdate(
      id,
      {
        $set: {
          'reservation.modeOfPayment': modeOfPayment,
          'reservation.paymentNo': paymentNo,
          'reservation.numberBankEwallets': numberBankEwallets || 'N/A',
          'package.modeOfPayment': modeOfPayment,
          'package.paymentNo': paymentNo,
          'package.numberBankEwallets': numberBankEwallets || 'N/A',
          paymentCategory: 'Full-Payment'
        }
      },
      { new: true }
    );

    if (!updatedBooking) return res.status(404).json({ message: 'Booking not found.' });

    const guestData = await guest.findById(updatedBooking.guestId);
    const guestEmail = guestData?.email || 'N/A';

    res.status(200).json({
      message: 'Full payment (reservation + package) updated successfully.',
      booking: updatedBooking,
      guestEmail
    });

  } catch (error) {
    console.error('Error updating full payment:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
};


exports.rateBooking = async (req, res) => {
  try {
    const { id } = req.params; 
    const { rating } = req.body;

    if (!rating || typeof rating !== 'number' || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be a number between 1 and 5.' });
    }

    const ratedBooking = await booking.findById(id);
    if (!ratedBooking) {
      return res.status(404).json({ message: 'Booking not found.' });
    }

    if (ratedBooking.rating > 0) {
      return res.status(400).json({ message: 'Booking already rated.' });
    }

    ratedBooking.rating = rating;
    await ratedBooking.save();

    const property = await Property.findById(ratedBooking.propertyId);
    if (!property) {
      return res.status(404).json({ message: 'Property not found.' });
    }

    const newRateCount = property.rateCount + 1;
    const newAverageRating = ((property.rating * property.rateCount) + rating) / newRateCount;

    property.rating = newAverageRating;
    property.rateCount = newRateCount;

    await property.save();

    res.status(200).json({
      message: 'Booking rated and property rating updated successfully.',
      bookingId: ratedBooking._id,
      newBookingRating: ratedBooking.rating,
      propertyId: property._id,
      newPropertyRating: property.rating,
      totalRates: property.rateCount
    });

  } catch (error) {
    console.error('Error rating booking:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
};

exports.getBookingsByGuestId = async (req, res) => {
  try {
    const { guestId } = req.params;

    if (!guestId) {
      return res.status(400).json({ message: 'Guest ID is required.' });
    }

    const allBookings = await booking.find({ guestId });

    if (allBookings.length === 0) {
      return res.status(404).json({ message: 'No bookings found for this guest.' });
    }

    const pendingStatuses = [
      'Pending Payment',
      'Reserved',
      'Fully-Paid',
      'Checked-In',
      'Checked-Out'
    ];
    const completedStatuses = ['Completed', 'Cancel'];

    const pending = [];
    const completed = [];
    const rate = [];

    allBookings.forEach(b => {
      if (b.status === 'Completed' && b.rating === 0) {
        rate.push(b); // needs to be rated
      } else if (pendingStatuses.includes(b.status)) {
        pending.push(b);
      } else if (completedStatuses.includes(b.status)) {
        completed.push(b);
      }
    });

    res.status(200).json({
      message: 'Bookings grouped successfully.',
      pending,
      completed,
      rate
    });

  } catch (error) {
    console.error('Error fetching guest bookings:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
};
exports.updateReservationPaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { bookingStatus, paymentStatus } = req.body;

    if (!bookingStatus || !paymentStatus) {
      return res.status(400).json({ message: 'bookingStatus and paymentStatus are required.' });
    }

    const validBookingStatuses = [
      'Pending Payment', 'Reserved', 'Fully-Paid',
      'Checked-In', 'Checked-Out', 'Completed', 'Cancel'
    ];
    if (!validBookingStatuses.includes(bookingStatus)) {
      return res.status(400).json({ message: 'Invalid bookingStatus value.' });
    }

    const validPaymentStatuses = ['Pending', 'Approved', 'Declined'];
    if (!validPaymentStatuses.includes(paymentStatus)) {
      return res.status(400).json({ message: 'Invalid paymentStatus value.' });
    }

    const updatedBooking = await booking.findByIdAndUpdate(
      id,
      {
        $set: {
          status: bookingStatus,
          'reservation.status': paymentStatus
        }
      },
      { new: true, runValidators: true }
    );

    if (!updatedBooking) return res.status(404).json({ message: 'Booking not found.' });

    res.status(200).json({
      message: 'Reservation payment status updated successfully.',
      booking: updatedBooking
    });

  } catch (error) {
    console.error('Error updating reservation payment status:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
};

// ✅ Update Package Payment Status
exports.updatePackagePaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { bookingStatus, paymentStatus } = req.body;

    if (!bookingStatus || !paymentStatus) {
      return res.status(400).json({ message: 'bookingStatus and paymentStatus are required.' });
    }

    const validBookingStatuses = [
      'Pending Payment', 'Reserved', 'Fully-Paid',
      'Checked-In', 'Checked-Out', 'Completed', 'Cancel'
    ];
    if (!validBookingStatuses.includes(bookingStatus)) {
      return res.status(400).json({ message: 'Invalid bookingStatus value.' });
    }

    const validPaymentStatuses = ['Pending', 'Approved', 'Declined'];
    if (!validPaymentStatuses.includes(paymentStatus)) {
      return res.status(400).json({ message: 'Invalid paymentStatus value.' });
    }

    const updatedBooking = await booking.findByIdAndUpdate(
      id,
      {
        $set: {
          status: bookingStatus,
          'package.status': paymentStatus
        }
      },
      { new: true, runValidators: true }
    );

    if (!updatedBooking) return res.status(404).json({ message: 'Booking not found.' });

    res.status(200).json({
      message: 'Package payment status updated successfully.',
      booking: updatedBooking
    });

  } catch (error) {
    console.error('Error updating package payment status:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
};

// ✅ Update Full Payment Status (both reservation + package)
exports.updateFullPaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { bookingStatus, paymentStatus } = req.body;

    if (!bookingStatus || !paymentStatus) {
      return res.status(400).json({ message: 'bookingStatus and paymentStatus are required.' });
    }

    const validBookingStatuses = [
      'Pending Payment', 'Reserved', 'Fully-Paid',
      'Checked-In', 'Checked-Out', 'Completed', 'Cancel'
    ];
    if (!validBookingStatuses.includes(bookingStatus)) {
      return res.status(400).json({ message: 'Invalid bookingStatus value.' });
    }

    const validPaymentStatuses = ['Pending', 'Approved', 'Declined'];
    if (!validPaymentStatuses.includes(paymentStatus)) {
      return res.status(400).json({ message: 'Invalid paymentStatus value.' });
    }

    const updatedBooking = await booking.findByIdAndUpdate(
      id,
      {
        $set: {
          status: bookingStatus,
          'reservation.status': paymentStatus,
          'package.status': paymentStatus
        }
      },
      { new: true, runValidators: true }
    );

    if (!updatedBooking) return res.status(404).json({ message: 'Booking not found.' });

    res.status(200).json({
      message: 'Full payment status updated successfully.',
      booking: updatedBooking
    });

  } catch (error) {
    console.error('Error updating full payment status:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
};

exports.getBookingById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: 'Booking ID is required.' });
    }

    const foundBooking = await booking.findById(id);

    if (!foundBooking) {
      return res.status(404).json({ message: 'Booking not found.' });
    }

    res.status(200).json({
      message: 'Booking retrieved successfully.',
      booking: foundBooking
    });
    
  } catch (error) {
    console.error('Error fetching booking by ID:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
};

exports.getBookingByTransNo = async (req, res) => {
  try {
    const { transNo } = req.params;

    if (!transNo) {
      return res.status(400).json({ message: 'Transaction number is required.' });
    }

    const foundBooking = await booking.findOne({ transNo });

    if (!foundBooking) {
      return res.status(404).json({ message: 'Booking not found with this transaction number.' });
    }

    res.status(200).json({
      message: 'Booking retrieved successfully.',
      booking: foundBooking
    });
    
  } catch (error) {
    console.error('Error fetching booking by transaction number:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
};

exports.deleteBooking = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: 'Booking ID is required.' });
    }

    const deletedBooking = await booking.findByIdAndDelete(id);

    if (!deletedBooking) {
      return res.status(404).json({ message: 'Booking not found.' });
    }

    res.status(200).json({
      message: 'Booking deleted successfully.',
      booking: deletedBooking
    });

  } catch (error) {
    console.error('Error deleting booking:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
};

exports.updateBookingDates = async (req, res) => {
  try {
    const { id } = req.params;
    const { newBookingDates } = req.body;

    if (!id) {
      return res.status(400).json({ message: 'Booking ID is required.' });
    }

    if (!newBookingDates || !Array.isArray(newBookingDates) || newBookingDates.length === 0) {
      return res.status(400).json({ message: 'newBookingDates must be a non-empty array.' });
    }

    // Get the current booking to check property and dates
    const currentBooking = await booking.findById(id);
    if (!currentBooking) {
      return res.status(404).json({ message: 'Booking not found.' });
    }

    // Convert string dates to Date objects and sort them
    const dateObjects = newBookingDates.map(dateStr => new Date(dateStr)).sort((a, b) => a - b);

    // Validate dates
    const invalidDates = dateObjects.filter(date => isNaN(date.getTime()));
    if (invalidDates.length > 0) {
      return res.status(400).json({ message: 'One or more dates are invalid.' });
    }

    // Check for conflicts with other bookings (excluding current booking and cancelled bookings)
    const existingBookings = await booking.find({ 
      propertyId: currentBooking.propertyId,
      _id: { $ne: id }, // Exclude current booking
      status: { $nin: ['Cancel', 'cancel', 'Cancelled'] } // Exclude cancelled bookings
    });

    const allBookedDates = existingBookings.flatMap(b =>
      b.datesOfBooking.map(d => d.toISOString().slice(0, 10))
    );

    // Check for property maintenance dates (excluding deactivated maintenance)
    const property = await Property.findById(currentBooking.propertyId);
    const allMaintenanceDates = property?.maintenance
      ?.filter(m => m.status !== 'Deactivated') // Exclude deactivated maintenance
      ?.flatMap(m => m.dates.map(d => d.toISOString().slice(0, 10))) || [];

    // Check for conflicts
    const conflictDates = newBookingDates.filter(date =>
      allBookedDates.includes(new Date(date).toISOString().slice(0, 10)) ||
      allMaintenanceDates.includes(new Date(date).toISOString().slice(0, 10))
    );

    if (conflictDates.length > 0) {
      return res.status(400).json({
        message: 'Some of the selected dates are already booked or under maintenance.',
        conflictDates
      });
    }

    // Set checkIn as the first date and checkOut as the last date
    const checkIn = dateObjects[0];
    const checkOut = dateObjects[dateObjects.length - 1];

    // Calculate number of days
    const numOfDays = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24)) + 1;

    const updatedBooking = await booking.findByIdAndUpdate(
      id,
      {
        $set: {
          datesOfBooking: dateObjects,
          checkIn,
          checkOut,
          numOfDays
        }
      },
      { new: true }
    );

    res.status(200).json({
      message: 'Booking dates updated successfully.',
      booking: updatedBooking
    });

  } catch (error) {
    console.error('Error updating booking dates:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
};

exports.getTopProperties = async (req, res) => {
  try {
    // Aggregate bookings to get top 5 most booked properties
    const topProperties = await booking.aggregate([
      // Exclude cancelled bookings
      {
        $match: {
          status: { 
            $nin: ['Cancel', 'Cancelled'] 
          }
        }
      },
      // Group by propertyId and count bookings
      {
        $group: {
          _id: '$propertyId',
          bookingCount: { $sum: 1 },
          propertyName: { $first: '$propertyName' }
        }
      },
      // Sort by booking count in descending order
      {
        $sort: { bookingCount: -1 }
      },
      // Limit to top 5
      {
        $limit: 5
      }
    ]);

    // Get property details for the top properties
    const propertyIds = topProperties.map(p => new mongoose.Types.ObjectId(p._id));
    const propertyDetails = await Property.find({ 
      '_id': { $in: propertyIds } 
    });

    // Combine booking counts with property details
    const result = topProperties.map(top => {
      const propertyDetail = propertyDetails.find(p => p._id.toString() === top._id.toString());
      return {
        property: propertyDetail,
        bookingCount: top.bookingCount
      };
    });

    res.status(200).json({
      message: 'Top 5 most booked properties retrieved successfully.',
      properties: result
    });

  } catch (error) {
    console.error('Error fetching top properties:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
};
