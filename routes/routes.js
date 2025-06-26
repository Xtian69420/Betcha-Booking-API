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

// booking routes
router.post('/booking/create', bookingController.createBooking);

module.exports = router;