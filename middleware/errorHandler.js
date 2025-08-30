const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
    logger.error('Error occurred:', {
        message: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        body: req.body,
        headers: req.headers
    });

    // Default error response
    let status = 500;
    let message = 'Internal Server Error';

    // Handle specific error types
    if (err.name === 'ValidationError') {
        status = 400;
        message = err.message;
    } else if (err.name === 'UnauthorizedError') {
        status = 401;
        message = 'Unauthorized';
    } else if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
        status = 503;
        message = 'Service temporarily unavailable';
    }

    // Don't expose internal errors in production
    if (process.env.NODE_ENV === 'production' && status === 500) {
        message = 'Something went wrong';
    }

    res.status(status).json({
        error: {
            message: message,
            status: status,
            timestamp: new Date().toISOString()
        }
    });
}

module.exports = errorHandler;
