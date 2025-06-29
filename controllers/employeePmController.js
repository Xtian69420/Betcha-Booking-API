const Booking = require('../models/bookingModel');
const Property = require('../models/propertyModel');
const moment = require('moment-timezone');

exports.getBookingSpecificDateAndProperties = async (req, res) => {
    try {
        const { checkIn, propertyIds } = req.body;

        // Validate
        if (!checkIn || !propertyIds || !Array.isArray(propertyIds) || propertyIds.length === 0) {
            return res.status(400).json({ message: 'checkIn date and propertyIds array are required.' });
        }

        const checkInDate = new Date(checkIn);
        checkInDate.setHours(0, 0, 0, 0);

        const nextDay = new Date(checkInDate);
        nextDay.setDate(nextDay.getDate() + 1);

        const bookings = await Booking.find({
            propertyId: { $in: propertyIds },
            checkIn: {
                $gte: checkInDate,
                $lt: nextDay
            }
        });

        const result = bookings.map(booking => ({
            nameOfProperty: booking.propertyName,
            checkIn: booking.checkIn.toISOString().split('T')[0],
            checkOut: booking.checkOut.toISOString().split('T')[0],
            timeIn: booking.timeIn,
            timeOut: booking.timeOut,
            nameOfGuest: booking.guestName
        }));

        res.status(200).json(result);
    } catch (error) {
        console.error('Error fetching bookings:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

exports.getCheckInToday = async (req, res) => {
    try {
        const { propertyIds } = req.body;

        if (!propertyIds || !Array.isArray(propertyIds) || propertyIds.length === 0) {
            return res.status(400).json({ message: 'propertyIds array is required.' });
        }

        // Get current date in PH timezone
        const todayPH = moment().tz('Asia/Manila');
        const startOfDay = todayPH.clone().startOf('day').toDate();
        const endOfDay = todayPH.clone().endOf('day').toDate();

        const bookings = await Booking.find({
            propertyId: { $in: propertyIds },
            checkIn: {
                $gte: startOfDay,
                $lte: endOfDay
            }
        });

        const result = [
            { message: `date today is ${todayPH.format('YYYY-MM-DD')}` }
        ];

        bookings.forEach(booking => {
            result.push({
                nameOfProperty: booking.propertyName,
                checkIn: moment(booking.checkIn).tz('Asia/Manila').format('YYYY-MM-DD'),
                checkOut: moment(booking.checkOut).tz('Asia/Manila').format('YYYY-MM-DD'),
                timeIn: booking.timeIn,
                timeOut: booking.timeOut,
                nameOfGuest: booking.guestName
            });
        });

        res.status(200).json(result);
    } catch (error) {
        console.error('Error in getCheckInToday:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};