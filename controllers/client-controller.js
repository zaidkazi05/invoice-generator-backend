const User = require('../models/user-model');
const Client = require('../models/client-model');
const Invoice = require('../models/invoice-model');
const mongoose = require('mongoose');

const getClientProfile = async (req, res) => {
    try {
        const clientId = req.client.clientId;

        const clientData = await Client.findById(clientId)
            .populate('userId', 'name businessDetails');

        if (!clientData) {
            return res.status(404).json({
                success: false,
                message: 'Client not found'
            });
        }

        return res.status(200).json({
            success: true,
            data: clientData
        });
    }
    catch (err) {
        return res.status(500).json({
            success: false,
            message: 'Internal Server error',
            error: err.message
        });
    }
};

const getClientDashboard = async (req, res) => {
    console.log("In client get dashboard");
    try {
        const clientId = req.client.clientId;

        // Get dashboard statistics
        const [
            totalInvoices,
            paidInvoices,
            unpaidInvoices,
            overdueInvoices,
            recentInvoices,
            totalAmountBilled,
            totalAmountPaid,
            pendingAmount
        ] = await Promise.all([
            Invoice.countDocuments({ clientId }),
            Invoice.countDocuments({ clientId, status: 'paid' }),
            Invoice.countDocuments({ clientId, status: { $in: ['sent', 'viewed'] } }),
            Invoice.countDocuments({
                clientId,
                status: { $in: ['sent', 'viewed', 'partial_paid'] },
                dueDate: { $lt: new Date() }
            }),
            Invoice.find({ clientId })
                .sort({ createdAt: -1 })
                .limit(5)
                .populate('userId', 'name businessDetails')
                .select('invoiceNumber totalAmount status createdAt dueDate remainingAmount'),
            Invoice.aggregate([
                { $match: { clientId: new mongoose.Types.ObjectId(clientId) } },
                { $group: { _id: null, total: { $sum: '$totalAmount' } } }
            ]),
            Invoice.aggregate([
                { $match: { clientId: new mongoose.Types.ObjectId(clientId), status: 'paid' } },
                { $group: { _id: null, total: { $sum: '$totalAmount' } } }
            ]),
            Invoice.aggregate([
                { $match: { clientId: new mongoose.Types.ObjectId(clientId), status: { $ne: 'paid' } } },
                { $group: { _id: null, total: { $sum: '$remainingAmount' } } }
            ])
        ]);

        // Get payment history
        const paymentHistory = await Invoice.aggregate([
            { $match: { clientId: new mongoose.Types.ObjectId(clientId) } },
            { $unwind: '$payments' },
            { $sort: { 'payments.paidAt': -1 } },
            { $limit: 10 },
            {
                $project: {
                    invoiceNumber: 1,
                    payment: '$payments',
                    totalAmount: 1,
                    status: 1
                }
            }
        ]);

        const dashboardData = {
            stats: {
                totalInvoices,
                paidInvoices,
                unpaidInvoices,
                overdueInvoices,
                totalAmountBilled: totalAmountBilled[0]?.total || 0,
                totalAmountPaid: totalAmountPaid[0]?.total || 0,
                pendingAmount: pendingAmount[0]?.total || 0
            },
            recentInvoices,
            paymentHistory,
            chartData: {
                paidPercentage: totalInvoices > 0 ? ((paidInvoices / totalInvoices) * 100).toFixed(1) : 0,
                unpaidPercentage: totalInvoices > 0 ? ((unpaidInvoices / totalInvoices) * 100).toFixed(1) : 0,
                overduePercentage: totalInvoices > 0 ? ((overdueInvoices / totalInvoices) * 100).toFixed(1) : 0
            },
            upcomingDueDates: await Invoice.find({
                clientId,
                status: { $in: ['sent', 'viewed', 'partial_paid'] },
                dueDate: {
                    $gte: new Date(),
                    $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // Next 30 days
                }
            })
                .sort({ dueDate: 1 })
                .limit(5)
                .select('invoiceNumber totalAmount remainingAmount dueDate status')
        };

        return res.status(200).json({
            success: true,
            data: dashboardData
        });
    }
    catch (err) {
        return res.status(500).json({
            success: false,
            message: 'Internal Server error',
            error: err.message
        });
    }
};

// ...existing code...

const getClientInvoiceDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const clientId = req.client.clientId;

        console.log("Fetching invoice details:", id);

        const invoice = await Invoice.findOne({ _id: id, clientId })
            .populate('userId', 'name businessDetails')
            .select('invoiceNumber invoiceDate dueDate status items subtotal taxAmount discountAmount totalAmount totalPaid remainingAmount notes terms pdfPath clientViewedAt payments');

        if (!invoice) {
            return res.status(404).json({
                success: false,
                message: 'Invoice not found'
            });
        }

        // Update client access timestamp
        invoice.lastClientAccess = new Date();
        if (!invoice.clientViewedAt) {
            invoice.clientViewedAt = new Date();
        }
        await invoice.save();

        return res.status(200).json({
            success: true,
            data: invoice
        });

    } catch (error) {
        console.error('Get client invoice details error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch invoice details',
            error: error.message
        });
    }
};

module.exports = {
    getClientProfile,
    getClientDashboard,
    getClientInvoiceDetails
};