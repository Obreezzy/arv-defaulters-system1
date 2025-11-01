// backend/middleware/auth.js
// Authentication middleware for protecting routes

const jwt = require('jsonwebtoken');

// Verify JWT token
const verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        
        console.log('🔍 Auth header:', authHeader);
        
        if (!authHeader) {
            return res.status(401).json({
                success: false,
                message: 'Access denied. No token provided.'
            });
        }
        
        const token = authHeader.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Access denied. Invalid token format. Use: Bearer <token>'
            });
        }
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        console.log('✅ Token verified for user:', decoded.username);
        
        req.user = {
            user_id: decoded.user_id,
            username: decoded.username,
            email: decoded.email,
            role: decoded.role
        };
        
        next();
        
    } catch (error) {
        console.error('❌ Token verification failed:', error.message);
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token has expired. Please login again.'
            });
        }
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid token. Please login again.'
            });
        }
        
        return res.status(500).json({
            success: false,
            message: 'Error verifying token',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Verify user role
const verifyRole = (allowedRoles) => {
    return (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    message: 'Access denied. User not authenticated.'
                });
            }
            
            if (!allowedRoles.includes(req.user.role)) {
                console.log('❌ Access denied for role:', req.user.role);
                return res.status(403).json({
                    success: false,
                    message: `Access denied. Required role: ${allowedRoles.join(' or ')}. Your role: ${req.user.role}`
                });
            }
            
            console.log('✅ Role verified:', req.user.role);
            next();
            
        } catch (error) {
            console.error('❌ Role verification error:', error);
            return res.status(500).json({
                success: false,
                message: 'Error verifying user role',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    };
};

// Optional authentication (token not required)
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        
        if (!authHeader) {
            req.user = null;
            return next();
        }
        
        const token = authHeader.split(' ')[1];
        
        if (!token) {
            req.user = null;
            return next();
        }
        
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = {
                user_id: decoded.user_id,
                username: decoded.username,
                email: decoded.email,
                role: decoded.role
            };
        } catch (error) {
            req.user = null;
        }
        
        next();
        
    } catch (error) {
        req.user = null;
        next();
    }
};

module.exports = {
    verifyToken,
    verifyRole,
    optionalAuth
};