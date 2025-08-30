require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Import services
const whatsappService = require('./services/whatsapp');
const geminiService = require('./services/gemini');
const groqService = require('./services/groq');
const databaseService = require('./services/database');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false, // Disable for webhook requests
}));
app.use(cors());

// Rate limiting middleware
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
    message: {
        error: 'Too many requests from this IP, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Apply rate limiting to webhook endpoint
app.use('/webhook', limiter);

// Body parsing middleware
app.use(express.json({ 
    limit: '50mb',
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Webhook verification endpoint (GET request from Meta)
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    logger.info('Webhook verification attempt', { mode, token: token ? 'present' : 'missing' });
    
    if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
        logger.info('✅ Webhook verified successfully');
        res.status(200).send(challenge);
    } else {
        logger.error('❌ Webhook verification failed', { 
            expectedToken: process.env.WEBHOOK_VERIFY_TOKEN ? 'set' : 'missing',
            receivedToken: token,
            mode 
        });
        res.sendStatus(403);
    }
});

// Webhook message handler (POST request from Meta)
app.post('/webhook', async (req, res) => {
    try {
        const body = req.body;
        
        logger.debug('Webhook received', { object: body.object });
        
        if (body.object === 'whatsapp_business_account') {
            // Process all webhook entries
            await processWebhookEntries(body.entry || []);
            res.status(200).send('EVENT_RECEIVED');
        } else {
            logger.warn('Unknown webhook object type', { object: body.object });
            res.sendStatus(404);
        }
    } catch (error) {
        logger.error('Webhook processing error:', error);
        res.status(500).send('INTERNAL_SERVER_ERROR');
    }
});

// Process webhook entries
async function processWebhookEntries(entries) {
    for (const entry of entries) {
        const changes = entry.changes || [];
        
        for (const change of changes) {
            if (change.field === 'messages') {
                await handleMessagesChange(change.value);
            } else if (change.field === 'message_template_status_update') {
                logger.info('Template status update received');
            }
        }
    }
}

// Handle message changes from webhook
async function handleMessagesChange(value) {
    const messages = value.messages || [];
    const statuses = value.statuses || [];
    const metadata = value.metadata;
    
    // Process incoming messages
    for (const message of messages) {
        await processMessage(message, metadata);
    }
    
    // Process message status updates
    for (const status of statuses) {
        logger.debug(`Message ${status.id} status: ${status.status}`);
    }
}

// Process individual message
async function processMessage(message, metadata) {
    const userPhone = message.from;
    const messageType = message.type;
    const messageId = message.id;
    const timestamp = message.timestamp;
    
    logger.info(`📱 Processing ${messageType} message from ${userPhone}`);
    
    try {
        // Mark message as read
        await whatsappService.markAsRead(messageId);
        
        // Route message based on type
        switch (messageType) {
            case 'text':
                await handleTextMessage(userPhone, message.text.body, messageId);
                break;
            case 'image':
                await handleImageMessage(userPhone, message.image, messageId);
                break;
            case 'document':
                await handleDocumentMessage(userPhone, message.document, messageId);
                break;
            case 'audio':
                await whatsappService.sendMessage(userPhone, 
                    "🎵 I received your audio message, but I can only process text and images for expense tracking.");
                break;
            case 'video':
                await whatsappService.sendMessage(userPhone, 
                    "🎥 I received your video, but I can only process text and images for expense tracking.");
                break;
            case 'location':
                await whatsappService.sendMessage(userPhone, 
                    "📍 Thanks for sharing your location! For expense tracking, please send receipt photos or type your expenses.");
                break;
            default:
                await whatsappService.sendMessage(userPhone, 
                    "I can help you track expenses! Send a receipt photo or type 'help' for commands.");
        }
    } catch (error) {
        logger.error(`Error processing message from ${userPhone}:`, error);
        await whatsappService.sendMessage(userPhone, 
            "⚠️ Sorry, something went wrong processing your message. Please try again.");
    }
}

// Handle text messages
async function handleTextMessage(userPhone, messageText, messageId) {
    const msgLower = messageText.toLowerCase().trim();
    
    logger.info(`Processing text: "${messageText.substring(0, 50)}..."`);
    
    try {
        // Check for expense-related keywords
        if (msgLower.includes('spent') || msgLower.includes('paid') || msgLower.includes('bought') || 
            msgLower.includes('cost') || msgLower.includes('purchase')) {
            
            await whatsappService.sendMessage(userPhone, "💭 Processing your expense...");
            
            // Parse expense with Groq
            const expenseData = await groqService.parseTextExpense(messageText);
            
            if (expenseData && expenseData.amount) {
                // Save to database
                await databaseService.saveExpense(userPhone, expenseData);
                
                // Get today's total
                const todayTotal = await databaseService.getTodayTotal(userPhone);
                
                const confirmMsg = `✅ *Expense Saved!*
💰 Amount: $${expenseData.amount}
📝 Description: ${expenseData.description}
📂 Category: ${expenseData.category}
${expenseData.merchant ? `🏪 Merchant: ${expenseData.merchant}` : ''}

📊 Today's total: $${todayTotal.toFixed(2)}`;
                
                await whatsappService.sendMessage(userPhone, confirmMsg);
            } else {
                await whatsappService.sendMessage(userPhone, 
                    "❌ I couldn't understand your expense. Try being more specific:\n\n" +
                    "Examples:\n" +
                    "• \"Spent 25 on lunch\"\n" +
                    "• \"Paid 50 for groceries at Walmart\"\n" +
                    "• \"Bus fare cost 3 dollars\"");
            }
            
        } else if (msgLower.includes('today') || msgLower === 'today') {
            const expenses = await databaseService.getTodayExpenses(userPhone);
            const summary = whatsappService.formatExpenseSummary(expenses);
            await whatsappService.sendMessage(userPhone, `📅 *Today's Expenses*\n\n${summary}`);
            
        } else if (msgLower.includes('week') || msgLower === 'week') {
            const expenses = await databaseService.getWeekExpenses(userPhone);
            const summary = whatsappService.formatExpenseSummary(expenses);
            await whatsappService.sendMessage(userPhone, `📅 *This Week's Expenses*\n\n${summary}`);
            
        } else if (msgLower.includes('month') || msgLower === 'month') {
            const expenses = await databaseService.getMonthExpenses(userPhone);
            const summary = whatsappService.formatExpenseSummary(expenses);
            await whatsappService.sendMessage(userPhone, `📅 *This Month's Expenses*\n\n${summary}`);
            
        } else if (msgLower.includes('category') || msgLower.includes('categories')) {
            const categoryTotals = await databaseService.getTotalByCategory(userPhone, 30);
            const summary = whatsappService.formatCategorySummary(categoryTotals);
            await whatsappService.sendMessage(userPhone, summary);
            
        } else if (msgLower.includes('insights') || msgLower.includes('analysis') || msgLower === 'insights') {
            await whatsappService.sendMessage(userPhone, "🧠 Analyzing your spending patterns...");
            
            const recentExpenses = await databaseService.getMonthExpenses(userPhone);
            const insights = await groqService.generateInsights(recentExpenses);
            await whatsappService.sendMessage(userPhone, `💡 *Your Spending Insights*\n\n${insights}`);
            
        } else if (msgLower.includes('help') || msgLower === 'hi' || msgLower === 'hello' || 
                   msgLower === 'start' || msgLower === 'menu') {
            
            const helpMsg = `👋 *Welcome to AI Expense Tracker!*

🚀 *Quick Start:*
📸 Send receipt photos - I'll extract details automatically
✍️ Type expenses like: "Spent 25 on lunch"

📊 *View Your Expenses:*
• *today* - Today's expenses
• *week* - This week's expenses  
• *month* - This month's expenses
• *categories* - Spending by category
• *insights* - AI analysis of your spending

💡 *Tips:*
• Be specific: "Paid 50 for groceries at Walmart"
• Include amounts: "Bus fare 3 dollars"
• Send clear receipt photos for best results

Just send a message or photo to get started! 🎯`;
            
            await whatsappService.sendMessage(userPhone, helpMsg);
            
        } else if (msgLower.includes('delete') || msgLower.includes('remove')) {
            await whatsappService.sendMessage(userPhone, 
                "🗑️ To delete expenses, you can:\n\n" +
                "1. Contact support for bulk deletions\n" +
                "2. Or specify which expense: \"Delete last expense\"\n\n" +
                "Note: Individual expense deletion is coming soon!");
            
        } else if (msgLower.includes('budget')) {
            await whatsappService.sendMessage(userPhone, 
                "💰 Budget tracking is coming soon!\n\n" +
                "For now, you can:\n" +
                "• Check 'categories' to see spending by type\n" +
                "• Use 'insights' for spending analysis\n" +
                "• Monitor 'today', 'week', 'month' totals");
            
        } else {
            // Generic response for unrecognized commands
            await whatsappService.sendMessage(userPhone, 
                "🤔 I didn't understand that command.\n\n" +
                "💡 *Quick commands:*\n" +
                "• Send receipt photos\n" +
                "• Type: \"Spent 25 on lunch\"\n" +
                "• Try: *help*, *today*, *week*, *insights*\n\n" +
                "What would you like to do?");
        }
        
    } catch (error) {
        logger.error('Error in handleTextMessage:', error);
        await whatsappService.sendMessage(userPhone, 
            "⚠️ Something went wrong processing your text. Please try again or contact support.");
    }
}

// Handle image messages (receipts)
async function handleImageMessage(userPhone, imageData, messageId) {
    logger.info(`Processing receipt image from ${userPhone}`);
    
    await whatsappService.sendMessage(userPhone, "📸 Processing your receipt... Please wait a moment.");
    
    try {
        // Download image using media ID
        const imageBuffer = await whatsappService.downloadMedia(imageData.id);
        
        // Extract data using Gemini Vision
        const receiptData = await geminiService.extractReceiptData(imageBuffer);
        
        if (receiptData && receiptData.amount) {
            // Save to database
            await databaseService.saveExpense(userPhone, receiptData);
            
            // Get today's total
            const todayTotal = await databaseService.getTodayTotal(userPhone);
            
            const confirmMsg = `✅ *Receipt Processed Successfully!*

💰 *Amount:* $${receiptData.amount}
🏪 *Merchant:* ${receiptData.merchant || 'Unknown'}
📂 *Category:* ${receiptData.category}
📅 *Date:* ${receiptData.date || 'Today'}
${receiptData.items && receiptData.items.length > 0 ? `\n🛍️ *Items:* ${receiptData.items.join(', ')}` : ''}

📊 *Today's total:* $${todayTotal.toFixed(2)}

💡 *Tip:* Send more receipts or type expenses manually!`;
            
            await whatsappService.sendMessage(userPhone, confirmMsg);
            
        } else {
            await whatsappService.sendMessage(userPhone, 
                "❌ I couldn't extract clear details from this receipt.\n\n" +
                "💡 *Try:*\n" +
                "• Take a clearer photo with good lighting\n" +
                "• Ensure the receipt is fully visible\n" +
                "• Or type manually: \"Spent 25 on lunch at McDonald's\"\n\n" +
                "Send another photo or type your expense!");
        }
        
    } catch (error) {
        logger.error('Error processing receipt image:', error);
        await whatsappService.sendMessage(userPhone, 
            "⚠️ There was an error processing your receipt image.\n\n" +
            "Please try:\n" +
            "• Sending the image again\n" +
            "• Taking a clearer photo\n" +
            "• Or typing your expense manually\n\n" +
            "Example: \"Spent 25 on lunch\"");
    }
}

// Handle document messages
async function handleDocumentMessage(userPhone, documentData, messageId) {
    logger.info(`Document received from ${userPhone}: ${documentData.filename}`);
    
    await whatsappService.sendMessage(userPhone, 
        "📄 I received your document!\n\n" +
        "For best results with expense tracking:\n" +
        "📸 Send receipt *photos* (not PDFs)\n" +
        "✍️ Or type expenses directly\n\n" +
        "Example: \"Spent 50 on groceries\"");
}

// Health check endpoint
app.get('/health', (req, res) => {
    const healthData = {
        status: 'OK',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        uptime: Math.floor(process.uptime()),
        memory: process.memoryUsage(),
        webhookConfigured: !!process.env.WEBHOOK_VERIFY_TOKEN,
        apisConfigured: {
            gemini: !!process.env.GEMINI_API_KEY,
            groq: !!process.env.GROQ_API_KEY,
            whatsapp: !!process.env.META_ACCESS_TOKEN
        }
    };
    
    res.json(healthData);
});

// API endpoint for user statistics (optional)
app.get('/api/stats/:phone', async (req, res) => {
    try {
        const phone = req.params.phone;
        const stats = await databaseService.getUserStats(phone);
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        logger.error('Error getting user stats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get user statistics'
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    logger.error('Unhandled error:', err);
    
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'production' ? 
            'Something went wrong' : err.message
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Not found',
        message: 'The requested endpoint does not exist'
    });
});

// Start server
// Use PORT from environment (Railway provides this automatically)

app.listen(PORT, () => {
    logger.info(`🚀 WhatsApp Expense Tracker running on port ${PORT}`);
    logger.info(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
    
    // Log Railway webhook URL
    if (process.env.RAILWAY_PUBLIC_DOMAIN) {
        logger.info(`🔗 Webhook URL: https://${process.env.RAILWAY_PUBLIC_DOMAIN}/webhook`);
    }
    
    console.log('✅ WhatsApp Expense Tracker Bot is ready on Railway!');
});


// Graceful shutdown handling
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err);
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

module.exports = app;
