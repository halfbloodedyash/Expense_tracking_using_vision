const logger = require('../utils/logger');
const crypto = require('crypto');

/**
 * Verifies the webhook token during Meta's webhook setup
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
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

/**
 * Verifies Meta webhook signature to ensure request authenticity
 * Uses HMAC SHA-256 to validate the x-hub-signature-256 header
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
function verifySignature(req, res, next) {
    // In development mode, you can skip verification, but log a warning
    if (process.env.NODE_ENV === 'development' && process.env.SKIP_SIGNATURE_VERIFICATION === 'true') {
        logger.warn('⚠️ Webhook signature verification SKIPPED (development mode)');
        return next();
    }

    const signature = req.headers['x-hub-signature-256'];
    
    if (!signature) {
        logger.error('Missing x-hub-signature-256 header');
        return res.sendStatus(403);
    }

    if (!process.env.META_APP_SECRET) {
        logger.error('META_APP_SECRET not configured - cannot verify signature');
        return res.sendStatus(500);
    }

    try {
        // Meta sends the signature as "sha256=<hash>"
        const signatureHash = signature.split('=')[1];
        
        // Calculate expected signature
        const expectedHash = crypto
            .createHmac('sha256', process.env.META_APP_SECRET)
            .update(JSON.stringify(req.body))
            .digest('hex');
        
        // Constant-time comparison to prevent timing attacks
        if (crypto.timingSafeEqual(Buffer.from(signatureHash), Buffer.from(expectedHash))) {
            logger.info('✅ Webhook signature verified');
            next();
        } else {
            logger.error('❌ Invalid webhook signature');
            res.sendStatus(403);
        }
    } catch (error) {
        logger.error('Signature verification error:', error);
        res.sendStatus(403);
    }
}

module.exports = {
    verifyToken,
    verifySignature
};
