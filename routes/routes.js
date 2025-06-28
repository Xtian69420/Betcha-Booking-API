const express = require('express');
const router = express.Router();

const guestController = require('../controllers/guestController');
const adminController = require('../controllers/adminController');
const employeeController = require ('../controllers/employeeController');
const rolesController = require('../controllers/roleController');
const otpController = require('../controllers/otpController');
const authenticationController = require('../controllers/authenticationController');
const propertyController = require ('../controllers/propertyController');
const paymentController = require ('../controllers/paymentController');
const bookingController = require('../controllers/bookingController');
const notificationController = require('../controllers/notificationController');
const faqController = require('../controllers/faqController');
const adminDashboardController = require('../controllers/adminDashboardController');
const auditTrailController = require('../controllers/auditTrailController');
const landingController = require ('../controllers/landingController');
const featuredPropertyController = require('../controllers/featuredPropertyController');
const maintenanceBookingCalendarController = require('../controllers/maintenanceBookingCalendarController');
const psrController = require('../controllers/employeePsrController')

const multer = require('multer');
const path = require('path');

// upload setup (REUSABLE)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

router.get('/', (req, res) => {
  res.status(200).json({ message: 'pong' });
});

// Guest User level
router.post('/guest/create', upload.single('pfp'), guestController.createGuest);
router.get('/guest/display/:id', guestController.displayGuest);
router.get('/guest/display', guestController.getAllGuests);
router.put('/guest/archive/:id', guestController.archiveGuest);
router.put('/guest/update/:id', guestController.updateGuest);
router.put('/guest/update/pfp/:id', upload.single('pfp'), guestController.updateGuestPfp);
router.put('/guest/unarchive/:id', guestController.unarchiveGuest);

// Admin User level
router.post('/admin/create', upload.single('pfp'), adminController.createAdmin);
router.get('/admin/display', adminController.getAllAdmin);
router.put('/admin/update/:id', adminController.updateAdmin);
router.put('/admin/update/pfp/:id', upload.single('pfp'), adminController.updateAdminPfp);
router.delete('/admin/delete/:id', adminController.deleteAdmin);

// Employee User level
router.post('/employee/create', upload.single('pfp'), employeeController.createEmployee);
router.get('/employee/display', employeeController.getAllEmployees);
router.get('/employee/display/:id', employeeController.getEmployeeById);
router.put('/employee/update/:id', employeeController.updateEmployee);
router.put('/employee/update/pfp/:id', upload.single('pfp'), employeeController.updateEmployeePfp);
router.put('/employee/archive/:id', employeeController.archiveEmployee);
router.put('/employee/unarchive/:id', employeeController.unarchiveEmployee);
router.delete('/employee/delete/:id', employeeController.deleteEmployee);
router.get('/employee/search', employeeController.searchEmployees);

// Role routes
router.post('/roles/create', rolesController.createRoles);
router.put('/roles/update/:id', rolesController.updateRoles);
router.delete('/roles/delete/:id', rolesController.deleteRoles);
router.get('/roles/employees/:name', rolesController.displayEmployeeByRoles);
router.get('/roles/display', rolesController.getAllRoles);
router.get('/roles/display/:id', rolesController.getRoleById);

// OTP routes
router.post('/otp/register', otpController.sendOtpRegistration);
router.post('/otp/forgot-password', otpController.sendOtpForgotPassword);
router.post('/otp/verify', otpController.verifyOtp);
router.post('/otp/resend', otpController.resendOtp);

// Auth routes
router.post('/auth/login', authenticationController.Login);
router.put('/auth/update-password', authenticationController.updatePassword);

// Property routes
router.post('/property/create', upload.array('photo', 10), propertyController.createProperty);
router.get('/property/search', propertyController.searchPropertyAdmin);
router.get('/property/display', propertyController.displayAllProperty);
router.get('/property/display/:id', propertyController.displayByIdProperty);
router.put('/property/update/:id', upload.none(), propertyController.updateProperty);
router.put('/property/update/photos/:id', upload.array('photos', 10), propertyController.updatePhotoProperty);
router.patch('/property/update/status/:id', propertyController.editPropertyStatus);

// adding maintenance
router.post('/property/:id/maintenance/create', propertyController.createMaintenanceById);
router.put('/property/:propertyId/maintenance/update-by-dates', propertyController.updateMaintenanceByDates);
router.delete('/property/:propertyId/maintenance/delete-by-dates', propertyController.deleteMaintenanceByDates);


