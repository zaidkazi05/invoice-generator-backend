const jwt = require('jsonwebtoken');

const userMiddleware = async (req, res, next) => {
    console.log("In user auth middleware");

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ message: 'Unathorized' });

    const token = authHeader.split(' ')[1];

    try {
        jwt.verify(
            token, process.env.JWT_SECRET,
            (err, decoded) => {
                if (err) return res.sendStatus(403);
                req.user = decoded;     // attach userID to req
                next();
            }
        );

    }
    catch (err) {
        console.error(err);
        return res.status(500).json({
            success: false,
            message: 'Failed to verify user',
            error: err.message
        })
    }
}

const clientMiddleware = async (req, res, next) => {
    console.log("In client auth middleware");

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ message: 'Unathorized' });

    const token = authHeader.split(' ')[1];

    try {
        jwt.verify(
            token, process.env.JWT_SECRET,
            (err, decoded) => {
                if (err) return res.sendStatus(403);
                req.client = decoded;     // attach clientID to req
                next();
            }
        );

    }
    catch (err) {
        console.error(err);
        return res.status(500).json({
            success: false,
            message: 'Failed to verify client',
            error: err.message
        })
    }
}

const authMiddleware = async (req, res, next) => {
    console.log("In auth middleware");

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ message: 'Unathorized' });

    const token = authHeader.split(' ')[1];

    try {
        jwt.verify(
            token, process.env.JWT_SECRET,
            (err, decoded) => {
                if (err) return res.sendStatus(403);
                req.user = decoded;     // attach userID to req
                next();
            }
        );

    }
    catch (err) {
        console.error(err);
        return res.status(500).json({
            success: false,
            message: 'Failed to verify user',
            error: err.message
        })
    }
}

const authorizeRoles = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                message: 'Access Denied: Invalid Role'
            });
        }
        next();
    };
};

module.exports = {
    userMiddleware,
    clientMiddleware,
    authorizeRoles
};