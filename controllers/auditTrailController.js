const AuditTrail = require('../models/auditTrailModel');
const Guest = require('../models/guestModel');
const Admin = require('../models/adminModel');
const Employee = require('../models/employeeModel');

const moment = require('moment-timezone');

exports.createAudit = async (req, res) => {
  try {
    const { userId, userType, activity } = req.body;

    // Detailed validation
    if (!userId) {
      return res.status(400).json({ message: 'userId is required.' });
    }
    if (!userType) {
      return res.status(400).json({ message: 'userType is required.' });
    }
    if (!activity) {
      return res.status(400).json({ message: 'activity is required.' });
    }

    // Validate userType format
    if (!['Guest', 'Admin', 'Employee'].includes(userType)) {
      return res.status(400).json({ 
        message: 'Invalid userType. Must be one of: Guest, Admin, Employee' 
      });
    }

    // Validate userId format
    if (!/^[0-9a-fA-F]{24}$/.test(userId)) {
      return res.status(400).json({ 
        message: 'Invalid userId format. Must be a valid MongoDB ObjectId.' 
      });
    }

    let userModel;
    if (userType === 'Guest') userModel = Guest;
    else if (userType === 'Admin') userModel = Admin;
    else if (userType === 'Employee') userModel = Employee;

    try {
      const user = await userModel.findById(userId);
      if (!user) {
        return res.status(404).json({ 
          message: `${userType} with id ${userId} not found.` 
        });
      }

      const fullName = `${user.firstname} ${user.lastname}`;
      const count = await AuditTrail.countDocuments();

      const newAudit = new AuditTrail({
        refNo: count + 1,
        userId,
        userType,
        activity,
        name: fullName,
        dateTime: moment().tz('Asia/Manila').toDate() 
      });

      await newAudit.save();

      res.status(201).json({
        message: 'Audit created successfully.',
        audit: {
          ...newAudit.toObject(),
          dateTimePH: moment(newAudit.dateTime).tz('Asia/Manila').format('YYYY-MM-DD HH:mm:ss')
        }
      });
    } catch (dbError) {
      console.error('Database operation error:', dbError);
      return res.status(500).json({ 
        message: 'Database operation failed.',
        error: dbError.message 
      });
    }
  } catch (error) {
    console.error('Create Audit Error:', error);
    res.status(500).json({ 
      message: 'Internal Server Error.',
      error: error.message
    });
  }
};

exports.getAllAudit = async (req, res) => {
  try {
    const audits = await AuditTrail.find().sort({ createdAt: -1 });

    const formatted = audits.map(audit => ({
      ...audit.toObject(),
      dateTimePH: moment(audit.dateTime).tz('Asia/Manila').format('YYYY-MM-DD HH:mm:ss')
    }));

    res.status(200).json(formatted);
  } catch (error) {
    console.error('Get All Audit Error:', error);
    res.status(500).json({ message: 'Internal Server Error.' });
  }
};

exports.getAllAuditByUserType = async (req, res) => {
  try {
    const { userType } = req.params;
    const audits = await AuditTrail.find({ userType }).sort({ createdAt: -1 });

    const formatted = audits.map(audit => ({
      ...audit.toObject(),
      dateTimePH: moment(audit.dateTime).tz('Asia/Manila').format('YYYY-MM-DD HH:mm:ss')
    }));

    res.status(200).json(formatted);
  } catch (error) {
    console.error('Get Audit By UserType Error:', error);
    res.status(500).json({ message: 'Internal Server Error.' });
  }
};

exports.getAuditByDate = async (req, res) => {
  try {
    const { date } = req.params;
    const start = new Date(date);
    const end = new Date(date);
    end.setDate(end.getDate() + 1);

    const audits = await AuditTrail.find({
      dateTime: {
        $gte: start,
        $lt: end
      }
    }).sort({ dateTime: -1 });

    const formatted = audits.map(audit => ({
      ...audit.toObject(),
      dateTimePH: moment(audit.dateTime).tz('Asia/Manila').format('YYYY-MM-DD HH:mm:ss')
    }));

    res.status(200).json(formatted);
  } catch (error) {
    console.error('Get Audit By Date Error:', error);
    res.status(500).json({ message: 'Internal Server Error.' });
  }
};

exports.getAuditBySearchQuery = async (req, res) => {
  try {
    const { query } = req.query;

    const searchConditions = [
      { activity: { $regex: query, $options: 'i' } },
      { name: { $regex: query, $options: 'i' } },
      { userType: { $regex: query, $options: 'i' } }
    ];

    const queryAsNumber = Number(query);
    if (!isNaN(queryAsNumber)) {
      searchConditions.push({ refNo: queryAsNumber });
    }

    const audits = await AuditTrail.find({
      $or: searchConditions
    }).sort({ dateTime: -1 });

    const formatted = audits.map(audit => ({
      ...audit.toObject(),
      dateTimePH: moment(audit.dateTime).tz('Asia/Manila').format('YYYY-MM-DD HH:mm:ss')
    }));

    res.status(200).json(formatted);
  } catch (error) {
    console.error('Search Audit Error:', error);
    res.status(500).json({ message: 'Internal Server Error.' });
  }
};