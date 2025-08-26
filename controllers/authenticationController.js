const bcrypt = require('bcrypt');
const employee = require('../models/employeeModel');
const guest = require('../models/guestModel');
const admin = require('../models/adminModel');

exports.Login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: 'Email and password are required.' });

    let user = await admin.findOne({ email });
    let userType = 'admin';

    if (!user) {
      user = await employee.findOne({ email });
      userType = 'employee';
    }

    if (!user) {
      user = await guest.findOne({ email });
      userType = 'guest';
    }

    if (!user) return res.status(404).json({ message: 'User not found.' });

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch)
      return res.status(401).json({ message: 'Invalid credentials.' });

    const { password: _, ...userWithoutPassword } = user.toObject();

    res.status(200).json({
      message: 'Login successful.',
      userType,
      user: userWithoutPassword,
    });
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.updatePassword = async (req, res) => {
  try {
    const { email, newPassword } = req.body;

    if (!email || !newPassword) {
      return res.status(400).json({ message: 'Email and new password are required.' });
    }

    let user = await admin.findOne({ email });
    let model = admin;

    if (!user) {
      user = await employee.findOne({ email });
      model = employee;
    }

    if (!user) {
      user = await guest.findOne({ email });
      model = guest;
    }

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    res.status(200).json({ message: 'Password updated successfully.' });

  } catch (error) {
    console.error('Update Password Error:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
};
// https://in.sumsub.com/websdk/p/sbx_uni_5lWlhioi8FNABcxg