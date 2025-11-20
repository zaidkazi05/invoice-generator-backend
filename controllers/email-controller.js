const path = require('path');
const fs = require('fs');
const Invoice = require('../models/invoice-model');
const User = require('../models/user-model');
const Client = require('../models/client-model');
const transporter = require('../config/nodemailer');

const sendInvoice = async (req, res) => {
    console.log("In send invoice");
    try {
        const { invoiceId } = req.params;
        const { customMessage } = req.body;

        // Get invoice with user and client details
        const invoice = await Invoice.findById(invoiceId)
            .populate('userId', 'name email businessDetails')
            .populate('clientId', 'name email company');

        if (!invoice) {
            return res.status(404).json({
                success: false,
                message: 'Invoice not found'
            });
        }
        if (!invoice.pdfPath) {
            return res.status(404).json({
                success: false,
                message: 'Invoice PDF not created'
            })
        }

        // Email content
        const subject = `Invoice ${invoice.invoiceNumber} from ${invoice.userId.businessDetails.companyName || invoice.userId.name}`;

        const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Invoice ${invoice.invoiceNumber}</h2>
        
        <p>Dear ${invoice.clientId.company.name},</p>
        
        <p>Please find attached your invoice for the amount of <strong>₹${invoice.totalAmount}</strong></p>
        
        ${customMessage ? `<p><em>${customMessage}</em></p>` : ''}
        
        <div style="background-color: #f5f5f5; padding: 20px; margin: 20px 0;">
          <h3>Invoice Details:</h3>
          <p><strong>Invoice Number:</strong> ${invoice.invoiceNumber}</p>
          <p><strong>Invoice Date:</strong> ${invoice.invoiceDate.toDateString()}</p>
          <p><strong>Due Date:</strong> ${invoice.dueDate.toDateString()}</p>
          <p><strong>Amount:</strong> ₹${invoice.totalAmount}</p>
          <p><strong>Status:</strong> ${invoice.status}</p>
        </div>
        
        <p>Thank you for your business!</p>
        
        <p>Best regards,<br>
        ${invoice.userId.name}<br>
        ${invoice.userId.businessDetails.companyName || ''}</p>
      </div>
    `;

        // Email options
        const mailOptions = {
            from: `"${invoice.userId.name}" <${process.env.SMTP_USER}>`,
            to: invoice.clientId.email,
            subject: subject,
            html: htmlContent,
            attachments: []
        };

        // Add PDF attachment if exists
        const filepath = path.join(__dirname, '../', invoice.pdfPath);
        if (invoice.pdfPath && fs.existsSync(filepath)) {
            mailOptions.attachments.push({
                filename: `Invoice-${invoice.invoiceNumber}.pdf`,
                // path: invoice.pdfPath,
                path: filepath,
                contentType: 'application/pdf'
            });
        }

        // Send email
        const info = await transporter.sendMail(mailOptions);

        // Log email activity
        await invoice.logEmail('invoice_sent', invoice.clientId.email, {
            status: 'sent',
            emailId: info.messageId,
            pdfGenerated: !!invoice.pdfPath
        });

        // Update invoice status if it was draft
        if (invoice.status === 'draft') {
            invoice.status = 'sent';
            await invoice.save();
        }

        return res.status(200).json({
            success: true,
            message: 'Invoice sent successfully',
            emailId: info.messageId,
            sentTo: invoice.clientId.email
        });

    } catch (error) {
        console.error('Send invoice error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to send invoice',
            error: error.message
        });
    }
};

const sendPaymentReminder = async (req, res) => {
    try {
        const { invoiceId } = req.params;
        const { reminderType = 'gentle', customMessage } = req.body;

        const invoice = await Invoice.findById(invoiceId)
            .populate('userId', 'name email businessDetails')
            .populate('clientId', 'name email company');

        if (!invoice) {
            return res.status(404).json({
                success: false,
                message: 'Invoice not found'
            });
        }

        // Different reminder messages based on type
        const reminderMessages = {
            gentle: 'This is a gentle reminder that your invoice is due.',
            urgent: 'URGENT: Your invoice is overdue. Please arrange payment immediately.',
            final: 'FINAL NOTICE: This is the final reminder for your overdue invoice.'
        };

        const subject = `Payment Reminder - Invoice ${invoice.invoiceNumber}`;

        const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #d32f2f;">Payment Reminder</h2>
        
        <p>Dear ${invoice.clientId.company.name},</p>
        
        <p>${reminderMessages[reminderType]}</p>
        
        ${customMessage ? `<p><em>${customMessage}</em></p>` : ''}
        
        <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 20px; margin: 20px 0;">
          <h3>Outstanding Invoice:</h3>
          <p><strong>Invoice Number:</strong> ${invoice.invoiceNumber}</p>
          <p><strong>Due Date:</strong> ${invoice.dueDate.toDateString()}</p>
          <p><strong>Amount Due:</strong> ₹${invoice.remainingAmount}</p>
          <p><strong>Days Overdue:</strong> ${Math.ceil((new Date() - invoice.dueDate) / (1000 * 60 * 60 * 24))}</p>
        </div>
        
        <p>Please arrange payment at your earliest convenience.</p>
        
        <p>Best regards,<br>
        ${invoice.userId.name}<br>
        ${invoice.userId.businessDetails.companyName || ''}</p>
      </div>
    `;

        const mailOptions = {
            from: `"${invoice.userId.name}" <${process.env.EMAIL_USER}>`,
            to: invoice.clientId.email,
            subject: subject,
            html: htmlContent
        };

        const info = await transporter.sendMail(mailOptions);

        // Log email activity
        await invoice.logEmail('payment_reminder', invoice.clientId.email, {
            status: 'sent',
            emailId: info.messageId
        });

        return res.status(200).json({
            success: true,
            message: 'Payment reminder sent successfully',
            emailId: info.messageId,
            reminderType: reminderType
        });

    } catch (error) {
        console.error('Send reminder error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to send reminder',
            error: error.message
        });
    }
};

