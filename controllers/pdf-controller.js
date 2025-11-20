const PDFDocument = require('pdfkit');
const Invoice = require('../models/invoice-model');
const User = require('../models/user-model');
const Client = require('../models/client-model');
const cloudinary = require('../config/cloudinary');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const streamifier = require('streamifier');

const generatePDFContent = async (doc, invoice) => {
    // Header
    doc.fontSize(20).text('INVOICE', 50, 50);

    // Company details (User/Business)
    doc.fontSize(12)
        .text('From:', 50, 100)                         // 50, 100 -> are x, y coordinatees
        .text(invoice.userId.name, 50, 120)
        .text(invoice.userId.businessDetails?.companyName || '', 50, 140)
        .text(invoice.userId.businessDetails?.address || '', 50, 160)
        .text(`GST: ${invoice.userId.businessDetails?.gstNo || 'N/A'}`, 50, 180);

    // Client details
    doc.text('To:', 50, 220)
        .text(invoice.clientId.name, 50, 240)
        .text(invoice.clientId.company.name, 50, 260)
        .text(invoice.clientId.company.address, 50, 280)
        .text(invoice.clientId.email, 50, 300)
        .text(`GST: ${invoice.clientId.company.gstNo || 'N/A'}`, 50, 320);

    // Invoice details (right side)
    doc.text(`Invoice #: ${invoice.invoiceNumber}`, 350, 120)
        .text(`Date: ${invoice.invoiceDate.toLocaleDateString()}`, 350, 140)
        .text(`Due Date: ${invoice.dueDate.toLocaleDateString()}`, 350, 160)
        .text(`Status: ${invoice.status.toUpperCase()}`, 350, 180);

    // Items table header
    const tableTop = 380;
    doc.fontSize(10)
        .text('Description', 50, tableTop)
        .text('Qty', 300, tableTop)
        .text('Rate (Rs.)', 350, tableTop)
        .text('Amount (Rs.)', 450, tableTop);

    // Line under header
    doc.moveTo(50, tableTop + 15)
        .lineTo(550, tableTop + 15)
        .stroke();

    // Items
    let yPosition = tableTop + 25;
    invoice.items.forEach((item, index) => {
        doc.text(item.description, 50, yPosition)
            .text(item.quantity.toString(), 300, yPosition)
            .text(`${item.rate.toFixed(2)}`, 350, yPosition)
            .text(`${item.amount.toFixed(2)}`, 450, yPosition);

        yPosition += 20;
    });

    // Totals
    const totalsTop = yPosition + 20;
    doc.moveTo(50, totalsTop)
        .lineTo(500, totalsTop)
        .stroke();

    doc.fontSize(10)
        .text('Subtotal:', 350, totalsTop + 10)
        .text(`₹${invoice.subtotal.toFixed(2)}`, 450, totalsTop + 10)
        .text('Tax:', 350, totalsTop + 30)
        .text(`₹${invoice.taxAmount.toFixed(2)}`, 450, totalsTop + 30);

    if (invoice.discountAmount > 0) {
        doc.text('Discount:', 350, totalsTop + 50)
            .text(`₹${invoice.discountAmount.toFixed(2)}`, 450, totalsTop + 50);
    }

    doc.fontSize(12)
        .text('Total:', 350, totalsTop + 70)
        .text(`₹${invoice.totalAmount.toFixed(2)}`, 450, totalsTop + 70);

    // Payment info
    if (invoice.totalPaid > 0) {
        doc.fontSize(10)
            .text('Paid:', 350, totalsTop + 100)
            .text(`₹${invoice.totalPaid.toFixed(2)}`, 450, totalsTop + 100)
            .text('Balance:', 350, totalsTop + 120)
            .text(`₹${invoice.remainingAmount.toFixed(2)}`, 450, totalsTop + 120);
    }

    // Terms and notes
    if (invoice.terms) {
        doc.fontSize(8)
            .text('Terms & Conditions:', 50, totalsTop + 150)
            .text(invoice.terms, 50, totalsTop + 170, { width: 500 });
    }

    if (invoice.notes) {
        doc.fontSize(8)
            .text('Notes:', 50, totalsTop + 220)
            .text(invoice.notes, 50, totalsTop + 240, { width: 500 });
    }

    // Footer
    doc.fontSize(8)
        .text('Thank you for your business!', 50, 750, { align: 'center' });
};

