const express = require('express');
const router = express.Router();
const userController = require('../controllers/client-controller');
const authMiddleware = require('../middleware/middleware');

router.use(authMiddleware.clientMiddleware);

router.get('/profile', userController.getClientProfile);
router.get('/dashboard', userController.getClientDashboard);
router.get('/clientinvoice/:id', userController.getClientInvoiceDetails);

module.exports = router;