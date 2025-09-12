exports.getAdminById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ message: 'Admin ID is required' });
    }
    const adminUser = await admin.findById(id);
    if (!adminUser) {
      return res.status(404).json({ message: 'Admin not found' });
    }
    res.status(200).json(adminUser);
  } catch (error) {
    console.error('Get Admin By ID Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
const admin = require('../models/adminModel');
const guest = require('../models/guestModel')
const employee = require ('../models/employeeModel');
const bcrypt = require('bcrypt');
const { google } = require('googleapis');
const fs = require('fs');
require('dotenv').config();

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/drive']
});

const drive = google.drive({ version: 'v3', auth });
const folderId = '1sL-VBECK9rMbBnJqxtL52IObJTrwysno';

exports.createAdmin = async (req, res) => {
  try {
    const { firstname, minitial, lastname, email, password } = req.body;

    const existingAdmin = await admin.findOne({ email });
    const existingGuest = await guest.findOne({ email });
    const existingEmployee = await employee.findOne( { email });
    if (existingAdmin || existingGuest || existingEmployee) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    let pfplink = '';
    if (req.file) {
      try {
        const fileMetadata = {
          name: `${Date.now()}-${req.file.originalname}`,
          parents: [folderId]
        };
        const media = {
          mimeType: req.file.mimetype,
          body: fs.createReadStream(req.file.path)
        };

        const file = await drive.files.create({
          resource: fileMetadata,
          media,
          fields: 'id'
        });

        const fileId = file.data.id;

        await drive.permissions.create({
          fileId,
          requestBody: {
            role: 'reader',
            type: 'anyone'
          }
        });

        pfplink = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1920-h1080`;

        fs.unlinkSync(req.file.path); // delete temp file
      } catch (uploadErr) {
        console.error('Google Drive Upload Error:', uploadErr);
        return res.status(500).json({ message: 'Failed to upload profile picture' });
      }
    }
    const newAdmin = new admin({
      firstname,
      minitial,
      lastname,
      email,
      password: hashedPassword,
      pfplink
    });

    await newAdmin.save();

    const { password: _, ...safeAdmin } = newAdmin.toObject();

    res.status(201).json({
      message: 'Admin account created successfully',
      admin: safeAdmin
    });

  } catch (error) {
    console.error('Create Admin Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.updateAdmin = async (req, res) =>{
    try{
        const { id } = req.params;
        const updateFields = req.body;

        if (!id) {
            return res.status(400).json({ message: 'Admin ID is required in request!' });
        }
        if (!updateFields || Object.keys(updateFields).length === 0) {
            return res.status(400).json({ message: 'No information provided to update' });
        }

        if (updateFields.email) {
          const existingAdmin = await admin.findOne({ email: updateFields.email });
          const existingGuest = await guest.findOne({ email: updateFields.email, _id: { $ne: id } });
          const existingEmployee = await employee.findOne({ email: updateFields.email });
    
          if (existingAdmin || existingGuest || existingEmployee) {
            return res.status(400).json({ message: 'Email already in use' });
          }
        }

        // Hash password if it's being updated
        if (updateFields.password) {
          updateFields.password = await bcrypt.hash(updateFields.password, 10);
        }

        const updatedAdmin = await admin.findByIdAndUpdate(
            id,
            { $set: updateFields },
            { new: true }
        );
        if (!updatedAdmin) {
            return res.status(404).json({ message: 'Admin not found' });
        }

        // Remove password from response for security
        const { password: _, ...safeAdmin } = updatedAdmin.toObject();
    
        res.status(200).json({ message: 'Admin updated successfully', admin: safeAdmin });
    } catch (error) {
    console.error('Update Admin Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

exports.getAllAdmin = async (req, res) => {
  try {
    const admins = await admin.find();

    if (admins.length === 0) {
      return res.status(404).json({ message: 'No admin accounts found' });
    }

    res.status(200).json(admins);
  } catch (error) {
    console.error('Get All Admin Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.updateAdminPfp = async (req, res) =>{
    try {
        const adminId = req.params.id;
        if (!req.file) return res.status(400).json({ message: 'No profile picture uploaded' });

        const adminUser = await admin.findById(adminId);
        if (!adminUser) return res.status(404).json({ message: 'Admin not found' });

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

        adminUser.pfplink = pfplink;
        await adminUser.save();

        fs.unlinkSync(req.file.path);
    
        res.status(200).json({
            message: 'Profile picture updated successfully',
            pfplink,
        });

    } catch (error) {
        console.error('Update Admin PFP Error:', error);
        res.status(500).json({ message: 'Failed to update profile picture' });
    }
}

exports.deleteAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: 'Admin ID is required' });
    }

    const deletedAdmin = await admin.findByIdAndDelete(id);

    if (!deletedAdmin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    res.status(200).json({
      message: 'Admin account deleted successfully',
      admin: deletedAdmin
    });

  } catch (error) {
    console.error('Delete Admin Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};