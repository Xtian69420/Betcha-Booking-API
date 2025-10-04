const mongoose = require('mongoose');
const Booking = require('../models/bookingModel');
const Property = require('../models/propertyModel');

const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment-timezone');

const addFooter = (doc, processedBy) => {
  const pageHeight = doc.page.height;
  const marginBottom = doc.page.margins.bottom;
  const footerY = pageHeight - marginBottom - 25; 
  
  const currentX = doc.x;
  const currentY = doc.y;
  const currentFontSize = doc._fontSize;

  doc.fontSize(8);
  if (processedBy) {
    doc.text(`Processed by: ${processedBy}`, doc.page.margins.left, footerY);
  }
  doc.text(`Generated on: ${moment().tz('Asia/Manila').format('MMMM D, YYYY [at] h:mm A')}`, doc.page.margins.left, footerY + 10);

  const pageWidth = doc.page.width;
  const marginRight = doc.page.margins.right;
  const pageNumber = doc._pageBuffer.length + 1;
  doc.text(`Page ${pageNumber}`, pageWidth - marginRight - 50, footerY + 5, { align: 'right' });

  doc.x = currentX;
  doc.y = currentY;
  doc.fontSize(currentFontSize);
};

const setupAutoFooter = (doc, processedBy) => {

  addFooter(doc, processedBy);

  const originalAddPage = doc.addPage.bind(doc);
  doc.addPage = function(options) {
    const result = originalAddPage(options);
    addFooter(this, processedBy);
    return result;
  };
};

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
    const { week, month, year, processedBy } = req.body;
    if (!week || !month || !year) {
      return res.status(400).json({ message: "Please provide week, month, and year." });
    }

    const momentDate = moment.tz({ year, month: month - 1, day: 1 }, 'Asia/Manila');
    const startOfWeek = momentDate.clone().add((week - 1) * 7, 'days').startOf('day');
    const endOfWeek = startOfWeek.clone().add(6, 'days').endOf('day');

    const [allProperties, bookings] = await Promise.all([
      Property.find({}, 'name packagePrice additionalPax'), // Get property details
      Booking.find({
        datesOfBooking: { $elemMatch: { $gte: startOfWeek.toDate(), $lte: endOfWeek.toDate() } },
        status: { $in: ['Checked-Out', 'Completed', 'Fully-Paid', 'Reserved'] }
      })
    ]);

    const propertyMap = {};
    allProperties.forEach(prop => {
      propertyMap[prop.name] = {
        packagePrice: prop.packagePrice,
        additionalPaxPrice: prop.additionalPax
      };
    });

    const summaryMap = {};
    allProperties.forEach(prop => {
      summaryMap[prop.name] = {
        bookings: 0,
        price: prop.packagePrice,
        addPax: 0,
        addPaxPrice: prop.additionalPax,
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
      
      summaryMap[name].bookings += bookingDatesInWeek;
      summaryMap[name].addPax += booking.additionalPax || 0;

      const packageEarnings = bookingDatesInWeek * summaryMap[name].price;
      const addPaxEarnings = (booking.additionalPax || 0) * summaryMap[name].addPaxPrice;
      summaryMap[name].earned += packageEarnings + addPaxEarnings;
    });

    const earningsList = Object.entries(summaryMap).map(([propertyName, data]) => ({
      propertyName,
      bookings: data.bookings,
      price: data.price,
      addPax: data.addPax,
      addPaxPrice: data.addPaxPrice,
      earned: data.earned
    }));

    const totals = earningsList.reduce((acc, entry) => ({
      bookings: acc.bookings + entry.bookings,
      addPax: acc.addPax + entry.addPax,
      earned: acc.earned + entry.earned
    }), { bookings: 0, addPax: 0, earned: 0 });

    earningsList.push({ 
      propertyName: 'TOTAL', 
      bookings: totals.bookings,
      price: '-',
      addPax: totals.addPax,
      addPaxPrice: '-',
      earned: totals.earned 
    });

    const fileId = uuidv4();
    const pdfPath = path.join(__dirname, `../exports/week-summary-${fileId}.pdf`);
    const excelPath = path.join(__dirname, `../exports/week-summary-${fileId}.xlsx`);

    const dateRange = `${startOfWeek.format('MMMM D, YYYY')} to ${endOfWeek.format('MMMM D, YYYY')}`;

    // ====== PDF GENERATION ======
    const doc = new PDFDocument({ margin: 40, size: [500, 1000], layout: 'landscape' });
    doc.pipe(fs.createWriteStream(pdfPath));

    const logoPath = path.join(__dirname, '../icon-betcha.png');
    if (fs.existsSync(logoPath)) {
      const logoSize = 30;
      const logoX = doc.page.margins.left;
      const logoY = doc.y;
      doc.image(logoPath, logoX, logoY, { width: logoSize, height: logoSize });

      doc.fontSize(24).text("Betcha by Homie House", logoX + logoSize + 10, logoY + 5);
      doc.fontSize(12).text("betcha-booking@gmail.com", logoX + logoSize + 10, logoY + 25);
      doc.y = logoY + logoSize + 10;
    } else {

      doc.fontSize(24).text("Betcha by Homie House", { align: 'center' });
      doc.fontSize(12).text("betcha-booking@gmail.com", { align: 'center' });
    }
    doc.moveDown(1);

    doc.fontSize(18).text(`Week ${week} Summary Report`, { align: 'center' });
    doc.fontSize(14).text(`${moment().month(month - 1).format('MMMM')} ${year}`, { align: 'center' });
    doc.fontSize(12).text(`Period: ${dateRange}`, { align: 'center' });
    doc.moveDown(2);

    setupAutoFooter(doc, processedBy);

    const columnWidths = [150, 80, 80, 80, 80, 100]; 
    const totalTableWidth = columnWidths.reduce((a, b) => a + b, 0);
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const tableX = doc.page.margins.left + (pageWidth - totalTableWidth) / 2;
    const cellHeight = 25;
    const cellPadding = 5;

    let y = doc.y;
    doc.fontSize(10);

    const drawTableHeader = () => {
    let x = tableX;
    const headers = ["Property Name", "Bookings", "Price", "Add-Pax", "Add-Pax Price", "Earned"];

    doc.font('Helvetica-Bold');
    
    headers.forEach((header, index) => {
        doc.rect(x, y, columnWidths[index], cellHeight).stroke();
        doc.text(header, x + cellPadding, y + cellPadding, {
            width: columnWidths[index] - 2 * cellPadding
        });
        x += columnWidths[index];
    });

    doc.font('Helvetica');
    y += cellHeight;
    };

    drawTableHeader();

    let rowCount = 0;
    earningsList.forEach((row, index) => {
    if (rowCount === 10) {
        doc.addPage({ margin: 40, size: [500, 1000], layout: 'landscape' });

        if (fs.existsSync(logoPath)) {
          const logoSize = 30;
          const logoX = doc.page.margins.left;
          const logoY = doc.y;
          doc.image(logoPath, logoX, logoY, { width: logoSize, height: logoSize });

          doc.fontSize(24).text("Betcha by Homie House", logoX + logoSize + 10, logoY + 5);
          doc.fontSize(12).text("betcha-booking@gmail.com", logoX + logoSize + 10, logoY + 25);
          doc.y = logoY + logoSize + 10;
        } else {
          doc.fontSize(24).text("Betcha by Homie House", { align: 'center' });
          doc.fontSize(12).text("betcha-booking@gmail.com", { align: 'center' });
        }
        doc.moveDown(1);
        doc.fontSize(18).text(`Week ${week} Summary Report`, { align: 'center' });
        doc.fontSize(14).text(`${moment().month(month - 1).format('MMMM')} ${year}`, { align: 'center' });
        doc.fontSize(12).text(`Period: ${dateRange}`, { align: 'center' });
        doc.moveDown(2);
        y = doc.y;
        doc.fontSize(10);
        drawTableHeader();
        rowCount = 0;
    }

    let x = tableX;
    
    const rowData = [
        row.propertyName,
        row.bookings.toLocaleString(),
        typeof row.price === 'number' ? `PHP ${row.price.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : row.price,
        row.addPax.toLocaleString(),
        typeof row.addPaxPrice === 'number' ? `PHP ${row.addPaxPrice.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : row.addPaxPrice,
        `PHP ${row.earned.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`
    ];

    if (row.propertyName === 'TOTAL') {
        doc.font('Helvetica-Bold');
    }

    rowData.forEach((data, colIndex) => {
        doc.rect(x, y, columnWidths[colIndex], cellHeight).stroke();
        doc.text(data, x + cellPadding, y + cellPadding, {
            width: columnWidths[colIndex] - 2 * cellPadding
        });
        x += columnWidths[colIndex];
    });

    if (row.propertyName === 'TOTAL') {
        doc.font('Helvetica');
    }

    y += cellHeight;
    rowCount++;
    });

    doc.addPage({ margin: 40, size: [500, 1000], layout: 'landscape' });

    const weeklyPdfLogoPath = path.join(__dirname, '../icon-betcha.png');
    if (fs.existsSync(weeklyPdfLogoPath)) {
      const logoSize = 30;
      const logoX = doc.page.margins.left;
      const logoY = doc.y;
      doc.image(weeklyPdfLogoPath, logoX, logoY, { width: logoSize, height: logoSize });

      doc.fontSize(24).text("Betcha by Homie House", logoX + logoSize + 10, logoY + 5);
      doc.fontSize(12).text("betcha-booking@gmail.com", logoX + logoSize + 10, logoY + 25);
      doc.y = logoY + logoSize + 10;
    } else {
      doc.fontSize(24).text("Betcha by Homie House", { align: 'center' });
      doc.fontSize(12).text("betcha-booking@gmail.com", { align: 'center' });
    }
    doc.moveDown(1);
    doc.fontSize(18).text(`Week ${week} Summary Report - Daily Breakdown`, { align: 'center' });
    doc.fontSize(14).text(`${moment().month(month - 1).format('MMMM')} ${year}`, { align: 'center' });
    doc.fontSize(12).text(`Period: ${dateRange}`, { align: 'center' });
    doc.moveDown(2);

    const dailyBreakdownPdf = {};
    earningsList.forEach(prop => {
      if (prop.propertyName !== 'TOTAL') {
        dailyBreakdownPdf[prop.propertyName] = {
          'Monday': 0, 'Tuesday': 0, 'Wednesday': 0, 'Thursday': 0,
          'Friday': 0, 'Saturday': 0, 'Sunday': 0
        };
      }
    });

    const weekStartPdf = startOfWeek.clone();
    const weekEndPdf = endOfWeek.clone();
    
    bookings.forEach(booking => {
      const propertyName = booking.propertyName;
      if (!dailyBreakdownPdf[propertyName]) return;

      booking.datesOfBooking.forEach(date => {
        const bookingDate = moment(date);
        if (bookingDate.isBetween(weekStartPdf, weekEndPdf, null, '[]')) {
          const dayName = bookingDate.format('dddd');
          if (dailyBreakdownPdf[propertyName][dayName] !== undefined) {
            dailyBreakdownPdf[propertyName][dayName]++;
          }
        }
      });
    });

    const dailyColumnWidths = [120, 70, 70, 70, 70, 70, 70, 70]; 
    const dailyTableWidth = dailyColumnWidths.reduce((a, b) => a + b, 0);
    const dailyPageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const dailyTableX = doc.page.margins.left + (dailyPageWidth - dailyTableWidth) / 2;
    const dailyCellHeight = 25;
    const dailyCellPadding = 5;

    let dailyY = doc.y;
    doc.fontSize(10);

    const dailyHeadersPdf = ['Property Name', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    doc.font('Helvetica-Bold');
    let dailyX = dailyTableX;
    dailyHeadersPdf.forEach((header, index) => {
      doc.rect(dailyX, dailyY, dailyColumnWidths[index], dailyCellHeight).stroke();
      doc.text(header, dailyX + dailyCellPadding, dailyY + dailyCellPadding, {
        width: dailyColumnWidths[index] - 2 * dailyCellPadding
      });
      dailyX += dailyColumnWidths[index];
    });

    doc.font('Helvetica');
    dailyY += dailyCellHeight;

    Object.entries(dailyBreakdownPdf).forEach(([propertyName, days]) => {
      dailyX = dailyTableX;
      
      const dailyRowData = [propertyName, days.Monday.toLocaleString(), days.Tuesday.toLocaleString(), 
                           days.Wednesday.toLocaleString(), days.Thursday.toLocaleString(),
                           days.Friday.toLocaleString(), days.Saturday.toLocaleString(), days.Sunday.toLocaleString()];

      dailyRowData.forEach((data, colIndex) => {
        doc.rect(dailyX, dailyY, dailyColumnWidths[colIndex], dailyCellHeight).stroke();
        doc.text(data, dailyX + dailyCellPadding, dailyY + dailyCellPadding, {
          width: dailyColumnWidths[colIndex] - 2 * dailyCellPadding
        });
        dailyX += dailyColumnWidths[colIndex];
      });
      
      dailyY += dailyCellHeight;
    });

    doc.end();


    // ====== EXCEL GENERATION ======
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Week Summary');

    const excelLogoPath = path.join(__dirname, '../icon-betcha.png');
    if (fs.existsSync(excelLogoPath)) {
      const logoId = workbook.addImage({
        filename: excelLogoPath,
        extension: 'png',
      });
      sheet.addImage(logoId, {
        tl: { col: 0.5, row: 0 },
        ext: { width: 60, height: 60 }
      });
    }

    sheet.mergeCells('A3:F3');
    sheet.getCell('A3').value = 'Betcha by Homie House';
    sheet.getCell('A3').alignment = { horizontal: 'center' };
    sheet.getCell('A3').font = { bold: true, size: 18 };

    sheet.mergeCells('A4:F4');
    sheet.getCell('A4').value = 'betcha-booking@gmail.com';
    sheet.getCell('A4').alignment = { horizontal: 'center' };
    sheet.getCell('A4').font = { size: 12 };

    sheet.mergeCells('A6:F6');
    sheet.getCell('A6').value = `Week ${week} Summary Report`;
    sheet.getCell('A6').alignment = { horizontal: 'center' };
    sheet.getCell('A6').font = { bold: true, size: 16 };

    sheet.mergeCells('A7:F7');
    sheet.getCell('A7').value = `${moment().month(month - 1).format('MMMM')} ${year}`;
    sheet.getCell('A7').alignment = { horizontal: 'center' };
    sheet.getCell('A7').font = { bold: true, size: 14 };

    sheet.mergeCells('A8:F8');
    sheet.getCell('A8').value = `Period: ${dateRange}`;
    sheet.getCell('A8').alignment = { horizontal: 'center' };
    sheet.getCell('A8').font = { size: 12 };

    if (processedBy) {
      sheet.getCell('F10').value = `Processed by: ${processedBy}`;
      sheet.getCell('F10').alignment = { horizontal: 'right' };
      sheet.getCell('F10').font = { size: 10 };
    }
    sheet.getCell('F11').value = `Generated on: ${moment().tz('Asia/Manila').format('MMMM D, YYYY [at] h:mm A')}`;
    sheet.getCell('F11').alignment = { horizontal: 'right' };
    sheet.getCell('F11').font = { size: 10 };

    const headerRow = 13;
    sheet.addRow([]);
    sheet.getCell(`A${headerRow}`).value = 'Property Name';
    sheet.getCell(`B${headerRow}`).value = 'Bookings';
    sheet.getCell(`C${headerRow}`).value = 'Price';
    sheet.getCell(`D${headerRow}`).value = 'Add-Pax';
    sheet.getCell(`E${headerRow}`).value = 'Add-Pax Price';
    sheet.getCell(`F${headerRow}`).value = 'Earned';
    sheet.getRow(headerRow).font = { bold: true };

    earningsList.forEach((row, index) => {
      const newRow = sheet.addRow([
        row.propertyName, 
        row.bookings,
        typeof row.price === 'number' ? row.price : row.price,
        row.addPax,
        typeof row.addPaxPrice === 'number' ? row.addPaxPrice : row.addPaxPrice,
        row.earned
      ]);                                                                                                                                                                                                                                                                                                                 
      newRow.getCell(2).numFmt = '#,##0';
      newRow.getCell(3).numFmt = '"PHP "#,##0.00'; 
      newRow.getCell(4).numFmt = '#,##0'; 
      newRow.getCell(5).numFmt = '"PHP "#,##0.00'; 
      newRow.getCell(6).numFmt = '"PHP "#,##0.00'; 
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
      { key: 'price', width: 15 },
      { key: 'addPax', width: 12 },
      { key: 'addPaxPrice', width: 15 },
      { key: 'earned', width: 18 }
    ];

    const dailyStartRow = sheet.rowCount + 3;
    sheet.addRow([]);
    sheet.addRow([]);
    
    sheet.mergeCells(`A${dailyStartRow}:H${dailyStartRow}`);
    sheet.getCell(`A${dailyStartRow}`).value = 'Daily Breakdown (Mon-Sun)';
    sheet.getCell(`A${dailyStartRow}`).alignment = { horizontal: 'center' };
    sheet.getCell(`A${dailyStartRow}`).font = { bold: true, size: 14 };

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
          const dayName = bookingDate.format('dddd'); // Monday, Tuesday, etc.
          if (dailyBreakdown[propertyName][dayName] !== undefined) {
            dailyBreakdown[propertyName][dayName]++;
          }
        }
      });
    });

    const dailyHeaderRow = dailyStartRow + 2;
    const dailyHeadersExcel = ['Property Name', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const dailyHeaders = sheet.addRow(dailyHeadersExcel);
    dailyHeaders.font = { bold: true };

    // Daily breakdown data rows
    Object.entries(dailyBreakdown).forEach(([propertyName, days]) => {
      const dailyData = [propertyName, days.Monday, days.Tuesday, days.Wednesday, days.Thursday, days.Friday, days.Saturday, days.Sunday];
      const dailyRow = sheet.addRow(dailyData);
      // Format day columns with number formatting (columns 2-8)
      for (let col = 2; col <= 8; col++) {
        dailyRow.getCell(col).numFmt = '#,##0';
      }
    });

    // Add borders to daily breakdown table
    const dailyEndRow = sheet.rowCount;
    for (let i = dailyHeaderRow; i <= dailyEndRow; i++) {
      for (let j = 1; j <= 8; j++) {
        const cell = sheet.getCell(i, j);
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
    const { month, year, processedBy } = req.body;
    if (!month || !year) {
      return res.status(400).json({ message: "Please provide month and year." });
    }

    const firstDay = moment.tz({ year, month: month - 1, day: 1 }, 'Asia/Manila').startOf('day');
    const lastDay = firstDay.clone().endOf('month');

    // Date range for display
    const dateRange = `${firstDay.format('MMMM D, YYYY')} to ${lastDay.format('MMMM D, YYYY')}`;

    const [allProperties, bookings] = await Promise.all([
      Property.find({}, 'name packagePrice additionalPax'), // Get property details
      Booking.find({
        datesOfBooking: { $elemMatch: { $gte: firstDay.toDate(), $lte: lastDay.toDate() } },
        status: { $in: ['Checked-Out', 'Completed', 'Fully-Paid', 'Reserved'] }
      })
    ]);

    // Create property lookup map
    const propertyMap = {};
    allProperties.forEach(prop => {
      propertyMap[prop.name] = {
        packagePrice: prop.packagePrice,
        additionalPaxPrice: prop.additionalPax
      };
    });

    const summaryMap = {};
    allProperties.forEach(prop => {
      summaryMap[prop.name] = {
        bookings: 0,
        price: prop.packagePrice,
        addPax: 0,
        addPaxPrice: prop.additionalPax,
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
      
      summaryMap[name].bookings += bookingDatesInMonth;
      summaryMap[name].addPax += booking.additionalPax || 0;
      
      // Calculate earnings: (booking dates * package price) + (additional pax * additional pax price)
      const packageEarnings = bookingDatesInMonth * summaryMap[name].price;
      const addPaxEarnings = (booking.additionalPax || 0) * summaryMap[name].addPaxPrice;
      summaryMap[name].earned += packageEarnings + addPaxEarnings;
    });

    const resultList = Object.entries(summaryMap).map(([propertyName, data]) => ({
      propertyName,
      bookings: data.bookings,
      price: data.price,
      addPax: data.addPax,
      addPaxPrice: data.addPaxPrice,
      earned: data.earned
    }));

    const totals = resultList.reduce((acc, entry) => ({
      bookings: acc.bookings + entry.bookings,
      addPax: acc.addPax + entry.addPax,
      earned: acc.earned + entry.earned
    }), { bookings: 0, addPax: 0, earned: 0 });

    resultList.push({ 
      propertyName: 'TOTAL', 
      bookings: totals.bookings,
      price: '-',
      addPax: totals.addPax,
      addPaxPrice: '-',
      earned: totals.earned 
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

    // Company Header with Logo
    const monthPdfLogoPath = path.join(__dirname, '../icon-betcha.png');
    if (fs.existsSync(monthPdfLogoPath)) {
      const logoSize = 30;
      const logoX = doc.page.margins.left;
      const logoY = doc.y;
      doc.image(monthPdfLogoPath, logoX, logoY, { width: logoSize, height: logoSize });
      
      // Position text next to logo
      doc.fontSize(24).text("Betcha by Homie House", logoX + logoSize + 10, logoY + 5);
      doc.fontSize(12).text("betcha-booking@gmail.com", logoX + logoSize + 10, logoY + 25);
      doc.y = logoY + logoSize + 10;
    } else {
      // Fallback without logo
      doc.fontSize(24).text("Betcha by Homie House", { align: 'center' });
      doc.fontSize(12).text("betcha-booking@gmail.com", { align: 'center' });
    }
    doc.moveDown(1);
    
    // Report Title and Date Range
    doc.fontSize(18).text("Monthly Summary Report", { align: 'center' });
    doc.fontSize(14).text(`${moment().month(month - 1).format('MMMM')} ${year}`, { align: 'center' });
    doc.fontSize(12).text(`Period: ${dateRange}`, { align: 'center' });
    doc.moveDown(2);
    
    // Setup automatic footer for all pages
    setupAutoFooter(doc, processedBy);

    const columnWidths = [150, 80, 80, 80, 80, 100]; // Property Name, Bookings, Price, Add-Pax, Add-Pax Price, Earned
    const totalTableWidth = columnWidths.reduce((a, b) => a + b, 0);
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const tableX = doc.page.margins.left + (pageWidth - totalTableWidth) / 2;
    const cellHeight = 25;
    const cellPadding = 5;

    // Table Header Drawer
    let y = doc.y;
    doc.fontSize(10);
    const drawTableHeader = () => {
      let x = tableX;
      const headers = ["Property Name", "Bookings", "Price", "Add-Pax", "Add-Pax Price", "Earned"];
      
      // Set bold font for headers
      doc.font('Helvetica-Bold');
      
      headers.forEach((header, index) => {
          doc.rect(x, y, columnWidths[index], cellHeight).stroke();
          doc.text(header, x + cellPadding, y + cellPadding, {
              width: columnWidths[index] - 2 * cellPadding
          });
          x += columnWidths[index];
      });

      // Reset to normal font
      doc.font('Helvetica');
      y += cellHeight;
    };

    drawTableHeader();

    let rowCount = 0;
    resultList.forEach((row, i) => {
      if (rowCount === 10) {
          doc.addPage({ margin: 40, size: [500, 1000], layout: 'landscape' });
          // Repeat header on new page with logo
          if (fs.existsSync(monthPdfLogoPath)) {
            const logoSize = 30;
            const logoX = doc.page.margins.left;
            const logoY = doc.y;
            doc.image(monthPdfLogoPath, logoX, logoY, { width: logoSize, height: logoSize });
            
            // Position text next to logo
            doc.fontSize(24).text("Betcha by Homie House", logoX + logoSize + 10, logoY + 5);
            doc.fontSize(12).text("betcha-booking@gmail.com", logoX + logoSize + 10, logoY + 25);
            doc.y = logoY + logoSize + 10;
          } else {
            doc.fontSize(24).text("Betcha by Homie House", { align: 'center' });
            doc.fontSize(12).text("betcha-booking@gmail.com", { align: 'center' });
          }
          doc.moveDown(1);
          doc.fontSize(18).text("Monthly Summary Report", { align: 'center' });
          doc.fontSize(14).text(`${moment().month(month - 1).format('MMMM')} ${year}`, { align: 'center' });
          doc.fontSize(12).text(`Period: ${dateRange}`, { align: 'center' });
          doc.moveDown(2);
          y = doc.y;
          doc.fontSize(10);
          drawTableHeader();
          rowCount = 0;
      }

      let x = tableX;
      
      const rowData = [
          row.propertyName,
          row.bookings.toLocaleString(),
          typeof row.price === 'number' ? `PHP ${row.price.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : row.price,
          row.addPax.toLocaleString(),
          typeof row.addPaxPrice === 'number' ? `PHP ${row.addPaxPrice.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : row.addPaxPrice,
          `PHP ${row.earned.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`
      ];

      // Set bold font for TOTAL row
      if (row.propertyName === 'TOTAL') {
          doc.font('Helvetica-Bold');
      }

      rowData.forEach((data, colIndex) => {
          doc.rect(x, y, columnWidths[colIndex], cellHeight).stroke();
          doc.text(data, x + cellPadding, y + cellPadding, {
              width: columnWidths[colIndex] - 2 * cellPadding
          });
          x += columnWidths[colIndex];
      });

      // Reset to normal font after TOTAL row
      if (row.propertyName === 'TOTAL') {
          doc.font('Helvetica');
      }
      
      y += cellHeight;
      rowCount++;
    });

    // Add Weekly Breakdown Section for Monthly Report
    doc.addPage({ margin: 40, size: [800, 1000], layout: 'landscape' });
    
    // Repeat header on new page with logo
    const monthlyPdfLogoPath = path.join(__dirname, '../icon-betcha.png');
    if (fs.existsSync(monthlyPdfLogoPath)) {
      const logoSize = 30;
      const logoX = doc.page.margins.left;
      const logoY = doc.y;
      doc.image(monthlyPdfLogoPath, logoX, logoY, { width: logoSize, height: logoSize });
      
      // Position text next to logo
      doc.fontSize(24).text("Betcha by Homie House", logoX + logoSize + 10, logoY + 5);
      doc.fontSize(12).text("betcha-booking@gmail.com", logoX + logoSize + 10, logoY + 25);
      doc.y = logoY + logoSize + 10;
    } else {
      doc.fontSize(24).text("Betcha by Homie House", { align: 'center' });
      doc.fontSize(12).text("betcha-booking@gmail.com", { align: 'center' });
    }
    doc.moveDown(1);
    doc.fontSize(18).text(`Monthly Summary Report - Weekly Breakdown`, { align: 'center' });
    doc.fontSize(14).text(`${moment().month(month - 1).format('MMMM')} ${year}`, { align: 'center' });
    doc.fontSize(12).text(`Period: ${dateRange}`, { align: 'center' });
    doc.moveDown(2);

    // Create weekly breakdown data for PDF
    const weeklyBreakdownPdf = {};
    resultList.forEach(item => {
      if (item.propertyName !== 'TOTAL') {
        weeklyBreakdownPdf[item.propertyName] = {};
      }
    });

    // Get all weeks in the month for PDF
    const monthStartPdf = firstDay.clone();
    const monthEndPdf = lastDay.clone();
    const weeksInMonthPdf = [];
    
    let currentWeekStartPdf = monthStartPdf.clone().startOf('week');
    while (currentWeekStartPdf.isBefore(monthEndPdf) || currentWeekStartPdf.isSame(monthEndPdf)) {
      const weekEnd = currentWeekStartPdf.clone().endOf('week');
      const weekLabel = `Week ${currentWeekStartPdf.week()}`;
      weeksInMonthPdf.push({ label: weekLabel, start: currentWeekStartPdf.clone(), end: weekEnd.clone() });
      currentWeekStartPdf.add(1, 'week');
      
      // Initialize weekly data
      Object.keys(weeklyBreakdownPdf).forEach(propertyName => {
        weeklyBreakdownPdf[propertyName][weekLabel] = 0;
      });
    }

    // Calculate weekly bookings for monthly breakdown PDF
    bookings.forEach(booking => {
      const propertyName = booking.propertyName;
      if (!weeklyBreakdownPdf[propertyName]) return;

      booking.datesOfBooking.forEach(date => {
        const bookingDate = moment(date);
        if (bookingDate.isBetween(monthStartPdf, monthEndPdf, null, '[]')) {
          weeksInMonthPdf.forEach(week => {
            if (bookingDate.isBetween(week.start, week.end, null, '[]')) {
              weeklyBreakdownPdf[propertyName][week.label]++;
            }
          });
        }
      });
    });

    // Weekly breakdown table setup
    const weeklyColumnWidths = [150, ...Array(weeksInMonthPdf.length).fill(80)]; // Property Name + weeks
    const weeklyTableWidth = weeklyColumnWidths.reduce((a, b) => a + b, 0);
    const weeklyPageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const weeklyTableX = doc.page.margins.left + (weeklyPageWidth - weeklyTableWidth) / 2;
    const weeklyCellHeight = 25;
    const weeklyCellPadding = 5;

    let weeklyY = doc.y;
    doc.fontSize(10);

    // Draw weekly breakdown header
    const weeklyHeadersPdf = ['Property Name', ...weeksInMonthPdf.map(week => week.label)];

    let weeklyX = weeklyTableX;
    weeklyHeadersPdf.forEach((header, index) => {
      doc.rect(weeklyX, weeklyY, weeklyColumnWidths[index], weeklyCellHeight).stroke();
      doc.text(header, weeklyX + weeklyCellPadding, weeklyY + weeklyCellPadding, {
        width: weeklyColumnWidths[index] - 2 * weeklyCellPadding
      });
      weeklyX += weeklyColumnWidths[index];
    });
    weeklyY += weeklyCellHeight;

    // Draw weekly breakdown data
    Object.entries(weeklyBreakdownPdf).forEach(([propertyName, weeks]) => {
      weeklyX = weeklyTableX;
      
      const weeklyRowData = [propertyName, ...weeksInMonthPdf.map(week => weeks[week.label].toLocaleString())];

      weeklyRowData.forEach((data, colIndex) => {
        doc.rect(weeklyX, weeklyY, weeklyColumnWidths[colIndex], weeklyCellHeight).stroke();
        doc.text(data, weeklyX + weeklyCellPadding, weeklyY + weeklyCellPadding, {
          width: weeklyColumnWidths[colIndex] - 2 * weeklyCellPadding
        });
        weeklyX += weeklyColumnWidths[colIndex];
      });
      
      weeklyY += weeklyCellHeight;
    });

    doc.end();

    // ====== Generate Excel ======
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Month Summary');

    // Company Logo
    const monthExcelLogoPath = path.join(__dirname, '../icon-betcha.png');
    if (fs.existsSync(monthExcelLogoPath)) {
      const logoId = workbook.addImage({
        filename: monthExcelLogoPath,
        extension: 'png',
      });
      sheet.addImage(logoId, {
        tl: { col: 0.5, row: 0 },
        ext: { width: 60, height: 60 }
      });
    }

    // Company Header (moved down to accommodate logo)
    sheet.mergeCells('A3:F3');
    sheet.getCell('A3').value = 'Betcha by Homie House';
    sheet.getCell('A3').alignment = { horizontal: 'center' };
    sheet.getCell('A3').font = { bold: true, size: 18 };

    sheet.mergeCells('A4:F4');
    sheet.getCell('A4').value = 'betcha-booking@gmail.com';
    sheet.getCell('A4').alignment = { horizontal: 'center' };
    sheet.getCell('A4').font = { size: 12 };

    // Report Title and Date Range
    sheet.mergeCells('A6:F6');
    sheet.getCell('A6').value = 'Monthly Summary Report';
    sheet.getCell('A6').alignment = { horizontal: 'center' };
    sheet.getCell('A6').font = { bold: true, size: 16 };

    sheet.mergeCells('A7:F7');
    sheet.getCell('A7').value = `${moment().month(month - 1).format('MMMM')} ${year}`;
    sheet.getCell('A7').alignment = { horizontal: 'center' };
    sheet.getCell('A7').font = { bold: true, size: 14 };

    sheet.mergeCells('A8:F8');
    sheet.getCell('A8').value = `Period: ${dateRange}`;
    sheet.getCell('A8').alignment = { horizontal: 'center' };
    sheet.getCell('A8').font = { size: 12 };

    // Processed By and Generated On
    if (processedBy) {
      sheet.getCell('F10').value = `Processed by: ${processedBy}`;
      sheet.getCell('F10').alignment = { horizontal: 'right' };
      sheet.getCell('F10').font = { size: 10 };
    }
    sheet.getCell('F11').value = `Generated on: ${moment().tz('Asia/Manila').format('MMMM D, YYYY [at] h:mm A')}`;
    sheet.getCell('F11').alignment = { horizontal: 'right' };
    sheet.getCell('F11').font = { size: 10 };

    // Table Headers
    const headerRow = 13;
    sheet.addRow([]);
    sheet.getCell(`A${headerRow}`).value = 'Property Name';
    sheet.getCell(`B${headerRow}`).value = 'Bookings';
    sheet.getCell(`C${headerRow}`).value = 'Price';
    sheet.getCell(`D${headerRow}`).value = 'Add-Pax';
    sheet.getCell(`E${headerRow}`).value = 'Add-Pax Price';
    sheet.getCell(`F${headerRow}`).value = 'Earned';
    sheet.getRow(headerRow).font = { bold: true };

    resultList.forEach((row, index) => {
      const newRow = sheet.addRow([
        row.propertyName, 
        row.bookings,
        typeof row.price === 'number' ? row.price : row.price,
        row.addPax,
        typeof row.addPaxPrice === 'number' ? row.addPaxPrice : row.addPaxPrice,
        row.earned
      ]);
      newRow.getCell(2).numFmt = '#,##0'; // Bookings column
      newRow.getCell(3).numFmt = '"PHP "#,##0.00'; // Price column
      newRow.getCell(4).numFmt = '#,##0'; // Add-Pax column
      newRow.getCell(5).numFmt = '"PHP "#,##0.00'; // Add-Pax Price column
      newRow.getCell(6).numFmt = '"PHP "#,##0.00'; // Earned column
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
      { key: 'price', width: 15 },
      { key: 'addPax', width: 12 },
      { key: 'addPaxPrice', width: 15 },
      { key: 'earned', width: 18 }
    ];

    // Weekly Breakdown Section for Monthly Report
    const currentRowMonth = sheet.rowCount + 3;
    
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

    // Add weekly breakdown title
    sheet.mergeCells(`A${currentRowMonth}:${String.fromCharCode(65 + weeksInMonth.length)}${currentRowMonth}`);
    sheet.getCell(`A${currentRowMonth}`).value = 'Weekly Breakdown - Number of Bookings';
    sheet.getCell(`A${currentRowMonth}`).alignment = { horizontal: 'center' };
    sheet.getCell(`A${currentRowMonth}`).font = { bold: true, size: 14 };

    // Add weekly breakdown headers
    const weeklyHeaderRowMonth = currentRowMonth + 2;
    sheet.getCell(`A${weeklyHeaderRowMonth}`).value = 'Property Name';
    weeksInMonth.forEach((week, index) => {
      const colLetter = String.fromCharCode(66 + index); // B, C, D, etc.
      sheet.getCell(`${colLetter}${weeklyHeaderRowMonth}`).value = week.label;
    });
    
    // Style weekly headers
    for (let col = 0; col <= weeksInMonth.length; col++) {
      const cellAddress = String.fromCharCode(65 + col) + weeklyHeaderRowMonth;
      const cell = sheet.getCell(cellAddress);
      cell.font = { bold: true };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    }

    // Add weekly breakdown data
    let weeklyRowMonth = weeklyHeaderRowMonth + 1;
    Object.entries(weeklyBreakdownDataMonth).forEach(([propertyName, weeks]) => {
      sheet.getCell(`A${weeklyRowMonth}`).value = propertyName;
      weeksInMonth.forEach((week, index) => {
        const colLetter = String.fromCharCode(66 + index);
        sheet.getCell(`${colLetter}${weeklyRowMonth}`).value = weeks[week.label] || 0;
        sheet.getCell(`${colLetter}${weeklyRowMonth}`).numFmt = '#,##0';
      });
      
      // Style weekly data row
      for (let col = 0; col <= weeksInMonth.length; col++) {
        const cellAddress = String.fromCharCode(65 + col) + weeklyRowMonth;
        const cell = sheet.getCell(cellAddress);
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      }
      
      weeklyRowMonth++;
    });

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
      Property.find({}, 'name packagePrice additionalPax'), // Get property details
      Booking.find({
        datesOfBooking: { $elemMatch: { $gte: startDate.toDate(), $lte: endDate.toDate() } },
        status: { $in: ['Checked-Out', 'Completed', 'Fully-Paid', 'Reserved'] }
      })
    ]);

    // Create property lookup map
    const propertyMap = {};
    allProperties.forEach(prop => {
      propertyMap[prop.name] = {
        packagePrice: prop.packagePrice,
        additionalPaxPrice: prop.additionalPax
      };
    });

    const summaryMap = {};
    allProperties.forEach(prop => {
      summaryMap[prop.name] = {
        bookings: 0,
        price: prop.packagePrice,
        addPax: 0,
        addPaxPrice: prop.additionalPax,
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
      
      summaryMap[name].bookings += bookingDatesInQuarter;
      summaryMap[name].addPax += booking.additionalPax || 0;
      
      // Calculate earnings: (booking dates * package price) + (additional pax * additional pax price)
      const packageEarnings = bookingDatesInQuarter * summaryMap[name].price;
      const addPaxEarnings = (booking.additionalPax || 0) * summaryMap[name].addPaxPrice;
      summaryMap[name].earned += packageEarnings + addPaxEarnings;
    });

    const resultList = Object.entries(summaryMap).map(([propertyName, data]) => ({
      propertyName,
      bookings: data.bookings,
      price: data.price,
      addPax: data.addPax,
      addPaxPrice: data.addPaxPrice,
      earned: data.earned
    }));

    const totals = resultList.reduce((acc, entry) => ({
      bookings: acc.bookings + entry.bookings,
      addPax: acc.addPax + entry.addPax,
      earned: acc.earned + entry.earned
    }), { bookings: 0, addPax: 0, earned: 0 });

    resultList.push({ 
      propertyName: 'TOTAL', 
      bookings: totals.bookings,
      price: '-',
      addPax: totals.addPax,
      addPaxPrice: '-',
      earned: totals.earned 
    });

    const fileId = uuidv4();
    const pdfPath = path.join(__dirname, `../exports/quarter-summary-${fileId}.pdf`);
    const excelPath = path.join(__dirname, `../exports/quarter-summary-${fileId}.xlsx`);

    const doc = new PDFDocument({ margin: 40, size: [500, 1000], layout: 'landscape' });
    doc.pipe(fs.createWriteStream(pdfPath));

    // Company Header with Logo
    const quarterPdfLogoPath = path.join(__dirname, '../icon-betcha.png');
    if (fs.existsSync(quarterPdfLogoPath)) {
      const logoSize = 30;
      const logoX = doc.page.margins.left;
      const logoY = doc.y;
      doc.image(quarterPdfLogoPath, logoX, logoY, { width: logoSize, height: logoSize });
      
      // Position text next to logo
      doc.fontSize(24).text("Betcha by Homie House", logoX + logoSize + 10, logoY + 5);
      doc.fontSize(12).text("betcha-booking@gmail.com", logoX + logoSize + 10, logoY + 25);
      doc.y = logoY + logoSize + 10;
    } else {
      // Fallback without logo
      doc.fontSize(24).text("Betcha by Homie House", { align: 'center' });
      doc.fontSize(12).text("betcha-booking@gmail.com", { align: 'center' });
    }
    doc.moveDown(1);
    
    // Report Title and Date Range
    doc.fontSize(18).text(`Quarter ${quarter} Summary Report`, { align: 'center' });
    doc.fontSize(14).text(`Year ${year}`, { align: 'center' });
    doc.fontSize(12).text(`Period: ${dateRange}`, { align: 'center' });
    doc.moveDown(2);
    
    // Setup automatic footer for all pages
    setupAutoFooter(doc, processedBy);

    const columnWidths = [150, 80, 80, 80, 80, 100]; // Property Name, Bookings, Price, Add-Pax, Add-Pax Price, Earned
    const totalTableWidth = columnWidths.reduce((a, b) => a + b, 0);
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const tableX = doc.page.margins.left + (pageWidth - totalTableWidth) / 2;
    const cellHeight = 25;
    const cellPadding = 5;

    let y = doc.y;
    doc.fontSize(10);

    // === Draw table header function ===
    const drawTableHeader = () => {
      let x = tableX;
      const headers = ["Property Name", "Bookings", "Price", "Add-Pax", "Add-Pax Price", "Earned"];
      
      // Set bold font for headers
      doc.font('Helvetica-Bold');
      
      headers.forEach((header, index) => {
          doc.rect(x, y, columnWidths[index], cellHeight).stroke();
          doc.text(header, x + cellPadding, y + cellPadding, {
              width: columnWidths[index] - 2 * cellPadding
          });
          x += columnWidths[index];
      });

      // Reset to normal font
      doc.font('Helvetica');
      y += cellHeight;
    };

    drawTableHeader();

    let rowCount = 0;
    resultList.forEach((row, index) => {
      if (rowCount === 10) {
          doc.addPage({ margin: 40, size: [500, 1000], layout: 'landscape' });
          // Repeat header on new page with logo
          if (fs.existsSync(quarterPdfLogoPath)) {
            const logoSize = 30;
            const logoX = doc.page.margins.left;
            const logoY = doc.y;
            doc.image(quarterPdfLogoPath, logoX, logoY, { width: logoSize, height: logoSize });
            
            // Position text next to logo
            doc.fontSize(24).text("Betcha by Homie House", logoX + logoSize + 10, logoY + 5);
            doc.fontSize(12).text("betcha-booking@gmail.com", logoX + logoSize + 10, logoY + 25);
            doc.y = logoY + logoSize + 10;
          } else {
            doc.fontSize(24).text("Betcha by Homie House", { align: 'center' });
            doc.fontSize(12).text("betcha-booking@gmail.com", { align: 'center' });
          }
          doc.moveDown(1);
          doc.fontSize(18).text(`Quarter ${quarter} Summary Report`, { align: 'center' });
          doc.fontSize(14).text(`Year ${year}`, { align: 'center' });
          doc.fontSize(12).text(`Period: ${dateRange}`, { align: 'center' });
          doc.moveDown(2);
          y = doc.y;
          doc.fontSize(10);
          drawTableHeader();
          rowCount = 0;
      }

      let x = tableX;
      
      const rowData = [
          row.propertyName,
          row.bookings.toLocaleString(),
          typeof row.price === 'number' ? `PHP ${row.price.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : row.price,
          row.addPax.toLocaleString(),
          typeof row.addPaxPrice === 'number' ? `PHP ${row.addPaxPrice.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : row.addPaxPrice,
          `PHP ${row.earned.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`
      ];

      // Set bold font for TOTAL row
      if (row.propertyName === 'TOTAL') {
          doc.font('Helvetica-Bold');
      }

      rowData.forEach((data, colIndex) => {
          doc.rect(x, y, columnWidths[colIndex], cellHeight).stroke();
          doc.text(data, x + cellPadding, y + cellPadding, {
              width: columnWidths[colIndex] - 2 * cellPadding
          });
          x += columnWidths[colIndex];
      });

      // Reset to normal font after TOTAL row
      if (row.propertyName === 'TOTAL') {
          doc.font('Helvetica');
      }

      y += cellHeight;
      rowCount++;
    });

    // Add Monthly Breakdown Section for Quarterly Report
    doc.addPage({ margin: 40, size: [600, 1000], layout: 'landscape' });
    
    // Repeat header on new page with logo
    const quarterlyPdfLogoPath = path.join(__dirname, '../icon-betcha.png');
    if (fs.existsSync(quarterlyPdfLogoPath)) {
      const logoSize = 30;
      const logoX = doc.page.margins.left;
      const logoY = doc.y;
      doc.image(quarterlyPdfLogoPath, logoX, logoY, { width: logoSize, height: logoSize });
      
      // Position text next to logo
      doc.fontSize(24).text("Betcha by Homie House", logoX + logoSize + 10, logoY + 5);
      doc.fontSize(12).text("betcha-booking@gmail.com", logoX + logoSize + 10, logoY + 25);
      doc.y = logoY + logoSize + 10;
    } else {
      doc.fontSize(24).text("Betcha by Homie House", { align: 'center' });
      doc.fontSize(12).text("betcha-booking@gmail.com", { align: 'center' });
    }
    doc.moveDown(1);
    doc.fontSize(18).text(`Quarter ${quarter} Summary Report - Monthly Breakdown`, { align: 'center' });
    doc.fontSize(14).text(`Year ${year}`, { align: 'center' });
    doc.fontSize(12).text(`Period: ${dateRange}`, { align: 'center' });
    doc.moveDown(2);

    // Create monthly breakdown data for PDF
    const monthlyBreakdownPdf = {};
    resultList.forEach(item => {
      if (item.propertyName !== 'TOTAL') {
        monthlyBreakdownPdf[item.propertyName] = {};
      }
    });

    // Get all months in the quarter for PDF
    const quarterStartPdf = startDate.clone();
    const quarterEndPdf = endDate.clone();
    const monthsInQuarterPdf = [];
    
    for (let i = 0; i < 3; i++) {
      const monthStart = quarterStartPdf.clone().add(i, 'months').startOf('month');
      const monthEnd = quarterStartPdf.clone().add(i, 'months').endOf('month');
      const monthLabel = monthStart.format('MMMM');
      monthsInQuarterPdf.push({ label: monthLabel, start: monthStart.clone(), end: monthEnd.clone() });
      
      // Initialize monthly data
      Object.keys(monthlyBreakdownPdf).forEach(propertyName => {
        monthlyBreakdownPdf[propertyName][monthLabel] = 0;
      });
    }

    // Calculate monthly bookings for quarterly breakdown PDF
    bookings.forEach(booking => {
      const propertyName = booking.propertyName;
      if (!monthlyBreakdownPdf[propertyName]) return;

      booking.datesOfBooking.forEach(date => {
        const bookingDate = moment(date);
        if (bookingDate.isBetween(quarterStartPdf, quarterEndPdf, null, '[]')) {
          monthsInQuarterPdf.forEach(month => {
            if (bookingDate.isBetween(month.start, month.end, null, '[]')) {
              monthlyBreakdownPdf[propertyName][month.label]++;
            }
          });
        }
      });
    });

    // Monthly breakdown table setup
    const monthlyColumnWidths = [200, 120, 120, 120]; // Property Name + 3 months
    const monthlyTableWidth = monthlyColumnWidths.reduce((a, b) => a + b, 0);
    const monthlyPageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const monthlyTableX = doc.page.margins.left + (monthlyPageWidth - monthlyTableWidth) / 2;
    const monthlyCellHeight = 25;
    const monthlyCellPadding = 5;

    let monthlyY = doc.y;
    doc.fontSize(10);

    // Draw monthly breakdown header
    const monthlyHeadersPdf = ['Property Name', ...monthsInQuarterPdf.map(month => month.label)];

    let monthlyX = monthlyTableX;
    monthlyHeadersPdf.forEach((header, index) => {
      doc.rect(monthlyX, monthlyY, monthlyColumnWidths[index], monthlyCellHeight).stroke();
      doc.text(header, monthlyX + monthlyCellPadding, monthlyY + monthlyCellPadding, {
        width: monthlyColumnWidths[index] - 2 * monthlyCellPadding
      });
      monthlyX += monthlyColumnWidths[index];
    });
    monthlyY += monthlyCellHeight;

    // Draw monthly breakdown data
    Object.entries(monthlyBreakdownPdf).forEach(([propertyName, months]) => {
      monthlyX = monthlyTableX;
      
      const monthlyRowData = [propertyName, ...monthsInQuarterPdf.map(month => months[month.label].toLocaleString())];

      monthlyRowData.forEach((data, colIndex) => {
        doc.rect(monthlyX, monthlyY, monthlyColumnWidths[colIndex], monthlyCellHeight).stroke();
        doc.text(data, monthlyX + monthlyCellPadding, monthlyY + monthlyCellPadding, {
          width: monthlyColumnWidths[colIndex] - 2 * monthlyCellPadding
        });
        monthlyX += monthlyColumnWidths[colIndex];
      });
      
      monthlyY += monthlyCellHeight;
    });

    doc.end();

    // Excel
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Quarter Summary');

    // Company Logo
    const quarterExcelLogoPath = path.join(__dirname, '../icon-betcha.png');
    if (fs.existsSync(quarterExcelLogoPath)) {
      const logoId = workbook.addImage({
        filename: quarterExcelLogoPath,
        extension: 'png',
      });
      sheet.addImage(logoId, {
        tl: { col: 0.5, row: 0 },
        ext: { width: 60, height: 60 }
      });
    }

    // Company Header (moved down to accommodate logo)
    sheet.mergeCells('A3:F3');
    sheet.getCell('A3').value = 'Betcha by Homie House';
    sheet.getCell('A3').alignment = { horizontal: 'center' };
    sheet.getCell('A3').font = { bold: true, size: 18 };

    sheet.mergeCells('A4:F4');
    sheet.getCell('A4').value = 'betcha-booking@gmail.com';
    sheet.getCell('A4').alignment = { horizontal: 'center' };
    sheet.getCell('A4').font = { size: 12 };

    // Report Title and Date Range
    sheet.mergeCells('A6:F6');
    sheet.getCell('A6').value = `Quarter ${quarter} Summary Report`;
    sheet.getCell('A6').alignment = { horizontal: 'center' };
    sheet.getCell('A6').font = { bold: true, size: 16 };

    sheet.mergeCells('A7:F7');
    sheet.getCell('A7').value = `Year ${year}`;
    sheet.getCell('A7').alignment = { horizontal: 'center' };
    sheet.getCell('A7').font = { bold: true, size: 14 };

    sheet.mergeCells('A8:F8');
    sheet.getCell('A8').value = `Period: ${dateRange}`;
    sheet.getCell('A8').alignment = { horizontal: 'center' };
    sheet.getCell('A8').font = { size: 12 };

    // Processed By and Generated On
    if (processedBy) {
      sheet.getCell('F10').value = `Processed by: ${processedBy}`;
      sheet.getCell('F10').alignment = { horizontal: 'right' };
      sheet.getCell('F10').font = { size: 10 };
    }
    sheet.getCell('F11').value = `Generated on: ${moment().tz('Asia/Manila').format('MMMM D, YYYY [at] h:mm A')}`;
    sheet.getCell('F11').alignment = { horizontal: 'right' };
    sheet.getCell('F11').font = { size: 10 };

    // Table Headers
    const headerRow = 13;
    sheet.addRow([]);
    sheet.getCell(`A${headerRow}`).value = 'Property Name';
    sheet.getCell(`B${headerRow}`).value = 'Bookings';
    sheet.getCell(`C${headerRow}`).value = 'Price';
    sheet.getCell(`D${headerRow}`).value = 'Add-Pax';
    sheet.getCell(`E${headerRow}`).value = 'Add-Pax Price';
    sheet.getCell(`F${headerRow}`).value = 'Earned';
    sheet.getRow(headerRow).font = { bold: true };

    resultList.forEach((row, index) => {
      const newRow = sheet.addRow([
        row.propertyName, 
        row.bookings,
        typeof row.price === 'number' ? row.price : row.price,
        row.addPax,
        typeof row.addPaxPrice === 'number' ? row.addPaxPrice : row.addPaxPrice,
        row.earned
      ]);
      newRow.getCell(2).numFmt = '#,##0'; // Bookings column
      newRow.getCell(3).numFmt = '"PHP "#,##0.00'; // Price column
      newRow.getCell(4).numFmt = '#,##0'; // Add-Pax column
      newRow.getCell(5).numFmt = '"PHP "#,##0.00'; // Add-Pax Price column
      newRow.getCell(6).numFmt = '"PHP "#,##0.00'; // Earned column
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
      { key: 'price', width: 15 },
      { key: 'addPax', width: 12 },
      { key: 'addPaxPrice', width: 15 },
      { key: 'earned', width: 18 }
    ];

    // Monthly Breakdown Section for Quarterly Report
    const currentRowQuarter = sheet.rowCount + 3;
    
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

    // Add monthly breakdown title
    sheet.mergeCells(`A${currentRowQuarter}:${String.fromCharCode(65 + monthsInQuarter.length)}${currentRowQuarter}`);
    sheet.getCell(`A${currentRowQuarter}`).value = 'Monthly Breakdown - Number of Bookings';
    sheet.getCell(`A${currentRowQuarter}`).alignment = { horizontal: 'center' };
    sheet.getCell(`A${currentRowQuarter}`).font = { bold: true, size: 14 };

    // Add monthly breakdown headers
    const monthlyHeaderRowQuarter = currentRowQuarter + 2;
    sheet.getCell(`A${monthlyHeaderRowQuarter}`).value = 'Property Name';
    monthsInQuarter.forEach((month, index) => {
      const colLetter = String.fromCharCode(66 + index); // B, C, D
      sheet.getCell(`${colLetter}${monthlyHeaderRowQuarter}`).value = month.label;
    });
    
    // Style monthly headers
    for (let col = 0; col <= monthsInQuarter.length; col++) {
      const cellAddress = String.fromCharCode(65 + col) + monthlyHeaderRowQuarter;
      const cell = sheet.getCell(cellAddress);
      cell.font = { bold: true };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    }

    // Add monthly breakdown data
    let monthlyRowQuarter = monthlyHeaderRowQuarter + 1;
    Object.entries(monthlyBreakdownDataQuarter).forEach(([propertyName, months]) => {
      sheet.getCell(`A${monthlyRowQuarter}`).value = propertyName;
      monthsInQuarter.forEach((month, index) => {
        const colLetter = String.fromCharCode(66 + index);
        sheet.getCell(`${colLetter}${monthlyRowQuarter}`).value = months[month.label] || 0;
        sheet.getCell(`${colLetter}${monthlyRowQuarter}`).numFmt = '#,##0';
      });
      
      // Style monthly data row
      for (let col = 0; col <= monthsInQuarter.length; col++) {
        const cellAddress = String.fromCharCode(65 + col) + monthlyRowQuarter;
        const cell = sheet.getCell(cellAddress);
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      }
      
      monthlyRowQuarter++;
    });

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
      Property.find({}, 'name packagePrice additionalPax'),
      Booking.find({
        datesOfBooking: { $elemMatch: { $gte: start.toDate(), $lte: end.toDate() } },
        status: { $in: ['Checked-Out', 'Completed', 'Fully-Paid', 'Reserved'] }
      })
    ]);

    const summaryMap = {};
    allProperties.forEach(prop => {
      summaryMap[prop.name] = {
        bookings: 0,
        price: prop.packagePrice,
        addPax: 0,
        addPaxPrice: prop.additionalPax,
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
      
      summaryMap[name].bookings += bookingDatesInSemiAnnual;
      summaryMap[name].addPax += booking.additionalPax || 0;
      
      // Calculate earnings: (booking dates * package price) + (additional pax * additional pax price)
      const packageEarnings = bookingDatesInSemiAnnual * summaryMap[name].price;
      const addPaxEarnings = (booking.additionalPax || 0) * summaryMap[name].addPaxPrice;
      summaryMap[name].earned += packageEarnings + addPaxEarnings;
    });

    const resultList = Object.entries(summaryMap).map(([propertyName, data]) => ({
      propertyName,
      bookings: data.bookings,
      price: data.price,
      addPax: data.addPax,
      addPaxPrice: data.addPaxPrice,
      earned: data.earned
    }));

    const totals = resultList.reduce((acc, entry) => ({
      bookings: acc.bookings + entry.bookings,
      addPax: acc.addPax + entry.addPax,
      earned: acc.earned + entry.earned
    }), { bookings: 0, addPax: 0, earned: 0 });

    resultList.push({ 
      propertyName: 'TOTAL', 
      bookings: totals.bookings,
      price: '-',
      addPax: totals.addPax,
      addPaxPrice: '-',
      earned: totals.earned 
    });

    const fileId = uuidv4();
    const pdfPath = path.join(__dirname, `../exports/semi-annual-summary-${fileId}.pdf`);
    const excelPath = path.join(__dirname, `../exports/semi-annual-summary-${fileId}.xlsx`);

    // ===== PDF =====
    const doc = new PDFDocument({ margin: 40, size: [500, 1000], layout: 'landscape' });
    doc.pipe(fs.createWriteStream(pdfPath));

    // Company Header with Logo
    const semiAnnualPdfLogoPath = path.join(__dirname, '../icon-betcha.png');
    if (fs.existsSync(semiAnnualPdfLogoPath)) {
      const logoSize = 30;
      const logoX = doc.page.margins.left;
      const logoY = doc.y;
      doc.image(semiAnnualPdfLogoPath, logoX, logoY, { width: logoSize, height: logoSize });
      
      // Position text next to logo
      doc.fontSize(24).text('Betcha by Homie House', logoX + logoSize + 10, logoY + 5);
      doc.fontSize(12).text('betcha-booking@gmail.com', logoX + logoSize + 10, logoY + 25);
      doc.y = logoY + logoSize + 10;
    } else {
      // Fallback without logo
      doc.fontSize(24).text('Betcha by Homie House', { align: 'center' });
      doc.fontSize(12).text('betcha-booking@gmail.com', { align: 'center' });
    }
    doc.moveDown(1);
    
    // Report Title and Date Range
    doc.fontSize(18).text('Semi-Annual Summary Report', { align: 'center' });
    doc.fontSize(14).text(`${year} - H${annual}`, { align: 'center' });
    doc.fontSize(12).text(`Period: ${dateRange}`, { align: 'center' });
    doc.moveDown(2);
    
    // Setup automatic footer for all pages
    setupAutoFooter(doc, processedBy);

    const columnWidths = [150, 80, 80, 80, 80, 100]; // Property Name, Bookings, Price, Add-Pax, Add-Pax Price, Earned
    const totalTableWidth = columnWidths.reduce((a, b) => a + b, 0);
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const tableX = doc.page.margins.left + (pageWidth - totalTableWidth) / 2;
    const cellHeight = 25;
    const cellPadding = 5;

    let y = doc.y;
    doc.fontSize(10);

    const drawTableHeader = () => {
      let x = tableX;
      const headers = ["Property Name", "Bookings", "Price", "Add-Pax", "Add-Pax Price", "Earned"];
      
      // Set bold font for headers
      doc.font('Helvetica-Bold');
      
      headers.forEach((header, index) => {
          doc.rect(x, y, columnWidths[index], cellHeight).stroke();
          doc.text(header, x + cellPadding, y + cellPadding, {
              width: columnWidths[index] - 2 * cellPadding
          });
          x += columnWidths[index];
      });

      // Reset to normal font
      doc.font('Helvetica');
      y += cellHeight;
    };

    drawTableHeader();

    let rowCount = 0;
    resultList.forEach((row, index) => {
      if (rowCount === 10) {
          doc.addPage({ margin: 40, size: [500, 1000], layout: 'landscape' });
          // Repeat header on new page with logo
          if (fs.existsSync(semiAnnualPdfLogoPath)) {
            const logoSize = 30;
            const logoX = doc.page.margins.left;
            const logoY = doc.y;
            doc.image(semiAnnualPdfLogoPath, logoX, logoY, { width: logoSize, height: logoSize });
            
            // Position text next to logo
            doc.fontSize(24).text("Betcha by Homie House", logoX + logoSize + 10, logoY + 5);
            doc.fontSize(12).text("betcha-booking@gmail.com", logoX + logoSize + 10, logoY + 25);
            doc.y = logoY + logoSize + 10;
          } else {
            doc.fontSize(24).text("Betcha by Homie House", { align: 'center' });
            doc.fontSize(12).text("betcha-booking@gmail.com", { align: 'center' });
          }
          doc.moveDown(1);
          doc.fontSize(18).text('Semi-Annual Summary Report', { align: 'center' });
          doc.fontSize(14).text(`${year} - H${annual}`, { align: 'center' });
          doc.fontSize(12).text(`Period: ${dateRange}`, { align: 'center' });
          doc.moveDown(2);
          y = doc.y;
          doc.fontSize(10);
          drawTableHeader();
          rowCount = 0;
      }

      let x = tableX;
      
      const rowData = [
          row.propertyName,
          row.bookings.toLocaleString(),
          typeof row.price === 'number' ? `PHP ${row.price.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : row.price,
          row.addPax.toLocaleString(),
          typeof row.addPaxPrice === 'number' ? `PHP ${row.addPaxPrice.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : row.addPaxPrice,
          `PHP ${row.earned.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`
      ];

      rowData.forEach((data, colIndex) => {
          doc.rect(x, y, columnWidths[colIndex], cellHeight).stroke();
          doc.text(data, x + cellPadding, y + cellPadding, {
              width: columnWidths[colIndex] - 2 * cellPadding
          });
          x += columnWidths[colIndex];
      });

      y += cellHeight;
      rowCount++;
    });

    // Add Monthly Breakdown Section
    doc.addPage({ margin: 40, size: [500, 1000], layout: 'landscape' });
    
    // Repeat header on new page with logo
    if (fs.existsSync(semiAnnualPdfLogoPath)) {
      const logoSize = 30;
      const logoX = doc.page.margins.left;
      const logoY = doc.y;
      doc.image(semiAnnualPdfLogoPath, logoX, logoY, { width: logoSize, height: logoSize });
      
      // Position text next to logo
      doc.fontSize(24).text("Betcha by Homie House", logoX + logoSize + 10, logoY + 5);
      doc.fontSize(12).text("betcha-booking@gmail.com", logoX + logoSize + 10, logoY + 25);
      doc.y = logoY + logoSize + 10;
    } else {
      doc.fontSize(24).text("Betcha by Homie House", { align: 'center' });
      doc.fontSize(12).text("betcha-booking@gmail.com", { align: 'center' });
    }
    doc.moveDown(1);
    doc.fontSize(18).text('Semi-Annual Summary Report - Monthly Breakdown', { align: 'center' });
    doc.fontSize(14).text(`${year} - H${annual}`, { align: 'center' });
    doc.fontSize(12).text(`Period: ${dateRange}`, { align: 'center' });
    doc.moveDown(2);

    // Create monthly breakdown data for PDF
    const monthlyBreakdownPdf = {};
    allProperties.forEach(prop => {
      monthlyBreakdownPdf[prop.name] = {};
      for (let monthOffset = 0; monthOffset < 6; monthOffset++) {
        const monthStart = start.clone().add(monthOffset, 'months');
        const monthName = monthStart.format('MMMM');
        monthlyBreakdownPdf[prop.name][monthName] = 0;
      }
    });

    // Calculate monthly bookings for PDF
    bookings.forEach(booking => {
      const propertyName = booking.propertyName;
      if (!monthlyBreakdownPdf[propertyName]) return;

      booking.datesOfBooking.forEach(date => {
        const bookingDate = moment(date);
        if (bookingDate.isBetween(start, end, null, '[]')) {
          const monthName = bookingDate.format('MMMM');
          if (monthlyBreakdownPdf[propertyName][monthName] !== undefined) {
            monthlyBreakdownPdf[propertyName][monthName]++;
          }
        }
      });
    });

    // Monthly breakdown table setup
    const monthlyColumnWidths = [120, 80, 80, 80, 80, 80, 80]; // Property Name + 6 months
    const monthlyTableWidth = monthlyColumnWidths.reduce((a, b) => a + b, 0);
    const monthlyPageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const monthlyTableX = doc.page.margins.left + (monthlyPageWidth - monthlyTableWidth) / 2;
    const monthlyCellHeight = 25;
    const monthlyCellPadding = 5;

    let monthlyY = doc.y;
    doc.fontSize(10);

    // Draw monthly breakdown header
    const monthHeadersPdf = ['Property Name'];
    for (let monthOffset = 0; monthOffset < 6; monthOffset++) {
      const monthStart = start.clone().add(monthOffset, 'months');
      monthHeadersPdf.push(monthStart.format('MMMM'));
    }

    // Set bold font for breakdown headers
    doc.font('Helvetica-Bold');
    let monthlyX = monthlyTableX;
    monthHeadersPdf.forEach((header, index) => {
      doc.rect(monthlyX, monthlyY, monthlyColumnWidths[index], monthlyCellHeight).stroke();
      doc.text(header, monthlyX + monthlyCellPadding, monthlyY + monthlyCellPadding, {
        width: monthlyColumnWidths[index] - 2 * monthlyCellPadding
      });
      monthlyX += monthlyColumnWidths[index];
    });
    // Reset to normal font
    doc.font('Helvetica');
    monthlyY += monthlyCellHeight;

    // Draw monthly breakdown data
    Object.entries(monthlyBreakdownPdf).forEach(([propertyName, months]) => {
      monthlyX = monthlyTableX;
      
      const monthRowData = [propertyName];
      for (let monthOffset = 0; monthOffset < 6; monthOffset++) {
        const monthStart = start.clone().add(monthOffset, 'months');
        const monthName = monthStart.format('MMMM');
        monthRowData.push((months[monthName] || 0).toLocaleString());
      }

      monthRowData.forEach((data, colIndex) => {
        doc.rect(monthlyX, monthlyY, monthlyColumnWidths[colIndex], monthlyCellHeight).stroke();
        doc.text(data, monthlyX + monthlyCellPadding, monthlyY + monthlyCellPadding, {
          width: monthlyColumnWidths[colIndex] - 2 * monthlyCellPadding
        });
        monthlyX += monthlyColumnWidths[colIndex];
      });
      
      monthlyY += monthlyCellHeight;
    });

    // Wait for PDF to finish
    await new Promise((resolve) => {
      doc.on('end', resolve);
      doc.end();
    });

    // ===== Excel Generation =====
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Semi-Annual Summary');

    // Company Header
    sheet.mergeCells('A1:F1');
    sheet.getCell('A1').value = 'Betcha by Homie House';
    sheet.getCell('A1').alignment = { horizontal: 'center' };
    sheet.getCell('A1').font = { bold: true, size: 18 };

    sheet.mergeCells('A2:F2');
    sheet.getCell('A2').value = 'betcha-booking@gmail.com';
    sheet.getCell('A2').alignment = { horizontal: 'center' };
    sheet.getCell('A2').font = { size: 12 };

    // Report Title and Date Range
    sheet.mergeCells('A4:F4');
    sheet.getCell('A4').value = 'Semi-Annual Summary Report';
    sheet.getCell('A4').alignment = { horizontal: 'center' };
    sheet.getCell('A4').font = { bold: true, size: 16 };

    sheet.mergeCells('A5:F5');
    sheet.getCell('A5').value = `${year} - H${annual}`;
    sheet.getCell('A5').alignment = { horizontal: 'center' };
    sheet.getCell('A5').font = { bold: true, size: 14 };

    sheet.mergeCells('A6:F6');
    sheet.getCell('A6').value = `Period: ${dateRange}`;
    sheet.getCell('A6').alignment = { horizontal: 'center' };
    sheet.getCell('A6').font = { size: 12 };

    // Processed By and Generated On
    if (processedBy) {
      sheet.getCell('F8').value = `Processed by: ${processedBy}`;
      sheet.getCell('F8').alignment = { horizontal: 'right' };
      sheet.getCell('F8').font = { size: 10 };
    }
    sheet.getCell('F9').value = `Generated on: ${moment().tz('Asia/Manila').format('MMMM D, YYYY [at] h:mm A')}`;
    sheet.getCell('F9').alignment = { horizontal: 'right' };
    sheet.getCell('F9').font = { size: 10 };

    // Table Headers
    const headerRow = 11;
    sheet.addRow([]);
    const headers = sheet.addRow(['Property Name', 'Bookings', 'Price', 'Add-Pax', 'Add-Pax Price', 'Earned']);
    headers.font = { bold: true };

    resultList.forEach(row => {
      const r = [
        row.propertyName, 
        row.bookings, 
        typeof row.price === 'number' ? row.price : row.price,
        row.addPax, 
        typeof row.addPaxPrice === 'number' ? row.addPaxPrice : row.addPaxPrice,
        row.earned
      ];
      const added = sheet.addRow(r);
      // Format numeric and currency columns
      added.getCell(2).numFmt = '#,##0'; // Bookings column
      added.getCell(3).numFmt = typeof row.price === 'number' ? '"PHP "#,##0.00' : '@'; // Price column
      added.getCell(4).numFmt = '#,##0'; // Add-Pax column
      added.getCell(5).numFmt = typeof row.addPaxPrice === 'number' ? '"PHP "#,##0.00' : '@'; // Add-Pax Price column
      added.getCell(6).numFmt = '"PHP "#,##0.00'; // Earned column
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

    sheet.columns = [
      { key: 'propertyName', width: 25 },
      { key: 'bookings', width: 12 },
      { key: 'price', width: 15 },
      { key: 'addPax', width: 12 },
      { key: 'addPaxPrice', width: 15 },
      { key: 'earned', width: 18 }
    ];

    // Add Monthly Breakdown Table
    const startRow = sheet.rowCount + 3;
    sheet.addRow([]);
    sheet.addRow([]);
    
    // Monthly breakdown title
    sheet.mergeCells(`A${startRow}:G${startRow}`);
    sheet.getCell(`A${startRow}`).value = 'Monthly Breakdown';
    sheet.getCell(`A${startRow}`).alignment = { horizontal: 'center' };
    sheet.getCell(`A${startRow}`).font = { bold: true, size: 14 };

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

    // Monthly breakdown headers
    const monthlyHeaderRow = startRow + 2;
    const monthHeadersExcel = ['Property Name'];
    for (let monthOffset = 0; monthOffset < 6; monthOffset++) {
      const monthStart = start.clone().add(monthOffset, 'months');
      monthHeadersExcel.push(monthStart.format('MMMM'));
    }
    const monthlyHeaders = sheet.addRow(monthHeadersExcel);
    monthlyHeaders.font = { bold: true };

    // Monthly breakdown data rows
    Object.entries(monthlyBreakdown).forEach(([propertyName, months]) => {
      const monthData = [propertyName];
      for (let monthOffset = 0; monthOffset < 6; monthOffset++) {
        const monthStart = start.clone().add(monthOffset, 'months');
        const monthName = monthStart.format('MMMM');
        monthData.push(months[monthName] || 0);
      }
      const monthRow = sheet.addRow(monthData);
      // Format month columns with number formatting
      for (let col = 2; col <= 7; col++) {
        monthRow.getCell(col).numFmt = '#,##0';
      }
    });

    // Add borders to monthly breakdown table
    const monthlyEndRow = sheet.rowCount;
    for (let i = monthlyHeaderRow; i <= monthlyEndRow; i++) {
      for (let j = 1; j <= 7; j++) {
        const cell = sheet.getCell(i, j);
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      }
    }

    await workbook.xlsx.writeFile(excelPath);

    // Cleanup files after 10 minutes (increased from 1 minute for better user experience)
    setTimeout(() => {
      fs.unlink(pdfPath, err => err && console.error('PDF delete error', err));
      fs.unlink(excelPath, err => err && console.error('Excel delete error', err));
    }, 600000);

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
    const { year, processedBy } = req.body;
    if (!year) {
      return res.status(400).json({ message: "Please provide a year." });
    }

    const start = moment.tz({ year, month: 0, day: 1 }, 'Asia/Manila').startOf('day');
    const end = moment.tz({ year, month: 11, day: 31 }, 'Asia/Manila').endOf('day');

    // Date range for display
    const dateRange = `January 1, ${year} to December 31, ${year}`;

    const [allProperties, bookings] = await Promise.all([
      Property.find({}, 'name packagePrice additionalPax'),
      Booking.find({
        datesOfBooking: { $elemMatch: { $gte: start.toDate(), $lte: end.toDate() } },
        status: { $in: ['Checked-Out', 'Completed', 'Fully-Paid', 'Reserved'] }
      })
    ]);

    const summaryMap = {};
    allProperties.forEach(prop => {
      summaryMap[prop.name] = {
        bookings: 0,
        price: prop.packagePrice,
        addPax: 0,
        addPaxPrice: prop.additionalPax,
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
      
      summaryMap[name].bookings += bookingDatesInYear;
      summaryMap[name].addPax += booking.additionalPax || 0;
      
      // Calculate earnings: (booking dates * package price) + (additional pax * additional pax price)
      const packageEarnings = bookingDatesInYear * summaryMap[name].price;
      const addPaxEarnings = (booking.additionalPax || 0) * summaryMap[name].addPaxPrice;
      summaryMap[name].earned += packageEarnings + addPaxEarnings;
    });

    const resultList = Object.entries(summaryMap).map(([propertyName, data]) => ({
      propertyName,
      bookings: data.bookings,
      price: data.price,
      addPax: data.addPax,
      addPaxPrice: data.addPaxPrice,
      earned: data.earned
    }));

    const totals = resultList.reduce((acc, entry) => ({
      bookings: acc.bookings + entry.bookings,
      addPax: acc.addPax + entry.addPax,
      earned: acc.earned + entry.earned
    }), { bookings: 0, addPax: 0, earned: 0 });

    resultList.push({ 
      propertyName: 'TOTAL', 
      bookings: totals.bookings,
      price: '-',
      addPax: totals.addPax,
      addPaxPrice: '-',
      earned: totals.earned 
    });

    const fileId = uuidv4();
    const pdfPath = path.join(__dirname, `../exports/annual-summary-${fileId}.pdf`);
    const excelPath = path.join(__dirname, `../exports/annual-summary-${fileId}.xlsx`);

    console.log('Annual Summary - Starting file generation:', { fileId, pdfPath, excelPath });

    // ===== PDF =====
    const doc = new PDFDocument({ margin: 40, size: [500, 1000], layout: 'landscape' });
    const pdfStream = fs.createWriteStream(pdfPath);
    doc.pipe(pdfStream);

    // Company Header with Logo
    const annualPdfLogoPath = path.join(__dirname, '../icon-betcha.png');
    if (fs.existsSync(annualPdfLogoPath)) {
      const logoSize = 30;
      const logoX = doc.page.margins.left;
      const logoY = doc.y;
      doc.image(annualPdfLogoPath, logoX, logoY, { width: logoSize, height: logoSize });
      
      // Position text next to logo
      doc.fontSize(24).text('Betcha by Homie House', logoX + logoSize + 10, logoY + 5);
      doc.fontSize(12).text('betcha-booking@gmail.com', logoX + logoSize + 10, logoY + 25);
      doc.y = logoY + logoSize + 10;
    } else {
      // Fallback without logo
      doc.fontSize(24).text('Betcha by Homie House', { align: 'center' });
      doc.fontSize(12).text('betcha-booking@gmail.com', { align: 'center' });
    }
    doc.moveDown(1);
    
    // Report Title and Date Range
    doc.fontSize(18).text('Annual Summary Report', { align: 'center' });
    doc.fontSize(14).text(`Year ${year}`, { align: 'center' });
    doc.fontSize(12).text(`Period: ${dateRange}`, { align: 'center' });
    doc.moveDown(2);
    
    // Setup automatic footer for all pages
    setupAutoFooter(doc, processedBy);

    const columnWidths = [150, 80, 80, 80, 80, 100]; // Property Name, Bookings, Price, Add-Pax, Add-Pax Price, Earned
    const totalTableWidth = columnWidths.reduce((a, b) => a + b, 0);
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const tableX = doc.page.margins.left + (pageWidth - totalTableWidth) / 2;
    const cellHeight = 25;
    const cellPadding = 5;

    let y = doc.y;
    doc.fontSize(10);

    const drawTableHeader = () => {
      let x = tableX;
      const headers = ["Property Name", "Bookings", "Price", "Add-Pax", "Add-Pax Price", "Earned"];
      
      // Set bold font for headers
      doc.font('Helvetica-Bold');
      
      headers.forEach((header, index) => {
          doc.rect(x, y, columnWidths[index], cellHeight).stroke();
          doc.text(header, x + cellPadding, y + cellPadding, {
              width: columnWidths[index] - 2 * cellPadding
          });
          x += columnWidths[index];
      });

      // Reset to normal font
      doc.font('Helvetica');
      y += cellHeight;
    };

    drawTableHeader();

    let rowCount = 0;
    resultList.forEach((row, index) => {
      if (rowCount === 10) {
          doc.addPage({ margin: 40, size: [500, 1000], layout: 'landscape' });
          // Repeat header on new page with logo
          if (fs.existsSync(annualPdfLogoPath)) {
            const logoSize = 30;
            const logoX = doc.page.margins.left;
            const logoY = doc.y;
            doc.image(annualPdfLogoPath, logoX, logoY, { width: logoSize, height: logoSize });
            
            // Position text next to logo
            doc.fontSize(24).text("Betcha by Homie House", logoX + logoSize + 10, logoY + 5);
            doc.fontSize(12).text("betcha-booking@gmail.com", logoX + logoSize + 10, logoY + 25);
            doc.y = logoY + logoSize + 10;
          } else {
            doc.fontSize(24).text("Betcha by Homie House", { align: 'center' });
            doc.fontSize(12).text("betcha-booking@gmail.com", { align: 'center' });
          }
          doc.moveDown(1);
          doc.fontSize(18).text('Annual Summary Report', { align: 'center' });
          doc.fontSize(14).text(`Year ${year}`, { align: 'center' });
          doc.fontSize(12).text(`Period: ${dateRange}`, { align: 'center' });
          doc.moveDown(2);
          y = doc.y;
          doc.fontSize(10);
          drawTableHeader();
          rowCount = 0;
      }

      let x = tableX;
      
      const rowData = [
          row.propertyName,
          row.bookings.toLocaleString(),
          typeof row.price === 'number' ? `PHP ${row.price.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : row.price,
          row.addPax.toLocaleString(),
          typeof row.addPaxPrice === 'number' ? `PHP ${row.addPaxPrice.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : row.addPaxPrice,
          `PHP ${row.earned.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`
      ];

      rowData.forEach((data, colIndex) => {
          doc.rect(x, y, columnWidths[colIndex], cellHeight).stroke();
          doc.text(data, x + cellPadding, y + cellPadding, {
              width: columnWidths[colIndex] - 2 * cellPadding
          });
          x += columnWidths[colIndex];
      });

      y += cellHeight;
      rowCount++;
    });

    // Add Monthly Breakdown Section for Annual Report
    doc.addPage({ margin: 40, size: [500, 1000], layout: 'landscape' });
    
    // Repeat header on new page with logo
    if (fs.existsSync(annualPdfLogoPath)) {
      const logoSize = 30;
      const logoX = doc.page.margins.left;
      const logoY = doc.y;
      doc.image(annualPdfLogoPath, logoX, logoY, { width: logoSize, height: logoSize });
      
      // Position text next to logo
      doc.fontSize(24).text("Betcha by Homie House", logoX + logoSize + 10, logoY + 5);
      doc.fontSize(12).text("betcha-booking@gmail.com", logoX + logoSize + 10, logoY + 25);
      doc.y = logoY + logoSize + 10;
    } else {
      doc.fontSize(24).text("Betcha by Homie House", { align: 'center' });
      doc.fontSize(12).text("betcha-booking@gmail.com", { align: 'center' });
    }
    doc.moveDown(1);
    doc.fontSize(18).text('Annual Summary Report - Monthly Breakdown', { align: 'center' });
    doc.fontSize(14).text(`Year ${year}`, { align: 'center' });
    doc.fontSize(12).text(`Period: ${dateRange}`, { align: 'center' });
    doc.moveDown(2);

    // Create monthly breakdown data for annual PDF (12 months)
    const annualMonthlyBreakdown = {};
    allProperties.forEach(prop => {
      annualMonthlyBreakdown[prop.name] = {};
      for (let monthOffset = 0; monthOffset < 12; monthOffset++) {
        const monthStart = start.clone().add(monthOffset, 'months');
        const monthName = monthStart.format('MMM'); // Short month names for space
        annualMonthlyBreakdown[prop.name][monthName] = 0;
      }
    });

    // Calculate monthly bookings for annual PDF
    bookings.forEach(booking => {
      const propertyName = booking.propertyName;
      if (!annualMonthlyBreakdown[propertyName]) return;

      booking.datesOfBooking.forEach(date => {
        const bookingDate = moment(date);
        if (bookingDate.isBetween(start, end, null, '[]')) {
          const monthName = bookingDate.format('MMM'); // Short month names
          if (annualMonthlyBreakdown[propertyName][monthName] !== undefined) {
            annualMonthlyBreakdown[propertyName][monthName]++;
          }
        }
      });
    });

    // Annual monthly breakdown table setup (smaller columns for 12 months)
    const annualColumnWidths = [100, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35]; // Property Name + 12 months
    const annualTableWidth = annualColumnWidths.reduce((a, b) => a + b, 0);
    const annualPageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const annualTableX = doc.page.margins.left + (annualPageWidth - annualTableWidth) / 2;
    const annualCellHeight = 25;
    const annualCellPadding = 3;

    let annualY = doc.y;
    doc.fontSize(8); // Smaller font for 12 months

    // Draw annual monthly breakdown header
    const annualHeadersPdf = ['Property Name'];
    for (let monthOffset = 0; monthOffset < 12; monthOffset++) {
      const monthStart = start.clone().add(monthOffset, 'months');
      annualHeadersPdf.push(monthStart.format('MMM')); // Jan, Feb, etc.
    }

    // Set bold font for breakdown headers
    doc.font('Helvetica-Bold');
    let annualX = annualTableX;
    annualHeadersPdf.forEach((header, index) => {
      doc.rect(annualX, annualY, annualColumnWidths[index], annualCellHeight).stroke();
      doc.text(header, annualX + annualCellPadding, annualY + annualCellPadding, {
        width: annualColumnWidths[index] - 2 * annualCellPadding
      });
      annualX += annualColumnWidths[index];
    });
    // Reset to normal font
    doc.font('Helvetica');
    annualY += annualCellHeight;

    // Draw annual monthly breakdown data
    Object.entries(annualMonthlyBreakdown).forEach(([propertyName, months]) => {
      annualX = annualTableX;
      
      const annualRowData = [propertyName];
      for (let monthOffset = 0; monthOffset < 12; monthOffset++) {
        const monthStart = start.clone().add(monthOffset, 'months');
        const monthName = monthStart.format('MMM');
        annualRowData.push((months[monthName] || 0).toLocaleString());
      }

      annualRowData.forEach((data, colIndex) => {
        doc.rect(annualX, annualY, annualColumnWidths[colIndex], annualCellHeight).stroke();
        doc.text(data, annualX + annualCellPadding, annualY + annualCellPadding, {
          width: annualColumnWidths[colIndex] - 2 * annualCellPadding
        });
        annualX += annualColumnWidths[colIndex];
      });
      
      annualY += annualCellHeight;
    });

    // Wait for PDF to finish
    console.log('Annual Summary - Waiting for PDF to complete...');
    await new Promise((resolve, reject) => {
      doc.on('end', () => {
        console.log('Annual Summary - PDF generation completed');
        resolve();
      });
      doc.on('error', (err) => {
        console.error('Annual Summary - PDF generation error:', err);
        reject(err);
      });
      pdfStream.on('error', (err) => {
        console.error('Annual Summary - PDF stream error:', err);
        reject(err);
      });
      doc.end();
    });

    console.log('Annual Summary - Starting Excel generation...');
    // ===== Excel Generation =====
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Annual Summary');

    // Company Header
    sheet.mergeCells('A1:F1');
    sheet.getCell('A1').value = 'Betcha by Homie House';
    sheet.getCell('A1').alignment = { horizontal: 'center' };
    sheet.getCell('A1').font = { bold: true, size: 18 };

    sheet.mergeCells('A2:F2');
    sheet.getCell('A2').value = 'betcha-booking@gmail.com';
    sheet.getCell('A2').alignment = { horizontal: 'center' };
    sheet.getCell('A2').font = { size: 12 };

    // Report Title and Date Range
    sheet.mergeCells('A4:F4');
    sheet.getCell('A4').value = 'Annual Summary Report';
    sheet.getCell('A4').alignment = { horizontal: 'center' };
    sheet.getCell('A4').font = { bold: true, size: 16 };

    sheet.mergeCells('A5:F5');
    sheet.getCell('A5').value = `Year ${year}`;
    sheet.getCell('A5').alignment = { horizontal: 'center' };
    sheet.getCell('A5').font = { bold: true, size: 14 };

    sheet.mergeCells('A6:F6');
    sheet.getCell('A6').value = `Period: ${dateRange}`;
    sheet.getCell('A6').alignment = { horizontal: 'center' };
    sheet.getCell('A6').font = { size: 12 };

    // Processed By and Generated On
    if (processedBy) {
      sheet.getCell('F8').value = `Processed by: ${processedBy}`;
      sheet.getCell('F8').alignment = { horizontal: 'right' };
      sheet.getCell('F8').font = { size: 10 };
    }
    sheet.getCell('F9').value = `Generated on: ${moment().tz('Asia/Manila').format('MMMM D, YYYY [at] h:mm A')}`;
    sheet.getCell('F9').alignment = { horizontal: 'right' };
    sheet.getCell('F9').font = { size: 10 };

    // Table Headers
    const headerRow = 11;
    sheet.addRow([]);
    const headers = sheet.addRow(['Property Name', 'Bookings', 'Price', 'Add-Pax', 'Add-Pax Price', 'Earned']);
    headers.font = { bold: true };

    resultList.forEach(row => {
      const r = [
        row.propertyName, 
        row.bookings, 
        typeof row.price === 'number' ? row.price : row.price,
        row.addPax, 
        typeof row.addPaxPrice === 'number' ? row.addPaxPrice : row.addPaxPrice,
        row.earned
      ];
      const added = sheet.addRow(r);
      // Format numeric and currency columns
      added.getCell(2).numFmt = '#,##0'; // Bookings column
      added.getCell(3).numFmt = typeof row.price === 'number' ? '"PHP "#,##0.00' : '@'; // Price column
      added.getCell(4).numFmt = '#,##0'; // Add-Pax column
      added.getCell(5).numFmt = typeof row.addPaxPrice === 'number' ? '"PHP "#,##0.00' : '@'; // Add-Pax Price column
      added.getCell(6).numFmt = '"PHP "#,##0.00'; // Earned column
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

    sheet.columns = [
      { key: 'propertyName', width: 25 },
      { key: 'bookings', width: 12 },
      { key: 'price', width: 15 },
      { key: 'addPax', width: 12 },
      { key: 'addPaxPrice', width: 15 },
      { key: 'earned', width: 18 }
    ];

    // Add Annual Monthly Breakdown Table (12 months)
    const annualStartRow = sheet.rowCount + 3;
    sheet.addRow([]);
    sheet.addRow([]);
    
    // Monthly breakdown title
    sheet.mergeCells(`A${annualStartRow}:M${annualStartRow}`);
    sheet.getCell(`A${annualStartRow}`).value = 'Monthly Breakdown (Jan-Dec)';
    sheet.getCell(`A${annualStartRow}`).alignment = { horizontal: 'center' };
    sheet.getCell(`A${annualStartRow}`).font = { bold: true, size: 14 };

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

    // Annual monthly breakdown headers
    const annualMonthlyHeaderRow = annualStartRow + 2;
    const annualMonthHeadersExcel = ['Property Name'];
    for (let monthOffset = 0; monthOffset < 12; monthOffset++) {
      const monthStart = start.clone().add(monthOffset, 'months');
      annualMonthHeadersExcel.push(monthStart.format('MMM')); // Jan, Feb, etc.
    }
    const annualMonthlyHeaders = sheet.addRow(annualMonthHeadersExcel);
    annualMonthlyHeaders.font = { bold: true };

    // Annual monthly breakdown data rows
    Object.entries(annualMonthlyBreakdownExcel).forEach(([propertyName, months]) => {
      const annualMonthData = [propertyName];
      for (let monthOffset = 0; monthOffset < 12; monthOffset++) {
        const monthStart = start.clone().add(monthOffset, 'months');
        const monthName = monthStart.format('MMM');
        annualMonthData.push(months[monthName] || 0);
      }
      const annualMonthRow = sheet.addRow(annualMonthData);
      // Format month columns with number formatting (columns 2-13)
      for (let col = 2; col <= 13; col++) {
        annualMonthRow.getCell(col).numFmt = '#,##0';
      }
    });

    // Add borders to annual monthly breakdown table
    const annualMonthlyEndRow = sheet.rowCount;
    for (let i = annualMonthlyHeaderRow; i <= annualMonthlyEndRow; i++) {
      for (let j = 1; j <= 13; j++) {
        const cell = sheet.getCell(i, j);
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      }
    }

    await workbook.xlsx.writeFile(excelPath);

    console.log('Annual Summary - Excel generation completed');
    console.log('Annual Summary - Files created:', { pdfPath, excelPath });

    // Cleanup files after 10 minutes (increased from 1 minute for better user experience)
    setTimeout(() => {
      console.log('Annual Summary - Cleaning up files:', { pdfPath, excelPath });
      fs.unlink(pdfPath, err => err && console.error('PDF delete error', err));
      fs.unlink(excelPath, err => err && console.error('Excel delete error', err));
    }, 600000);

    console.log('Annual Summary - Sending response with file links');
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
