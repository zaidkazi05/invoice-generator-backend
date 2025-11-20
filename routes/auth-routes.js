const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth-controller');
const authMiddleware = require('../middleware/middleware');

router.post('/user-register', authController.userRegister);
router.post('/user-login', authController.userLogin);
router.post('/client-register', authMiddleware.userMiddleware, authController.clientRegister);
router.post('/client-login', authController.clientLogin);

module.exports = router;