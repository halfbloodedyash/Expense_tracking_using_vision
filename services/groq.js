const Groq = require("groq-sdk");
const logger = require('../utils/logger');

class GroqService {
    constructor() {
        this.groq = new Groq({
            apiKey: process.env.GROQ_API_KEY
        });
    }

async parseTextExpense(userMessage) {
    try {
        const prompt = `
        Parse this expense message in Indian context and extract the spending information.
        Message: "${userMessage}"
        
        Return ONLY a valid JSON object:
        {
            "amount": <number in rupees>,
            "description": "<what was purchased>",
            "category": "<one of: food, transport, shopping, entertainment, healthcare, utilities, other>",
            "merchant": "<store name if mentioned, otherwise null>",
            "currency": "INR"
        }
        
        Examples:
        - "Spent 500 on lunch" -> amount: 500
        - "Paid ₹250 for groceries" -> amount: 250
        - "Bus fare 30 rupees" -> amount: 30
        `;

        const completion = await this.groq.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "llama-3.1-8b-instant",
            temperature: 0.1,
            max_tokens: 200
        });

        const response = completion.choices[0].message.content.trim();
        const cleanResponse = response.replace(/``````/g, '').trim();
        
        const parsedData = JSON.parse(cleanResponse);
        
        if (!parsedData.amount || isNaN(parsedData.amount) || parsedData.amount <= 0) {
            return null;
        }

        // Ensure currency is set to INR
        parsedData.currency = 'INR';
        return parsedData;
        
    } catch (error) {
        logger.error('Groq API Error:', error);
        return null;
    }
}


    async generateInsights(expenses) {
        try {
            if (!expenses || expenses.length === 0) {
                return "No expenses found to analyze.";
            }

            // Prepare expense data for analysis
            const expenseData = expenses.slice(-30).map(exp => ({
                amount: exp.amount,
                category: exp.category,
                date: exp.date,
                merchant: exp.merchant,
                description: exp.description
            }));

            const totalAmount = expenseData.reduce((sum, exp) => sum + exp.amount, 0);
            const categoryBreakdown = {};
            
            expenseData.forEach(exp => {
                categoryBreakdown[exp.category] = (categoryBreakdown[exp.category] || 0) + exp.amount;
            });

            const prompt = `
            Analyze these recent expenses and provide 3-4 brief, actionable insights:
            
            Total expenses: $${totalAmount.toFixed(2)}
            Number of transactions: ${expenseData.length}
            
            Category breakdown:
            ${Object.entries(categoryBreakdown).map(([cat, amount]) => `${cat}: $${amount.toFixed(2)}`).join('\n')}
            
            Recent expenses:
            ${expenseData.slice(0, 10).map(exp => `$${exp.amount} - ${exp.description} (${exp.category})`).join('\n')}
            
            Provide insights on:
            1. Spending patterns by category
            2. Frequent merchants or types of purchases
            3. Practical money-saving suggestions
            4. Budget recommendations
            
            Keep response under 250 words, be helpful and encouraging, not judgmental.
            Focus on actionable advice.
            `;

            logger.info('Generating insights for expenses:', expenses.length);

            const completion = await this.groq.chat.completions.create({
                messages: [{ role: "user", content: prompt }],
                model: "llama-3.1-8b-instant",
                temperature: 0.3,
                max_tokens: 300
            });

            const insights = completion.choices[0].message.content.trim();
            
            logger.info('Insights generated successfully');
            return insights;
            
        } catch (error) {
            logger.error('Groq Insights Error:', error);
            return "Unable to generate insights at the moment. Please try again later.";
        }
    }

    async categorizeExpense(description, merchant) {
        try {
            const prompt = `
            Categorize this expense into one of these categories: food, transport, shopping, entertainment, healthcare, utilities, other
            
            Description: "${description}"
            Merchant: "${merchant || 'unknown'}"
            
            Return only the category name, nothing else.
            `;

            const completion = await this.groq.chat.completions.create({
                messages: [{ role: "user", content: prompt }],
                model: "llama-3.1-8b-instant",
                temperature: 0.1,
                max_tokens: 10
            });

            const category = completion.choices[0].message.content.trim().toLowerCase();
            const validCategories = ['food', 'transport', 'shopping', 'entertainment', 'healthcare', 'utilities', 'other'];
            
            return validCategories.includes(category) ? category : 'other';
            
        } catch (error) {
            logger.error('Categorization error:', error);
            return 'other';
        }
    }
}

module.exports = new GroqService();
