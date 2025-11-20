const express = require('express');
const router = express.Router();
const userController = require('../controllers/user-controller');
const authMiddleware = require('../middleware/middleware');

router.use(authMiddleware.userMiddleware);

router.get('/profile', userController.getUserProfile);
router.get('/dashboard', userController.getUserDashboard);
router.get('/clients', userController.getAllClients);

module.exports = router;