const ensureUploadDir = () => {
    const uploadDir = path.join(__dirname, '../uploadPdf');
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }
    return uploadDir;
};

// const generateInvoicePDF = async (req, res) => {
//     try {
//         const { invoiceId } = req.params;

//         // Get invoice with populated data
//         const invoice = await Invoice.findById(invoiceId)
//             .populate('userId', 'name businessDetails')
//             .populate('clientId', 'name company email');

//         if (!invoice) {
//             return res.status(404).json({ error: 'Invoice not found' });
//         }

//         // Create PDF document
//         const doc = new PDFDocument({ margin: 50 });

//         // Store PDF chunks
//         const chunks = [];
//         doc.on('data', chunk => chunks.push(chunk));

//         // Generate PDF content
//         await generatePDFContent(doc, invoice);

//         // End the document
//         doc.end();

//         // Wait for PDF to be complete
//         doc.on('end', async () => {
//             try {
//                 const now = new Date();
//                 const formattedDate = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
//                 const pdfBuffer = Buffer.concat(chunks);

//                 // Upload to Cloudinary
//                 const uploadResult = await new Promise((resolve, reject) => {
//                     cloudinary.uploader.upload_stream(
//                         {
//                             resource_type: 'raw',
//                             folder: 'invoices',
//                             public_id: `invoice_${invoice.invoiceNumber}_${formattedDate}`,
//                             format: 'pdf'
//                         },
//                         (error, result) => {
//                             if (error) reject(error);
//                             else resolve(result);
//                         }
//                     ).end(pdfBuffer);
//                 });

//                 // Update invoice with PDF URL
//                 invoice.pdfPath = uploadResult.secure_url;
//                 await invoice.save();

//                 // Log email activity
//                 await invoice.logEmail('invoice_sent', invoice.clientId.email, {
//                     pdfGenerated: true
//                 });

//                 return res.status(200).json({
//                     success: true,
//                     pdfUrl: uploadResult.secure_url,
//                     message: 'PDF generated successfully'
//                 });

//             } catch (uploadError) {
//                 console.error('Cloudinary upload error:', uploadError);
//                 return res.status(500).json({ error: 'Failed to upload PDF' });
//             }
//         });

//     } catch (error) {
//         console.error('PDF generation error:', error);
//         return res.status(500).json({ error: 'Failed to generate PDF' });
//     }
// };

// const https = require('https');
// const downloadInvoicePDF = async (req, res) => {
//     try {
//         const { invoiceId } = req.params;
//         console.log("Invoice ID:", invoiceId);
//         const invoice = await Invoice.findById(invoiceId);

//         if (!invoice) {
//             return res.status(404).json({ error: 'Invoice not found' });
//         }

//         if (!invoice.pdfPath) {
//             return res.status(404).json({ error: 'PDF not found, please generate first' });
//         }


//     } catch (error) {
//         console.error('PDF download error:', error);
//         return res.status(500).json({ error: 'Failed to get PDF download link' });
//     }
// };

const generateInvoicePDF = async (req, res) => {
    console.log("In generate pdf");

    try {
        const { invoiceId } = req.params;

        // Get invoice with populated data
        const invoice = await Invoice.findById(invoiceId)
            .populate('userId', 'name email businessDetails')
            .populate('clientId', 'name email company');

        if (!invoice) {
            return res.status(404).json({ message: 'Invoice not found' });
        }

        // Create PDF document
        const doc = new PDFDocument({ margin: 50 });

        // Generate filename and path
        const now = new Date(Date.now());
        const formattedDate = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
        const filename = `invoice-${invoice.invoiceNumber}-${formattedDate}.pdf`;
        const uploadDir = ensureUploadDir();
        const filepath = path.join(uploadDir, filename);

        // Pipe PDF to file
        doc.pipe(fs.createWriteStream(filepath));

        // Add content to PDF
        await generatePDFContent(doc, invoice);

        // Finalize PDF
        doc.end();

        // Wait for file to be written
        doc.on('end', async () => {
            // Update invoice with PDF path
            invoice.pdfPath = `/uploadPdf/${filename}`;
            await invoice.save();

            // Log PDF generation
            await invoice.logEmail('invoice_sent', invoice.clientId.email, {
                pdfGenerated: true
            });

            return res.status(200).json({
                success: true,
                message: 'PDF generated successfully',
                pdfPath: invoice.pdfPath,
                filename: filename
            });
        });

    } catch (error) {
        console.error('PDF generation error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error generating PDF',
            error: error.message
        });
    }
};

