const Booking = require('../models/bookingModel');
const Property = require('../models/propertyModel');

exports.summary = async (req, res) => {
  try {
    const now = new Date();

    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const matchCondition = { status: { $ne: 'Cancel' } };

    const [weekIncome, monthIncome, yearIncome] = await Promise.all([
      Booking.aggregate([
        { $match: { ...matchCondition, createdAt: { $gte: startOfWeek } } },
        { $group: { _id: null, total: { $sum: "$totalFee" } } }
      ]),
      Booking.aggregate([
        { $match: { ...matchCondition, createdAt: { $gte: startOfMonth } } },
        { $group: { _id: null, total: { $sum: "$totalFee" } } }
      ]),
      Booking.aggregate([
        { $match: { ...matchCondition, createdAt: { $gte: startOfYear } } },
        { $group: { _id: null, total: { $sum: "$totalFee" } } }
      ])
    ]);

    res.status(200).json({
      summary: {
        TotalEarningsThisWeek: weekIncome[0]?.total || 0,
        TotalEarningsThisMonth: monthIncome[0]?.total || 0,
        TotalEarningsThisYear: yearIncome[0]?.total || 0
      }
    });
  } catch (error) {
    console.error("Error fetching earnings summary:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};


exports.rankProperty = async (req, res) => {
  try {
    const { month, year } = req.body;

    if (month === undefined || year === undefined) {
      return res.status(400).json({ message: "Month and year are required." });
    }

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999); 

    const earnings = await Booking.aggregate([
      {
        $match: {
          status: { $nin: ['Cancel', 'Pending Payment'] },
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: "$propertyId",
          earned: { $sum: "$totalFee" }
        }
      },
      {
        $sort: { earned: -1 }
      }
    ]);

    const topProperty = {};

    for (let entry of earnings) {
      const propertyInfo = await Property.findById(entry._id).lean(); 
      if (propertyInfo) {
        propertyInfo.earned = entry.earned;
        topProperty[`${propertyInfo.propertyName}`] = propertyInfo;
      }
    }

    res.status(200).json({ topProperty });

  } catch (error) {
    console.error("Error ranking properties:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

const audit = require('../models/auditTrailModel');

exports.new5AuditTrails = async (req, res) => {
  try {
    const recentAudits = await audit.find()
      .sort({ createdAt: -1 }) 
      .limit(5); 

    res.status(200).json(recentAudits);
  } catch (error) {
    console.error('Error fetching recent audit trails:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

const Employee = require('../models/employeeModel');
exports.EmployeeCountActive = async (req, res) => {
  try {
    const count = await Employee.countDocuments({
      status: { $in: ['active', 'Active'] }
    });
    res.status(200).json({ count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const Guest = require('../models/guestModel');
exports.GuestCountActive = async (req, res) => {
  try {
    const count = await Guest.countDocuments({
      archived: false
    });
    res.status(200).json({ count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.PropertyCountActive = async (req, res) => {
  try {
    const count = await Property.countDocuments({
      status: { $in: ['Active', 'active'] }
    });
    res.status(200).json({ count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.BookingCountActive = async (req, res) => {
  try {
    const count = await Booking.countDocuments({
      status: { $nin: ['Cancel', 'cancel', 'Cancelled', 'cancelled'] }
    });
    res.status(200).json({ count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.BookingCountToday = async (req, res) => {
  try {
    const now = new Date();

    const count = await Booking.countDocuments({
      status: { $nin: ['Cancel', 'cancel', 'Cancelled', 'cancelled'] },
      checkIn: { $lte: now },
      checkOut: { $gte: now }
    });

    res.status(200).json({ activeBookingsToday: count });
  } catch (error) {
    console.error("Error counting today's active bookings:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};


exports.AvailableRoomToday = async (req, res) => {
  try {
    const today = new Date();

    const activeProperties = await Property.find({
      status: { $in: ['Active', 'active'] }
    }).lean();

    const activePropertyIds = activeProperties.map(p => p._id.toString());

    const overlappingBookings = await Booking.find({
      propertyId: { $in: activePropertyIds },
      status: { $nin: ['Cancel', 'cancel', 'Cancelled', 'cancelled'] },
      checkIn: { $lte: today },
      checkOut: { $gte: today }
    }).lean();

    const bookedPropertyIds = new Set(overlappingBookings.map(b => b.propertyId));
    const availableRooms = activeProperties.filter(p => !bookedPropertyIds.has(p._id.toString()));

    res.status(200).json({
      availableRoomCount: availableRooms.length,
      availableRooms
    });
  } catch (error) {
    console.error("Error fetching available rooms today:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};
