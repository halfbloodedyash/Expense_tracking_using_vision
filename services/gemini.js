const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');

class GeminiService {
    constructor() {
        if (!process.env.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY environment variable is required');
        }
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    }

    // FIXED: Simple and safe regex patterns
    cleanJSONResponse(responseText) {
        if (!responseText) return null;
        
        let cleaned = responseText;
        
        // Remove ```
        cleaned = cleaned.replace(/```json/gi, '');
        
        // Remove ```
        cleaned = cleaned.replace(/```/g, '');
        
        // Remove extra newlines
        cleaned = cleaned.replace(/\n\s*\n/g, '\n');
        
        // Trim whitespace
        cleaned = cleaned.trim();
        
        return cleaned;
    }

    async extractReceiptData(imageBuffer) {
        try {
            logger.info('Sending image to Gemini Vision for processing...');

            const prompt = `
            Analyze this receipt image and extract expense information in Indian context. 
            Return ONLY valid JSON with these fields:
            {
                "amount": <total amount in rupees as number>,
                "merchant": "<store/restaurant name>",
                "category": "<food/transport/shopping/entertainment/healthcare/utilities/other>",
                "date": "<date in YYYY-MM-DD format or null>",
                "items": ["item1", "item2"] or [],
                "currency": "INR"
            }
            
            Important:
            - Amount should be in Indian Rupees (₹) as a number
            - If receipt shows ₹250 or Rs.250, return amount as 250
            - Return ONLY the JSON, no explanations or markdown.
            `;

            const imagePart = {
                inlineData: {
                    data: imageBuffer.toString('base64'),
                    mimeType: 'image/jpeg'
                }
            };

            const result = await this.model.generateContent([prompt, imagePart]);
            const responseText = result.response.text();
            
            logger.info('Raw Gemini response received');

            // Clean the response
            const cleanedResponse = this.cleanJSONResponse(responseText);
            
            if (!cleanedResponse) {
                logger.error('Empty response after cleaning');
                return null;
            }

            // Parse JSON
            let parsedData;
            try {
                parsedData = JSON.parse(cleanedResponse);
            } catch (parseError) {
                logger.error('JSON Parse Error:', parseError.message);
                logger.error('Cleaned response:', cleanedResponse);
                return null;
            }

            // Validate data
            if (!parsedData.amount || typeof parsedData.amount !== 'number') {
                logger.error('Invalid amount in response');
                return null;
            }

            logger.info('✅ Receipt data extracted successfully');

            return {
                amount: parsedData.amount,
                merchant: parsedData.merchant || 'Unknown',
                category: parsedData.category || 'other',
                date: parsedData.date || new Date().toISOString().split('T')[0],
                items: parsedData.items || [],
                currency: 'INR'
            };

        } catch (error) {
            logger.error('Gemini Vision API Error:', error.message);
            return null;
        }
    }

    async generateInsights(expenses) {
        try {
            if (!expenses || expenses.length === 0) {
                return "No expenses to analyze yet. Start tracking your spending in rupees!";
            }

            const total = expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
            const count = expenses.length;

            const prompt = `Analyze ${count} expenses totaling ₹${total.toFixed(2)} in Indian context. Provide 2-3 brief insights in under 150 words about spending patterns.`;

            const result = await this.model.generateContent(prompt);
            return result.response.text().trim();

        } catch (error) {
            logger.error('Insights error:', error.message);
            return "Unable to generate insights right now.";
        }
    }
}

module.exports = new GeminiService();
