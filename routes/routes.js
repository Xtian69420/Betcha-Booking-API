const express = require('express');
const router = express.Router();
const testController = require('../controllers/testController');
const guestController = require('../controllers/guestController');
const multer = require('multer');
const path = require('path');

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

router.get('/', testController.run);
router.get('/hi', testController.greet);

// CRUD routes for test controllers
router.post('/test', testController.createTest);
router.get('/test', testController.getAllTests);
router.get('/test/:id', testController.getTestById);
router.put('/test/:id', testController.updateTest);
router.delete('/test/:id', testController.deleteTest);

// Guest User level
router.post('/guest/create', upload.single('pfp'), guestController.createGuest);
router.get('/guest/display/:id', guestController.guestDisplay);
router.get('/guest/display', guestController.getAllGuests);
router.put('/guest/archive/:id', guestController.archiveGuest);
router.put('/guest/update/:id', guestController.updateGuest);
router.put('/guest/update/pfp/:id', upload.single('pfp'), guestController.updateGuestPfp);

module.exports = router;