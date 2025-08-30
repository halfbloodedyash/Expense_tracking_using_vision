const crypto = require('crypto');
const logger = require('../utils/logger');

function verifyToken(req, res, next) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    logger.info('Webhook verification attempt:', { mode, token: token ? 'present' : 'missing' });
    
    if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
        logger.info('Webhook verification successful');
        next();
    } else {
        logger.error('Webhook verification failed', { 
            expectedToken: process.env.WEBHOOK_VERIFY_TOKEN ? 'set' : 'missing',
            receivedToken: token,
            mode: mode
        });
        res.sendStatus(403);
    }
}

function verifySignature(req, res, next) {
    const signature = req.headers['x-hub-signature-256'];
    const webhookSecret = process.env.WEBHOOK_SECRET;
    
    // Skip signature verification if secret is not set (development mode)
    if (!webhookSecret) {
        logger.warn('Webhook secret not set, skipping signature verification');
        return next();
    }
    
    if (!signature) {
        logger.error('No signature provided in webhook request');
        return res.sendStatus(401);
    }
    
    try {
        const expectedSignature = crypto
            .createHmac('sha256', webhookSecret)
            .update(JSON.stringify(req.body), 'utf8')
            .digest('hex');
        
        const providedSignature = signature.replace('sha256=', '');
        
        if (crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(providedSignature))) {
            logger.debug('Webhook signature verified successfully');
            next();
        } else {
            logger.error('Invalid webhook signature');
            res.sendStatus(401);
        }
    } catch (error) {
        logger.error('Error verifying webhook signature:', error);
        res.sendStatus(500);
    }
}

module.exports = {
    verifyToken,
    verifySignature
};