const sendPaymentConfirmation = async (req, res) => {
    try {
        const { invoiceId } = req.params;
        const { paymentAmount, paymentMethod, transactionId } = req.body;
        const userId = req.user.userId;

        const invoice = await Invoice.findById(invoiceId)
            .populate('userId', 'name email businessDetails')
            .populate('clientId', 'name email company');

        if (!invoice) {
            return res.status(404).json({
                success: false,
                message: 'Invoice not found'
            });
        }

        if (!paymentAmount || paymentAmount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid payment amount'
            });
        }
        if (!transactionId) {
            return res.status(400).json({
                success: false,
                message: 'Invalid Transaction Id'
            });
        }

        // Update the invoice status to 'paid'
        // Use the model method to change status
        // const status = invoice.remainingAmount - paymentAmount <= 0 ? 'paid' : 'partial_paid';
        // const reason = `Payment of ₹${paymentAmount} received via ${paymentMethod}`;
        // await invoice.changeStatus(status, {
        //     userId: userId,
        //     role: 'user'
        // }, reason);
        // invoice.status = 'paid';
        // invoice.remainingAmount = 0; // Set remaining amount to 0
        // await invoice.save(); // Save the updated invoice

        // Add payment record (this saves the invoice and triggers pre-save recalculations)
        const updatedInvoice = await invoice.addPayment(
            { amount: paymentAmount, method: paymentMethod, transactionId, paidAt: new Date() },
            { userId: userId, role: 'user' }
        );

        // If needed, ensure status is 'paid' when remainingAmount <= 0
        if (updatedInvoice.remainingAmount <= 0 && updatedInvoice.status !== 'paid') {
            await updatedInvoice.changeStatus('paid', { userId: userId, role: 'user' }, `Payment of ₹${paymentAmount} received`);
        }

        // Use the latest invoice state for email content and logging
        await updatedInvoice.populate('userId', 'name businessDetails').execPopulate?.() || null;


        const subject = `Payment Received - Invoice ${invoice.invoiceNumber}`;

        const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4caf50;">Payment Confirmation</h2>
        
        <p>Dear ${invoice.clientId.company.name},</p>
        
        <p>Thank you! We have received your payment for Invoice ${invoice.invoiceNumber}.</p>
        
        <div style="background-color: #e8f5e8; border: 1px solid #4caf50; padding: 20px; margin: 20px 0;">
          <h3>Payment Details:</h3>
          <p><strong>Amount Received:</strong> ₹${paymentAmount}</p>
          <p><strong>Payment Method:</strong> ${paymentMethod}</p>
          <p><strong>Payment Date:</strong> ${new Date().toDateString()}</p>
          <p><strong>Old Invoice Status:</strong> ${invoice.status}</p>
          <p><strong>Invoice Status:</strong> ${updatedInvoice.status}</p>
          ${invoice.remainingAmount > 0 ? `<p><strong>Remaining Balance:</strong> ₹${invoice.remainingAmount}</p>` : ''}
        </div>
        
        <p>We appreciate your business!</p>
        
        <p>Best regards,<br>
        ${invoice.userId.name}<br>
        ${invoice.userId.businessDetails.companyName || ''}</p>
      </div>
    `;

        const mailOptions = {
            from: `"${invoice.userId.name}" <${process.env.EMAIL_USER}>`,
            to: invoice.clientId.email,
            subject: subject,
            html: htmlContent
        };

        const info = await transporter.sendMail(mailOptions);

        await invoice.logEmail('payment_received', invoice.clientId.email, {
            status: 'sent',
            emailId: info.messageId
        });

        return res.status(200).json({
            success: true,
            message: 'Payment confirmation sent successfully',
            emailId: info.messageId
        });

    } catch (error) {
        console.error('Send payment confirmation error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to send confirmation',
            error: error.message
        });
    }
};

const sendBulkReminders = async (req, res) => {
    try {
        const { invoiceIds, reminderType = 'gentle' } = req.body;
        const userID = req.user.userId;

        if (!invoiceIds || invoiceIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No invoices selected'
            });
        }

        const results = [];
        const errors = [];

        for (const invoiceId of invoiceIds) {
            try {
                const invoice = await Invoice.findOne({
                    _id: invoiceId,
                    userId: userID,
                    status: { $in: ['sent', 'overdue', 'partial_paid', 'viewed'] }
                })
                    .populate('userId', 'name email businessDetails')
                    .populate('clientId', 'name email company');

                if (!invoice) {
                    errors.push({ invoiceId, error: 'Invoice not found' });
                    continue;
                }

                // Send reminder (reuse logic from sendPaymentReminder)
                const reminderMessages = {
                    gentle: 'This is a gentle reminder that your invoice is due.',
                    urgent: 'URGENT: Your invoice is overdue. Please arrange payment immediately.',
                    final: 'FINAL NOTICE: This is the final reminder for your overdue invoice.'
                };

                const subject = `Payment Reminder - Invoice ${invoice.invoiceNumber}`;
                const htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #d32f2f;">Payment Reminder</h2>
            <p>Dear ${invoice.clientId.company.name},</p>
            <p>${reminderMessages[reminderType]}</p>
            <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 20px; margin: 20px 0;">
              <h3>Outstanding Invoice:</h3>
              <p><strong>Invoice Number:</strong> ${invoice.invoiceNumber}</p>
              <p><strong>Due Date:</strong> ${invoice.dueDate.toDateString()}</p>
              <p><strong>Amount Due:</strong> ₹${invoice.remainingAmount}</p>
            </div>
            <p>Please arrange payment at your earliest convenience.</p>
            <p>Best regards,<br>${invoice.userId.name}</p>
          </div>
        `;

                const mailOptions = {
                    from: `"${invoice.userId.name}" <${process.env.EMAIL_USER}>`,
                    to: invoice.clientId.email,
                    subject: subject,
                    html: htmlContent
                };

                const info = await transporter.sendMail(mailOptions);

                await invoice.logEmail('payment_reminder', invoice.clientId.email, {
                    status: 'sent',
                    emailId: info.messageId
                });

                results.push({
                    invoiceId,
                    invoiceNumber: invoice.invoiceNumber,
                    sentTo: invoice.clientId.email,
                    emailId: info.messageId
                });

            } catch (error) {
                errors.push({ invoiceId, error: error.message });
            }
        }

        return res.status(200).json({
            success: true,
            message: `Sent ${results.length} reminders successfully`,
            results,
            errors,
            totalSent: results.length,
            totalErrors: errors.length
        });

    } catch (error) {
        console.error('Bulk reminder error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to send bulk reminders',
            error: error.message
        });
    }
};

const getEmailLogs = async (req, res) => {
    try {
        const { invoiceId } = req.params;

        const invoice = await Invoice.findById(invoiceId).select('emailLog invoiceNumber');

        if (!invoice) {
            return res.status(404).json({ message: 'Invoice not found' });
        }

        return res.status(200).json({
            success: true,
            invoiceNumber: invoice.invoiceNumber,
            emailLogs: invoice.emailLog.sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt))
        });

    } catch (error) {
        console.error('Get email logs error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to get email logs',
            error: error.message
        });
    }
};


module.exports = {
    sendInvoice,
    sendPaymentReminder,
    sendPaymentConfirmation,
    sendBulkReminders,
    getEmailLogs
};