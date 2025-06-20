const employee = require('../models/employeeModel');
const admin = require('../models/adminModel');
const guest = require('../models/guestModel');
const bcrypt = require('bcrypt');
const { google } = require('googleapis');
const fs = require('fs');
require('dotenv').config();

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/drive'],
});

const drive = google.drive({ version: 'v3', auth });
const folderId = '1sL-VBECK9rMbBnJqxtL52IObJTrwysno';

// Create Employee
exports.createEmployee = async (req, res) => {
  try {
    const { firstname, minitial, lastname, email, password, role, properties } = req.body;

    const existingAdmin = await admin.findOne({ email });
    const existingGuest = await guest.findOne({ email });
    const existingEmployee = await employee.findOne({ email });
    if (existingAdmin || existingGuest || existingEmployee) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    let pfplink = '';
    if (req.file) {
      const fileMetadata = {
        name: `${Date.now()}-${req.file.originalname}`,
        parents: [folderId],
      };
      const media = {
        mimeType: req.file.mimetype,
        body: fs.createReadStream(req.file.path),
      };

      const file = await drive.files.create({
        resource: fileMetadata,
        media,
        fields: 'id',
      });

      const fileId = file.data.id;

      await drive.permissions.create({
        fileId,
        requestBody: {
          role: 'reader',
          type: 'anyone',
        },
      });

      pfplink = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1920-h1080`;
      fs.unlinkSync(req.file.path);
    }

    const newEmployee = new employee({
      firstname,
      minitial,
      lastname,
      email,
      password: hashedPassword,
      pfplink,
      role: Array.isArray(role) ? role : [role],
      Properties: Array.isArray(Properties) ? Properties : [Properties]
    });

    await newEmployee.save();

    const { password: _, ...safeEmployee } = newEmployee.toObject();

    res.status(201).json({
      message: 'Employee account created successfully',
      employee: safeEmployee,
    });

  } catch (error) {
    console.error('Create Employee Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Update Employee
exports.updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const updateFields = req.body;

    if (!id) return res.status(400).json({ message: 'Employee ID is required' });
    if (!updateFields || Object.keys(updateFields).length === 0)
      return res.status(400).json({ message: 'No information provided to update' });

    if (updateFields.email) {
      const email = updateFields.email;
      const existingAdmin = await admin.findOne({ email });
      const existingGuest = await guest.findOne({ email, _id: { $ne: id } });
      const existingEmployee = await employee.findOne({ email, _id: { $ne: id } });

      if (existingAdmin || existingGuest || existingEmployee) {
        return res.status(400).json({ message: 'Email already in use' });
      }
    }

    const updatedEmployee = await employee.findByIdAndUpdate(
      id,
      { $set: updateFields },
      { new: true }
    );

    if (!updatedEmployee) return res.status(404).json({ message: 'Employee not found' });

    res.status(200).json({ message: 'Employee updated successfully', employee: updatedEmployee });

  } catch (error) {
    console.error('Update Employee Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get All Employees
exports.getAllEmployees = async (req, res) => {
  try {
    const employees = await employee.find();
    if (employees.length === 0) return res.status(404).json({ message: 'No employee accounts found' });

    res.status(200).json(employees);
  } catch (error) {
    console.error('Get All Employees Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Update Employee Profile Picture
exports.updateEmployeePfp = async (req, res) => {
  try {
    const employeeId = req.params.id;
    if (!req.file) return res.status(400).json({ message: 'No profile picture uploaded' });

    const employeeUser = await employee.findById(employeeId);
    if (!employeeUser) return res.status(404).json({ message: 'Employee not found' });

    const fileMetadata = {
      name: `${Date.now()}-${req.file.originalname}`,
      parents: [folderId],
    };

    const media = {
      mimeType: req.file.mimetype,
      body: fs.createReadStream(req.file.path),
    };

    const file = await drive.files.create({
      resource: fileMetadata,
      media,
      fields: 'id',
    });

    const fileId = file.data.id;

    await drive.permissions.create({
      fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });

    const pfplink = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1920-h1080`;

    employeeUser.pfplink = pfplink;
    await employeeUser.save();

    fs.unlinkSync(req.file.path);

    res.status(200).json({
      message: 'Profile picture updated successfully',
      pfplink,
    });

  } catch (error) {
    console.error('Update Employee PFP Error:', error);
    res.status(500).json({ message: 'Failed to update profile picture' });
  }
};

// Delete Employee
exports.deleteEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: 'Employee ID is required' });

    const deletedEmployee = await employee.findByIdAndDelete(id);
    if (!deletedEmployee) return res.status(404).json({ message: 'Employee not found' });

    res.status(200).json({
      message: 'Employee account deleted successfully',
      employee: deletedEmployee,
    });

  } catch (error) {
    console.error('Delete Employee Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getEmployeeById = async (req, res) => {
  try {
    const { id } = req.params;
    const employeeUser = await employee.findById(id);

    if (!employeeUser) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    res.status(200).json(employeeUser);
  } catch (error) {
    console.error('Get Employee By ID Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.archiveEmployee = async (req, res) => {
  try {
    const { id } = req.params;

    const updated = await employee.findByIdAndUpdate(
      id,
      { $set: { status: 'archived' } },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    res.status(200).json({ message: 'Employee archived successfully', employee: updated });
  } catch (error) {
    console.error('Archive Employee Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.unarchiveEmployee = async (req, res) => {
  try {
    const { id } = req.params;

    const updated = await employee.findByIdAndUpdate(
      id,
      { $set: { status: 'active' } },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    res.status(200).json({ message: 'Employee unarchived successfully', employee: updated });
  } catch (error) {
    console.error('Unarchive Employee Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.searchEmployees = async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.trim() === '') {
      return res.status(400).json({ message: 'Search query is required' });
    }

    const searchRegex = new RegExp(query, 'i'); // case-insensitive match

    const results = await employee.find({
      $or: [
        { firstname: searchRegex },
        { lastname: searchRegex },
        { minitial: searchRegex },
        { email: searchRegex },
        { role: searchRegex },
        { userType: searchRegex },
        { properties: searchRegex},
        { status: searchRegex }
      ]
    });

    if (results.length === 0) {
      return res.status(404).json({ message: 'No matching employees found' });
    }

    res.status(200).json(results);
  } catch (error) {
    console.error('Search Employee Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};