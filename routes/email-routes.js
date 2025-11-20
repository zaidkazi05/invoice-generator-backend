const express = require('express');
const router = express.Router();
const emailController = require('../controllers/email-controller');
const authMiddleware = require('../middleware/middleware');

router.use(authMiddleware.userMiddleware);

router.post('/send-invoice/:invoiceId', emailController.sendInvoice);
router.post('/send-reminder/:invoiceId', emailController.sendPaymentReminder);
router.post('/send-confirmation/:invoiceId', emailController.sendPaymentConfirmation);
router.post('/bulk-reminders', emailController.sendBulkReminders);
router.get('/logs/:invoiceId', emailController.getEmailLogs);

module.exports = router;