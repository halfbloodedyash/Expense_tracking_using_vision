const logger = require('./logger');

class Helpers {
    static formatCurrency(amount, currency = 'USD') {
        try {
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: currency
            }).format(amount);
        } catch (error) {
            logger.error('Currency formatting error:', error);
            return `$${amount.toFixed(2)}`;
        }
    }

    static formatDate(date, locale = 'en-US') {
        try {
            const dateObj = typeof date === 'string' ? new Date(date) : date;
            return dateObj.toLocaleDateString(locale, {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch (error) {
            logger.error('Date formatting error:', error);
            return date.toString();
        }
    }

    static formatRelativeTime(date) {
        try {
            const now = new Date();
            const past = new Date(date);
            const diffMs = now - past;
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            
            if (diffDays === 0) return 'Today';
            if (diffDays === 1) return 'Yesterday';
            if (diffDays < 7) return `${diffDays} days ago`;
            if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
            if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
            return `${Math.floor(diffDays / 365)} years ago`;
        } catch (error) {
            logger.error('Relative time formatting error:', error);
            return this.formatDate(date);
        }
    }

    static generateId(length = 8) {
        const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    static truncateText(text, maxLength = 50) {
        if (!text || text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
    }

    static escapeMarkdown(text) {
        if (!text) return '';
        return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
    }

    static parseAmount(text) {
        // Extract number from text like "$25.50", "25.50", "twenty five", etc.
        const matches = text.match(/[\d,]+\.?\d*/g);
        if (matches) {
            const amount = parseFloat(matches[0].replace(/,/g, ''));
            return isNaN(amount) ? null : amount;
        }
        return null;
    }

    static getDateRange(period) {
        const now = new Date();
        const start = new Date();
        
        switch (period.toLowerCase()) {
            case 'today':
                start.setHours(0, 0, 0, 0);
                break;
            case 'week':
                start.setDate(now.getDate() - 7);
                break;
            case 'month':
                start.setMonth(now.getMonth() - 1);
                break;
            case 'year':
                start.setFullYear(now.getFullYear() - 1);
                break;
            default:
                start.setDate(now.getDate() - 30); // Default to 30 days
        }
        
        return {
            start: start.toISOString().split('T')[0],
            end: now.toISOString().split('T')[0]
        };
    }

    static calculatePercentage(value, total) {
        if (!total || total === 0) return 0;
        return Math.round((value / total) * 100);
    }

    static groupExpensesByCategory(expenses) {
        const grouped = {};
        
        expenses.forEach(expense => {
            const category = expense.category || 'other';
            if (!grouped[category]) {
                grouped[category] = {
                    total: 0,
                    count: 0,
                    expenses: []
                };
            }
            
            grouped[category].total += expense.amount;
            grouped[category].count += 1;
            grouped[category].expenses.push(expense);
        });
        
        return grouped;
    }

    static generateExpenseReport(expenses, period = 'month') {
        if (!expenses || expenses.length === 0) {
            return {
                total: 0,
                count: 0,
                average: 0,
                categories: {},
                topCategory: null,
                period: period
            };
        }

        const total = expenses.reduce((sum, exp) => sum + exp.amount, 0);
        const count = expenses.length;
        const average = total / count;
        const categories = this.groupExpensesByCategory(expenses);
        
        // Find top category by spending
        const topCategory = Object.entries(categories)
            .sort(([,a], [,b]) => b.total - a.total)[0];

        return {
            total: total,
            count: count,
            average: average,
            categories: categories,
            topCategory: topCategory ? {
                name: topCategory[0],
                amount: topCategory[1].total,
                percentage: this.calculatePercentage(topCategory[1].total, total)
            } : null,
            period: period
        };
    }
}

module.exports = Helpers;
