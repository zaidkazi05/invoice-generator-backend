const User = require('../models/user-model');
const Client = require('../models/client-model');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const userRegister = async (req, res) => {
    console.log('In user register func');
    const { name, email, password, businessDetails } = req.body;

    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Email already registered'
            })
        }

        const newUser = await User.create({
            name,
            email,
            password,
            role: 'user',
            businessDetails
        });

        return res.status(201).json({
            success: true,
            message: 'User Registered',
            data: newUser
        })
    }
    catch (err) {
        console.error("user register error\n", err);
        return res.status(500).json({
            success: false,
            message: 'Failed to register user',
            error: err.message
        })
    }
}

const userLogin = async (req, res) => {
    console.log('In user Login func');
    const { email, password } = req.body;

    try {
        if (!email || !password) {
            return res.status(400).json({
                status: 'error',
                message: 'Please provide email and password'
            });
        }
        const user = await User.findOne({ email }).select('+password');
        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'User not found'
            })
        }

        const correctPwd = await bcrypt.compare(password, user.password);
        if (!correctPwd) {
            return res.status(401).json({
                success: false,
                message: 'Incorrect Password'
            })
        }

        const token = jwt.sign(
            {
                userId: user._id,
                // role: 'user'
            },
            process.env.JWT_SECRET,
            {
                expiresIn: '7d'
            }
        )

        return res.status(201).json({
            success: true,
            message: 'User Login Successful',
            data: token
        })
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({
            success: false,
            message: 'Failed to login user',
            error: err.message
        })
    }
}

const clientRegister = async (req, res) => {
    console.log('In client register func');
    const { email, password, company } = req.body;

    try {
        const userId = req.user.userId;
        const existingUser = await User.findById(userId);
        if (!existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Cannot find User'
            })
        }
        const existingClient = await Client.findOne({ email });
        if (existingClient) {
            return res.status(400).json({
                success: false,
                message: 'Client already registered'
            })
        }

        const newClient = await Client.create({
            email,
            password,
            company,
            userId
        });

        return res.status(201).json({
            success: true,
            message: 'User Registered',
            data: newClient
        })
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({
            success: false,
            message: 'Failed to register client',
            error: err.message
        })
    }
}

const clientLogin = async (req, res) => {
    console.log('In client Login func');
    const { email, password } = req.body;

    try {
        if (!email || !password) {
            return res.status(400).json({
                status: 'error',
                message: 'Please provide email and password'
            });
        }
        const client = await Client.findOne({ email }).select('+password');
        if (!client) {
            return res.status(400).json({
                success: false,
                message: 'Client not found'
            })
        }

        const correctPwd = await bcrypt.compare(password, client.password);
        if (!correctPwd) {
            return res.status(401).json({
                success: false,
                message: 'Incorrect Password'
            })
        }

        const token = jwt.sign(
            {
                clientId: client._id,
                // role: 'client'
            },
            process.env.JWT_SECRET,
            {
                expiresIn: '7d'
            }
        )

        return res.status(201).json({
            success: true,
            message: 'Client Login Successful',
            data: token
        })
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({
            success: false,
            message: 'Failed to login client',
            error: err.message
        })
    }
}

module.exports = {
    userRegister,
    userLogin,
    clientRegister,
    clientLogin
}