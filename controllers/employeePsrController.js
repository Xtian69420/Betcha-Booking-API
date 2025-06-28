const mongoose = require('mongoose');
const Booking = require('../models/bookingModel');
const Property = require('../models/propertyModel');

const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment-timezone');

exports.mostPeakBookingProperty = async (req, res) => {
  try {
    const now = new Date();

    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const matchCondition = { status: { $ne: "Cancel" } };

    const findPeak = async (startDate) => {
      const result = await Booking.aggregate([
        { $match: { ...matchCondition, createdAt: { $gte: startDate } } },
        {
          $project: {
            propertyId: 1,
            datesCount: { $size: "$datesOfBooking" }
          }
        },
        {
          $group: {
            _id: "$propertyId",
            totalBookedDates: { $sum: "$datesCount" }
          }
        },
        { $sort: { totalBookedDates: -1 } },
        { $limit: 1 }
      ]);

      if (result.length === 0) return null;

      let propertyInfo = null;
      try {

        propertyInfo = await Property.findById(new mongoose.Types.ObjectId(result[0]._id)).lean();
      } catch (err) {

        propertyInfo = await Property.findById(result[0]._id).lean();
      }

      if (!propertyInfo) {
        return {
          propertyId: result[0]._id,
          bookedDates: result[0].totalBookedDates
        };
      }

      return {
        propertyId: propertyInfo._id,
        propertyName: propertyInfo.name,
        bookedDates: result[0].totalBookedDates
      };
    };

    const [yearPeak, monthPeak, weekPeak] = await Promise.all([
      findPeak(startOfYear),
      findPeak(startOfMonth),
      findPeak(startOfWeek)
    ]);

    res.status(200).json({
      peak: {
        year: yearPeak || {},
        month: monthPeak || {},
        week: weekPeak || {}
      }
    });

  } catch (error) {
    console.error("Error fetching peak booking data:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.peakBookingDay = async (req, res) => {
  try {
    const now = moment.tz('Asia/Manila');
    const year = now.year();

    const startOfYear = now.clone().startOf('year').toDate();
    const endOfYear = now.clone().endOf('year').toDate();

    const startOfMonth = now.clone().startOf('month').toDate();
    const endOfMonth = now.clone().endOf('month').toDate();

    const startOfWeek = now.clone().startOf('week').toDate(); 
    const endOfWeek = now.clone().endOf('week').toDate();

    const matchCondition = { status: { $ne: "Cancel" } };

    const findPeakDate = async (startDate, endDate) => {
      const result = await Booking.aggregate([
        {
          $match: {
            ...matchCondition,
            datesOfBooking: {
              $elemMatch: {
                $gte: startDate,
                $lte: endDate
              }
            }
          }
        },
        { $unwind: "$datesOfBooking" },
        {
          $match: {
            datesOfBooking: {
              $gte: startDate,
              $lte: endDate
            }
          }
        },
        {
          $group: {
            _id: "$datesOfBooking",
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 1 }
      ]);

      if (result.length === 0) return null;
      return moment(result[0]._id).tz('Asia/Manila').format('YYYY-MM-DD');
    };

    const [yearPeak, monthPeak, weekPeak] = await Promise.all([
      findPeakDate(startOfYear, endOfYear),
      findPeakDate(startOfMonth, endOfMonth),
      findPeakDate(startOfWeek, endOfWeek)
    ]);

    res.status(200).json({
      year: {
        peakDay: yearPeak || "No bookings this year"
      },
      month: {
        peakDay: monthPeak || "No bookings this month"
      },
      week: {
        peakDay: weekPeak || "No bookings this week"
      }
    });

  } catch (error) {
    console.error("Error determining peak booking day:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

exports.transactions = async (req, res) => {
  try {
    const bookings = await Booking.find({ status: { $ne: "Cancel" } })
      .sort({ createdAt: -1 })
      .select("transNo propertyName totalFee createdAt")
      .lean(); 

    const transactions = bookings.map(booking => ({
      bookingId: booking._id,
      transactionNo: booking.transNo,
      propertyName: booking.propertyName,
      dateOfBooking: booking.createdAt,
      amount: booking.totalFee
    }));

    res.status(200).json(transactions);

  } catch (error) {
    console.error("Error fetching transactions:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.generateWeekSummary = async (req, res) => {
  try {
    const { week, month, year } = req.body;
    if (!week || !month || !year) {
      return res.status(400).json({ message: "Please provide week, month, and year." });
    }

    const momentDate = moment.tz({ year, month: month - 1, day: 1 }, 'Asia/Manila');
    const startOfWeek = momentDate.clone().add((week - 1) * 7, 'days').startOf('day');
    const endOfWeek = startOfWeek.clone().add(6, 'days').endOf('day');

    const [allProperties, bookings] = await Promise.all([
      Property.find({}, 'name'), // Get all property names
      Booking.find({
        datesOfBooking: { $elemMatch: { $gte: startOfWeek.toDate(), $lte: endOfWeek.toDate() } },
        status: { $in: ['Checked-Out', 'Completed', 'Fully-Paid', 'Reserved'] }
      })
    ]);

    const earningsMap = {};
    bookings.forEach(booking => {
      const name = booking.propertyName;
      if (!earningsMap[name]) earningsMap[name] = 0;
      earningsMap[name] += booking.totalFee;
    });

    const earningsList = allProperties.map(prop => ({
      propertyName: prop.name,
      earned: earningsMap[prop.name] || 0
    }));

    const totalEarned = earningsList.reduce((sum, entry) => sum + entry.earned, 0);
    earningsList.push({ propertyName: 'TOTAL', earned: totalEarned });

    const fileId = uuidv4();
    const pdfPath = path.join(__dirname, `../exports/week-summary-${fileId}.pdf`);
    const excelPath = path.join(__dirname, `../exports/week-summary-${fileId}.xlsx`);

    // ====== PDF GENERATION ======
    const doc = new PDFDocument({ margin: 40, size: [500, 1000], layout: 'landscape' });
    doc.pipe(fs.createWriteStream(pdfPath));

    doc.fontSize(22).text("Betcha Booking", { align: 'center' });
    doc.fontSize(18).text(`Week ${week} of ${moment().month(month - 1).format('MMMM')}, ${year}`, { align: 'center' });
    doc.moveDown(2);

    const columnWidths = [500, 200]; // wider
    const totalTableWidth = columnWidths.reduce((a, b) => a + b, 0);
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const tableX = doc.page.margins.left + (pageWidth - totalTableWidth) / 2;
    const cellHeight = 25;
    const cellPadding = 5;

    let y = doc.y;
    doc.fontSize(12);

    // Header function
    const drawTableHeader = () => {
    let x = tableX;
    doc.rect(x, y, columnWidths[0], cellHeight).stroke();
    doc.text("Property Name", x + cellPadding, y + cellPadding, {
        width: columnWidths[0] - 2 * cellPadding
    });
    x += columnWidths[0];

    doc.rect(x, y, columnWidths[1], cellHeight).stroke();
    doc.text("Earned", x + cellPadding, y + cellPadding, {
        width: columnWidths[1] - 2 * cellPadding
    });

    y += cellHeight;
    };

    drawTableHeader();

    let rowCount = 0;
    earningsList.forEach((row, index) => {
    if (rowCount === 10) {
        doc.addPage({ margin: 40, size: [500, 1000], layout: 'landscape' });
        doc.fontSize(22).text("Betcha Booking", { align: 'center' });
        doc.fontSize(18).text(`Week ${week} of ${moment().month(month - 1).format('MMMM')}, ${year}`, { align: 'center' });
        doc.moveDown(2);
        y = doc.y;
        doc.fontSize(12);
        drawTableHeader();
        rowCount = 0;
    }

    let x = tableX;
    doc.rect(x, y, columnWidths[0], cellHeight).stroke();
    doc.text(row.propertyName, x + cellPadding, y + cellPadding, {
        width: columnWidths[0] - 2 * cellPadding
    });
    x += columnWidths[0];

    doc.rect(x, y, columnWidths[1], cellHeight).stroke();
    doc.text(`PHP ${row.earned.toLocaleString()}`, x + cellPadding, y + cellPadding, {
        width: columnWidths[1] - 2 * cellPadding
    });

    y += cellHeight;
    rowCount++;
    });

    doc.end();


    // ====== EXCEL GENERATION ======
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Week Summary');

    sheet.mergeCells('A1:B1');
    sheet.getCell('A1').value = 'Betcha Booking';
    sheet.getCell('A1').alignment = { horizontal: 'center' };
    sheet.getCell('A1').font = { bold: true, size: 16 };

    sheet.mergeCells('A2:B2');
    sheet.getCell('A2').value = `Week ${week} of ${moment().month(month - 1).format('MMMM')}, ${year}`;
    sheet.getCell('A2').alignment = { horizontal: 'center' };
    sheet.getCell('A2').font = { bold: true, size: 14 };

    sheet.addRow([]);
    sheet.addRow(['Property Name', 'Earned']);

    earningsList.forEach(row => {
      const newRow = sheet.addRow([row.propertyName, row.earned]);
      newRow.getCell(2).numFmt = '"₱"#,##0.00';
    });

    const totalRows = sheet.rowCount;
    for (let i = 4; i <= totalRows; i++) {
      ['A', 'B'].forEach(col => {
        const cell = sheet.getCell(`${col}${i}`);
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    }

    sheet.columns = [
      { key: 'propertyName', width: 30 },
      { key: 'earned', width: 20 }
    ];

    await workbook.xlsx.writeFile(excelPath);

    setTimeout(() => {
      fs.unlink(pdfPath, err => err && console.error(`PDF delete error: ${err}`));
      fs.unlink(excelPath, err => err && console.error(`Excel delete error: ${err}`));
    }, 60000);

    return res.json({
      message: `Week ${week} of ${moment().month(month - 1).format('MMMM')}, ${year}`,
      pdfLink: `/exports/week-summary-${fileId}.pdf`,
      excelLink: `/exports/week-summary-${fileId}.xlsx`
    });

  } catch (error) {
    console.error("Week summary generation failed:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

exports.generateMonthSummary = async (req, res) => {
  try {
    const { month, year } = req.body;
    if (!month || !year) {
      return res.status(400).json({ message: "Please provide month and year." });
    }

    const firstDay = moment.tz({ year, month: month - 1, day: 1 }, 'Asia/Manila').startOf('day');
    const lastDay = firstDay.clone().endOf('month');

    const weeks = [];
    let start = firstDay.clone();
    while (start.isBefore(lastDay)) {
      const end = start.clone().add(6, 'days').endOf('day');
      weeks.push({ start: start.clone(), end: end.isAfter(lastDay) ? lastDay.clone() : end.clone() });
      start = end.clone().add(1, 'day').startOf('day');
    }

    const bookings = await Booking.find({
      datesOfBooking: { $elemMatch: { $gte: firstDay.toDate(), $lte: lastDay.toDate() } },
      status: { $in: ['Checked-Out', 'Completed', 'Fully-Paid', 'Reserved'] }
    });

    const properties = await Property.find({}, 'name').lean();


    const summary = {};
    for (const property of properties) {
    summary[property.name] = {
        weekly: Array(weeks.length).fill(0),
        total: 0
    };
    }

    for (const booking of bookings) {
        const name = booking.propertyName;
        if (!summary[name]) continue; 

        for (let i = 0; i < weeks.length; i++) {
            const { start, end } = weeks[i];
            const hasOverlap = booking.datesOfBooking.some(dateStr => {
            const date = new Date(dateStr);
            return date >= start.toDate() && date <= end.toDate();
            });

            if (hasOverlap) {
            summary[name].weekly[i] += booking.totalFee;
            summary[name].total += booking.totalFee;
            }
        }
    }

    const resultList = Object.entries(summary).map(([propertyName, { weekly, total }]) => ({
      propertyName,
      weekly,
      earned: total
    }));

    const totalWeekly = Array(weeks.length).fill(0);
    let grandTotal = 0;
    for (const entry of resultList) {
      for (let i = 0; i < entry.weekly.length; i++) {
        totalWeekly[i] += entry.weekly[i];
      }
      grandTotal += entry.earned;
    }

    resultList.push({
      propertyName: 'TOTAL',
      weekly: totalWeekly,
      earned: grandTotal
    });

    const fileId = uuidv4();
    const pdfPath = path.join(__dirname, `../exports/month-summary-${fileId}.pdf`);
    const excelPath = path.join(__dirname, `../exports/month-summary-${fileId}.xlsx`);

    // ====== Generate PDF ======
    const doc = new PDFDocument({
    margin: 40,
    size: [500, 1000],
    layout: 'landscape'
    });

    doc.pipe(fs.createWriteStream(pdfPath));

    doc.fontSize(22).text("Betcha Booking", { align: 'center' });
    doc.fontSize(18).text(`Monthly Summary: ${moment().month(month - 1).format('MMMM')} ${year}`, { align: 'center' });
    doc.moveDown(2);

    const columnWidths = [250, ...Array(weeks.length).fill(100), 120];
    const totalTableWidth = columnWidths.reduce((sum, width) => sum + width, 0);
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const tableX = doc.page.margins.left + (pageWidth - totalTableWidth) / 2;
    const cellHeight = 25;
    const cellPadding = 5;

    // Table Header Drawer
    let y = doc.y;
    doc.fontSize(14);
    const drawTableHeader = () => {
    let x = tableX;
    doc.rect(x, y, columnWidths[0], cellHeight).stroke();
    doc.text("Property Name", x + cellPadding, y + cellPadding, {
        width: columnWidths[0] - 2 * cellPadding
    });
    x += columnWidths[0];

    for (let i = 0; i < weeks.length; i++) {
        doc.rect(x, y, columnWidths[i + 1], cellHeight).stroke();
        doc.text(`Week ${i + 1}`, x + cellPadding, y + cellPadding, {
        width: columnWidths[i + 1] - 2 * cellPadding
        });
        x += columnWidths[i + 1];
    }

    doc.rect(x, y, columnWidths[columnWidths.length - 1], cellHeight).stroke();
    doc.text("Earned", x + cellPadding, y + cellPadding, {
        width: columnWidths[columnWidths.length - 1] - 2 * cellPadding
    });

    y += cellHeight;
    };

    drawTableHeader();

    let rowCount = 0;
    resultList.forEach((row, i) => {
    if (rowCount === 10) {
        doc.addPage({ margin: 40, size: [500, 1000], layout: 'landscape' });
        doc.fontSize(22).text("Betcha Booking", { align: 'center' });
        doc.fontSize(18).text(`Monthly Summary: ${moment().month(month - 1).format('MMMM')} ${year}`, { align: 'center' });
        doc.moveDown(2);
        y = doc.y;
        doc.fontSize(14);
        drawTableHeader();
        rowCount = 0;
    }

    let x = tableX;
    doc.rect(x, y, columnWidths[0], cellHeight).stroke();
    doc.text(row.propertyName, x + cellPadding, y + cellPadding, {
        width: columnWidths[0] - 2 * cellPadding
    });
    x += columnWidths[0];

    row.weekly.forEach((w, i) => {
        doc.rect(x, y, columnWidths[i + 1], cellHeight).stroke();
        doc.text(`PHP ${w.toLocaleString()}`, x + cellPadding, y + cellPadding, {
        width: columnWidths[i + 1] - 2 * cellPadding
        });
        x += columnWidths[i + 1];
    });

    doc.rect(x, y, columnWidths[columnWidths.length - 1], cellHeight).stroke();
    doc.text(`PHP ${row.earned.toLocaleString()}`, x + cellPadding, y + cellPadding, {
        width: columnWidths[columnWidths.length - 1] - 2 * cellPadding
    });

    y += cellHeight;
    rowCount++;
    });

    doc.end();

    // ====== Generate Excel ======
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Month Summary');


    const totalCols = weeks.length + 2; 
    const lastColLetter = sheet.getColumn(totalCols).letter;

    const titleRange = `A1:${lastColLetter}1`;
    sheet.mergeCells(titleRange);
    sheet.getCell('A1').value = 'Betcha Booking';
    sheet.getCell('A1').alignment = { horizontal: 'center' };
    sheet.getCell('A1').font = { bold: true, size: 16 };

    const subtitleRange = `A2:${lastColLetter}2`;
    sheet.mergeCells(subtitleRange);
    sheet.getCell('A2').value = `Monthly Summary: ${moment().month(month - 1).format('MMMM')} ${year}`;
    sheet.getCell('A2').alignment = { horizontal: 'center' };
    sheet.getCell('A2').font = { bold: true, size: 14 };

    sheet.addRow([]);

    const headerRow = ['Property Name'];
    for (let i = 0; i < weeks.length; i++) {
    headerRow.push(`Week ${i + 1}`);
    }
    headerRow.push('Earned');
    const headers = sheet.addRow(headerRow);
    headers.font = { bold: true };

    resultList.forEach(row => {
    const dataRow = [row.propertyName, ...row.weekly, row.earned];
    const newRow = sheet.addRow(dataRow);

    for (let i = 1; i < dataRow.length; i++) {
        newRow.getCell(i + 1).numFmt = '"PHP"#,##0.00';
    }
    });

    const startRow = 5; 
    const endRow = sheet.rowCount;
    for (let row = startRow; row <= endRow; row++) {
    for (let col = 1; col <= totalCols; col++) {
        const cell = sheet.getCell(row, col);
        cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
        };
    }
    }

    sheet.columns = [
    { width: 30 }, 
    ...Array(weeks.length).fill({ width: 15 }),
    { width: 20 } 
    ];

    await workbook.xlsx.writeFile(excelPath);


    setTimeout(() => {
      fs.unlink(pdfPath, err => err && console.error('PDF delete error', err));
      fs.unlink(excelPath, err => err && console.error('Excel delete error', err));
    }, 60000);

    return res.json({
      message: `Month Summary for ${moment().month(month - 1).format('MMMM')} ${year}`,
      pdfLink: `/exports/month-summary-${fileId}.pdf`,
      excelLink: `/exports/month-summary-${fileId}.xlsx`
    });

  } catch (error) {
    console.error("Month summary generation failed:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

exports.generateQuarterSummary = async (req, res) => {
  try {
    const { quarter, year } = req.body;
    if (!quarter || !year || quarter < 1 || quarter > 4) {
      return res.status(400).json({ message: "Please provide a valid quarter (1–4) and year." });
    }

    const startMonth = (quarter - 1) * 3; 
    const monthsInQuarter = [startMonth, startMonth + 1, startMonth + 2];

    const startDate = moment.tz({ year, month: startMonth, day: 1 }, 'Asia/Manila').startOf('month');
    const endDate = moment(startDate).add(2, 'months').endOf('month');

    const properties = await Property.find();
    const propertyNames = properties.map(p => p.name);

    const bookings = await Booking.find({
      datesOfBooking: { $elemMatch: { $gte: startDate.toDate(), $lte: endDate.toDate() } },
      status: { $in: ['Checked-Out', 'Completed', 'Fully-Paid', 'Reserved'] }
    });

    const summaryMap = {};
    for (const name of propertyNames) {
      summaryMap[name] = {
        monthly: [0, 0, 0],
        total: 0
      };
    }

    for (const booking of bookings) {
      const name = booking.propertyName;
      if (!summaryMap[name]) continue;

      booking.datesOfBooking.forEach(dateStr => {
        const date = moment(dateStr);
        const mIndex = monthsInQuarter.indexOf(date.month());
        if (mIndex !== -1) {
          summaryMap[name].monthly[mIndex] += booking.totalFee;
          summaryMap[name].total += booking.totalFee;
        }
      });
    }

    const resultList = Object.entries(summaryMap).map(([propertyName, { monthly, total }]) => ({
      propertyName,
      monthly,
      earned: total
    }));

    const totalMonthly = [0, 0, 0];
    let grandTotal = 0;
    for (const entry of resultList) {
      entry.monthly.forEach((val, idx) => totalMonthly[idx] += val);
      grandTotal += entry.earned;
    }
    resultList.push({ propertyName: 'TOTAL', monthly: totalMonthly, earned: grandTotal });

    const fileId = uuidv4();
    const pdfPath = path.join(__dirname, `../exports/quarter-summary-${fileId}.pdf`);
    const excelPath = path.join(__dirname, `../exports/quarter-summary-${fileId}.xlsx`);

    const doc = new PDFDocument({ margin: 30, size: [500, 1000], layout: 'landscape' });
    doc.pipe(fs.createWriteStream(pdfPath));

    doc.fontSize(22).text("Betcha Booking", { align: 'center' });
    doc.fontSize(18).text(`Quarter ${quarter} Summary - ${year}`, { align: 'center' });
    doc.moveDown(2);

    const columnWidths = [180, ...Array(3).fill(100), 100];
    const totalTableWidth = columnWidths.reduce((a, b) => a + b, 0);
    const tableX = doc.page.margins.left + ((doc.page.width - doc.page.margins.left - doc.page.margins.right - totalTableWidth) / 2);
    const cellPadding = 5;
    let y = doc.y;
    const headerMonths = monthsInQuarter.map(m => moment().month(m).format('MMM'));

    const dataRows = resultList.slice(0, -1);
    const totalRow = resultList[resultList.length - 1];

    doc.fontSize(12); 

    // === Draw table header function ===
    const drawTableHeader = () => {
    let x = tableX;
    doc.rect(x, y, columnWidths[0], 20).stroke();
    doc.text('Property Name', x + cellPadding, y + cellPadding, {
        width: columnWidths[0] - 2 * cellPadding
    });
    x += columnWidths[0];

    headerMonths.forEach((m, i) => {
        doc.rect(x, y, columnWidths[i + 1], 20).stroke();
        doc.text(m, x + cellPadding, y + cellPadding, {
        width: columnWidths[i + 1] - 2 * cellPadding
        });
        x += columnWidths[i + 1];
    });

    doc.rect(x, y, columnWidths[4], 20).stroke();
    doc.text("Earned", x + cellPadding, y + cellPadding, {
        width: columnWidths[4] - 2 * cellPadding
    });

    y += 20;
    };

    drawTableHeader();

    let rowCount = 0;
    dataRows.forEach((row, index) => {
    if (rowCount === 10) {
        doc.addPage({ margin: 30, size: [500, 1000], layout: 'landscape' });
        doc.fontSize(22).text("Betcha Booking", { align: 'center' });
        doc.fontSize(18).text(`Quarter ${quarter} Summary - ${year}`, { align: 'center' });
        doc.moveDown(2);
        doc.fontSize(12);
        y = doc.y;
        drawTableHeader();
        rowCount = 0;
    }

    let x = tableX;
    doc.rect(x, y, columnWidths[0], 20).stroke();
    doc.text(row.propertyName, x + cellPadding, y + cellPadding, {
        width: columnWidths[0] - 2 * cellPadding
    });
    x += columnWidths[0];

    row.monthly.forEach((amount, i) => {
        doc.rect(x, y, columnWidths[i + 1], 20).stroke();
        doc.text(`PHP ${amount.toLocaleString()}`, x + cellPadding, y + cellPadding, {
        width: columnWidths[i + 1] - 2 * cellPadding
        });
        x += columnWidths[i + 1];
    });

    doc.rect(x, y, columnWidths[4], 20).stroke();
    doc.text(`PHP ${row.earned.toLocaleString()}`, x + cellPadding, y + cellPadding, {
        width: columnWidths[4] - 2 * cellPadding
    });

    y += 20;
    rowCount++;
    });

    if (rowCount === 10) {
    doc.addPage({ margin: 30, size: [500, 1000], layout: 'landscape' });
    doc.fontSize(22).text("Betcha Booking", { align: 'center' });
    doc.fontSize(18).text(`Quarter ${quarter} Summary - ${year}`, { align: 'center' });
    doc.moveDown(2);
    doc.fontSize(12);
    y = doc.y;
    drawTableHeader();
    }

    let x = tableX;
    doc.rect(x, y, columnWidths[0], 20).stroke();
    doc.text(totalRow.propertyName, x + cellPadding, y + cellPadding, {
    width: columnWidths[0] - 2 * cellPadding
    });
    x += columnWidths[0];

    totalRow.monthly.forEach((amount, i) => {
    doc.rect(x, y, columnWidths[i + 1], 20).stroke();
    doc.text(`PHP ${amount.toLocaleString()}`, x + cellPadding, y + cellPadding, {
        width: columnWidths[i + 1] - 2 * cellPadding
    });
    x += columnWidths[i + 1];
    });

    doc.rect(x, y, columnWidths[4], 20).stroke();
    doc.text(`PHP ${totalRow.earned.toLocaleString()}`, x + cellPadding, y + cellPadding, {
    width: columnWidths[4] - 2 * cellPadding
    });

    doc.end();


    // Excel
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Quarter Summary');

    sheet.mergeCells('A1:E1');
    sheet.getCell('A1').value = 'Betcha Booking';
    sheet.getCell('A1').alignment = { horizontal: 'center' };
    sheet.getCell('A1').font = { bold: true, size: 16 };

    sheet.mergeCells('A2:E2');
    sheet.getCell('A2').value = `Quarter ${quarter} Summary - ${year}`;
    sheet.getCell('A2').alignment = { horizontal: 'center' };
    sheet.getCell('A2').font = { bold: true, size: 14 };

    sheet.addRow([]);

    const excelHeader = ['Property Name', ...headerMonths, 'Earned'];
    sheet.addRow(excelHeader);

    resultList.forEach(row => {
      const excelRow = [row.propertyName, ...row.monthly, row.earned];
      sheet.addRow(excelRow);
    });

    sheet.columns = [
      { key: 'propertyName', width: 30 },
      { key: 'm1', width: 15, style: { numFmt: '"₱"#,##0.00' } },
      { key: 'm2', width: 15, style: { numFmt: '"₱"#,##0.00' } },
      { key: 'm3', width: 15, style: { numFmt: '"₱"#,##0.00' } },
      { key: 'earned', width: 20, style: { numFmt: '"₱"#,##0.00' } },
    ];

    const totalRows = sheet.rowCount;
    for (let i = 5; i <= totalRows; i++) {
      ['A', 'B', 'C', 'D', 'E'].forEach(col => {
        sheet.getCell(`${col}${i}`).border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    }

    await workbook.xlsx.writeFile(excelPath);

    setTimeout(() => {
      fs.unlink(pdfPath, err => err && console.error('PDF delete error', err));
      fs.unlink(excelPath, err => err && console.error('Excel delete error', err));
    }, 60000);

    return res.json({
      message: `Quarter ${quarter} Summary - ${year}`,
      pdfLink: `/exports/quarter-summary-${fileId}.pdf`,
      excelLink: `/exports/quarter-summary-${fileId}.xlsx`
    });

  } catch (error) {
    console.error("Quarter summary generation failed:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

exports.generateSemiAnnualSummary = async (req, res) => {
  try {
    const { annual, year } = req.body;
    if (!annual || !year || ![1, 2].includes(annual)) {
      return res.status(400).json({ message: 'Please provide valid annual (1-2) and year.' });
    }

    const startMonth = (annual - 1) * 6; // 0 or 6
    const months = Array.from({ length: 6 }, (_, i) => startMonth + i);

    const start = moment.tz({ year, month: startMonth, day: 1 }, 'Asia/Manila').startOf('month');
    const end = start.clone().add(5, 'months').endOf('month');

    // Get bookings
    const bookings = await Booking.find({
      datesOfBooking: { $elemMatch: { $gte: start.toDate(), $lte: end.toDate() } },
      status: { $in: ['Checked-Out', 'Completed', 'Fully-Paid', 'Reserved'] }
    });

    const allProperties = await Property.find({}, 'name');
    const summary = {};

    allProperties.forEach(p => {
      summary[p.name] = { monthly: Array(6).fill(0), total: 0 };
    });

    for (const booking of bookings) {
      const name = booking.propertyName;
      if (!summary[name]) {
        summary[name] = { monthly: Array(6).fill(0), total: 0 };
      }

      for (let i = 0; i < 6; i++) {
        const m = start.clone().add(i, 'months');
        const monthStart = m.clone().startOf('month').toDate();
        const monthEnd = m.clone().endOf('month').toDate();

        const overlaps = booking.datesOfBooking.some(d => {
          const date = new Date(d);
          return date >= monthStart && date <= monthEnd;
        });

        if (overlaps) {
          summary[name].monthly[i] += booking.totalFee;
          summary[name].total += booking.totalFee;
        }
      }
    }

    const resultList = Object.entries(summary).map(([propertyName, { monthly, total }]) => ({
      propertyName,
      monthly,
      earned: total
    }));

    const totalMonthly = Array(6).fill(0);
    let grandTotal = 0;
    resultList.forEach(entry => {
      entry.monthly.forEach((amt, i) => (totalMonthly[i] += amt));
      grandTotal += entry.earned;
    });

    resultList.push({
      propertyName: 'TOTAL',
      monthly: totalMonthly,
      earned: grandTotal
    });

    const fileId = uuidv4();
    const pdfPath = path.join(__dirname, `../exports/semi-annual-summary-${fileId}.pdf`);
    const excelPath = path.join(__dirname, `../exports/semi-annual-summary-${fileId}.xlsx`);

    // ===== PDF =====
    const doc = new PDFDocument({ margin: 40, size: [1000, 500] });
    doc.pipe(fs.createWriteStream(pdfPath));

    doc.fontSize(16).text('Betcha Booking', { align: 'center' });
    doc.fontSize(12).text(`Semi-Annual Summary: ${year} - H${annual}`, { align: 'center' });
    doc.moveDown(2);

    const monthsLabels = months.map(m => moment().month(m).format('MMM'));

    const columnWidths = [180, ...Array(6).fill(110), 120];
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const totalTableWidth = columnWidths.reduce((a, b) => a + b, 0);
    const tableX = doc.page.margins.left + (pageWidth - totalTableWidth) / 2;
    const tableTop = doc.y;
    const cellPadding = 5;

    doc.fontSize(9); 

    let y = tableTop + 20;
    let rowCount = 0;

    const dataRows = resultList.slice(0, -1);
    const totalRow = resultList[resultList.length - 1];

    const drawTableHeader = () => {
    let x = tableX;
    doc.rect(x, y, columnWidths[0], 20).stroke();
    doc.text('Property Name', x + cellPadding, y + cellPadding, {
        width: columnWidths[0] - 2 * cellPadding
    });
    x += columnWidths[0];

    monthsLabels.forEach((label, i) => {
        doc.rect(x, y, columnWidths[i + 1], 20).stroke();
        doc.text(label, x + cellPadding, y + cellPadding, {
        width: columnWidths[i + 1] - 2 * cellPadding
        });
        x += columnWidths[i + 1];
    });

    doc.rect(x, y, columnWidths[columnWidths.length - 1], 20).stroke();
    doc.text('Earned', x + cellPadding, y + cellPadding, {
        width: columnWidths[columnWidths.length - 1] - 2 * cellPadding
    });

    y += 20;
    };

    drawTableHeader();

    dataRows.forEach((row, idx) => {
    if (rowCount === 10) {
        doc.addPage({ margin: 40, size: [1000, 500] });
        doc.fontSize(16).text('Betcha Booking', { align: 'center' });
        doc.fontSize(12).text(`Semi-Annual Summary: ${year} - H${annual}`, { align: 'center' });
        doc.moveDown(2);

        y = doc.y;
        doc.fontSize(9);
        drawTableHeader();
        rowCount = 0;
    }

    let x = tableX;
    doc.rect(x, y, columnWidths[0], 20).stroke();
    doc.text(row.propertyName, x + cellPadding, y + cellPadding, {
        width: columnWidths[0] - 2 * cellPadding
    });
    x += columnWidths[0];

    row.monthly.forEach((amt, i) => {
        doc.rect(x, y, columnWidths[i + 1], 20).stroke();
        doc.text(`PHP ${amt.toLocaleString()}`, x + cellPadding, y + cellPadding, {
        width: columnWidths[i + 1] - 2 * cellPadding
        });
        x += columnWidths[i + 1];
    });

    doc.rect(x, y, columnWidths[columnWidths.length - 1], 20).stroke();
    doc.text(`PHP ${row.earned.toLocaleString()}`, x + cellPadding, y + cellPadding, {
        width: columnWidths[columnWidths.length - 1] - 2 * cellPadding
    });

    y += 20;
    rowCount++;
    });

    if (rowCount === 10) {
        doc.addPage({ margin: 40, size: [1000, 500] });
        doc.fontSize(16).text('Betcha Booking', { align: 'center' });
        doc.fontSize(12).text(`Semi-Annual Summary: ${year} - H${annual}`, { align: 'center' });
        doc.moveDown(2);
        y = doc.y;
        doc.fontSize(9);
        drawTableHeader();
    }

    let x = tableX;
        doc.rect(x, y, columnWidths[0], 20).stroke();
        doc.text(totalRow.propertyName, x + cellPadding, y + cellPadding, {
        width: columnWidths[0] - 2 * cellPadding
    });
    x += columnWidths[0];

    totalRow.monthly.forEach((amt, i) => {
        doc.rect(x, y, columnWidths[i + 1], 20).stroke();
        doc.text(`PHP ${amt.toLocaleString()}`, x + cellPadding, y + cellPadding, {
        width: columnWidths[i + 1] - 2 * cellPadding
    });
    x += columnWidths[i + 1];
    });

    doc.rect(x, y, columnWidths[columnWidths.length - 1], 20).stroke();
    doc.text(`PHP ${totalRow.earned.toLocaleString()}`, x + cellPadding, y + cellPadding, {
    width: columnWidths[columnWidths.length - 1] - 2 * cellPadding
    });

    doc.end();


    // ===== Excel =====
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Semi-Annual Summary');

    const headerLabel = `Semi-Annual Summary: ${year} - H${annual}`;
    const mergeCols = 6 + 2; // 6 months + name + earned

    sheet.mergeCells(`A1:${String.fromCharCode(64 + mergeCols)}1`);
    sheet.getCell('A1').value = 'Betcha Booking';
    sheet.getCell('A1').alignment = { horizontal: 'center' };
    sheet.getCell('A1').font = { bold: true, size: 16 };

    sheet.mergeCells(`A2:${String.fromCharCode(64 + mergeCols)}2`);
    sheet.getCell('A2').value = headerLabel;
    sheet.getCell('A2').alignment = { horizontal: 'center' };
    sheet.getCell('A2').font = { bold: true, size: 14 };

    sheet.addRow([]);
    sheet.addRow(['Property Name', ...monthsLabels, 'Earned']);

    resultList.forEach(row => {
      const r = [row.propertyName, ...row.monthly, row.earned];
      const added = sheet.addRow(r);
      for (let i = 2; i < r.length + 1; i++) {
        added.getCell(i).numFmt = '"₱"#,##0.00';
      }
    });

    const totalRows = sheet.rowCount;
    for (let i = 4; i <= totalRows; i++) {
      for (let j = 1; j <= mergeCols; j++) {
        const cell = sheet.getCell(i, j);
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      }
    }

    sheet.columns = [
      { key: 'propertyName', width: 25 },
      ...Array(6).fill({ width: 15 }),
      { key: 'earned', width: 18 }
    ];

    await workbook.xlsx.writeFile(excelPath);

    // Cleanup
    setTimeout(() => {
      fs.unlink(pdfPath, err => err && console.error('PDF delete error', err));
      fs.unlink(excelPath, err => err && console.error('Excel delete error', err));
    }, 60000);

    return res.json({
      message: `Semi-Annual Summary for H${annual} ${year}`,
      pdfLink: `/exports/semi-annual-summary-${fileId}.pdf`,
      excelLink: `/exports/semi-annual-summary-${fileId}.xlsx`
    });
  } catch (error) {
    console.error('Semi-annual summary generation failed:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.generateAnnualSummary = async (req, res) => {
  try {
    const { year } = req.body;
    if (!year) {
      return res.status(400).json({ message: "Please provide a year." });
    }

    const start = moment.tz({ year, month: 0, day: 1 }, 'Asia/Manila').startOf('day');
    const end = moment.tz({ year, month: 11, day: 31 }, 'Asia/Manila').endOf('day');

    const allProperties = await Property.find();
    const bookings = await Booking.find({
      datesOfBooking: { $elemMatch: { $gte: start.toDate(), $lte: end.toDate() } },
      status: { $in: ['Checked-Out', 'Completed', 'Fully-Paid', 'Reserved'] }
    });

    const summary = {};
    allProperties.forEach(p => {
      summary[p.name] = { monthly: Array(12).fill(0), earned: 0 };
    });

    bookings.forEach(booking => {
      const propName = booking.propertyName;
      booking.datesOfBooking.forEach(dateStr => {
        const date = new Date(dateStr);
        const m = date.getMonth();
        if (summary[propName]) {
          summary[propName].monthly[m] += booking.totalFee;
          summary[propName].earned += booking.totalFee;
        }
      });
    });

    const resultList = Object.entries(summary).map(([propertyName, { monthly, earned }]) => ({
      propertyName,
      monthly,
      earned
    }));

    const totalMonthly = Array(12).fill(0);
    let grandTotal = 0;
    resultList.forEach(row => {
      row.monthly.forEach((amt, i) => totalMonthly[i] += amt);
      grandTotal += row.earned;
    });
    resultList.push({ propertyName: 'TOTAL', monthly: totalMonthly, earned: grandTotal });

    const fileId = uuidv4();
    const pdfPath = path.join(__dirname, `../exports/annual-summary-${fileId}.pdf`);
    const excelPath = path.join(__dirname, `../exports/annual-summary-${fileId}.xlsx`);

    const doc = new PDFDocument({ margin: 40, size: [1200, 500] });
    doc.pipe(fs.createWriteStream(pdfPath));

    doc.fontSize(16).text('Betcha Booking', { align: 'center' });
    doc.fontSize(12).text(`Annual Summary: ${year}`, { align: 'center' });
    doc.moveDown(2);

    const monthsLabels = moment.monthsShort(); // Jan–Dec
    const columnWidths = [120, ...Array(12).fill(70), 100];
    const totalTableWidth = columnWidths.reduce((a, b) => a + b, 0);
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const tableX = doc.page.margins.left + (pageWidth - totalTableWidth) / 2;
    const tableTop = doc.y;
    const cellPadding = 3;

    let x = tableX;
    doc.fontSize(8);
    doc.rect(x, tableTop, columnWidths[0], 20).stroke();
    doc.text('Property Name', x + cellPadding, tableTop + cellPadding, { width: columnWidths[0] - 2 * cellPadding });
    x += columnWidths[0];

    for (let i = 0; i < monthsLabels.length; i++) {
      doc.rect(x, tableTop, columnWidths[i + 1], 20).stroke();
      doc.text(monthsLabels[i], x + cellPadding, tableTop + cellPadding, { width: columnWidths[i + 1] - 2 * cellPadding });
      x += columnWidths[i + 1];
    }

    doc.rect(x, tableTop, columnWidths[columnWidths.length - 1], 20).stroke();
    doc.text('Earned', x + cellPadding, tableTop + cellPadding, { width: columnWidths[columnWidths.length - 1] - 2 * cellPadding });

    let y = tableTop + 20;
    let rowCount = 0;

    resultList.forEach((row, index) => {
    if (rowCount === 10) {
        doc.addPage({ size: [1200, 500], margin: 40 });
        doc.fontSize(16).text('Betcha Booking', { align: 'center' });
        doc.fontSize(12).text(`Annual Summary: ${year}`, { align: 'center' });
        doc.moveDown(2);

        // Reset table header on new page
        y = doc.y;
        let x = tableX;
        doc.fontSize(8);
        doc.rect(x, y, columnWidths[0], 20).stroke();
        doc.text('Property Name', x + cellPadding, y + cellPadding, { width: columnWidths[0] - 2 * cellPadding });
        x += columnWidths[0];

        for (let i = 0; i < monthsLabels.length; i++) {
        doc.rect(x, y, columnWidths[i + 1], 20).stroke();
        doc.text(monthsLabels[i], x + cellPadding, y + cellPadding, { width: columnWidths[i + 1] - 2 * cellPadding });
        x += columnWidths[i + 1];
        }

        doc.rect(x, y, columnWidths[columnWidths.length - 1], 20).stroke();
        doc.text('Earned', x + cellPadding, y + cellPadding, { width: columnWidths[columnWidths.length - 1] - 2 * cellPadding });

        y += 20;
        rowCount = 0;
    }

    let x = tableX;
    doc.rect(x, y, columnWidths[0], 20).stroke();
    doc.text(row.propertyName, x + cellPadding, y + cellPadding, { width: columnWidths[0] - 2 * cellPadding });
    x += columnWidths[0];

    row.monthly.forEach((amt, i) => {
        doc.rect(x, y, columnWidths[i + 1], 20).stroke();
        doc.text(`PHP ${amt.toLocaleString()}`, x + cellPadding, y + cellPadding, { width: columnWidths[i + 1] - 2 * cellPadding });
        x += columnWidths[i + 1];
    });

    doc.rect(x, y, columnWidths[columnWidths.length - 1], 20).stroke();
    doc.text(`PHP ${row.earned.toLocaleString()}`, x + cellPadding, y + cellPadding, { width: columnWidths[columnWidths.length - 1] - 2 * cellPadding });

    y += 20;
    rowCount++;
    });


    doc.end();

    // ===== EXCEL =====
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Annual Summary');

    sheet.mergeCells(1, 1, 1, 14);
    sheet.getCell('A1').value = 'Betcha Booking';
    sheet.getCell('A1').alignment = { horizontal: 'center' };
    sheet.getCell('A1').font = { bold: true, size: 16 };

    sheet.mergeCells(2, 1, 2, 14);
    sheet.getCell('A2').value = `Annual Summary: ${year}`;
    sheet.getCell('A2').alignment = { horizontal: 'center' };
    sheet.getCell('A2').font = { bold: true, size: 14 };

    sheet.addRow([]);
    const headerRow = ['Property Name', ...monthsLabels, 'Earned'];
    sheet.addRow(headerRow);

    resultList.forEach(row => {
      const r = [row.propertyName, ...row.monthly, row.earned];
      sheet.addRow(r);
    });

    sheet.columns = [
      { width: 25 }, ...Array(12).fill({ width: 15 }), { width: 18 }
    ];
    const totalRows = sheet.rowCount;
    for (let i = 4; i <= totalRows; i++) {
      for (let j = 1; j <= 14; j++) {
        const cell = sheet.getCell(i, j);
        if (j > 1) cell.numFmt = '"₱"#,##0.00';
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      }
    }

    await workbook.xlsx.writeFile(excelPath);

    setTimeout(() => {
      fs.unlink(pdfPath, err => err && console.error('PDF delete error', err));
      fs.unlink(excelPath, err => err && console.error('Excel delete error', err));
    }, 60000);

    return res.json({
      message: `Annual Summary for ${year}`,
      pdfLink: `/exports/annual-summary-${fileId}.pdf`,
      excelLink: `/exports/annual-summary-${fileId}.xlsx`
    });

  } catch (error) {
    console.error("Annual summary generation failed:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
