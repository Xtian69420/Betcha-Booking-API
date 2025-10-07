const mongoose = require('mongoose');
const Booking = require('../models/bookingModel');
const Property = require('../models/propertyModel');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment-timezone');

exports.generateWeekSummary = async (req, res) => {
  try {
    const { week, month, year, processedBy } = req.body;
    if (!week || !month || !year) {
      return res.status(400).json({ message: "Please provide week, month, and year." });
    }

    const momentDate = moment.tz({ year, month: month - 1, day: 1 }, 'Asia/Manila');
    const startOfWeek = momentDate.clone().add((week - 1) * 7, 'days').startOf('day');
    const endOfWeek = startOfWeek.clone().add(6, 'days').endOf('day');

    const [allProperties, bookings] = await Promise.all([
      Property.find({}, 'name'), // Get property names only
      Booking.find({
        datesOfBooking: { $elemMatch: { $gte: startOfWeek.toDate(), $lte: endOfWeek.toDate() } },
        status: { $in: ['Completed', 'Cancel'] }
      })
    ]);

    const summaryMap = {};
    allProperties.forEach(prop => {
      summaryMap[prop.name] = {
        bookings: 0,
        cancelled: 0,
        refund: 0,
        total: 0,
        earned: 0
      };
    });

    bookings.forEach(booking => {
      const name = booking.propertyName;
      if (!summaryMap[name]) return;

      const bookingDatesInWeek = booking.datesOfBooking.filter(date => {
        const bookingDate = new Date(date);
        return bookingDate >= startOfWeek.toDate() && bookingDate <= endOfWeek.toDate();
      }).length;

      if (booking.status === 'Cancel') {
        summaryMap[name].cancelled += bookingDatesInWeek;
        summaryMap[name].refund += booking.refund?.refundAmount || 0;
      }
      
      summaryMap[name].bookings += bookingDatesInWeek;
      summaryMap[name].total += booking.totalFee || 0;
    });

    const earningsList = Object.entries(summaryMap).map(([propertyName, data]) => {
      const earned = data.total - data.refund;
      return {
        propertyName,
        bookings: data.bookings,
        cancelled: data.cancelled,
        refund: data.refund,
        total: data.total,
        earned: earned
      };
    });

    const totals = earningsList.reduce((acc, entry) => ({
      bookings: acc.bookings + entry.bookings,
      cancelled: acc.cancelled + entry.cancelled,
      refund: acc.refund + entry.refund,
      total: acc.total + entry.total,
      earned: acc.earned + entry.earned
    }), { bookings: 0, cancelled: 0, refund: 0, total: 0, earned: 0 });

    earningsList.push({ 
      propertyName: 'TOTAL', 
      bookings: totals.bookings,
      cancelled: totals.cancelled,
      refund: totals.refund,
      total: totals.total,
      earned: totals.earned 
    });

    const fileId = uuidv4();
    const excelPath = path.join(__dirname, `../exports/week-summary-${fileId}.xlsx`);

    const dateRange = `${startOfWeek.format('MMMM D, YYYY')} to ${endOfWeek.format('MMMM D, YYYY')}`;


    // ====== EXCEL GENERATION ======
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Week Summary');

    sheet.mergeCells('A1:O1');
    sheet.getCell('A1').value = 'Betcha by Homie House';
    sheet.getCell('A1').alignment = { horizontal: 'center' };
    sheet.getCell('A1').font = { bold: true, size: 18 };

    sheet.mergeCells('A2:O2');
    sheet.getCell('A2').value = 'betcha-booking@gmail.com';
    sheet.getCell('A2').alignment = { horizontal: 'center' };
    sheet.getCell('A2').font = { size: 12 };

    sheet.mergeCells('A4:O4');
    sheet.getCell('A4').value = `Week ${week} Summary Report`;
    sheet.getCell('A4').alignment = { horizontal: 'center' };
    sheet.getCell('A4').font = { bold: true, size: 16 };

    sheet.mergeCells('A5:O5');
    sheet.getCell('A5').value = `${moment().month(month - 1).format('MMMM')} ${year}`;
    sheet.getCell('A5').alignment = { horizontal: 'center' };
    sheet.getCell('A5').font = { bold: true, size: 14 };

    sheet.mergeCells('A6:O6');
    sheet.getCell('A6').value = `Period: ${dateRange}`;
    sheet.getCell('A6').alignment = { horizontal: 'center' };
    sheet.getCell('A6').font = { size: 12 };

    if (processedBy) {
      sheet.getCell('A8').value = `Processed by: ${processedBy}`;
      sheet.getCell('A8').alignment = { horizontal: 'left' };
      sheet.getCell('A8').font = { size: 10 };
    }
    sheet.getCell('A9').value = `Generated on: ${moment().tz('Asia/Manila').format('MMMM D, YYYY [at] h:mm A')}`;
    sheet.getCell('A9').alignment = { horizontal: 'left' };
    sheet.getCell('A9').font = { size: 10 };

    // Add table labels
    sheet.mergeCells('A10:F10');
    sheet.getCell('A10').value = 'Summary';
    sheet.getCell('A10').alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getCell('A10').font = { bold: true, size: 13 };

    sheet.mergeCells('H10:O10');
    sheet.getCell('H10').value = 'Booking Breakdown Dates';
    sheet.getCell('H10').alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getCell('H10').font = { bold: true, size: 13 };

    const headerRow = 11;
    sheet.getCell(`A${headerRow}`).value = 'Property Name';
    sheet.getCell(`B${headerRow}`).value = 'Bookings';
    sheet.getCell(`C${headerRow}`).value = 'Cancelled';
    sheet.getCell(`D${headerRow}`).value = 'Refund';
    sheet.getCell(`E${headerRow}`).value = 'Total';
    sheet.getCell(`F${headerRow}`).value = 'Earned';
    
    // Style main table headers
    for (let col of ['A', 'B', 'C', 'D', 'E', 'F']) {
      sheet.getCell(`${col}${headerRow}`).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getCell(`${col}${headerRow}`).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF147B42' }
      };
      sheet.getCell(`${col}${headerRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
    }

    earningsList.forEach((row, index) => {
      const newRow = sheet.addRow([
        row.propertyName, 
        row.bookings,
        row.cancelled,
        row.refund,
        row.total,
        row.earned
      ]);                                                                                                                                                                                                                                                                                                                 
      newRow.getCell(2).numFmt = '#,##0';
      newRow.getCell(3).numFmt = '#,##0'; 
      newRow.getCell(4).numFmt = '"PHP "#,##0.00'; 
      newRow.getCell(5).numFmt = '"PHP "#,##0.00'; 
      newRow.getCell(6).numFmt = '"PHP "#,##0.00';
      
      // Make TOTAL row bold
      if (row.propertyName === 'TOTAL') {
        for (let colNum = 1; colNum <= 6; colNum++) {
          newRow.getCell(colNum).font = { bold: true };
        }
      }
    });

    const totalRows = sheet.rowCount;
    for (let i = headerRow; i <= totalRows; i++) {
      ['A', 'B', 'C', 'D', 'E', 'F'].forEach(col => {
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
      { key: 'propertyName', width: 25 },
      { key: 'bookings', width: 12 },
      { key: 'cancelled', width: 12 },
      { key: 'refund', width: 15 },
      { key: 'total', width: 15 },
      { key: 'earned', width: 18 },
      { key: 'spacer', width: 2 },
      { key: 'dailyProperty', width: 25 },
      { key: 'monday', width: 12 },
      { key: 'tuesday', width: 12 },
      { key: 'wednesday', width: 12 },
      { key: 'thursday', width: 12 },
      { key: 'friday', width: 12 },
      { key: 'saturday', width: 12 },
      { key: 'sunday', width: 12 }
    ];

    // Calculate daily breakdown data
    const dailyBreakdown = {};
    earningsList.forEach(prop => {
      if (prop.propertyName !== 'TOTAL') {
        dailyBreakdown[prop.propertyName] = {
          'Monday': 0, 'Tuesday': 0, 'Wednesday': 0, 'Thursday': 0,
          'Friday': 0, 'Saturday': 0, 'Sunday': 0
        };
      }
    });

    const weekStart = startOfWeek.clone();
    const weekEnd = endOfWeek.clone();
    
    bookings.forEach(booking => {
      const propertyName = booking.propertyName;
      if (!dailyBreakdown[propertyName]) return;

      booking.datesOfBooking.forEach(date => {
        const bookingDate = moment(date);
        if (bookingDate.isBetween(weekStart, weekEnd, null, '[]')) {
          const dayName = bookingDate.format('dddd');
          if (dailyBreakdown[propertyName][dayName] !== undefined) {
            dailyBreakdown[propertyName][dayName]++;
          }
        }
      });
    });

    // Add daily breakdown headers - same row as main table headers (row 11, columns H to O)
    const dailyHeaderRow = 11;
    const dailyHeadersExcel = ['Property Name', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    
    dailyHeadersExcel.forEach((header, index) => {
      const colLetter = String.fromCharCode(72 + index); // H=72 (H, I, J, K, L, M, N, O)
      sheet.getCell(`${colLetter}${dailyHeaderRow}`).value = header;
      sheet.getCell(`${colLetter}${dailyHeaderRow}`).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getCell(`${colLetter}${dailyHeaderRow}`).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF147B42' }
      };
      sheet.getCell(`${colLetter}${dailyHeaderRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
      sheet.getCell(`${colLetter}${dailyHeaderRow}`).border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    // Add date ranges below day headers (row 12)
    const dateRangeRow = 12;
    daysOfWeek.forEach((day, index) => {
      const colLetter = String.fromCharCode(73 + index); // I=73 (I, J, K, L, M, N, O)
      const dayDate = startOfWeek.clone().day(day);
      const dateLabel = dayDate.format('MMM D');
      sheet.getCell(`${colLetter}${dateRangeRow}`).value = `(${dateLabel})`;
      sheet.getCell(`${colLetter}${dateRangeRow}`).font = { size: 9, italic: true };
      sheet.getCell(`${colLetter}${dateRangeRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
      sheet.getCell(`${colLetter}${dateRangeRow}`).border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
    
    // Property Name column for date range row
    sheet.getCell(`H${dateRangeRow}`).value = '';
    sheet.getCell(`H${dateRangeRow}`).border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };

    // Add daily breakdown data rows (starting from row 13, columns H to O)
    let dailyDataRow = 13;
    Object.entries(dailyBreakdown).forEach(([propertyName, days]) => {
      sheet.getCell(`H${dailyDataRow}`).value = propertyName;
      sheet.getCell(`I${dailyDataRow}`).value = days.Monday;
      sheet.getCell(`J${dailyDataRow}`).value = days.Tuesday;
      sheet.getCell(`K${dailyDataRow}`).value = days.Wednesday;
      sheet.getCell(`L${dailyDataRow}`).value = days.Thursday;
      sheet.getCell(`M${dailyDataRow}`).value = days.Friday;
      sheet.getCell(`N${dailyDataRow}`).value = days.Saturday;
      sheet.getCell(`O${dailyDataRow}`).value = days.Sunday;

      // Format and add borders
      for (let col = 8; col <= 15; col++) {
        const cell = sheet.getCell(dailyDataRow, col);
        if (col > 8) cell.numFmt = '#,##0';
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      }
      dailyDataRow++;
    });

    await workbook.xlsx.writeFile(excelPath);

    setTimeout(() => {
      fs.unlink(excelPath, err => err && console.error(`Excel delete error: ${err}`));
    }, 60000);

    return res.json({
      message: `Week ${week} of ${moment().month(month - 1).format('MMMM')}, ${year}`,
      excelLink: `/exports/week-summary-${fileId}.xlsx`
    });

  } catch (error) {
    console.error("Week summary generation failed:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

exports.generateMonthSummary = async (req, res) => {
  try {
    const { month, year, processedBy } = req.body;
    if (!month || !year) {
      return res.status(400).json({ message: "Please provide month and year." });
    }

    const firstDay = moment.tz({ year, month: month - 1, day: 1 }, 'Asia/Manila').startOf('day');
    const lastDay = firstDay.clone().endOf('month');

    // Date range for display
    const dateRange = `${firstDay.format('MMMM D, YYYY')} to ${lastDay.format('MMMM D, YYYY')}`;

    const [allProperties, bookings] = await Promise.all([
      Property.find({}, 'name'), // Get property names only
      Booking.find({
        datesOfBooking: { $elemMatch: { $gte: firstDay.toDate(), $lte: lastDay.toDate() } },
        status: { $in: ['Completed', 'Cancel'] }
      })
    ]);

    const summaryMap = {};
    allProperties.forEach(prop => {
      summaryMap[prop.name] = {
        bookings: 0,
        cancelled: 0,
        refund: 0,
        total: 0,
        earned: 0
      };
    });

    bookings.forEach(booking => {
      const name = booking.propertyName;
      if (!summaryMap[name]) return;
      
      // Count booking dates within the month range
      const bookingDatesInMonth = booking.datesOfBooking.filter(date => {
        const bookingDate = new Date(date);
        return bookingDate >= firstDay.toDate() && bookingDate <= lastDay.toDate();
      }).length;

      if (booking.status === 'Cancel') {
        summaryMap[name].cancelled += bookingDatesInMonth;
        summaryMap[name].refund += booking.refund?.refundAmount || 0;
      }
      
      summaryMap[name].bookings += bookingDatesInMonth;
      summaryMap[name].total += booking.totalFee || 0;
    });

    const resultList = Object.entries(summaryMap).map(([propertyName, data]) => {
      const earned = data.total - data.refund;
      return {
        propertyName,
        bookings: data.bookings,
        cancelled: data.cancelled,
        refund: data.refund,
        total: data.total,
        earned: earned
      };
    });

    const totals = resultList.reduce((acc, entry) => ({
      bookings: acc.bookings + entry.bookings,
      cancelled: acc.cancelled + entry.cancelled,
      refund: acc.refund + entry.refund,
      total: acc.total + entry.total,
      earned: acc.earned + entry.earned
    }), { bookings: 0, cancelled: 0, refund: 0, total: 0, earned: 0 });

    resultList.push({ 
      propertyName: 'TOTAL', 
      bookings: totals.bookings,
      cancelled: totals.cancelled,
      refund: totals.refund,
      total: totals.total,
      earned: totals.earned 
    });

    const fileId = uuidv4();
    const excelPath = path.join(__dirname, `../exports/month-summary-${fileId}.xlsx`);

    // ====== Generate Excel ======
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Month Summary');

    // Company Header
    sheet.mergeCells('A1:M1');
    sheet.getCell('A1').value = 'Betcha by Homie House';
    sheet.getCell('A1').alignment = { horizontal: 'center' };
    sheet.getCell('A1').font = { bold: true, size: 18 };

    sheet.mergeCells('A2:M2');
    sheet.getCell('A2').value = 'betcha-booking@gmail.com';
    sheet.getCell('A2').alignment = { horizontal: 'center' };
    sheet.getCell('A2').font = { size: 12 };

    // Report Title and Date Range
    sheet.mergeCells('A4:M4');
    sheet.getCell('A4').value = 'Monthly Summary Report';
    sheet.getCell('A4').alignment = { horizontal: 'center' };
    sheet.getCell('A4').font = { bold: true, size: 16 };

    sheet.mergeCells('A5:M5');
    sheet.getCell('A5').value = `${moment().month(month - 1).format('MMMM')} ${year}`;
    sheet.getCell('A5').alignment = { horizontal: 'center' };
    sheet.getCell('A5').font = { bold: true, size: 14 };

    sheet.mergeCells('A6:M6');
    sheet.getCell('A6').value = `Period: ${dateRange}`;
    sheet.getCell('A6').alignment = { horizontal: 'center' };
    sheet.getCell('A6').font = { size: 12 };

    // Processed By and Generated On
    if (processedBy) {
      sheet.getCell('A8').value = `Processed by: ${processedBy}`;
      sheet.getCell('A8').alignment = { horizontal: 'left' };
      sheet.getCell('A8').font = { size: 10 };
    }
    sheet.getCell('A9').value = `Generated on: ${moment().tz('Asia/Manila').format('MMMM D, YYYY [at] h:mm A')}`;
    sheet.getCell('A9').alignment = { horizontal: 'left' };
    sheet.getCell('A9').font = { size: 10 };

    // Calculate the last column for table 2 dynamically (based on weeks in month)
    const weeksInMonthCount = Math.ceil((lastDay.diff(firstDay, 'days') + 1) / 7);
    const lastWeeklyColTemp = String.fromCharCode(72 + weeksInMonthCount); // H + number of weeks

    // Add table labels
    sheet.mergeCells('A10:F10');
    sheet.getCell('A10').value = 'Summary';
    sheet.getCell('A10').alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getCell('A10').font = { bold: true, size: 13 };

    sheet.mergeCells(`H10:${lastWeeklyColTemp}10`);
    sheet.getCell('H10').value = 'Booking Breakdown Dates';
    sheet.getCell('H10').alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getCell('H10').font = { bold: true, size: 13 };

    // Table Headers
    const headerRow = 11;
    sheet.getCell(`A${headerRow}`).value = 'Property Name';
    sheet.getCell(`B${headerRow}`).value = 'Bookings';
    sheet.getCell(`C${headerRow}`).value = 'Cancelled';
    sheet.getCell(`D${headerRow}`).value = 'Refund';
    sheet.getCell(`E${headerRow}`).value = 'Total';
    sheet.getCell(`F${headerRow}`).value = 'Earned';
    
    // Style main table headers
    for (let col of ['A', 'B', 'C', 'D', 'E', 'F']) {
      sheet.getCell(`${col}${headerRow}`).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getCell(`${col}${headerRow}`).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF147B42' }
      };
      sheet.getCell(`${col}${headerRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
    }

    resultList.forEach((row, index) => {
      const newRow = sheet.addRow([
        row.propertyName, 
        row.bookings,
        row.cancelled,
        row.refund,
        row.total,
        row.earned
      ]);
      newRow.getCell(2).numFmt = '#,##0'; // Bookings column
      newRow.getCell(3).numFmt = '#,##0'; // Cancelled column
      newRow.getCell(4).numFmt = '"PHP "#,##0.00'; // Refund column
      newRow.getCell(5).numFmt = '"PHP "#,##0.00'; // Total column
      newRow.getCell(6).numFmt = '"PHP "#,##0.00'; // Earned column
      
      // Make TOTAL row bold (MONTH SUMMARY)
      if (row.propertyName === 'TOTAL') {
        for (let colNum = 1; colNum <= 6; colNum++) {
          newRow.getCell(colNum).font = { bold: true };
        }
      }
    });

    const totalRows = sheet.rowCount;
    for (let i = headerRow; i <= totalRows; i++) {
      ['A', 'B', 'C', 'D', 'E', 'F'].forEach(col => {
        const cell = sheet.getCell(`${col}${i}`);
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    }

    // Calculate weekly breakdown data for monthly report
    const weeklyBreakdownDataMonth = {};
    resultList.forEach(item => {
      if (item.propertyName !== 'TOTAL') {
        weeklyBreakdownDataMonth[item.propertyName] = {};
      }
    });

    // Get all weeks in the month
    const monthStartWeekly = firstDay.clone();
    const monthEndWeekly = lastDay.clone();
    const weeksInMonth = [];
    
    let currentWeekStart = monthStartWeekly.clone().startOf('week');
    while (currentWeekStart.isBefore(monthEndWeekly) || currentWeekStart.isSame(monthEndWeekly)) {
      const weekEnd = currentWeekStart.clone().endOf('week');
      const weekLabel = `Week ${currentWeekStart.week()}`;
      weeksInMonth.push({ label: weekLabel, start: currentWeekStart.clone(), end: weekEnd.clone() });
      currentWeekStart.add(1, 'week');
      
      // Initialize weekly data
      Object.keys(weeklyBreakdownDataMonth).forEach(propertyName => {
        weeklyBreakdownDataMonth[propertyName][weekLabel] = 0;
      });
    }

    // Calculate weekly bookings for monthly breakdown
    bookings.forEach(booking => {
      const propertyName = booking.propertyName;
      if (!weeklyBreakdownDataMonth[propertyName]) return;

      booking.datesOfBooking.forEach(date => {
        const bookingDate = moment(date);
        if (bookingDate.isBetween(monthStartWeekly, monthEndWeekly, null, '[]')) {
          weeksInMonth.forEach(week => {
            if (bookingDate.isBetween(week.start, week.end, null, '[]')) {
              weeklyBreakdownDataMonth[propertyName][week.label]++;
            }
          });
        }
      });
    });

    // Determine the last column for the weekly breakdown table
    const lastWeeklyCol = String.fromCharCode(72 + weeksInMonth.length); // H + number of weeks

    // Set column widths (include spacer and weekly breakdown columns)
    const monthColumns = [
      { key: 'propertyName', width: 25 },
      { key: 'bookings', width: 12 },
      { key: 'cancelled', width: 12 },
      { key: 'refund', width: 15 },
      { key: 'total', width: 15 },
      { key: 'earned', width: 18 },
      { key: 'spacer', width: 2 },
      { key: 'weeklyProperty', width: 25 }
    ];
    // Add columns for weekly breakdown (up to 6 weeks typically)
    for (let i = 0; i < weeksInMonth.length; i++) {
      monthColumns.push({ key: `week${i + 1}`, width: 12 });
    }
    sheet.columns = monthColumns;

    // Add weekly breakdown headers (row 11, starting at column H)
    const weeklyHeaderRow = 11;
    sheet.getCell(`H${weeklyHeaderRow}`).value = 'Property Name';
    sheet.getCell(`H${weeklyHeaderRow}`).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getCell(`H${weeklyHeaderRow}`).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF147B42' }
    };
    sheet.getCell(`H${weeklyHeaderRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getCell(`H${weeklyHeaderRow}`).border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };

    weeksInMonth.forEach((week, index) => {
      const colLetter = String.fromCharCode(73 + index); // I, J, K, etc.
      sheet.getCell(`${colLetter}${weeklyHeaderRow}`).value = week.label;
      sheet.getCell(`${colLetter}${weeklyHeaderRow}`).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getCell(`${colLetter}${weeklyHeaderRow}`).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF147B42' }
      };
      sheet.getCell(`${colLetter}${weeklyHeaderRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
      sheet.getCell(`${colLetter}${weeklyHeaderRow}`).border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    // Add date ranges below week headers (row 12)
    const weekDateRangeRow = 12;
    weeksInMonth.forEach((week, index) => {
      const colLetter = String.fromCharCode(73 + index); // I, J, K, etc.
      const dateLabel = `(${week.start.format('MMM D')}-${week.end.format('D')})`;
      sheet.getCell(`${colLetter}${weekDateRangeRow}`).value = dateLabel;
      sheet.getCell(`${colLetter}${weekDateRangeRow}`).font = { size: 9, italic: true };
      sheet.getCell(`${colLetter}${weekDateRangeRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
      sheet.getCell(`${colLetter}${weekDateRangeRow}`).border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
    
    // Property Name column for date range row
    sheet.getCell(`H${weekDateRangeRow}`).value = '';
    sheet.getCell(`H${weekDateRangeRow}`).border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };

    // Add weekly breakdown data (starting from row 13, column H)
    let weeklyDataRow = 13;
    Object.entries(weeklyBreakdownDataMonth).forEach(([propertyName, weeks]) => {
      sheet.getCell(`H${weeklyDataRow}`).value = propertyName;
      sheet.getCell(`H${weeklyDataRow}`).border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };

      weeksInMonth.forEach((week, index) => {
        const colLetter = String.fromCharCode(73 + index);
        sheet.getCell(`${colLetter}${weeklyDataRow}`).value = weeks[week.label] || 0;
        sheet.getCell(`${colLetter}${weeklyDataRow}`).numFmt = '#,##0';
        sheet.getCell(`${colLetter}${weeklyDataRow}`).border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
      
      weeklyDataRow++;
    });

    await workbook.xlsx.writeFile(excelPath);


    setTimeout(() => {
      fs.unlink(excelPath, err => err && console.error('Excel delete error', err));
    }, 60000);

    return res.json({
      message: `Month Summary for ${moment().month(month - 1).format('MMMM')} ${year}`,
      excelLink: `/exports/month-summary-${fileId}.xlsx`
    });

  } catch (error) {
    console.error("Month summary generation failed:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

exports.generateQuarterSummary = async (req, res) => {
  try {
    const { quarter, year, processedBy } = req.body;
    if (!quarter || !year || quarter < 1 || quarter > 4) {
      return res.status(400).json({ message: "Please provide a valid quarter (1–4) and year." });
    }

    const startMonth = (quarter - 1) * 3; 
    const startDate = moment.tz({ year, month: startMonth, day: 1 }, 'Asia/Manila').startOf('month');
    const endDate = moment(startDate).add(2, 'months').endOf('month');

    // Date range for display
    const dateRange = `${startDate.format('MMMM D, YYYY')} to ${endDate.format('MMMM D, YYYY')}`;

    const [allProperties, bookings] = await Promise.all([
      Property.find({}, 'name'), // Get property names only
      Booking.find({
        datesOfBooking: { $elemMatch: { $gte: startDate.toDate(), $lte: endDate.toDate() } },
        status: { $in: ['Completed', 'Cancel'] }
      })
    ]);

    const summaryMap = {};
    allProperties.forEach(prop => {
      summaryMap[prop.name] = {
        bookings: 0,
        cancelled: 0,
        refund: 0,
        total: 0,
        earned: 0
      };
    });

    bookings.forEach(booking => {
      const name = booking.propertyName;
      if (!summaryMap[name]) return;
      
      // Count booking dates within the quarter range
      const bookingDatesInQuarter = booking.datesOfBooking.filter(date => {
        const bookingDate = new Date(date);
        return bookingDate >= startDate.toDate() && bookingDate <= endDate.toDate();
      }).length;

      if (booking.status === 'Cancel') {
        summaryMap[name].cancelled += bookingDatesInQuarter;
        summaryMap[name].refund += booking.refund?.refundAmount || 0;
      }
      
      summaryMap[name].bookings += bookingDatesInQuarter;
      summaryMap[name].total += booking.totalFee || 0;
    });

    const resultList = Object.entries(summaryMap).map(([propertyName, data]) => {
      const earned = data.total - data.refund;
      return {
        propertyName,
        bookings: data.bookings,
        cancelled: data.cancelled,
        refund: data.refund,
        total: data.total,
        earned: earned
      };
    });

    const totals = resultList.reduce((acc, entry) => ({
      bookings: acc.bookings + entry.bookings,
      cancelled: acc.cancelled + entry.cancelled,
      refund: acc.refund + entry.refund,
      total: acc.total + entry.total,
      earned: acc.earned + entry.earned
    }), { bookings: 0, cancelled: 0, refund: 0, total: 0, earned: 0 });

    resultList.push({ 
      propertyName: 'TOTAL', 
      bookings: totals.bookings,
      cancelled: totals.cancelled,
      refund: totals.refund,
      total: totals.total,
      earned: totals.earned 
    });

    const fileId = uuidv4();
    const excelPath = path.join(__dirname, `../exports/quarter-summary-${fileId}.xlsx`);

    // Excel
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Quarter Summary');

    // Company Header
    sheet.mergeCells('A1:K1');
    sheet.getCell('A1').value = 'Betcha by Homie House';
    sheet.getCell('A1').alignment = { horizontal: 'center' };
    sheet.getCell('A1').font = { bold: true, size: 18 };

    sheet.mergeCells('A2:K2');
    sheet.getCell('A2').value = 'betcha-booking@gmail.com';
    sheet.getCell('A2').alignment = { horizontal: 'center' };
    sheet.getCell('A2').font = { size: 12 };

    // Report Title and Date Range
    sheet.mergeCells('A4:K4');
    sheet.getCell('A4').value = `Quarter ${quarter} Summary Report`;
    sheet.getCell('A4').alignment = { horizontal: 'center' };
    sheet.getCell('A4').font = { bold: true, size: 16 };

    sheet.mergeCells('A5:K5');
    sheet.getCell('A5').value = `Year ${year}`;
    sheet.getCell('A5').alignment = { horizontal: 'center' };
    sheet.getCell('A5').font = { bold: true, size: 14 };

    sheet.mergeCells('A6:K6');
    sheet.getCell('A6').value = `Period: ${dateRange}`;
    sheet.getCell('A6').alignment = { horizontal: 'center' };
    sheet.getCell('A6').font = { size: 12 };

    // Processed By and Generated On
    if (processedBy) {
      sheet.getCell('A8').value = `Processed by: ${processedBy}`;
      sheet.getCell('A8').alignment = { horizontal: 'left' };
      sheet.getCell('A8').font = { size: 10 };
    }
    sheet.getCell('A9').value = `Generated on: ${moment().tz('Asia/Manila').format('MMMM D, YYYY [at] h:mm A')}`;
    sheet.getCell('A9').alignment = { horizontal: 'left' };
    sheet.getCell('A9').font = { size: 10 };

    // Add table labels (Quarter has 3 months, so last column is K)
    sheet.mergeCells('A10:F10');
    sheet.getCell('A10').value = 'Summary';
    sheet.getCell('A10').alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getCell('A10').font = { bold: true, size: 13 };

    sheet.mergeCells('H10:K10');
    sheet.getCell('H10').value = 'Booking Breakdown Dates';
    sheet.getCell('H10').alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getCell('H10').font = { bold: true, size: 13 };

    // Table Headers
    const headerRow = 11;
    sheet.getCell(`A${headerRow}`).value = 'Property Name';
    sheet.getCell(`B${headerRow}`).value = 'Bookings';
    sheet.getCell(`C${headerRow}`).value = 'Cancelled';
    sheet.getCell(`D${headerRow}`).value = 'Refund';
    sheet.getCell(`E${headerRow}`).value = 'Total';
    sheet.getCell(`F${headerRow}`).value = 'Earned';
    
    // Style main table headers
    for (let col of ['A', 'B', 'C', 'D', 'E', 'F']) {
      sheet.getCell(`${col}${headerRow}`).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getCell(`${col}${headerRow}`).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF147B42' }
      };
      sheet.getCell(`${col}${headerRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
    }

    resultList.forEach((row, index) => {
      const newRow = sheet.addRow([
        row.propertyName, 
        row.bookings,
        row.cancelled,
        row.refund,
        row.total,
        row.earned
      ]);
      newRow.getCell(2).numFmt = '#,##0'; // Bookings column
      newRow.getCell(3).numFmt = '#,##0'; // Cancelled column
      newRow.getCell(4).numFmt = '"PHP "#,##0.00'; // Refund column
      newRow.getCell(5).numFmt = '"PHP "#,##0.00'; // Total column
      newRow.getCell(6).numFmt = '"PHP "#,##0.00'; // Earned column
      
      // Make TOTAL row bold (QUARTER SUMMARY)
      if (row.propertyName === 'TOTAL') {
        for (let colNum = 1; colNum <= 6; colNum++) {
          newRow.getCell(colNum).font = { bold: true };
        }
      }
    });

    const totalRows = sheet.rowCount;
    for (let i = headerRow; i <= totalRows; i++) {
      ['A', 'B', 'C', 'D', 'E', 'F'].forEach(col => {
        const cell = sheet.getCell(`${col}${i}`);
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    }

    // Calculate monthly breakdown data for quarterly report
    const monthlyBreakdownDataQuarter = {};
    resultList.forEach(item => {
      if (item.propertyName !== 'TOTAL') {
        monthlyBreakdownDataQuarter[item.propertyName] = {};
      }
    });

    // Get all months in the quarter
    const quarterStartMonthly = startDate.clone();
    const quarterEndMonthly = endDate.clone();
    const monthsInQuarter = [];
    
    for (let i = 0; i < 3; i++) {
      const monthStart = quarterStartMonthly.clone().add(i, 'months').startOf('month');
      const monthEnd = quarterStartMonthly.clone().add(i, 'months').endOf('month');
      const monthLabel = monthStart.format('MMMM');
      monthsInQuarter.push({ label: monthLabel, start: monthStart.clone(), end: monthEnd.clone() });
      
      // Initialize monthly data
      Object.keys(monthlyBreakdownDataQuarter).forEach(propertyName => {
        monthlyBreakdownDataQuarter[propertyName][monthLabel] = 0;
      });
    }

    // Calculate monthly bookings for quarterly breakdown
    bookings.forEach(booking => {
      const propertyName = booking.propertyName;
      if (!monthlyBreakdownDataQuarter[propertyName]) return;

      booking.datesOfBooking.forEach(date => {
        const bookingDate = moment(date);
        if (bookingDate.isBetween(quarterStartMonthly, quarterEndMonthly, null, '[]')) {
          monthsInQuarter.forEach(month => {
            if (bookingDate.isBetween(month.start, month.end, null, '[]')) {
              monthlyBreakdownDataQuarter[propertyName][month.label]++;
            }
          });
        }
      });
    });

    // Set column widths (include spacer and monthly breakdown columns)
    sheet.columns = [
      { key: 'propertyName', width: 25 },
      { key: 'bookings', width: 12 },
      { key: 'cancelled', width: 12 },
      { key: 'refund', width: 15 },
      { key: 'total', width: 15 },
      { key: 'earned', width: 18 },
      { key: 'spacer', width: 2 },
      { key: 'monthlyProperty', width: 25 },
      { key: 'month1', width: 15 },
      { key: 'month2', width: 15 },
      { key: 'month3', width: 15 }
    ];

    // Add monthly breakdown headers (row 11, columns H to K)
    const monthlyHeaderRow = 11;
    sheet.getCell(`H${monthlyHeaderRow}`).value = 'Property Name';
    sheet.getCell(`H${monthlyHeaderRow}`).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getCell(`H${monthlyHeaderRow}`).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF147B42' }
    };
    sheet.getCell(`H${monthlyHeaderRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getCell(`H${monthlyHeaderRow}`).border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };

    monthsInQuarter.forEach((month, index) => {
      const colLetter = String.fromCharCode(73 + index); // I, J, K
      sheet.getCell(`${colLetter}${monthlyHeaderRow}`).value = month.label;
      sheet.getCell(`${colLetter}${monthlyHeaderRow}`).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getCell(`${colLetter}${monthlyHeaderRow}`).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF147B42' }
      };
      sheet.getCell(`${colLetter}${monthlyHeaderRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
      sheet.getCell(`${colLetter}${monthlyHeaderRow}`).border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    // Add date ranges below month headers (row 12)
    const monthDateRangeRow = 12;
    monthsInQuarter.forEach((month, index) => {
      const colLetter = String.fromCharCode(73 + index); // I, J, K
      const dateLabel = `(${month.start.format('MMM D')}-${month.end.format('D')})`;
      sheet.getCell(`${colLetter}${monthDateRangeRow}`).value = dateLabel;
      sheet.getCell(`${colLetter}${monthDateRangeRow}`).font = { size: 9, italic: true };
      sheet.getCell(`${colLetter}${monthDateRangeRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
      sheet.getCell(`${colLetter}${monthDateRangeRow}`).border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
    
    // Property Name column for date range row
    sheet.getCell(`H${monthDateRangeRow}`).value = '';
    sheet.getCell(`H${monthDateRangeRow}`).border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };

    // Add monthly breakdown data (starting from row 13, column H)
    let monthlyDataRow = 13;
    Object.entries(monthlyBreakdownDataQuarter).forEach(([propertyName, months]) => {
      sheet.getCell(`H${monthlyDataRow}`).value = propertyName;
      sheet.getCell(`H${monthlyDataRow}`).border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };

      monthsInQuarter.forEach((month, index) => {
        const colLetter = String.fromCharCode(73 + index);
        sheet.getCell(`${colLetter}${monthlyDataRow}`).value = months[month.label] || 0;
        sheet.getCell(`${colLetter}${monthlyDataRow}`).numFmt = '#,##0';
        sheet.getCell(`${colLetter}${monthlyDataRow}`).border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
      
      monthlyDataRow++;
    });

    await workbook.xlsx.writeFile(excelPath);

    setTimeout(() => {
      fs.unlink(excelPath, err => err && console.error('Excel delete error', err));
    }, 60000);

    return res.json({
      message: `Quarter ${quarter} Summary - ${year}`,
      excelLink: `/exports/quarter-summary-${fileId}.xlsx`
    });

  } catch (error) {
    console.error("Quarter summary generation failed:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// TEMPORARY: Semi-annual and Annual functions commented out due to corruption
// Will be restored shortly

/*
exports.generateSemiAnnualSummary = async (req, res) => {
  try {
    return res.status(500).json({ message: "Feature temporarily unavailable" });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error" });
  }
};

exports.generateAnnualSummary = async (req, res) => {
  try {
    return res.status(500).json({ message: "Feature temporarily unavailable" });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error" });
  }
};
*/

// Clean implementations of semi-annual and annual functions will be added here
exports.generateSemiAnnualSummary = async (req, res) => {
  try {
    const { annual, year, processedBy } = req.body;
    if (!annual || !year || ![1, 2].includes(annual)) {
      return res.status(400).json({ message: 'Please provide valid annual (1-2) and year.' });
    }

    const startMonth = (annual - 1) * 6; // 0 for H1, 6 for H2
    const start = moment.tz({ year, month: startMonth, day: 1 }, 'Asia/Manila').startOf('month');
    const end = start.clone().add(5, 'months').endOf('month');

    // Date range for display
    const dateRange = `${start.format('MMMM D, YYYY')} to ${end.format('MMMM D, YYYY')}`;

    const [allProperties, bookings] = await Promise.all([
      Property.find({}, 'name'),
      Booking.find({
        datesOfBooking: { $elemMatch: { $gte: start.toDate(), $lte: end.toDate() } },
        status: { $in: ['Completed', 'Cancel'] }
      })
    ]);

    const summaryMap = {};
    allProperties.forEach(prop => {
      summaryMap[prop.name] = {
        bookings: 0,
        cancelled: 0,
        refund: 0,
        total: 0,
        earned: 0
      };
    });

    bookings.forEach(booking => {
      const name = booking.propertyName;
      if (!summaryMap[name]) return;
      
      // Count booking dates within the semi-annual range
      const bookingDatesInSemiAnnual = booking.datesOfBooking.filter(date => {
        const bookingDate = new Date(date);
        return bookingDate >= start.toDate() && bookingDate <= end.toDate();
      }).length;

      if (booking.status === 'Cancel') {
        summaryMap[name].cancelled += bookingDatesInSemiAnnual;
        summaryMap[name].refund += booking.refund?.refundAmount || 0;
      }
      
      summaryMap[name].bookings += bookingDatesInSemiAnnual;
      summaryMap[name].total += booking.totalFee || 0;
    });

    const resultList = Object.entries(summaryMap).map(([propertyName, data]) => {
      const earned = data.total - data.refund;
      return {
        propertyName,
        bookings: data.bookings,
        cancelled: data.cancelled,
        refund: data.refund,
        total: data.total,
        earned: earned
      };
    });

    const totals = resultList.reduce((acc, entry) => ({
      bookings: acc.bookings + entry.bookings,
      cancelled: acc.cancelled + entry.cancelled,
      refund: acc.refund + entry.refund,
      total: acc.total + entry.total,
      earned: acc.earned + entry.earned
    }), { bookings: 0, cancelled: 0, refund: 0, total: 0, earned: 0 });

    resultList.push({ 
      propertyName: 'TOTAL', 
      bookings: totals.bookings,
      cancelled: totals.cancelled,
      refund: totals.refund,
      total: totals.total,
      earned: totals.earned 
    });

    const fileId = uuidv4();
    const excelPath = path.join(__dirname, `../exports/semi-annual-summary-${fileId}.xlsx`);

    // ===== Excel Generation =====
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Semi-Annual Summary');

    // Company Header (moved from A3:N3 to A1:N1 and A4:N4 to A2:N2)
    sheet.mergeCells('A1:N1');
    sheet.getCell('A1').value = 'Betcha by Homie House';
    sheet.getCell('A1').alignment = { horizontal: 'center' };
    sheet.getCell('A1').font = { bold: true, size: 18 };

    sheet.mergeCells('A2:N2');
    sheet.getCell('A2').value = 'betcha-booking@gmail.com';
    sheet.getCell('A2').alignment = { horizontal: 'center' };
    sheet.getCell('A2').font = { size: 12 };

    // Report Title and Date Range (moved up by 2 rows)
    sheet.mergeCells('A4:N4');
    sheet.getCell('A4').value = 'Semi-Annual Summary Report';
    sheet.getCell('A4').alignment = { horizontal: 'center' };
    sheet.getCell('A4').font = { bold: true, size: 16 };

    sheet.mergeCells('A5:N5');
    sheet.getCell('A5').value = `${year} - H${annual}`;
    sheet.getCell('A5').alignment = { horizontal: 'center' };
    sheet.getCell('A5').font = { bold: true, size: 14 };

    sheet.mergeCells('A6:N6');
    sheet.getCell('A6').value = `Period: ${dateRange}`;
    sheet.getCell('A6').alignment = { horizontal: 'center' };
    sheet.getCell('A6').font = { size: 12 };

    // Processed By and Generated On (moved from A10, A11 to A8, A9)
    if (processedBy) {
      sheet.getCell('A8').value = `Processed by: ${processedBy}`;
      sheet.getCell('A8').alignment = { horizontal: 'left' };
      sheet.getCell('A8').font = { size: 10 };
    }
    sheet.getCell('A9').value = `Generated on: ${moment().tz('Asia/Manila').format('MMMM D, YYYY [at] h:mm A')}`;
    sheet.getCell('A9').alignment = { horizontal: 'left' };
    sheet.getCell('A9').font = { size: 10 };

    // Add table labels (Semi-Annual has 6 months, so last column is N)
    sheet.mergeCells('A10:F10');
    sheet.getCell('A10').value = 'Summary';
    sheet.getCell('A10').alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getCell('A10').font = { bold: true, size: 13 };

    sheet.mergeCells('H10:N10');
    sheet.getCell('H10').value = 'Booking Breakdown Dates';
    sheet.getCell('H10').alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getCell('H10').font = { bold: true, size: 13 };

    // Table Headers (moved from row 13 to row 11)
    const headerRow = 11;
    sheet.getCell(`A${headerRow}`).value = 'Property Name';
    sheet.getCell(`B${headerRow}`).value = 'Bookings';
    sheet.getCell(`C${headerRow}`).value = 'Cancelled';
    sheet.getCell(`D${headerRow}`).value = 'Refund';
    sheet.getCell(`E${headerRow}`).value = 'Total';
    sheet.getCell(`F${headerRow}`).value = 'Earned';
    
    // Style main table headers with green background and white text
    for (let col of ['A', 'B', 'C', 'D', 'E', 'F']) {
      sheet.getCell(`${col}${headerRow}`).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getCell(`${col}${headerRow}`).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF147B42' }
      };
      sheet.getCell(`${col}${headerRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
    }

    resultList.forEach(row => {
      const r = [
        row.propertyName, 
        row.bookings, 
        row.cancelled,
        row.refund,
        row.total,
        row.earned
      ];
      const added = sheet.addRow(r);
      // Format numeric and currency columns
      added.getCell(2).numFmt = '#,##0'; // Bookings column
      added.getCell(3).numFmt = '#,##0'; // Cancelled column
      added.getCell(4).numFmt = '"PHP "#,##0.00'; // Refund column
      added.getCell(5).numFmt = '"PHP "#,##0.00'; // Total column
      added.getCell(6).numFmt = '"PHP "#,##0.00'; // Earned column
      
      // Make TOTAL row bold (SEMI-ANNUAL SUMMARY)
      if (row.propertyName === 'TOTAL') {
        for (let colNum = 1; colNum <= 6; colNum++) {
          added.getCell(colNum).font = { bold: true };
        }
      }
    });

    const totalRows = sheet.rowCount;
    for (let i = headerRow; i <= totalRows; i++) {
      for (let j = 1; j <= 6; j++) {
        const cell = sheet.getCell(i, j);
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      }
    }

    // Create monthly breakdown data
    const monthlyBreakdown = {};
    allProperties.forEach(prop => {
      monthlyBreakdown[prop.name] = {};
      for (let monthOffset = 0; monthOffset < 6; monthOffset++) {
        const monthStart = start.clone().add(monthOffset, 'months');
        const monthName = monthStart.format('MMMM');
        monthlyBreakdown[prop.name][monthName] = 0;
      }
    });

    // Calculate monthly bookings
    bookings.forEach(booking => {
      const propertyName = booking.propertyName;
      if (!monthlyBreakdown[propertyName]) return;

      booking.datesOfBooking.forEach(date => {
        const bookingDate = moment(date);
        if (bookingDate.isBetween(start, end, null, '[]')) {
          const monthName = bookingDate.format('MMMM');
          if (monthlyBreakdown[propertyName][monthName] !== undefined) {
            monthlyBreakdown[propertyName][monthName]++;
          }
        }
      });
    });

    // Set column widths (include spacer and monthly breakdown columns)
    sheet.columns = [
      { key: 'propertyName', width: 25 },
      { key: 'bookings', width: 12 },
      { key: 'cancelled', width: 12 },
      { key: 'refund', width: 15 },
      { key: 'total', width: 15 },
      { key: 'earned', width: 18 },
      { key: 'spacer', width: 2 },
      { key: 'monthlyProperty', width: 25 },
      { key: 'month1', width: 12 },
      { key: 'month2', width: 12 },
      { key: 'month3', width: 12 },
      { key: 'month4', width: 12 },
      { key: 'month5', width: 12 },
      { key: 'month6', width: 12 }
    ];

    // Add monthly breakdown headers (row 11, columns H to N)
    const monthlyHeaderRow = 11;
    sheet.getCell(`H${monthlyHeaderRow}`).value = 'Property Name';
    sheet.getCell(`H${monthlyHeaderRow}`).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getCell(`H${monthlyHeaderRow}`).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF147B42' }
    };
    sheet.getCell(`H${monthlyHeaderRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getCell(`H${monthlyHeaderRow}`).border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };

    for (let monthOffset = 0; monthOffset < 6; monthOffset++) {
      const monthStart = start.clone().add(monthOffset, 'months');
      const colLetter = String.fromCharCode(73 + monthOffset); // I, J, K, L, M, N
      sheet.getCell(`${colLetter}${monthlyHeaderRow}`).value = monthStart.format('MMMM');
      sheet.getCell(`${colLetter}${monthlyHeaderRow}`).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getCell(`${colLetter}${monthlyHeaderRow}`).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF147B42' }
      };
      sheet.getCell(`${colLetter}${monthlyHeaderRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
      sheet.getCell(`${colLetter}${monthlyHeaderRow}`).border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    }

    // Add date ranges below month headers (row 12) for SEMI-ANNUAL
    const semiAnnualDateRangeRow = 12;
    for (let monthOffset = 0; monthOffset < 6; monthOffset++) {
      const monthStart = start.clone().add(monthOffset, 'months').startOf('month');
      const monthEnd = start.clone().add(monthOffset, 'months').endOf('month');
      const colLetter = String.fromCharCode(73 + monthOffset); // I, J, K, L, M, N
      const dateLabel = `(${monthStart.format('MMM D')}-${monthEnd.format('D')})`;
      sheet.getCell(`${colLetter}${semiAnnualDateRangeRow}`).value = dateLabel;
      sheet.getCell(`${colLetter}${semiAnnualDateRangeRow}`).font = { size: 9, italic: true };
      sheet.getCell(`${colLetter}${semiAnnualDateRangeRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
      sheet.getCell(`${colLetter}${semiAnnualDateRangeRow}`).border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    }
    
    // Property Name column for date range row
    sheet.getCell(`H${semiAnnualDateRangeRow}`).value = '';
    sheet.getCell(`H${semiAnnualDateRangeRow}`).border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };

    // Add monthly breakdown data rows (starting from row 13, column H)
    let monthlyDataRow = 13;
    Object.entries(monthlyBreakdown).forEach(([propertyName, months]) => {
      sheet.getCell(`H${monthlyDataRow}`).value = propertyName;
      sheet.getCell(`H${monthlyDataRow}`).border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };

      for (let monthOffset = 0; monthOffset < 6; monthOffset++) {
        const monthStart = start.clone().add(monthOffset, 'months');
        const monthName = monthStart.format('MMMM');
        const colLetter = String.fromCharCode(73 + monthOffset);
        sheet.getCell(`${colLetter}${monthlyDataRow}`).value = months[monthName] || 0;
        sheet.getCell(`${colLetter}${monthlyDataRow}`).numFmt = '#,##0';
        sheet.getCell(`${colLetter}${monthlyDataRow}`).border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      }
      
      monthlyDataRow++;
    });

    await workbook.xlsx.writeFile(excelPath);

    // Cleanup files after 10 minutes (increased from 1 minute for better user experience)
    setTimeout(() => {
      fs.unlink(excelPath, err => err && console.error('Excel delete error', err));
    }, 600000);

    return res.json({
      message: `Semi-Annual Summary for H${annual} ${year}`,
      excelLink: `/exports/semi-annual-summary-${fileId}.xlsx`
    });
  } catch (error) {
    console.error('Semi-annual summary generation failed:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.generateAnnualSummary = async (req, res) => {
  try {
    const { year, processedBy } = req.body;
    if (!year) {
      return res.status(400).json({ message: "Please provide a year." });
    }

    const start = moment.tz({ year, month: 0, day: 1 }, 'Asia/Manila').startOf('day');
    const end = moment.tz({ year, month: 11, day: 31 }, 'Asia/Manila').endOf('day');

    // Date range for display
    const dateRange = `January 1, ${year} to December 31, ${year}`;

    const [allProperties, bookings] = await Promise.all([
      Property.find({}, 'name'),
      Booking.find({
        datesOfBooking: { $elemMatch: { $gte: start.toDate(), $lte: end.toDate() } },
        status: { $in: ['Completed', 'Cancel'] }
      })
    ]);

    const summaryMap = {};
    allProperties.forEach(prop => {
      summaryMap[prop.name] = {
        bookings: 0,
        cancelled: 0,
        refund: 0,
        total: 0,
        earned: 0
      };
    });

    bookings.forEach(booking => {
      const name = booking.propertyName;
      if (!summaryMap[name]) return;
      
      // Count booking dates within the annual range
      const bookingDatesInYear = booking.datesOfBooking.filter(date => {
        const bookingDate = new Date(date);
        return bookingDate >= start.toDate() && bookingDate <= end.toDate();
      }).length;

      if (booking.status === 'Cancel') {
        summaryMap[name].cancelled += bookingDatesInYear;
        summaryMap[name].refund += booking.refund?.refundAmount || 0;
      }
      
      summaryMap[name].bookings += bookingDatesInYear;
      summaryMap[name].total += booking.totalFee || 0;
    });

    const resultList = Object.entries(summaryMap).map(([propertyName, data]) => {
      const earned = data.total - data.refund;
      return {
        propertyName,
        bookings: data.bookings,
        cancelled: data.cancelled,
        refund: data.refund,
        total: data.total,
        earned: earned
      };
    });

    const totals = resultList.reduce((acc, entry) => ({
      bookings: acc.bookings + entry.bookings,
      cancelled: acc.cancelled + entry.cancelled,
      refund: acc.refund + entry.refund,
      total: acc.total + entry.total,
      earned: acc.earned + entry.earned
    }), { bookings: 0, cancelled: 0, refund: 0, total: 0, earned: 0 });

    resultList.push({ 
      propertyName: 'TOTAL', 
      bookings: totals.bookings,
      cancelled: totals.cancelled,
      refund: totals.refund,
      total: totals.total,
      earned: totals.earned 
    });

    const fileId = uuidv4();
    const excelPath = path.join(__dirname, `../exports/annual-summary-${fileId}.xlsx`);

    console.log('Annual Summary - Starting Excel generation:', { fileId, excelPath });



    // Process data for Excel generation
    // ===== Excel Generation =====
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Annual Summary');

    // Company Header
    sheet.mergeCells('A1:T1');
    sheet.getCell('A1').value = 'Betcha by Homie House';
    sheet.getCell('A1').alignment = { horizontal: 'center' };
    sheet.getCell('A1').font = { bold: true, size: 18 };

    sheet.mergeCells('A2:T2');
    sheet.getCell('A2').value = 'betcha-booking@gmail.com';
    sheet.getCell('A2').alignment = { horizontal: 'center' };
    sheet.getCell('A2').font = { size: 12 };

    // Report Title and Date Range
    sheet.mergeCells('A4:T4');
    sheet.getCell('A4').value = 'Annual Summary Report';
    sheet.getCell('A4').alignment = { horizontal: 'center' };
    sheet.getCell('A4').font = { bold: true, size: 16 };

    sheet.mergeCells('A5:T5');
    sheet.getCell('A5').value = `Year ${year}`;
    sheet.getCell('A5').alignment = { horizontal: 'center' };
    sheet.getCell('A5').font = { bold: true, size: 14 };

    sheet.mergeCells('A6:T6');
    sheet.getCell('A6').value = `Period: ${dateRange}`;
    sheet.getCell('A6').alignment = { horizontal: 'center' };
    sheet.getCell('A6').font = { size: 12 };

    // Processed By and Generated On
    if (processedBy) {
      sheet.getCell('A8').value = `Processed by: ${processedBy}`;
      sheet.getCell('A8').alignment = { horizontal: 'left' };
      sheet.getCell('A8').font = { size: 10 };
    }
    sheet.getCell('A9').value = `Generated on: ${moment().tz('Asia/Manila').format('MMMM D, YYYY [at] h:mm A')}`;
    sheet.getCell('A9').alignment = { horizontal: 'left' };
    sheet.getCell('A9').font = { size: 10 };

    // Add table labels (Annual has 12 months, so last column is T)
    sheet.mergeCells('A10:F10');
    sheet.getCell('A10').value = 'Summary';
    sheet.getCell('A10').alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getCell('A10').font = { bold: true, size: 13 };

    sheet.mergeCells('H10:T10');
    sheet.getCell('H10').value = 'Booking Breakdown Dates';
    sheet.getCell('H10').alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getCell('H10').font = { bold: true, size: 13 };

    // Table Headers
    const headerRow = 11;
    sheet.getCell(`A${headerRow}`).value = 'Property Name';
    sheet.getCell(`B${headerRow}`).value = 'Bookings';
    sheet.getCell(`C${headerRow}`).value = 'Cancelled';
    sheet.getCell(`D${headerRow}`).value = 'Refund';
    sheet.getCell(`E${headerRow}`).value = 'Total';
    sheet.getCell(`F${headerRow}`).value = 'Earned';
    
    // Style main table headers with green background and white text
    for (let col of ['A', 'B', 'C', 'D', 'E', 'F']) {
      sheet.getCell(`${col}${headerRow}`).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getCell(`${col}${headerRow}`).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF147B42' }
      };
      sheet.getCell(`${col}${headerRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
    }

    resultList.forEach(row => {
      const r = [
        row.propertyName, 
        row.bookings, 
        row.cancelled,
        row.refund,
        row.total,
        row.earned
      ];
      const added = sheet.addRow(r);
      // Format numeric and currency columns
      added.getCell(2).numFmt = '#,##0'; // Bookings column
      added.getCell(3).numFmt = '#,##0'; // Cancelled column
      added.getCell(4).numFmt = '"PHP "#,##0.00'; // Refund column
      added.getCell(5).numFmt = '"PHP "#,##0.00'; // Total column
      added.getCell(6).numFmt = '"PHP "#,##0.00'; // Earned column
      
      // Make TOTAL row bold (ANNUAL SUMMARY)
      if (row.propertyName === 'TOTAL') {
        for (let colNum = 1; colNum <= 6; colNum++) {
          added.getCell(colNum).font = { bold: true };
        }
      }
    });

    const totalRows = sheet.rowCount;
    for (let i = headerRow; i <= totalRows; i++) {
      for (let j = 1; j <= 6; j++) {
        const cell = sheet.getCell(i, j);
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      }
    }

    // Create annual monthly breakdown data (12 months)
    const annualMonthlyBreakdownExcel = {};
    allProperties.forEach(prop => {
      annualMonthlyBreakdownExcel[prop.name] = {};
      for (let monthOffset = 0; monthOffset < 12; monthOffset++) {
        const monthStart = start.clone().add(monthOffset, 'months');
        const monthName = monthStart.format('MMM'); // Jan, Feb, etc.
        annualMonthlyBreakdownExcel[prop.name][monthName] = 0;
      }
    });

    // Calculate annual monthly bookings
    bookings.forEach(booking => {
      const propertyName = booking.propertyName;
      if (!annualMonthlyBreakdownExcel[propertyName]) return;

      booking.datesOfBooking.forEach(date => {
        const bookingDate = moment(date);
        if (bookingDate.isBetween(start, end, null, '[]')) {
          const monthName = bookingDate.format('MMM');
          if (annualMonthlyBreakdownExcel[propertyName][monthName] !== undefined) {
            annualMonthlyBreakdownExcel[propertyName][monthName]++;
          }
        }
      });
    });

    // Set column widths (include spacer and monthly breakdown columns - 12 months)
    sheet.columns = [
      { key: 'propertyName', width: 25 },
      { key: 'bookings', width: 12 },
      { key: 'cancelled', width: 12 },
      { key: 'refund', width: 15 },
      { key: 'total', width: 15 },
      { key: 'earned', width: 18 },
      { key: 'spacer', width: 2 },
      { key: 'monthlyProperty', width: 25 },
      { key: 'month1', width: 10 },
      { key: 'month2', width: 10 },
      { key: 'month3', width: 10 },
      { key: 'month4', width: 10 },
      { key: 'month5', width: 10 },
      { key: 'month6', width: 10 },
      { key: 'month7', width: 10 },
      { key: 'month8', width: 10 },
      { key: 'month9', width: 10 },
      { key: 'month10', width: 10 },
      { key: 'month11', width: 10 },
      { key: 'month12', width: 10 }
    ];

    // Add monthly breakdown headers (row 11, columns H to T)
    const monthlyHeaderRow = 11;
    sheet.getCell(`H${monthlyHeaderRow}`).value = 'Property Name';
    sheet.getCell(`H${monthlyHeaderRow}`).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getCell(`H${monthlyHeaderRow}`).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF147B42' }
    };
    sheet.getCell(`H${monthlyHeaderRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getCell(`H${monthlyHeaderRow}`).border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };

    for (let monthOffset = 0; monthOffset < 12; monthOffset++) {
      const monthStart = start.clone().add(monthOffset, 'months');
      const colLetter = String.fromCharCode(73 + monthOffset); // I, J, K, ... T
      sheet.getCell(`${colLetter}${monthlyHeaderRow}`).value = monthStart.format('MMM');
      sheet.getCell(`${colLetter}${monthlyHeaderRow}`).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getCell(`${colLetter}${monthlyHeaderRow}`).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF147B42' }
      };
      sheet.getCell(`${colLetter}${monthlyHeaderRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
      sheet.getCell(`${colLetter}${monthlyHeaderRow}`).border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    }

    // Add date ranges below month headers (row 12) for ANNUAL
    const annualDateRangeRow = 12;
    for (let monthOffset = 0; monthOffset < 12; monthOffset++) {
      const monthStart = start.clone().add(monthOffset, 'months').startOf('month');
      const monthEnd = start.clone().add(monthOffset, 'months').endOf('month');
      const colLetter = String.fromCharCode(73 + monthOffset); // I, J, K, ... T
      const dateLabel = `(${monthStart.format('MMM D')}-${monthEnd.format('D')})`;
      sheet.getCell(`${colLetter}${annualDateRangeRow}`).value = dateLabel;
      sheet.getCell(`${colLetter}${annualDateRangeRow}`).font = { size: 9, italic: true };
      sheet.getCell(`${colLetter}${annualDateRangeRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
      sheet.getCell(`${colLetter}${annualDateRangeRow}`).border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    }
    
    // Property Name column for date range row
    sheet.getCell(`H${annualDateRangeRow}`).value = '';
    sheet.getCell(`H${annualDateRangeRow}`).border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };

    // Add monthly breakdown data rows (starting from row 13, column H)
    let monthlyDataRow = 13;
    Object.entries(annualMonthlyBreakdownExcel).forEach(([propertyName, months]) => {
      sheet.getCell(`H${monthlyDataRow}`).value = propertyName;
      sheet.getCell(`H${monthlyDataRow}`).border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };

      for (let monthOffset = 0; monthOffset < 12; monthOffset++) {
        const monthStart = start.clone().add(monthOffset, 'months');
        const monthName = monthStart.format('MMM');
        const colLetter = String.fromCharCode(73 + monthOffset);
        sheet.getCell(`${colLetter}${monthlyDataRow}`).value = months[monthName] || 0;
        sheet.getCell(`${colLetter}${monthlyDataRow}`).numFmt = '#,##0';
        sheet.getCell(`${colLetter}${monthlyDataRow}`).border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      }
      
      monthlyDataRow++;
    });

    await workbook.xlsx.writeFile(excelPath);

    console.log('Annual Summary - Excel generation completed');
    console.log('Annual Summary - Excel file created:', { excelPath });

    // Cleanup Excel file after 10 minutes
    setTimeout(() => {
      console.log('Annual Summary - Cleaning up Excel file:', { excelPath });
      fs.unlink(excelPath, err => err && console.error('Excel delete error', err));
    }, 600000);

    console.log('Annual Summary - Sending response with Excel file link');
    return res.json({
      message: `Annual Summary for ${year}`,
      excelLink: `/exports/annual-summary-${fileId}.xlsx`
    });

  } catch (error) {
    console.error("Annual summary generation failed:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
