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

  const matchCondition = { status: { $nin: ['Cancel', 'Pending Payment'] } };

    const [weekIncome, monthIncome, yearIncome] = await Promise.all([
      Booking.aggregate([
        { $match: { ...matchCondition, createdAt: { $gte: startOfWeek } } },
        { 
          $group: { 
            _id: null, 
            totalEarnings: { $sum: "$totalFee" }
          } 
        }
      ]),
      Booking.aggregate([
        { $match: { ...matchCondition, createdAt: { $gte: startOfMonth } } },
        { 
          $group: { 
            _id: null, 
            totalEarnings: { $sum: "$totalFee" }
          } 
        }
      ]),
      Booking.aggregate([
        { $match: { ...matchCondition, createdAt: { $gte: startOfYear } } },
        { 
          $group: { 
            _id: null, 
            totalEarnings: { $sum: "$totalFee" }
          } 
        }
      ])
    ]);

    res.status(200).json({
      summary: {
        TotalEarningsThisWeek: weekIncome[0]?.totalEarnings || 0,
        TotalEarningsThisMonth: monthIncome[0]?.totalEarnings || 0,
        TotalEarningsThisYear: yearIncome[0]?.totalEarnings || 0
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
          status: 'Completed',
          $or: [
            { checkIn: { $gte: startDate, $lte: endDate } },
            { checkOut: { $gte: startDate, $lte: endDate } },
            { 
              checkIn: { $lte: startDate },
              checkOut: { $gte: endDate }
            }
          ]
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

    const topProperty = [];

    for (let entry of earnings) {
      const propertyInfo = await Property.findById(entry._id).lean(); 
      if (propertyInfo) {
        propertyInfo.earned = entry.earned;
        topProperty.push(propertyInfo);
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

const Refund = require('../models/refundModel');

exports.AIAnalyticsData = async (req, res) => {
  try {
    const now = new Date();
    
    // Date ranges
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    // Parallel data fetching for performance
    const [
      guestStats,
      propertyStats,
      bookingStats,
      earningsData,
      refundData,
      topProperties,
      recentBookings,
      upcomingCheckIns,
      activeBookingsNow,
      bookedDatesByProperty,
      allPropertiesEarnings,
      employeeStats
    ] = await Promise.all([
      // Guest Statistics
      Guest.aggregate([
        {
          $facet: {
            total: [{ $count: 'count' }],
            active: [{ $match: { archived: false } }, { $count: 'count' }],
            archived: [{ $match: { archived: true } }, { $count: 'count' }],
            withWarnings: [{ $match: { warning: { $gt: 0 } } }, { $count: 'count' }],
            newThisWeek: [{ $match: { createdAt: { $gte: startOfWeek } } }, { $count: 'count' }],
            newThisMonth: [{ $match: { createdAt: { $gte: startOfMonth } } }, { $count: 'count' }]
          }
        }
      ]),

      // Property Statistics
      Property.aggregate([
        {
          $facet: {
            total: [{ $count: 'count' }],
            active: [{ $match: { status: { $in: ['Active', 'active'] } } }, { $count: 'count' }],
            inactive: [{ $match: { status: { $in: ['Inactive', 'inactive'] } } }, { $count: 'count' }],
            byCategory: [
              { $group: { _id: '$category', count: { $sum: 1 } } }
            ],
            byCity: [
              { $group: { _id: '$city', count: { $sum: 1 } } }
            ],
            averageRating: [
              { $group: { _id: null, avgRating: { $avg: '$rating' } } }
            ]
          }
        }
      ]),

      // Booking Statistics
      Booking.aggregate([
        {
          $facet: {
            total: [{ $count: 'count' }],
            byStatus: [
              { $group: { _id: '$status', count: { $sum: 1 } } }
            ],
            thisWeek: [
              { $match: { createdAt: { $gte: startOfWeek }, status: { $nin: ['Cancel', 'Pending Payment'] } } },
              { 
                $group: { 
                  _id: null, 
                  count: { $sum: 1 },
                  totalFee: { $sum: '$totalFee' },
                  totalRefunds: { $sum: '$refund.refundAmount' }
                } 
              }
            ],
            thisMonth: [
              { $match: { createdAt: { $gte: startOfMonth }, status: { $nin: ['Cancel', 'Pending Payment'] } } },
              { 
                $group: { 
                  _id: null, 
                  count: { $sum: 1 },
                  totalFee: { $sum: '$totalFee' },
                  totalRefunds: { $sum: '$refund.refundAmount' }
                } 
              }
            ],
            thisYear: [
              { $match: { createdAt: { $gte: startOfYear }, status: { $nin: ['Cancel', 'Pending Payment'] } } },
              { 
                $group: { 
                  _id: null, 
                  count: { $sum: 1 },
                  totalFee: { $sum: '$totalFee' },
                  totalRefunds: { $sum: '$refund.refundAmount' }
                } 
              }
            ],
            cancelledThisMonth: [
              { $match: { createdAt: { $gte: startOfMonth }, status: 'Cancel' } },
              { $count: 'count' }
            ]
          }
        }
      ]),

      // Earnings Data
      Booking.aggregate([
        {
          $match: { status: { $nin: ['Cancel', 'Pending Payment'] } }
        },
        {
          $facet: {
            week: [
              { $match: { createdAt: { $gte: startOfWeek } } },
              { $group: { _id: null, gross: { $sum: '$totalFee' }, refunds: { $sum: '$refund.refundAmount' } } }
            ],
            month: [
              { $match: { createdAt: { $gte: startOfMonth } } },
              { $group: { _id: null, gross: { $sum: '$totalFee' }, refunds: { $sum: '$refund.refundAmount' } } }
            ],
            year: [
              { $match: { createdAt: { $gte: startOfYear } } },
              { $group: { _id: null, gross: { $sum: '$totalFee' }, refunds: { $sum: '$refund.refundAmount' } } }
            ],
            allTime: [
              { $group: { _id: null, gross: { $sum: '$totalFee' }, refunds: { $sum: '$refund.refundAmount' } } }
            ]
          }
        }
      ]),

      // Refund Statistics
      Refund.aggregate([
        {
          $facet: {
            total: [{ $count: 'count' }],
            totalAmount: [{ $group: { _id: null, total: { $sum: { $toDouble: '$amount' } } } }],
            thisMonth: [
              { $match: { createdAt: { $gte: startOfMonth } } },
              { $count: 'count' }
            ],
            thisMonthAmount: [
              { $match: { createdAt: { $gte: startOfMonth } } },
              { $group: { _id: null, total: { $sum: { $toDouble: '$amount' } } } }
            ]
          }
        }
      ]),

      // Top 5 Properties by Bookings
      Booking.aggregate([
        {
          $match: { status: { $nin: ['Cancel', 'Pending Payment'] } }
        },
        {
          $group: {
            _id: '$propertyId',
            propertyName: { $first: '$propertyName' },
            totalBookings: { $sum: 1 },
            totalEarnings: { $sum: '$totalFee' }
          }
        },
        { $sort: { totalEarnings: -1 } },
        { $limit: 5 }
      ]),

      // Recent 10 Bookings
      Booking.find({ status: { $nin: ['Cancel'] } })
        .sort({ createdAt: -1 })
        .limit(10)
        .select('transNo propertyName guestName status totalFee checkIn checkOut createdAt')
        .lean(),

      // Upcoming Check-ins (next 7 days)
      Booking.find({
        status: { $in: ['Reserved', 'Fully-Paid'] },
        checkIn: { $gte: now, $lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) }
      })
        .sort({ checkIn: 1 })
        .limit(10)
        .select('transNo propertyName guestName checkIn timeIn')
        .lean(),

      // Active Bookings Right Now
      Booking.countDocuments({
        status: { $nin: ['Cancel', 'Completed', 'Pending Payment'] },
        checkIn: { $lte: now },
        checkOut: { $gte: now }
      }),

      // Booked Dates per Property (excluding Cancel and Completed)
      Booking.aggregate([
        {
          $match: {
            status: { $nin: ['Cancel', 'Completed'] }
          }
        },
        {
          $group: {
            _id: '$propertyId',
            propertyName: { $first: '$propertyName' },
            bookings: {
              $push: {
                transNo: '$transNo',
                guestName: '$guestName',
                status: '$status',
                checkIn: '$checkIn',
                checkOut: '$checkOut',
                datesOfBooking: '$datesOfBooking'
              }
            },
            allBookedDates: { $push: '$datesOfBooking' }
          }
        },
        {
          $project: {
            _id: 1,
            propertyName: 1,
            bookings: 1,
            bookedDates: {
              $reduce: {
                input: '$allBookedDates',
                initialValue: [],
                in: { $concatArrays: ['$$value', '$$this'] }
              }
            }
          }
        },
        { $sort: { propertyName: 1 } }
      ]),

      // All Properties with Earnings and Refunds
      Booking.aggregate([
        {
          $match: {
            status: { $nin: ['Cancel', 'Pending Payment'] }
          }
        },
        {
          $group: {
            _id: '$propertyId',
            propertyName: { $first: '$propertyName' },
            totalBookings: { $sum: 1 },
            totalEarnings: { $sum: '$totalFee' },
            totalRefunds: { $sum: '$refund.refundAmount' },
            completedBookings: {
              $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] }
            },
            activeBookings: {
              $sum: { $cond: [{ $in: ['$status', ['Reserved', 'Fully-Paid', 'Checked-In', 'Checked-Out']] }, 1, 0] }
            }
          }
        },
        {
          $project: {
            _id: 1,
            propertyName: 1,
            totalBookings: 1,
            completedBookings: 1,
            activeBookings: 1,
            totalEarnings: 1,
            totalRefunds: 1,
            netEarnings: { $subtract: ['$totalEarnings', '$totalRefunds'] }
          }
        },
        { $sort: { netEarnings: -1 } }
      ]),

      // Employee Statistics and Productivity
      Employee.aggregate([
        {
          $facet: {
            total: [{ $count: 'count' }],
            active: [
              { $match: { status: { $in: ['active', 'Active'] } } },
              { $count: 'count' }
            ],
            inactive: [
              { $match: { status: { $nin: ['active', 'Active'] } } },
              { $count: 'count' }
            ],
            newThisWeek: [
              { $match: { createdAt: { $gte: startOfWeek } } },
              { $count: 'count' }
            ],
            newThisMonth: [
              { $match: { createdAt: { $gte: startOfMonth } } },
              { $count: 'count' }
            ],
            byPropertyCount: [
              {
                $project: {
                  firstname: 1,
                  lastname: 1,
                  email: 1,
                  status: 1,
                  propertyCount: { $size: { $ifNull: ['$properties', []] } }
                }
              },
              {
                $group: {
                  _id: null,
                  avgPropertiesPerEmployee: { $avg: '$propertyCount' },
                  maxProperties: { $max: '$propertyCount' },
                  minProperties: { $min: '$propertyCount' }
                }
              }
            ],
            topEmployees: [
              { $match: { status: { $in: ['active', 'Active'] } } },
              {
                $lookup: {
                  from: 'roles_tb',
                  localField: 'role',
                  foreignField: '_id',
                  as: 'roleDetails'
                }
              },
              {
                $project: {
                  _id: 1,
                  firstname: 1,
                  lastname: 1,
                  email: 1,
                  propertyCount: { $size: { $ifNull: ['$properties', []] } },
                  roles: '$roleDetails.name'
                }
              },
              { $sort: { propertyCount: -1 } },
              { $limit: 5 }
            ]
          }
        }
      ])
    ]);

    // Format earnings
    const weekEarnings = earningsData[0].week[0] || { gross: 0, refunds: 0 };
    const monthEarnings = earningsData[0].month[0] || { gross: 0, refunds: 0 };
    const yearEarnings = earningsData[0].year[0] || { gross: 0, refunds: 0 };
    const allTimeEarnings = earningsData[0].allTime[0] || { gross: 0, refunds: 0 };

    // Build comprehensive response
    const analyticsData = {
      data: {
        generatedAt: now,
        summary: {
          guests: {
            total: guestStats[0].total[0]?.count || 0,
            active: guestStats[0].active[0]?.count || 0,
            archived: guestStats[0].archived[0]?.count || 0,
            withWarnings: guestStats[0].withWarnings[0]?.count || 0,
            newThisWeek: guestStats[0].newThisWeek[0]?.count || 0,
            newThisMonth: guestStats[0].newThisMonth[0]?.count || 0
          },
          properties: {
            total: propertyStats[0].total[0]?.count || 0,
            active: propertyStats[0].active[0]?.count || 0,
            inactive: propertyStats[0].inactive[0]?.count || 0,
            averageRating: propertyStats[0].averageRating[0]?.avgRating || 0,
            byCategory: propertyStats[0].byCategory,
            byCity: propertyStats[0].byCity
          },
          bookings: {
            total: bookingStats[0].total[0]?.count || 0,
            byStatus: bookingStats[0].byStatus,
            thisWeek: {
              count: bookingStats[0].thisWeek[0]?.count || 0,
              totalFee: bookingStats[0].thisWeek[0]?.totalFee || 0,
              refunds: bookingStats[0].thisWeek[0]?.totalRefunds || 0,
              netRevenue: (bookingStats[0].thisWeek[0]?.totalFee || 0) - (bookingStats[0].thisWeek[0]?.totalRefunds || 0)
            },
            thisMonth: {
              count: bookingStats[0].thisMonth[0]?.count || 0,
              totalFee: bookingStats[0].thisMonth[0]?.totalFee || 0,
              refunds: bookingStats[0].thisMonth[0]?.totalRefunds || 0,
              netRevenue: (bookingStats[0].thisMonth[0]?.totalFee || 0) - (bookingStats[0].thisMonth[0]?.totalRefunds || 0)
            },
            thisYear: {
              count: bookingStats[0].thisYear[0]?.count || 0,
              totalFee: bookingStats[0].thisYear[0]?.totalFee || 0,
              refunds: bookingStats[0].thisYear[0]?.totalRefunds || 0,
              netRevenue: (bookingStats[0].thisYear[0]?.totalFee || 0) - (bookingStats[0].thisYear[0]?.totalRefunds || 0)
            },
            cancelledThisMonth: bookingStats[0].cancelledThisMonth[0]?.count || 0,
            activeNow: activeBookingsNow
          },
          earnings: {
            week: {
              gross: weekEarnings.gross,
              refunds: weekEarnings.refunds,
              net: weekEarnings.gross - weekEarnings.refunds
            },
            month: {
              gross: monthEarnings.gross,
              refunds: monthEarnings.refunds,
              net: monthEarnings.gross - monthEarnings.refunds
            },
            year: {
              gross: yearEarnings.gross,
              refunds: yearEarnings.refunds,
              net: yearEarnings.gross - yearEarnings.refunds
            },
            allTime: {
              gross: allTimeEarnings.gross,
              refunds: allTimeEarnings.refunds,
              net: allTimeEarnings.gross - allTimeEarnings.refunds
            }
          },
          refunds: {
            totalRequests: refundData[0].total[0]?.count || 0,
            totalAmount: refundData[0].totalAmount[0]?.total || 0,
            thisMonth: refundData[0].thisMonth[0]?.count || 0,
            thisMonthAmount: refundData[0].thisMonthAmount[0]?.total || 0
          },
          employees: {
            total: employeeStats[0].total[0]?.count || 0,
            active: employeeStats[0].active[0]?.count || 0,
            inactive: employeeStats[0].inactive[0]?.count || 0,
            newThisWeek: employeeStats[0].newThisWeek[0]?.count || 0,
            newThisMonth: employeeStats[0].newThisMonth[0]?.count || 0,
            productivity: {
              avgPropertiesPerEmployee: employeeStats[0].byPropertyCount[0]?.avgPropertiesPerEmployee || 0,
              maxPropertiesAssigned: employeeStats[0].byPropertyCount[0]?.maxProperties || 0,
              minPropertiesAssigned: employeeStats[0].byPropertyCount[0]?.minProperties || 0
            },
            topPerformers: employeeStats[0].topEmployees || []
          }
        },
        insights: {
          topProperties: topProperties,
          recentBookings: recentBookings,
          upcomingCheckIns: upcomingCheckIns
        },
        propertyAvailability: bookedDatesByProperty.map(property => ({
          propertyId: property._id,
          propertyName: property.propertyName,
          totalActiveBookings: property.bookings.length,
          bookedDates: property.bookedDates,
          bookingDetails: property.bookings
        })),
        propertiesFinancials: allPropertiesEarnings.map(property => ({
          propertyId: property._id,
          propertyName: property.propertyName,
          bookingStats: {
            total: property.totalBookings,
            completed: property.completedBookings,
            active: property.activeBookings
          },
          financials: {
            totalEarnings: property.totalEarnings,
            totalRefunds: property.totalRefunds,
            netEarnings: property.netEarnings
          }
        })),
        metadata: {
          dateRanges: {
            week: { start: startOfWeek, end: now },
            month: { start: startOfMonth, end: now },
            year: { start: startOfYear, end: now }
          }
        }
      }
    };

    res.status(200).json(analyticsData);
  } catch (error) {
    console.error('Error fetching AI analytics data:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

