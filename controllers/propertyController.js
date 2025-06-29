const Property = require('../models/propertyModel');
const { google } = require('googleapis');
const fs = require('fs');
require('dotenv').config();

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
  },
  scopes: ['https://www.googleapis.com/auth/drive']
});

const drive = google.drive({ version: 'v3', auth });
const folderId = '1YxNjOLL7IPrPsb2ELXfCVZQhb8UHkAFV';

exports.createProperty = async (req, res) => {
  try {
    const {
      name, address, mapLink, city, description, category,
      packageCapacity, maxCapacity, timeIn, timeOut,
      packagePrice, reservationFee, additionalPax,
      discount, rating, calendarList
    } = req.body;

    const rawAmenities = req.body.amenities;
    const rawOtherAmenities = req.body.otherAmenities;

    if (!req.files || req.files.length === 0)
      return res.status(400).json({ error: 'At least one photo is required.' });

    if (req.files.length > 10)
      return res.status(400).json({ error: 'Maximum of 10 photos allowed.' });

    const photoLinks = [];
    for (const file of req.files) {
      const fileMetaData = {
        name: file.originalname,
        parents: [folderId]
      };

      const media = {
        mimeType: file.mimetype,
        body: fs.createReadStream(file.path)
      };

      const driveResponse = await drive.files.create({
        resource: fileMetaData,
        media: media,
        fields: 'id'
      });

      const fileId = driveResponse.data.id;
      const thumbnailLink = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1920-h1080`;
      photoLinks.push(thumbnailLink);

      fs.unlinkSync(file.path);
    }

    const processedAmenities = Array.isArray(rawAmenities)
      ? rawAmenities
      : typeof rawAmenities === 'string'
        ? rawAmenities.split(',').map(item => item.trim())
        : [];

    const processedOtherAmenities = Array.isArray(rawOtherAmenities)
      ? rawOtherAmenities
      : typeof rawOtherAmenities === 'string'
        ? rawOtherAmenities.split(',').map(item => item.trim())
        : [];

    const newProperty = new Property({
      name,
      address,
      mapLink,
      city,
      description,
      category,
      packageCapacity,
      maxCapacity,
      timeIn,
      timeOut,
      packagePrice,
      reservationFee,
      additionalPax,
      discount: discount || 0,
      rating: rating || 0,
      amenities: processedAmenities,
      otherAmenities: processedOtherAmenities,
      photoLinks,
      calendarListId: calendarList 
    });

    const savedProperty = await newProperty.save();
    res.status(201).json(savedProperty);
  } catch (err) {
    console.error('Error creating property:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

exports.displayAllProperty = async (req, res) => {
  try {
    const properties = await Property.find();
    res.status(200).json(properties);
  } catch (err) {
    console.error('Error retrieving all properties:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

exports.displayByIdProperty = async (req, res) => {
  try {
    const { id } = req.params;
    const property = await Property.findById(id);

    if (!property) {
      return res.status(404).json({ error: 'Property not found.' });
    }
    res.status(200).json(property);
  } catch (err) {
    console.error('Error retrieving property by ID:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};


exports.updateProperty = async (req, res) => {
  try {
    const { id } = req.params;

    const updates = {};


    for (let key in req.body) {
      let value = req.body[key];

      const numberFields = [
        'packageCapacity', 'maxCapacity', 'packagePrice',
        'reservationFee', 'additionalPax', 'discount', 'rating'
      ];
      if (numberFields.includes(key)) {
        updates[key] = Number(value);
        continue;
      }

      if (['amenities', 'otherAmenities'].includes(key)) {
        updates[key] = typeof value === 'string'
          ? value.split(',').map(item => item.trim())
          : value;
        continue;
      }

    if (['timeIn', 'timeOut'].includes(key)) {
        updates[key] = value;
        continue;
    }


      updates[key] = value;
    }

    const updatedProperty = await Property.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true
    });

    if (!updatedProperty) {
      return res.status(404).json({ error: 'Property not found.' });
    }

    return res.status(200).json(updatedProperty);
  } catch (err) {
    console.error('Error updating property:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
};

exports.updatePhotoProperty = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'At least one photo is required.' });
    }

    if (req.files.length > 10) {
      return res.status(400).json({ error: 'Maximum of 10 photos allowed.' });
    }

    const photoLinks = [];

    for (const file of req.files) {
      const fileMetaData = {
        name: file.originalname,
        parents: [folderId]
      };

      const media = {
        mimeType: file.mimetype,
        body: fs.createReadStream(file.path)
      };

      const driveResponse = await drive.files.create({
        resource: fileMetaData,
        media: media,
        fields: 'id'
      });

      const fileId = driveResponse.data.id;
      const link = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1920-h1080`;
      photoLinks.push(link);

      fs.unlinkSync(file.path);
    }

    const updated = await Property.findByIdAndUpdate(id, { photoLinks }, { new: true });

    if (!updated) {
      return res.status(404).json({ error: 'Property not found.' });
    }

    res.status(200).json(updated);
  } catch (err) {
    console.error('Error updating photos:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

exports.createReport = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const { sender, category, status, date, transNo, message } = req.body;

    if (!['Solved', 'Unsolved'].includes(status)) {
      return res.status(400).json({ error: "Status must be either 'Solved' or 'Unsolved'." });
    }

    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({ error: 'Property not found.' });
    }

    const targetReports = status === 'Solved' ? property.reports.solved : property.reports.unsolved;

    // Determine new report ID by finding max existing ID and adding 1
    const maxId = targetReports.length > 0
      ? Math.max(...targetReports.map(r => r.id || 0))
      : 0;

    const newReport = {
      id: maxId + 1,
      sender,
      category,
      status,
      date: date ? new Date(date) : new Date(),
      transNo,
      message
    };

    // Append the new report
    if (status === 'Solved') {
      property.reports.solved.push(newReport);
    } else {
      property.reports.unsolved.push(newReport);
    }

    await property.save();

    res.status(200).json({ message: 'Report added successfully.', report: newReport });
  } catch (err) {
    console.error('Error appending report:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

exports.editReportStatus = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const { id, status, newStatus } = req.body;

    if (!['Solved', 'Unsolved'].includes(status) || !['Solved', 'Unsolved'].includes(newStatus)) {
      return res.status(400).json({ error: "Status and newStatus must be either 'Solved' or 'Unsolved'." });
    }

    if (status === newStatus) {
      return res.status(400).json({ error: 'No status change detected.' });
    }

    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({ error: 'Property not found.' });
    }

    const sourceArray = status === 'Solved' ? property.reports.solved : property.reports.unsolved;
    const targetArray = newStatus === 'Solved' ? property.reports.solved : property.reports.unsolved;

    const reportIndex = sourceArray.findIndex(r => r.id === id);
    if (reportIndex === -1) {
      return res.status(404).json({ error: `Report with id ${id} not found in ${status} list.` });
    }

    const report = sourceArray[reportIndex];
    report.status = newStatus;

    sourceArray.splice(reportIndex, 1);
    targetArray.push(report);

    await property.save();
    res.status(200).json({ message: 'Report status updated successfully.', updatedReport: report });
  } catch (err) {
    console.error('Error updating report status:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

exports.deleteReport = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const { id, status } = req.body; 

    if (!['Solved', 'Unsolved'].includes(status)) {
      return res.status(400).json({ error: "Status must be either 'Solved' or 'Unsolved'." });
    }

    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({ error: 'Property not found.' });
    }

    const targetArray = status === 'Solved' ? property.reports.solved : property.reports.unsolved;
    const reportIndex = targetArray.findIndex(r => r.id === id);

    if (reportIndex === -1) {
      return res.status(404).json({ error: `Report with id ${id} not found in ${status.toLowerCase()} list.` });
    }

    targetArray.splice(reportIndex, 1);
    await property.save();

    res.status(200).json({ message: `Report with id ${id} deleted successfully.` });
  } catch (err) {
    console.error('Error deleting report:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

exports.editPropertyStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required.' });
    }

    const updatedProperty = await Property.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    );

    if (!updatedProperty) {
      return res.status(404).json({ error: 'Property not found.' });
    }

    res.status(200).json({ message: 'Property status updated successfully.', property: updatedProperty });
  } catch (err) {
    console.error('Error updating property status:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

exports.searchPropertyAdmin = async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.trim() === '') {
      return res.status(400).json({ message: 'Search query is required' });
    }

    const searchRegex = new RegExp(query, 'i');
    const numberQuery = Number(query);

    const conditions = [
      { name: searchRegex },
      { status: searchRegex },
      { city: searchRegex },
      { address: searchRegex },
      { category: searchRegex },
      { amenities: searchRegex },
      { otherAmenities: searchRegex }
    ];

    // Only add price search if the query is a valid number
    if (!isNaN(numberQuery)) {
      conditions.push({ packagePrice: numberQuery });
    }

    const results = await Property.find({ $or: conditions });

    if (results.length === 0) {
      return res.status(404).json({ message: 'No matching Property found' });
    }

    res.status(200).json(results);
  } catch (error) {
    console.error('Search Property Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

const Booking = require('../models/bookingModel');

exports.createMaintenanceById = async (req, res) => {
  try {
    const { id } = req.params;
    let { dates, status } = req.body;

    if (!dates) {
      return res.status(400).json({ message: 'Dates are required.' });
    }

    if (!Array.isArray(dates)) {
      dates = [dates];
    }

    const validStatuses = ['Active', 'Deactivated'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status value.' });
    }

    const incomingDates = dates.map(date =>
      new Date(date).toISOString().split('T')[0]
    );

    const property = await Property.findById(id);
    if (!property) {
      return res.status(404).json({ message: 'Property not found.' });
    }

    const existingMaintenanceDates = property.maintenance
      .flatMap(entry => entry.dates.map(d => new Date(d).toISOString().split('T')[0]));

    const duplicateMaintenance = incomingDates.filter(date =>
      existingMaintenanceDates.includes(date)
    );
    if (duplicateMaintenance.length > 0) {
      return res.status(400).json({
        message: 'One or more of the dates already exist in maintenance.',
        duplicateDates: duplicateMaintenance
      });
    }

    const bookings = await Booking.find({ propertyId: id });
    const bookedDates = bookings.flatMap(b =>
      b.datesOfBooking.map(d => new Date(d).toISOString().split('T')[0])
    );

    const conflictWithBookings = incomingDates.filter(date =>
      bookedDates.includes(date)
    );
    if (conflictWithBookings.length > 0) {
      return res.status(400).json({
        message: 'One or more of the dates are already booked. Cannot proceed.',
        bookedDates: conflictWithBookings
      });
    }

    const newMaintenance = {
      dates,
      status: status || 'Active'
    };

    property.maintenance.push(newMaintenance);
    await property.save();

    res.status(200).json({
      message: 'Maintenance dates added successfully.',
      maintenance: property.maintenance
    });

  } catch (err) {
    console.error('Error adding maintenance:', err);
    res.status(500).json({ message: 'Server error while adding maintenance.' });
  }
};

exports.updateMaintenanceByDates = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const { originalDates, newDates, status } = req.body;

    if (!Array.isArray(originalDates) || !Array.isArray(newDates) || newDates.length === 0) {
      return res.status(400).json({ message: 'Both originalDates and newDates are required arrays.' });
    }

    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({ message: 'Property not found.' });
    }

    // Normalize date strings to yyyy-mm-dd
    const normalize = dateArr => dateArr.map(d => new Date(d).toISOString().split('T')[0]);

    const formattedOriginal = normalize(originalDates);
    const formattedNew = normalize(newDates);

    // Find the target maintenance entry
    const targetIndex = property.maintenance.findIndex(entry => {
      const entryDates = normalize(entry.dates);
      return entryDates.length === formattedOriginal.length &&
             entryDates.every(d => formattedOriginal.includes(d));
    });

    if (targetIndex === -1) {
      return res.status(404).json({ message: 'Maintenance entry with the specified dates not found.' });
    }

    // Check for booking conflicts
    const bookings = await Booking.find({ propertyId });
    const bookedDates = bookings.flatMap(b =>
      b.datesOfBooking.map(d => new Date(d).toISOString().split('T')[0])
    );

    const conflictDates = formattedNew.filter(d => bookedDates.includes(d));
    if (conflictDates.length > 0) {
      return res.status(400).json({
        message: 'New dates conflict with existing bookings.',
        conflictDates
      });
    }

    // Update maintenance entry
    property.maintenance[targetIndex].dates = newDates;
    if (status) property.maintenance[targetIndex].status = status;

    await property.save();
    res.status(200).json({
      message: 'Maintenance updated successfully.',
      maintenance: property.maintenance
    });

  } catch (err) {
    console.error('Error updating maintenance:', err);
    res.status(500).json({ message: 'Server error while updating maintenance.' });
  }
};

