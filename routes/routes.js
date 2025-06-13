const express = require('express');
const router = express.Router();
const testController = require('../controllers/testController');

// Status check
router.get('/', testController.run);

// CRUD routes for test controllers
router.post('/test', testController.createTest);
router.get('/test', testController.getAllTests);
router.get('/test/:id', testController.getTestById);
router.put('/test/:id', testController.updateTest);
router.delete('/test/:id', testController.deleteTest);

module.exports = router;