// Property reports
router.post('/property/:propertyId/report', propertyController.createReport);
router.patch('/property/:propertyId/report/edit-status', propertyController.editReportStatus);
router.delete('/property/:propertyId/report/delete', propertyController.deleteReport);

// Payment method routes
router.post('/paymentPlatform/create', upload.single('qrPicture'), paymentController.createPayment);
router.get('/payments/display', paymentController.displayAllPayment);
router.get('/payments/display/:id', paymentController.displayByIdPayment);
router.put('/payments/update/:id', upload.single('qrPicture'),paymentController.updatePayment);
router.delete('/payments/delete/:id',paymentController.deletePaymentById)

// booking routes
router.post('/booking/create', bookingController.createBooking);
router.patch('/booking/update-status/:id', bookingController.updateStatus);
router.get('/booking/status/:status', bookingController.displayByStatus);
router.get('/booking/property/:propertyId', bookingController.getBookingsByPropertyId);

// booking payment routes
router.patch('/booking/payment/reservation/:id', bookingController.reservationPayment);
router.patch('/booking/payment/package/:id', bookingController.packagePayment);
router.patch('/booking/payment/full/:id', bookingController.fullPayment);

// email generator
router.post('/email/bookingmessage', otpController.BookingMessage);
router.post('/email/cancellationMessage', otpController.cancellationMessage);
router.post('/email/checkin/today', otpController.CheckInTodayMessage);

// notification routes
router.post('/notify/message', notificationController.messageNotification);
router.post('/notify/cancellation', notificationController.cancellationNotification);
router.patch('/notify/seen/:id', notificationController.updateSeen);
router.get('/notify/to/:toId', notificationController.getAllNotificationByToId);
router.delete('/notify/:id', notificationController.deleteNotificationById);

// FAQ routes
router.post('/faq/create', faqController.createFAQ);
router.get('/faq/getAll', faqController.getAllFAQ);
router.put('/faq/update/:id', faqController.updateFAQbyId);
router.delete('/faq/delete/:id', faqController.deleteFAQbyId);
router.get('/faq/five', faqController.get5Faq);

// Admin Dashboard
router.get('/dashboard/admin/summary', adminDashboardController.summary);
router.get('/dashboard/admin/rankProperty', adminDashboardController.rankProperty);
router.get('/dashboard/admin/audit', adminDashboardController.new5AuditTrails);

// Landing page
router.post('/landing/create', upload.single('file'), landingController.createLanding);
router.put('/landing/update/:id', upload.single('file'), landingController.updateLanding);
router.get('/landing/totalOfDaysBooked', landingController.getHowManyDaysofBooked);

// featured properties
router.post('/featured/create', featuredPropertyController.createFeatured);
router.get('/featured/display', featuredPropertyController.getAllFeatured);
router.put('/featured/update/:id', featuredPropertyController.updateFeaturedById);
router.delete('/featured/delete/:id', featuredPropertyController.deleteFeaturedById);

// Audit Trail routes
router.post('/audit/create', auditTrailController.createAudit);
router.get('/audit/getAll', auditTrailController.getAllAudit);
router.get('/audit/getAll/:userType', auditTrailController.getAllAuditByUserType);
router.get('/audit/by-date/:date', auditTrailController.getAuditByDate); // date format: YYYY-MM-DD
router.get('/audit/search', auditTrailController.getAuditBySearchQuery); // ?query=keyword

// Calendar
router.get('/calendar/byProperty/:propertyId', maintenanceBookingCalendarController.getCalendarByPropertyId);
router.get('/calendar/byProperties', maintenanceBookingCalendarController.getCalendarForMultiplePropertyById);
router.get('/calendar/getAllProperties', maintenanceBookingCalendarController.getAllCalendarForAllProperties);

// PSR
router.get('/psr/peakBooking', psrController.mostPeakBookingProperty);
router.get('/psr/peakBookingDay', psrController.peakBookingDay);
router.get('/psr/transactions', psrController.transactions);
router.post('/psr/weekSummary', psrController.generateWeekSummary);
router.post('/psr/monthSummary', psrController.generateMonthSummary);
router.post('/psr/quarterSummary', psrController.generateQuarterSummary);
router.post('/psr/semiAnnualSummary', psrController.generateSemiAnnualSummary);
router.post('/psr/AnnualSummary', psrController.generateAnnualSummary);

module.exports = router;