exports.deleteMaintenanceByDates = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const { dates } = req.body;

    if (!Array.isArray(dates) || dates.length === 0) {
      return res.status(400).json({ message: 'Dates array is required.' });
    }

    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({ message: 'Property not found.' });
    }

    const normalizedToDelete = dates.map(d => new Date(d).toISOString().split('T')[0]);

    const index = property.maintenance.findIndex(entry => {
      const entryDates = entry.dates.map(d => new Date(d).toISOString().split('T')[0]);
      return entryDates.length === normalizedToDelete.length &&
             entryDates.every(d => normalizedToDelete.includes(d));
    });

    if (index === -1) {
      return res.status(404).json({ message: 'Matching maintenance entry not found.' });
    }

    property.maintenance.splice(index, 1);
    await property.save();

    res.status(200).json({
      message: 'Maintenance entry deleted successfully.',
      maintenance: property.maintenance
    });

  } catch (err) {
    console.error('Error deleting maintenance:', err);
    res.status(500).json({ message: 'Server error while deleting maintenance.' });
  }
};

exports.searchPropertyGuest = async (req, res) => {
  try {
    const { city, CheckIn, CheckOut, priceStartrange, priceEndrange, people } = req.body;

    if (!city || !CheckIn || !CheckOut || !priceStartrange || !priceEndrange || !people) {
      return res.status(400).json({ message: 'All search fields are required.' });
    }

    const checkInDate = new Date(CheckIn);
    const checkOutDate = new Date(CheckOut);

    const matchedProperties = await Property.find({
      city: { $regex: new RegExp(city, 'i') },
      packagePrice: { $gte: priceStartrange, $lte: priceEndrange },
      maxCapacity: { $gte: people },
      status: 'Active'
    });

    const availableProperties = [];

    for (const property of matchedProperties) {

      const conflictingBookings = await Booking.findOne({
        propertyId: property._id.toString(),
        status: { $ne: 'Cancel' },
        $or: [
          {
            checkIn: { $lte: checkOutDate },
            checkOut: { $gte: checkInDate }
          },
          {
            datesOfBooking: {
              $in: getDateRange(checkInDate, checkOutDate)
            }
          }
        ]
      });

      const maintenanceBlocked = property.maintenance.some(m => {
        return m.dates.some(date =>
          date >= checkInDate && date <= checkOutDate
        );
      });

      if (!conflictingBookings && !maintenanceBlocked) {
        availableProperties.push(property);
      }
    }

    res.status(200).json({
      message: `${availableProperties.length} properties found.`,
      data: availableProperties
    });

  } catch (error) {
    console.error('searchPropertyGuest error:', error);
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

function getDateRange(startDate, endDate) {
  const dates = [];
  let current = new Date(startDate);
  while (current <= endDate) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

exports.getAllCities = async (req, res) => {
  try {
    const cities = await Property.distinct('city', { status: 'Active' });

    if (!cities.length) {
      return res.status(404).json({ message: 'No cities found.' });
    }

    res.status(200).json({
      message: `${cities.length} unique cities found.`,
      cities
    });
  } catch (error) {
    console.error('getAllCities error:', error);
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.getPropertiesByCategory = async (req, res) => {
  try {

    const allProperties = await Property.find({ status: 'Active' });
    const result = {
      allProperties: allProperties,
      barkada: [],
      couple: [],
      family: [],
      other: []
    };

    allProperties.forEach(prop => {
      const categoryKey = prop.category.toLowerCase();
      if (result[categoryKey]) {
        result[categoryKey].push(prop);
      }
    });

    res.status(200).json(result);
  } catch (error) {
    console.error('getPropertiesByCategoryWithAll error:', error);
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};