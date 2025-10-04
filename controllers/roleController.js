const roles = require('../models/rolesModel');
const employee = require('../models/employeeModel');
const mongoose = require('mongoose');

exports.createRoles = async (req, res) => {
  try {
    const { name, privileges } = req.body;

    const existingRole = await roles.findOne({ name });
    if (existingRole) {
      return res.status(400).json({ message: 'Role already exists' });
    }

    const newRole = new roles({
      name,
      privileges: Array.isArray(privileges) ? privileges : [privileges],
      active: true
    });

    await newRole.save();
    res.status(201).json({ message: 'Role created successfully', role: newRole });

  } catch (error) {
    console.error('Create Role Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.updateRoles = async (req, res) => {
  try {
    const { id } = req.params;
    const updateFields = req.body;

    const updatedRole = await roles.findByIdAndUpdate(id, { $set: updateFields }, { new: true });

    if (!updatedRole) {
      return res.status(404).json({ message: 'Role not found' });
    }

    res.status(200).json({ message: 'Role updated successfully', role: updatedRole });

  } catch (error) {
    console.error('Update Role Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.deleteRoles = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await roles.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: 'Role not found' });
    }

    res.status(200).json({ message: 'Role deleted successfully', role: deleted });

  } catch (error) {
    console.error('Delete Role Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.displayEmployeeByRoles = async (req, res) => {
  try {
    const { name } = req.params;

    const role = await roles.findOne({ name });

    if (!role) {
      return res.status(404).json({ message: `Role "${name}" not found` });
    }

    const employees = await employee
      .find({ role: role._id })
      .populate({ path: 'role', strictPopulate: false })
      //.populate({ path: 'properties', strictPopulate: false });

    if (employees.length === 0) {
      return res.status(404).json({ message: `No employees found for the role "${name}"` });
    }

    res.status(200).json(employees);
  } catch (error) {
    console.error('Display Employees By Role Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getAllRoles = async (req, res) => {
  try {
    const allRoles = await roles.find();
    if (allRoles.length === 0) {
      return res.status(404).json({ message: 'No roles found' });
    }

    res.status(200).json(allRoles);
  } catch (error) {
    console.error('Get All Roles Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getRoleById = async (req, res) => {
  try {
    const { id } = req.params;

    const role = await roles.findById(id);

    if (!role) {
      return res.status(404).json({ message: 'Role not found' });
    }

    res.status(200).json(role);
  } catch (error) {
    console.error('Get Role By ID Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.updateActive = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid role ID format' });
    }

    const roleId = new mongoose.Types.ObjectId(id);
    const role = await roles.findById(roleId);
    
    if (!role) {
      return res.status(404).json({ message: 'Role not found' });
    }

    role.active = !role.active;
    await role.save();

    if (!role.active) {

      await employee.updateMany(
        { role: id },
        { $pull: { role: id } }
      );
    }

    res.status(200).json({ 
      message: `Role ${role.active ? 'activated' : 'deactivated'} successfully${!role.active ? ' and removed from all employees' : ''}`,
      active: role.active 
    });
  } catch (error) {
    console.error('Update Role Active Status Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}