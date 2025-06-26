const booking = require('../models/bookingModel');
const Counter = require('../models/counterModel');
const Property = require('../models/propertyModel');

exports.createBooking = async (req, res) => {
  try {
    const {
      propertyId,
      guestId,
      guestName,
      datesOfBooking,
      checkIn,
      checkOut,
      additionalPax = 0
    } = req.body;

    if (!propertyId || !guestId || !guestName || !datesOfBooking || !checkIn || !checkOut) {
      return res.status(400).json({ message: 'Missing required fields.' });
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

    const allBookedDates = existingBookings.flatMap(b => b.datesOfBooking.map(d => d.toISOString().slice(0, 10)));
    const allMaintenanceDates = maintenance.flatMap(m => m.dates.map(d => d.toISOString().slice(0, 10)));

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

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    const numOfDays = Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24));
    if (numOfDays <= 0) {
      return res.status(400).json({ message: 'Invalid check-in/check-out dates.' });
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