const downloadInvoicePDF = async (req, res) => {
    console.log("In download pdf");

    try {
        const { invoiceId } = req.params;

        let invoice = await Invoice.findById(invoiceId)        
            .populate('userId', 'name businessDetails')
            .populate('clientId', 'name company email');

        if (!invoice) {
            return res.status(404).json({
                success: false,
                message: 'Invoice not found'
            });
        }

        if (!invoice.pdfPath) {
            return res.status(400).json({
                success: false,
                message: 'PDF not found. Generate PDF first.'
            });
        }
        // if (!invoice.pdfPath) {
        //     console.log('PDF not found, generating...');
            
        //     try {
        //         // Create mock request and response for generateInvoicePDF
        //         const generateReq = {
        //             params: { invoiceId: invoice._id },
        //             user: req.user
        //         };

        //         const generateRes = {
        //             status: function(code) {
        //                 this.statusCode = code;
        //                 return this;
        //             },
        //             json: function(data) {
        //                 if (data.success) {
        //                     console.log('PDF generated successfully');
        //                 }
        //                 return this;
        //             }
        //         };

        //         await generateInvoicePDF(generateReq, generateRes);

        //         // Refresh invoice data to get updated pdfPath
        //         invoice = await Invoice.findById(invoiceId);

        //     } catch (generateError) {
        //         console.error('Error generating PDF:', generateError);
        //         return res.status(500).json({
        //             success: false,
        //             message: 'Failed to generate PDF',
        //             error: generateError.message
        //         });
        //     }
        // }

        const filepath = path.join(__dirname, '../', invoice.pdfPath);

        // Check if file exists
        if (!fs.existsSync(filepath)) {
            return res.status(404).json({
                success: false,
                message: 'PDF file not found on server'
            });
        }

        // Set headers for download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`);

        // Stream file to response
        const fileStream = fs.createReadStream(filepath);
        fileStream.pipe(res);

    } catch (error) {
        console.error('PDF download error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error downloading PDF',
            error: error.message
        });
    }
};

const viewInvoicePDF = async (req, res) => {
    try {
        const { invoiceId } = req.params;

        const invoice = await Invoice.findById(invoiceId);
        if (!invoice) {
            return res.status(404).json({
                success: false,
                message: 'Invoice not found'
            });
        }

        if (!invoice.pdfPath) {
            return res.status(404).json({
                success: false,
                message: 'PDF not found. Generate PDF first.'
            });
        }

        const filepath = path.join(__dirname, '../', invoice.pdfPath);

        // Check if file exists
        if (!fs.existsSync(filepath)) {
            return res.status(404).json({
                success: false,
                message: 'PDF file not found on server'
            });
        }

        // Set headers for inline viewing
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline');

        // Stream file to response
        const fileStream = fs.createReadStream(filepath);
        fileStream.pipe(res);

        // Update client viewed timestamp
        // if (req.user && req.user.role === 'client') {
        if (req.client && req.client.clientId === 'client') {
            invoice.clientViewedAt = new Date();
            invoice.lastClientAccess = new Date();
            if (invoice.status === 'sent') {
                invoice.status = 'viewed';
            }
            await invoice.save();
        }

    } catch (error) {
        console.error('PDF view error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error viewing PDF',
            error: error.message
        });
    }
};

