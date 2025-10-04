const moment = require('moment-timezone');
const Tk = require('../models/TKModel');
const Guest = require('../models/guestModel');
const Admin = require('../models/adminModel');
const Employee = require('../models/employeeModel');

exports.createTicket = async (req, res) => {
  try {
    const {
      category,
      customerServiceAgentId,
      senderId,
      messages
    } = req.body;

    if (!category || !customerServiceAgentId || !senderId || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ message: 'Missing required fields.' });
    }

    const firstMessage = messages[0];

    const { userId, userLevel, message } = firstMessage;
    if (!userId || !userLevel || !message) {
      return res.status(400).json({ message: 'Missing required message fields.' });
    }

    const normalizedLevel = userLevel.toLowerCase();
    let userModel;

    if (normalizedLevel === 'guest') userModel = Guest;
    else if (normalizedLevel === 'admin') userModel = Admin;
    else if (normalizedLevel === 'employee') userModel = Employee;
    else return res.status(400).json({ message: 'Invalid user level.' });

    const user = await userModel.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const userName = `${user.firstname} ${user.lastname}`;

    const lastTicket = await Tk.findOne().sort({ ticketNumber: -1 });
    const ticketNumber = lastTicket ? lastTicket.ticketNumber + 1 : 1;

    const populatedMessage = {
      userId,
      userName,
      userLevel: normalizedLevel.charAt(0).toUpperCase() + normalizedLevel.slice(1),
      message,
      dateTime: moment().tz('Asia/Manila').toDate()
    };

    const newTicket = new Tk({
      ticketNumber,
      category,
      customerServiceAgentId,
      senderId,
      messages: [populatedMessage]
    });

    await newTicket.save();

    res.status(201).json({ message: 'Ticket created successfully.', ticket: newTicket });

  } catch (error) {
    console.error('Create Ticket Error:', error);
    res.status(500).json({ message: 'Internal Server Error.' });
  }
};


exports.getAllTicketsByCustomerServiceId = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: 'Customer service agent ID is required.' });
    }

    const tickets = await Tk.find({ customerServiceAgentId: id }).sort({ createdAt: -1 }).lean();

    const formatted = tickets.map(ticket => ({
      ...ticket,
      ticketNumber: String(ticket.ticketNumber).padStart(8, '0'),
      messages: ticket.messages.map(msg => ({
        ...msg,
        phDateTime: moment(msg.dateTime).tz('Asia/Manila').format('YYYY-MM-DD HH:mm:ss')
      }))
    }));

    res.status(200).json({ message: 'Tickets fetched successfully.', tickets: formatted });
  } catch (error) {
    console.error('Error fetching tickets by customer service ID:', error);
    res.status(500).json({ message: 'Internal Server Error.' });
  }
};

exports.getAllTicketsBySenderId = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: 'Sender ID is required.' });
    }

    const tickets = await Tk.find({ senderId: id }).sort({ createdAt: -1 }).lean();

    const formatted = tickets.map(ticket => ({
      ...ticket,
      ticketNumber: String(ticket.ticketNumber).padStart(8, '0'),
      messages: ticket.messages.map(msg => ({
        ...msg,
        phDateTime: moment(msg.dateTime).tz('Asia/Manila').format('YYYY-MM-DD HH:mm:ss')
      }))
    }));

    res.status(200).json({ message: 'Tickets fetched successfully.', tickets: formatted });
  } catch (error) {
    console.error('Error fetching tickets by sender ID:', error);
    res.status(500).json({ message: 'Internal Server Error.' });
  }
};

exports.getAllTickets = async (req, res) => {
  try {
    const tickets = await Tk.find().sort({ createdAt: -1 }).lean();

    const formatted = tickets.map(ticket => ({
      ...ticket,
      ticketNumber: String(ticket.ticketNumber).padStart(8, '0'),
      messages: ticket.messages.map(msg => ({
        ...msg,
        phDateTime: moment(msg.dateTime).tz('Asia/Manila').format('YYYY-MM-DD HH:mm:ss')
      }))
    }));

    res.status(200).json({ message: 'All tickets fetched successfully.', tickets: formatted });
  } catch (error) {
    console.error('Error fetching all tickets:', error);
    res.status(500).json({ message: 'Internal Server Error.' });
  }
};

exports.createMessageInTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, userLevel, message } = req.body;

    if (!id || !userId || !userLevel || !message) {
      return res.status(400).json({ message: 'Missing required fields.' });
    }

    const normalizedLevel = userLevel.toLowerCase();

    let userModel;
    if (normalizedLevel === 'guest') userModel = Guest;
    else if (normalizedLevel === 'admin') userModel = Admin;
    else if (normalizedLevel === 'employee') userModel = Employee;
    else return res.status(400).json({ message: 'Invalid user level.' });

    const user = await userModel.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const userName = `${user.firstname} ${user.lastname}`;

    const ticket = await Tk.findById(id); 
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found.' });
    }

    const dateTime = moment().tz('Asia/Manila');

    const newMessage = {
      userId,
      userName,
      userLevel: normalizedLevel.charAt(0).toUpperCase() + normalizedLevel.slice(1),
      message,
      dateTime: dateTime.toDate(),
      dateTimePH: dateTime.format('YYYY-MM-DD hh:mm A')
    };

    ticket.messages.push(newMessage);
    await ticket.save();

    res.status(200).json({ message: 'Message added to ticket.', ticket });
  } catch (error) {
    console.error('Error replying to ticket:', error);
    res.status(500).json({ message: 'Internal Server Error.' });
  }
};


exports.updateStatusById = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ message: 'Status is required.' });
    }

    const validStatuses = ['queue', 'ongoing', 'resolved', 'closed'];
    if (!validStatuses.includes(status.toLowerCase())) {
      return res.status(400).json({ message: `Invalid status. Valid statuses: ${validStatuses.join(', ')}` });
    }

    const ticket = await Tk.findByIdAndUpdate(
      id,
      { status: status.toLowerCase() },
      { new: true }
    );

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found.' });
    }

    res.status(200).json({ message: 'Ticket status updated successfully.', ticket });
  } catch (error) {
    console.error('Error updating ticket status:', error);
    res.status(500).json({ message: 'Internal Server Error.' });
  }
};

exports.getTicketById = async (req, res) => {
  try {
    const { id } = req.params;
    const ticket = await Tk.findById(id);
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    const formattedTicket = {
      ...ticket._doc,
      ticketNumber: String(ticket.ticketNumber).padStart(8, '0'),
      messages: ticket.messages.map(msg => ({
        ...msg._doc,
        phTime: new Date(msg.dateTime).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })
      }))
    };

    res.status(200).json({ ticket: formattedTicket });
  } catch (err) {
    console.error('Get ticket by ID error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};
