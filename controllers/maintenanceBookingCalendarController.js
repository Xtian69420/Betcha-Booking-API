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