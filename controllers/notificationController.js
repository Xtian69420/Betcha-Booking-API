const Notification = require('../models/notificationModel'); 
const moment = require('moment-timezone');

// Message Notification
exports.messageNotification = async (req, res) => {
  try {
    const {
      fromId, fromName, fromRole,
      toId, toName, toRole,
      message
    } = req.body;

    if (!fromId || !fromName || !fromRole || !toId || !toName || !toRole || !message) {
      return res.status(400).json({ message: 'Missing required fields.' });
    }

    const dateTimePH = moment().tz('Asia/Manila').toDate();

    const newNotification = new Notification({
      from: { fromId, name: fromName, role: fromRole },
      to: { toId, name: toName, role: toRole },
      seen: false,
      dateTime: dateTimePH,
      category: 'Message',
      message
    });

    await newNotification.save();

    res.status(201).json({
      message: 'Message notification created.',
      data: {
        ...newNotification.toObject(),
        dateTimePH: moment(newNotification.dateTime).tz('Asia/Manila').format('YYYY-MM-DD HH:mm:ss')
      }
    });
  } catch (error) {
    console.error('Error creating message notification:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

exports.cancellationNotification = async (req, res) => {
  try {
    const {
      fromId, fromName, fromRole,
      toId, toName, toRole,
      message, transNo, bookingId, amountRefund, reasonToGuest, numberEwalletBank, modeOfRefund
    } = req.body;

    if (!fromId || !fromName || !fromRole || !toId || !toName || !toRole || !message || !transNo) {
      return res.status(400).json({ message: 'Missing required fields for cancellation notification.' });
    }

    const dateTimePH = moment().tz('Asia/Manila').toDate();

    const newNotification = new Notification({
      from: { fromId, name: fromName, role: fromRole },
      to: { toId, name: toName, role: toRole },
      seen: false,
      dateTime: dateTimePH,
      category: 'Cancellation Request',
      message,
      statusRejection: 'Pending',
      transNo,
      bookingId,
      amountRefund,
      modeOfRefund,
      reasonToGuest,
      numberEwalletBank
    });

    await newNotification.save();

    res.status(201).json({
      message: 'Cancellation notification created.',
      data: {
        ...newNotification.toObject(),
        dateTimePH: moment(newNotification.dateTime).tz('Asia/Manila').format('YYYY-MM-DD HH:mm:ss')
      }
    });
  } catch (error) {
    console.error('Error creating cancellation notification:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};


exports.updateSeen = async (req, res) => {
  try {
    const { id } = req.params;

    const updatedNotification = await Notification.findByIdAndUpdate(
      id,
      { seen: true },
      { new: true }
    );

    if (!updatedNotification) {
      return res.status(404).json({ message: 'Notification not found.' });
    }

    res.status(200).json({ message: 'Notification marked as seen.', data: updatedNotification });
  } catch (error) {
    console.error('Error updating seen status:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

exports.getAllNotificationByToId = async (req, res) => {
  try {
    const { toId } = req.params;

    const notifications = await Notification.find({ 'to.toId': toId })
      .populate('bookingId')
      .sort({ createdAt: -1 });

    const formatted = notifications.map(notif => ({
      ...notif.toObject(),
      dateTimePH: moment(notif.dateTime).tz('Asia/Manila').format('YYYY-MM-DD HH:mm:ss')
    }));

    res.status(200).json({ message: 'Notifications fetched successfully.', data: formatted });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

exports.deleteNotificationById = async (req, res) => {
  try {
    const { id } = req.params;

    const deletedNotification = await Notification.findByIdAndDelete(id);

    if (!deletedNotification) {
      return res.status(404).json({ message: 'Notification not found.' });
    }

    res.status(200).json({ message: 'Notification deleted successfully.' });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

exports.updateStatusRejection = async (req, res) => {
  try {
    const { id } = req.params;
    const { statusRejection } = req.body;

    if (!statusRejection) {
      return res.status(400).json({ message: 'Status rejection value is required.' });
    }

    const updatedNotification = await Notification.findByIdAndUpdate(
      id,
      { statusRejection },
      { new: true }
    );

    if (!updatedNotification) {
      return res.status(404).json({ message: 'Notification not found.' });
    }

    const formattedResponse = {
      ...updatedNotification.toObject(),
      dateTimePH: moment(updatedNotification.dateTime).tz('Asia/Manila').format('YYYY-MM-DD HH:mm:ss')
    };

    res.status(200).json({ 
      message: 'Status rejection updated successfully.', 
      data: formattedResponse 
    });
  } catch (error) {
    console.error('Error updating status rejection:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};