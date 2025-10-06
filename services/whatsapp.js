const axios = require('axios');
const logger = require('../utils/logger');

class MetaWhatsAppService {
    constructor() {
        this.accessToken = process.env.META_ACCESS_TOKEN;
        this.phoneNumberId = process.env.META_PHONE_NUMBER_ID;
        this.apiVersion = 'v17.0';
        this.baseUrl = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}`;
    }

    async sendMessage(to, message) {
        try {
            const url = `${this.baseUrl}/messages`;
            const payload = {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: to,
                type: 'text',
                text: {
                    body: message
                }
            };

            const response = await axios.post(url, payload, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            console.log(`✅ Message sent to ${to}`);
            return response.data;
        } catch (error) {
            console.error('❌ WhatsApp Send Error:', error.response?.data || error.message);
            throw error;
        }
    }

    async markAsRead(messageId) {
        try {
            const url = `${this.baseUrl}/messages`;
            const payload = {
                messaging_product: 'whatsapp',
                status: 'read',
                message_id: messageId
            };

            await axios.post(url, payload, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            console.log(`📖 Message marked as read: ${messageId}`);
        } catch (error) {
            console.error('Mark as Read Error:', error.response?.data || error.message);
        }
    }

    async downloadMedia(mediaId) {
        try {
            // First, get media URL
            const mediaInfoUrl = `https://graph.facebook.com/${this.apiVersion}/${mediaId}`;
            const mediaInfoResponse = await axios.get(mediaInfoUrl, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });

            const mediaUrl = mediaInfoResponse.data.url;

            // Then download the actual media
            const mediaResponse = await axios.get(mediaUrl, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                },
                responseType: 'arraybuffer'
            });

            console.log(`📥 Media downloaded: ${mediaId}`);
            return Buffer.from(mediaResponse.data);
        } catch (error) {
            console.error('Media Download Error:', error.response?.data || error.message);
            throw error;
        }
    }

    formatExpenseSummary(expenses) {
        if (!expenses || expenses.length === 0) {
            return "No expenses found.";
        }

        const total = expenses.reduce((sum, exp) => sum + exp.amount, 0);
        const count = expenses.length;
        
        let summary = `💰 *${count} expenses* - Total: *₹${total.toFixed(2)}*\n\n`;
        
        expenses.slice(0, 10).forEach(exp => {
            const date = new Date(exp.date).toLocaleDateString('en-IN');
            const merchant = exp.merchant ? ` at ${exp.merchant}` : '';
            summary += `• ₹${exp.amount}${merchant} (${exp.category}) - ${date}\n`;
        });
        
        if (expenses.length > 10) {
            summary += `\n... and ${expenses.length - 10} more`;
        }
        
        return summary;
    }

    formatCategorySummary(categoryTotals) {
        if (!categoryTotals || categoryTotals.length === 0) {
            return "No spending by category found.";
        }

        let summary = "📊 *Spending by Category:*\n\n";
        categoryTotals.forEach(cat => {
            const emoji = this.getCategoryEmoji(cat.category);
            summary += `${emoji} ${cat.category}: ₹${cat.total.toFixed(2)} (${cat.count} items)\n`;
        });
        
        return summary;
    }

    getCategoryEmoji(category) {
        const emojis = {
            food: '🍔',
            transport: '🚗',
            shopping: '🛒',
            entertainment: '🎬',
            healthcare: '🏥',
            utilities: '⚡',
            other: '📦'
        };
        return emojis[category] || '📦';
    }
}

module.exports = new MetaWhatsAppService();
