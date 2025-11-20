const User = require('../models/user-model');
const Client = require('../models/client-model');
const Invoice = require('../models/invoice-model');
const mongoose = require('mongoose');

const getUserProfile = async (req, res) => {
    console.log("In user get profile");
    try {
        const userId = req.user.userId;
        console.log("UserID:", userId);

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            })
        }

        return res.status(200).json({
            success: true,
            data: user
        })
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({
            success: false,
            message: 'Internal Server error',
            error: err.message
        })
    }
}

const getUserDashboard = async (req, res) => {
    try {
        const userId = req.user.userId;
        console.log("UserID:", userId);

        // Get dashboard statistics
        const [
            totalInvoices,
            paidInvoices,
            unpaidInvoices,
            overdueInvoices,
            totalClients,
            recentInvoices,
            totalRevenue,
            pendingAmount
        ] = await Promise.all([
            Invoice.countDocuments({ userId }),
            Invoice.countDocuments({ userId, status: 'paid' }),
            Invoice.countDocuments({ userId, status: { $in: ['sent', 'viewed'] } }),
            Invoice.countDocuments({
                userId,
                status: { $in: ['sent', 'viewed', 'partial_paid', 'overdue'] },
                dueDate: { $lt: new Date() }
            }),
            Client.countDocuments({ userId }),
            Invoice.find({ userId })
                .sort({ createdAt: -1 })
                .limit(5)
                .populate('clientId', 'name company')
                .select('invoiceNumber totalAmount status createdAt dueDate'),
            Invoice.aggregate([
                { $match: { userId: new mongoose.Types.ObjectId(userId), status: 'paid' } },
                { $group: { _id: null, total: { $sum: '$totalAmount' } } }
            ]),
            Invoice.aggregate([
                { $match: { userId: new mongoose.Types.ObjectId(userId), status: { $ne: 'paid' } } },
                { $group: { _id: null, total: { $sum: '$remainingAmount' } } }
            ])
        ]);

        console.log("Pending Amount:", pendingAmount);

        const dashboardData = {
            stats: {
                totalInvoices,
                paidInvoices,
                unpaidInvoices,
                overdueInvoices,
                totalClients,
                totalRevenue: totalRevenue[0]?.total || 0,
                pendingAmount: pendingAmount[0]?.total || 0
            },
            recentInvoices,
            chartData: {
                paidPercentage: totalInvoices > 0 ? ((paidInvoices / totalInvoices) * 100).toFixed(1) : 0,
                unpaidPercentage: totalInvoices > 0 ? ((unpaidInvoices / totalInvoices) * 100).toFixed(1) : 0,
                overduePercentage: totalInvoices > 0 ? ((overdueInvoices / totalInvoices) * 100).toFixed(1) : 0
            }
        };

        return res.status(200).json({
            success: true,
            data: dashboardData
        });
    }
    catch (err) {
        console.log(err);
        return res.status(500).json({
            success: false,
            message: 'Internal Server error',
            error: err.message
        });
    }
};

const getAllClients = async (req, res) => {
    try {
        const userId = req.user.userId;
        console.log(userId);
        const { search = '', sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

        // Build search query
        const searchQuery = {
            userId,
            ...(search && {
                $or: [
                    { name: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } },
                    { 'company.name': { $regex: search, $options: 'i' } }
                ]
            })
        };

        const sortOptions = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

        // Get all matching clients
        const clients = await Client.find(searchQuery)
            .select('-password')
            .sort(sortOptions);


        // Get invoice statistics for each client
        const clientsWithStats = await Promise.all(
            clients.map(async (client) => {
                const [totalInvoices, totalAmount, paidAmount] = await Promise.all([
                    Invoice.countDocuments({ userId, clientId: client._id }),
                    Invoice.aggregate([
                        { $match: { userId: new mongoose.Types.ObjectId(userId), clientId: new mongoose.Types.ObjectId(client._id) } },
                        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
                    ]),
                    Invoice.aggregate([
                        { $match: { userId: new mongoose.Types.ObjectId(userId), clientId: new mongoose.Types.ObjectId(client._id), status: 'paid' } },
                        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
                    ])
                ]);

                return {
                    ...client.toObject(),
                    stats: {
                        totalInvoices,
                        totalAmount: totalAmount[0]?.total || 0,
                        paidAmount: paidAmount[0]?.total || 0,
                        pendingAmount: (totalAmount[0]?.total || 0) - (paidAmount[0]?.total || 0)
                    }
                };
            })
        );

        return res.status(200).json({
            success: true,
            data: {
                clients: clientsWithStats
            }
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

module.exports = {
    getUserProfile,
    getUserDashboard,
    getAllClients
};