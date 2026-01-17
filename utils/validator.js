const logger = require('./logger');

// Define constants internally if not available in config yet, or we can update config later
const VALID_CATEGORIES = [
    'food', 'transport', 'shopping', 'entertainment',
    'healthcare', 'utilities', 'other', 'rent', 'salary', 'income'
];

class Validator {
    static validatePhone(phone) {
        if (!phone) return false;
        // Remove any non-digit characters except +
        const cleaned = phone.replace(/[^\d+]/g, '');

        // Check if it's a valid international format (10-15 digits)
        const phoneRegex = /^\+?[1-9]\d{10,14}$/;
        return phoneRegex.test(cleaned);
    }

    static validateAmount(amount) {
        if (amount === undefined || amount === null) return false;
        const num = parseFloat(amount);
        // Allow positive numbers up to 10 million (arbitrary logical limit)
        return !isNaN(num) && num > 0 && num < 10000000;
    }

    static validateCategory(category) {
        if (!category) return false;
        return VALID_CATEGORIES.includes(category.toLowerCase());
    }

    static validateDate(dateString) {
        if (!dateString) return true; // null/empty dates are allowed (defaults to today in DB layer if needed)

        const date = new Date(dateString);
        const now = new Date();
        const twoYearsAgo = new Date();
        twoYearsAgo.setFullYear(now.getFullYear() - 2);

        // Allow dates up to 1 day in future (timezone differences) and 2 years in past
        const oneDayFuture = new Date(now);
        oneDayFuture.setDate(oneDayFuture.getDate() + 1);

        return date instanceof Date &&
            !isNaN(date) &&
            date <= oneDayFuture &&
            date >= twoYearsAgo;
    }

    static validateExpenseData(expenseData) {
        const errors = [];

        if (!expenseData) {
            errors.push('Expense data is required');
            return errors;
        }

        if (!this.validateAmount(expenseData.amount)) {
            errors.push('Invalid amount: must be positive number');
        }

        // Optional category validation - if provided, must be valid. If missing, logic elsewhere sets default.
        if (expenseData.category && !this.validateCategory(expenseData.category)) {
            errors.push(`Invalid category. Valid: ${VALID_CATEGORIES.join(', ')}`);
        }

        if (expenseData.date && !this.validateDate(expenseData.date)) {
            errors.push('Invalid date: cannot be in future or older than 2 years');
        }

        if (expenseData.description && expenseData.description.length > 200) {
            errors.push('Description too long (max 200 chars)');
        }

        if (expenseData.merchant && expenseData.merchant.length > 100) {
            errors.push('Merchant name too long (max 100 chars)');
        }

        return errors;
    }

    static sanitizeText(text) {
        if (!text || typeof text !== 'string') return '';

        return text
            .replace(/[<>]/g, '') // Remove potential HTML tags
            .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
            .trim()
            .substring(0, 500); // Limit length
    }

    static validateWebhookSignature(payload, signature, secret) {
        if (!signature || !secret) return false;

        const crypto = require('crypto');
        try {
            const expectedSignature = crypto
                .createHmac('sha256', secret)
                .update(payload) // Payload should be stringified body
                .digest('hex');

            const signatureHash = signature.startsWith('sha256=') ? signature.split('=')[1] : signature;

            return crypto.timingSafeEqual(
                Buffer.from(signatureHash),
                Buffer.from(expectedSignature)
            );
        } catch (e) {
            logger.error('Signature validation error:', e);
            return false;
        }
    }
}

module.exports = Validator;
