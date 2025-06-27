const AuditTrail = require('../models/auditTrailModel');
const Guest = require('../models/guestModel');
const Admin = require('../models/adminModel');
const Employee = require('../models/employeeModel');

exports.createAudit = async (req, res) => {
  try {
    const { userId, userType, activity } = req.body;

    if (!userId || !userType || !activity) {
      return res.status(400).json({ message: 'Missing required fields.' });
    }

    let userModel;
    if (userType === 'Guest') userModel = Guest;
    else if (userType === 'Admin') userModel = Admin;
    else if (userType === 'Employee') userModel = Employee;
    else return res.status(400).json({ message: 'Invalid userType.' });

    const user = await userModel.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const fullName = `${user.firstname} ${user.lastname}`;
    const count = await AuditTrail.countDocuments();

    const newAudit = new AuditTrail({
      refNo: count + 1,
      userId,
      userType,
      activity,
      name: fullName, 
      dateTime: Date.now()
    });

    await newAudit.save();

    res.status(201).json({ message: 'Audit created.', audit: newAudit });
  } catch (error) {
    console.error('Create Audit Error:', error);
    res.status(500).json({ message: 'Internal Server Error.' });
  }
};

exports.getAllAudit = async (req, res) => {
  try {
    const audits = await AuditTrail.find().sort({ createdAt: -1 });
    res.status(200).json(audits);
  } catch (error) {
    console.error('Get All Audit Error:', error);
    res.status(500).json({ message: 'Internal Server Error.' });
  }
};

exports.getAllAuditByUserType = async (req, res) => {
  try {
    const { userType } = req.params;
    const audits = await AuditTrail.find({ userType }).sort({ createdAt: -1 });
    res.status(200).json(audits);
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

    res.status(200).json(audits);
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

    // Add numeric match for refNo if query is a number
    const queryAsNumber = Number(query);
    if (!isNaN(queryAsNumber)) {
      searchConditions.push({ refNo: queryAsNumber });
    }

    const audits = await AuditTrail.find({
      $or: searchConditions
    }).sort({ dateTime: -1 });

    res.status(200).json(audits);
  } catch (error) {
    console.error('Search Audit Error:', error);
    res.status(500).json({ message: 'Internal Server Error.' });
  }
};