const regenerateInvoicePDF = async (req, res) => {
    try {
        const { invoiceId } = req.params;

        const invoice = await Invoice.findById(invoiceId)
            .populate('userId', 'name email businessDetails')
            .populate('clientId', 'name email company');

        if (!invoice) {
            return res.status(404).json({
                success: false,
                message: 'Invoice not found'
            });
        }

        // Delete old PDF if exists
        if (invoice.pdfPath) {
            const oldFilepath = path.join(__dirname, '../', invoice.pdfPath);
            if (fs.existsSync(oldFilepath)) {
                fs.unlinkSync(oldFilepath);
            }
        }

        // Generate new PDF
        const now = new Date(Date.now());
        const formattedDate = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
        const doc = new PDFDocument({ margin: 50 });
        const filename = `invoice-${invoice.invoiceNumber}-${formattedDate}.pdf`;
        const uploadDir = ensureUploadDir();
        const filepath = path.join(uploadDir, filename);

        doc.pipe(fs.createWriteStream(filepath));
        generatePDFContent(doc, invoice);
        doc.end();

        doc.on('end', async () => {
            invoice.pdfPath = `/uploadPdf/${filename}`;
            await invoice.save();

            return res.json({
                success: true,
                message: 'PDF regenerated successfully',
                pdfPath: invoice.pdfPath,
                filename: filename
            });
        });

    } catch (error) {
        console.error('PDF regeneration error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error regenerating PDF',
            error: error.message
        });
    }
};

const deleteInvoicePDF = async (req, res) => {
    try {
        const { invoiceId } = req.params;

        const invoice = await Invoice.findById(invoiceId);
        if (!invoice) {
            return res.status(404).json({
                success: false,
                message: 'Invoice not found'
            });
        }

        if (!invoice.pdfPath) {
            return res.status(404).json({
                success: false,
                message: 'No PDF to delete'
            });
        }

        const filepath = path.join(__dirname, '../', invoice.pdfPath);

        // Delete file if exists
        if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
        }

        // Clear PDF path from database
        invoice.pdfPath = null;
        await invoice.save();

        return res.json({
            success: true,
            message: 'PDF deleted successfully'
        });

    } catch (error) {
        console.error('PDF deletion error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error deleting PDF',
            error: error.message
        });
    }
};

const generateInvoicePDFCloudinary = async (req, res) => {
    console.log("In generate pdf cloudinary");

    try {
        const { invoiceId } = req.params;

        // Get invoice with populated data
        const invoice = await Invoice.findById(invoiceId)
            .populate('userId', 'name email businessDetails')
            .populate('clientId', 'name email company');

        if (!invoice) {
            return res.status(404).json({ message: 'Invoice not found' });
        }

        console.log("before pdf buffer");
        // 🔹 EDITED: Create PDF in memory (no file path)
        const pdfBuffer = await new Promise((resolve, reject) => {
            const doc = new PDFDocument({ margin: 50 });
            const chunks = [];

            doc.on('data', (chunk) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            // Add content to PDF (same as your generatePDFContent)
            doc.fontSize(20).text(`Invoice #${invoice.invoiceNumber}`, { align: 'center' });
            doc.moveDown();

            doc.fontSize(12).text(`Date: ${invoice.invoiceDate.toDateString()}`);
            doc.text(`Due Date: ${invoice.dueDate.toDateString()}`);
            doc.text(`Client: ${invoice.clientId.company.name}`);
            doc.text(`Client Email: ${invoice.clientId.email}`);
            doc.text(`Amount: ₹${invoice.totalAmount}`);
            doc.text(`Status: ${invoice.status}`);
            doc.moveDown();
            doc.text('Thank you for your business!', { align: 'center' });

            doc.end();
        });
        console.log("after pdf buffer, before pdf upload");

        // 🔹 EDITED: Upload PDF buffer to Cloudinary
        const cloudinaryUpload = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    resource_type: 'raw', // important for PDFs
                    folder: 'invoices'
                },
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                }
            );
            streamifier.createReadStream(pdfBuffer).pipe(uploadStream);
        });
        console.log("after pdf upload");

        // 🔹 EDITED: Save Cloudinary URL in invoice
        invoice.pdfPath = cloudinaryUpload.secure_url;
        await invoice.save();

        // Log PDF generation
        await invoice.logEmail('invoice_sent', invoice.clientId.email, {
            pdfGenerated: true,
            cloudinaryUrl: invoice.pdfPath
        });

        return res.status(200).json({
            success: true,
            message: 'PDF generated and uploaded to Cloudinary successfully',
            pdfPath: invoice.pdfPath
        });

    } catch (error) {
        console.error('PDF generation error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error generating PDF',
            error: error.message
        });
    }
};

module.exports = {
    generateInvoicePDF,
    downloadInvoicePDF,
    viewInvoicePDF,
    regenerateInvoicePDF,
    deleteInvoicePDF,
    generateInvoicePDFCloudinary
}