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

    const existingBookings = await booking.find({ propertyId });

    const allBookedDates = existingBookings.flatMap(b =>
      b.datesOfBooking.map(d => d.toISOString().slice(0, 10))
    );
    const allMaintenanceDates = maintenance.flatMap(m =>
      m.dates.map(d => d.toISOString().slice(0, 10))
    );

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
    const totalFee = reservationFee + discountedPackageFee + (additionalPax * additionalPaxPrice);

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

exports.reservationPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { modeOfPayment, paymentNo, status, numberBankEwallets } = req.body;

    if (!modeOfPayment || !paymentNo || !status) {
      return res.status(400).json({ message: 'All reservation fields are required.' });
    }

    const updatedBooking = await booking.findByIdAndUpdate(
      id,
      {
        $set: {
          'reservation.modeOfPayment': modeOfPayment,
          'reservation.paymentNo': paymentNo,
          'reservation.status': status,
          numberBankEwallets: numberBankEwallets || 'N/A',
          status: status === 'Reserved' ? 'Reserved' : 'Pending Payment'
        }
      },
      { new: true }
    );

    if (!updatedBooking) {
      return res.status(404).json({ message: 'Booking not found.' });
    }

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


exports.packagePayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { modeOfPayment, paymentNo, status } = req.body;

    if (!modeOfPayment || !paymentNo || !status) {
      return res.status(400).json({ message: 'All package fields are required.' });
    }

    const updatedBooking = await booking.findByIdAndUpdate(
      id,
      {
        $set: {
          'package.modeOfPayment': modeOfPayment,
          'package.paymentNo': paymentNo,
          'package.status': status,
          status: status === 'Fully-Paid' ? 'Fully-Paid' : 'Reserved'
        }
      },
      { new: true }
    );

    if (!updatedBooking) {
      return res.status(404).json({ message: 'Booking not found.' });
    }

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

exports.fullPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { modeOfPayment, paymentNo, status, numberBankEwallets } = req.body;

    if (!modeOfPayment || !paymentNo || !status) {
      return res.status(400).json({ message: 'modeOfPayment, paymentNo, and status are required.' });
    }

    const updatedBooking = await booking.findByIdAndUpdate(
      id,
      {
        $set: {
          'reservation.modeOfPayment': modeOfPayment,
          'reservation.paymentNo': paymentNo,
          'reservation.status': status,
          'package.modeOfPayment': modeOfPayment,
          'package.paymentNo': paymentNo,
          'package.status': status,
          numberBankEwallets: numberBankEwallets || 'N/A',
          status: status === 'Fully-Paid' ? 'Fully-Paid' : 'Reserved'
        }
      },
      { new: true }
    );

    if (!updatedBooking) {
      return res.status(404).json({ message: 'Booking not found.' });
    }

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