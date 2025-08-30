const logger = require('../utils/logger');

function verifyToken(req, res, next) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    
    if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
        logger.info('Webhook verification successful');
        next();
    } else {
        logger.error('Webhook verification failed');
        res.sendStatus(403);
    }
}

function verifySignature(req, res, next) {
    // Skip signature verification for development
    next();
}

module.exports = {
    verifyToken,
    verifySignature
};
const logger = require('../utils/logger');

function verifyToken(req, res, next) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    
    if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
        logger.info('Webhook verification successful');
        next();
    } else {
        logger.error('Webhook verification failed');
        res.sendStatus(403);
    }
}

function verifySignature(req, res, next) {
    // Skip signature verification for development
    next();
}

module.exports = {
    verifyToken,
    verifySignature
};
