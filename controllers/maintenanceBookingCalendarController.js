const Property = require('../models/propertyModel');
const Booking = require('../models/bookingModel');

exports.getCalendarByPropertyId = async (req, res) => {
  try {
    const { propertyId } = req.params;

    if (!propertyId) {
      return res.status(400).json({ message: 'Property ID is required.' });
    }

    const bookings = await Booking.find({
      propertyId: propertyId,
      status: { $nin: ['Cancel'] }
    });

    const bookingDates = [];
    bookings.forEach(booking => {
      booking.datesOfBooking.forEach(date => {
        bookingDates.push({
          date: date.toISOString().split('T')[0],
          bookingId: booking._id
        });
      });
    });

    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({ message: 'Property not found.' });
    }

    const maintenanceDates = [];
    property.maintenance.forEach(entry => {
      if (entry.status === 'Active') {
        entry.dates.forEach(date => {
          maintenanceDates.push({ date: date.toISOString().split('T')[0] });
        });
      }
    });

    return res.status(200).json({
      calendar: {
        propertyId: propertyId,
        booking: bookingDates,
        maintenance: maintenanceDates
      }
    });

  } catch (error) {
    console.error('Error fetching calendar data:', error);
    res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
};

exports.getCalendarForMultiplePropertyById = async (req, res) => {
  try {
    const { propertyIds } = req.body;

    if (!Array.isArray(propertyIds) || propertyIds.length === 0) {
      return res.status(400).json({ message: 'propertyIds must be a non-empty array.' });
    }

    const calendar = [];

    for (const propertyId of propertyIds) {

      const bookings = await Booking.find({
        propertyId,
        status: { $nin: ['Cancel'] }
      });

      const bookingDates = [];
      bookings.forEach(booking => {
        booking.datesOfBooking.forEach(date => {
          bookingDates.push({
            date: date.toISOString().split('T')[0],
            bookingId: booking._id
          });
        });
      });

      const property = await Property.findById(propertyId);
      if (!property) continue;

      const maintenanceDates = [];
      property.maintenance.forEach(entry => {
        if (entry.status === 'Active') {
          entry.dates.forEach(date => {
            maintenanceDates.push({ date: date.toISOString().split('T')[0] });
          });
        }
      });

      calendar.push({
        propertyId,
        booking: bookingDates,
        maintenance: maintenanceDates
      });
    }

    return res.status(200).json({ calendar });

  } catch (error) {
    console.error('Error fetching multiple property calendars:', error);
    res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
};


exports.getAllCalendarForAllProperties = async (req, res) => {
  try {
    const allProperties = await Property.find(); 

    const calendar = [];

    for (const property of allProperties) {
      const propertyId = property._id;

      // Fetch valid bookings for this property
      const bookings = await Booking.find({
        propertyId: propertyId.toString(),
        status: { $nin: ['Cancel'] }
      });

      const bookingDates = [];
      bookings.forEach(booking => {
        booking.datesOfBooking.forEach(date => {
          bookingDates.push({
            date: date.toISOString().split('T')[0],
            bookingId: booking._id
          });
        });
      });

      const maintenanceDates = [];
      property.maintenance.forEach(entry => {
        if (entry.status === 'Active') {
          entry.dates.forEach(date => {
            maintenanceDates.push({ date: date.toISOString().split('T')[0] });
          });
        }
      });

      calendar.push({
        propertyId: propertyId.toString(),
        booking: bookingDates,
        maintenance: maintenanceDates
      });
    }

    return res.status(200).json({ calendar });

  } catch (error) {
    console.error('Error fetching calendar for all properties:', error);
    res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
};

exports.getAllPropertiesAvailableOn = async (req, res) => {
  try {
    const { city, CheckOut } = req.body;

    if (!city || !CheckOut) {
      return res.status(400).json({ message: 'City and CheckOut date are required.' });
    }

    // Get today's date in Philippines timezone
    const moment = require('moment-timezone');
    const today = moment.tz('Asia/Manila').startOf('day').toDate();
    const checkOutDate = new Date(CheckOut);

    if (checkOutDate < today) {
      return res.status(400).json({ message: 'CheckOut date must be today or in the future.' });
    }

    // Find all active properties in the specified city
    const propertiesInCity = await Property.find({
      city: { $regex: new RegExp(city, 'i') },
      status: 'Active'
    });

    if (propertiesInCity.length === 0) {
      return res.status(404).json({ 
        message: `No properties found in ${city}.`,
        availableProperties: []
      });
    }

    // Generate date range from today to CheckOut
    const dateRange = [];
    let currentDate = new Date(today);
    while (currentDate <= checkOutDate) {
      dateRange.push(currentDate.toISOString().split('T')[0]);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const availableProperties = [];

    for (const property of propertiesInCity) {
      const propertyId = property._id.toString();

      // Get all bookings for this property (exclude cancelled)
      const bookings = await Booking.find({
        propertyId: propertyId,
        status: { $nin: ['Cancel'] }
      });

      // Collect all booked dates
      const bookedDates = new Set();
      bookings.forEach(booking => {
        booking.datesOfBooking.forEach(date => {
          bookedDates.add(date.toISOString().split('T')[0]);
        });
      });

      // Collect all maintenance dates (only Active maintenance)
      const maintenanceDates = new Set();
      property.maintenance.forEach(entry => {
        if (entry.status === 'Active') {
          entry.dates.forEach(date => {
            maintenanceDates.add(date.toISOString().split('T')[0]);
          });
        }
      });

      // Check if property is available for all dates in the range
      const isAvailable = dateRange.every(date => {
        return !bookedDates.has(date) && !maintenanceDates.has(date);
      });

      if (isAvailable) {
        availableProperties.push({
          propertyId: property._id,
          propertyName: property.name,
          city: property.city,
          address: property.address
        });
      }
    }

    const todayFormatted = moment.tz('Asia/Manila').format('YYYY-MM-DD');
    const checkOutFormatted = moment(checkOutDate).format('YYYY-MM-DD');

    return res.status(200).json({
      message: `List of available rooms in ${city} on ${todayFormatted} - ${checkOutFormatted}`,
      count: availableProperties.length,
      availableProperties: availableProperties
    });

  } catch (error) {
    console.error('Error fetching available properties:', error);
    res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
};