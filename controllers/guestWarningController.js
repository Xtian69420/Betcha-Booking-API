const guestWarning = require('../models/guestWarningModel');
const guest = require('../models/guestModel');

exports.createReport = async (req, res) => {
    try {
        const { guestId, reason, transNo, reportedBy } = req.body;

        const foundGuest = await guest.findById(guestId);
        if (!foundGuest) {
            return res.status(404).json({ message: "Guest not found" });
        }

        const newReport = new guestWarning({
            guestId,
            reason,
            transNo,
            reportedBy
        });

        await newReport.save();

        foundGuest.warning = (foundGuest.warning || 0) + 1;
        await foundGuest.save();

        res.status(201).json({
            message: "Report created successfully",
            report: newReport,
            guest: {
                id: foundGuest._id,
                name: `${foundGuest.firstname} ${foundGuest.minitial ? foundGuest.minitial + ". " : ""}${foundGuest.lastname}`,
                totalWarnings: foundGuest.warning
            }
        });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

exports.displayReportsByGuestId = async (req, res) => {
    try {
        const { guestId } = req.params;

        const foundGuest = await guest.findById(guestId);
        if (!foundGuest) {
            return res.status(404).json({ message: "Guest not found" });
        }

        const reports = await guestWarning.find({ guestId }).sort({ createdAt: -1 });

        const formattedReports = reports.map(r => ({
            name: `${foundGuest.firstname} ${foundGuest.minitial ? foundGuest.minitial + ". " : ""}${foundGuest.lastname}`,
            dateCreated: r.createdAt,
            transNo: r.transNo,
            reportedBy: r.reportedBy,
            reason: r.reason
        }));

        res.status(200).json(formattedReports);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

exports.displayAllReports = async (req, res) => {
    try {

        const reports = await guestWarning.find()
            .populate('guestId', 'firstname minitial lastname')
            .sort({ createdAt: -1 });

        const formattedReports = reports.map(r => ({
            name: `${r.guestId.firstname} ${r.guestId.minitial ? r.guestId.minitial + ". " : ""}${r.guestId.lastname}`,
            dateCreated: r.createdAt,
            transNo: r.transNo,
            reportedBy: r.reportedBy,
            reason: r.reason
        }));

        res.status(200).json(formattedReports);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

exports.resetWarnings = async (req, res) => {
    try {
        const { guestId } = req.params;

        const foundGuest = await guest.findById(guestId);
        if (!foundGuest) {
            return res.status(404).json({ message: "Guest not found" });
        }
        foundGuest.warning = 0;
        foundGuest.archived = false; 
        await foundGuest.save();

        res.status(200).json({
            message: "Guest unarchived and warnings reset",
            guest: {
                id: foundGuest._id,
                name: `${foundGuest.firstname} ${foundGuest.minitial ? foundGuest.minitial + ". " : ""}${foundGuest.lastname}`,
                totalWarnings: foundGuest.warning,
                archived: foundGuest.archived
            }
        });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};
