const { GoogleGenerativeAI } = require("@google/generative-ai");
const logger = require('../utils/logger');

class GeminiService {
    constructor() {
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    }

    async extractReceiptData(imageBuffer) {
        try {
            const prompt = `
            Analyze this receipt/bill image and extract expense information.
            Return ONLY a valid JSON object with this exact structure:
            {
                "amount": <total amount as number>,
                "merchant": "<store/restaurant name>",
                "date": "<date in YYYY-MM-DD format or null if not clear>",
                "category": "<one of: food, transport, shopping, entertainment, healthcare, utilities, other>",
                "items": ["<list of main items purchased if visible>"],
                "description": "<brief description of purchase>"
            }

            Rules:
            - Extract the FINAL TOTAL amount, not subtotals or tax
            - If date is unclear, use null
            - Choose the most appropriate category based on the merchant and items
            - If no items are clearly visible, use empty array
            - Be accurate, don't guess values
            - Merchant should be the business name, not just a description
            `;

            const imagePart = {
                inlineData: {
                    data: imageBuffer.toString('base64'),
                    mimeType: "image/jpeg"
                }
            };

            logger.info('Sending image to Gemini Vision for processing...');
            const result = await this.model.generateContent([prompt, imagePart]);
            const response = result.response.text();
            
            // Clean response (remove markdown formatting if present)
            const cleanResponse = response.replace(/``````/g, '').trim();
            
            try {
                const parsedData = JSON.parse(cleanResponse);
                
                // Validate required fields
                if (!parsedData.amount || isNaN(parsedData.amount) || parsedData.amount <= 0) {
                    logger.warn('Invalid amount in Gemini response:', parsedData.amount);
                    return null;
                }

                // Ensure category is valid
                const validCategories = ['food', 'transport', 'shopping', 'entertainment', 'healthcare', 'utilities', 'other'];
                if (!validCategories.includes(parsedData.category)) {
                    parsedData.category = 'other';
                }

                // Ensure items is an array
                if (!Array.isArray(parsedData.items)) {
                    parsedData.items = [];
                }
                
                logger.info('Receipt processed successfully:', {
                    amount: parsedData.amount,
                    merchant: parsedData.merchant,
                    category: parsedData.category
                });
                
                return parsedData;
            } catch (parseError) {
                logger.error('JSON Parse Error from Gemini:', parseError);
                logger.error('Raw Gemini response:', response);
                return null;
            }
            
        } catch (error) {
            logger.error('Gemini Vision Error:', error);
            return null;
        }
    }

    async processDocument(documentBuffer, mimeType) {
        try {
            const prompt = `
            Analyze this document and extract any expense or financial information.
            If this appears to be a receipt, bill, or invoice, extract the relevant details.
            Return a JSON object with the same structure as receipt processing.
            If no financial information is found, return null.
            `;

            const documentPart = {
                inlineData: {
                    data: documentBuffer.toString('base64'),
                    mimeType: mimeType
                }
            };

            const result = await this.model.generateContent([prompt, documentPart]);
            const response = result.response.text();
            
            const cleanResponse = response.replace(/``````/g, '').trim();
            
            if (cleanResponse.toLowerCase() === 'null') {
                return null;
            }

            try {
                const parsedData = JSON.parse(cleanResponse);
                if (parsedData && parsedData.amount && !isNaN(parsedData.amount)) {
                    return parsedData;
                }
                return null;
            } catch (parseError) {
                logger.error('Document processing parse error:', parseError);
                return null;
            }

        } catch (error) {
            logger.error('Document processing error:', error);
            return null;
        }
    }
}

module.exports = new GeminiService();
