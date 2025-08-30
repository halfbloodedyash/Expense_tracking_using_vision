const logger = require('./logger');

class Validator {
    static validatePhone(phone) {
        // Remove any non-digit characters except +
        const cleaned = phone.replace(/[^\d+]/g, '');
        
        // Check if it's a valid international format
        const phoneRegex = /^\+?[1-9]\d{1,14}$/;
        return phoneRegex.test(cleaned);
    }

    static validateAmount(amount) {
        const num = parseFloat(amount);
        return !isNaN(num) && num > 0 && num < 1000000; // Max $1M
    }

    static validateCategory(category) {
        const validCategories = [
            'food', 'transport', 'shopping', 'entertainment', 
            'healthcare', 'utilities', 'other'
        ];
        return validCategories.includes(category?.toLowerCase());
    }

    static validateDate(dateString) {
        if (!dateString) return true; // null dates are allowed
        
        const date = new Date(dateString);
        const now = new Date();
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(now.getFullYear() - 1);
        
        return date instanceof Date && 
               !isNaN(date) && 
               date <= now && 
               date >= oneYearAgo;
    }

    static validateExpenseData(expenseData) {
        const errors = [];
        
        if (!expenseData) {
            errors.push('Expense data is required');
            return errors;
        }

        if (!this.validateAmount(expenseData.amount)) {
            errors.push('Invalid amount');
        }

        if (!this.validateCategory(expenseData.category)) {
            errors.push('Invalid category');
        }

        if (!this.validateDate(expenseData.date)) {
            errors.push('Invalid date');
        }

        if (expenseData.description && expenseData.description.length > 200) {
            errors.push('Description too long');
        }

        if (expenseData.merchant && expenseData.merchant.length > 100) {
            errors.push('Merchant name too long');
        }

        return errors;
    }

    static sanitizeText(text) {
        if (!text || typeof text !== 'string') return '';
        
        return text
            .replace(/[<>]/g, '') // Remove potential HTML tags
            .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
            .trim()
            .substring(0, 1000); // Limit length
    }

    static validateWebhookSignature(payload, signature, secret) {
        if (!signature || !secret) return false;
        
        const crypto = require('crypto');
        const expectedSignature = crypto
            .createHmac('sha256', secret)
            .update(payload, 'utf8')
            .digest('hex');
        
        return crypto.timingSafeEqual(
            Buffer.from(signature.replace('sha256=', '')),
            Buffer.from(expectedSignature)
        );
    }
}

module.exports = Validator;
