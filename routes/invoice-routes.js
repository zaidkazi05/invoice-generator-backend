const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoice-controller');
const authMiddleware = require('../middleware/middleware');

router.use(authMiddleware.userMiddleware);

router.get('/', invoiceController.getAllInvoices);
router.post('/create', invoiceController.createInvoice);
router.get('/stats', invoiceController.getInvoiceStats);
router.get('/:id', invoiceController.getInvoiceDetails);
router.put('/:id', invoiceController.updateInvoice);
router.put('/status/:id', invoiceController.changeInvoiceStatus);
router.delete('/:id', invoiceController.deleteInvoice);

module.exports = router;