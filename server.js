require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

// Import services
const whatsappService = require('./services/whatsapp');
const geminiService = require('./services/gemini');
const groqService = require('./services/groq');
const databaseService = require('./services/database');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors());

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Webhook verification endpoint (GET request from Meta)
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    console.log('Verification attempt:', { 
        mode, 
        token: token ? 'present' : 'missing', 
        challenge: challenge ? 'present' : 'missing' 
    });
    
    if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
        console.log('✅ WEBHOOK VERIFIED SUCCESSFULLY');
        // CRITICAL: Must send back the challenge as plain text
        res.status(200).send(challenge);
    } else {
        console.log('❌ VERIFICATION FAILED - Token mismatch or invalid mode');
        res.sendStatus(403);
    }
});

// Webhook message handler (POST request from Meta)
app.post('/webhook', async (req, res) => {
    try {
        const body = req.body;
        console.log('📨 Webhook received:', JSON.stringify(body, null, 2));
        
        if (body.object === 'whatsapp_business_account') {
            await processWebhookEntries(body.entry || []);
            res.status(200).send('EVENT_RECEIVED');
        } else {
            console.log('Unknown webhook object type:', body.object);
            res.sendStatus(404);
        }
    } catch (error) {
        console.error('Webhook processing error:', error);
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
            }
        }
    }
}

// Handle message changes from webhook
async function handleMessagesChange(value) {
    const messages = value.messages || [];
    const metadata = value.metadata;
    
    // Process incoming messages
    for (const message of messages) {
        await processMessage(message, metadata);
    }
}

// Process individual message
async function processMessage(message, metadata) {
    const userPhone = message.from;
    const messageType = message.type;
    const messageId = message.id;
    
    console.log(`📱 Processing ${messageType} message from ${userPhone}`);
    
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
            default:
                await whatsappService.sendMessage(userPhone, 
                    "I can help you track expenses! Send a receipt photo or type 'help' for commands.");
        }
    } catch (error) {
        console.error(`Error processing message from ${userPhone}:`, error);
        await whatsappService.sendMessage(userPhone, 
            "Sorry, something went wrong. Please try again.");
    }
}

// Handle text messages
async function handleTextMessage(userPhone, messageText, messageId) {
    const msgLower = messageText.toLowerCase().trim();
    
    console.log(`Processing text: "${messageText}"`);
    
    try {
        if (msgLower.includes('spent') || msgLower.includes('paid') || msgLower.includes('bought')) {
            await whatsappService.sendMessage(userPhone, "💭 Processing your expense...");
            
            // Parse expense with Groq
            const expenseData = await groqService.parseTextExpense(messageText);
            
            if (expenseData && expenseData.amount) {
                // Save to database
                await databaseService.saveExpense(userPhone, expenseData);
                
                // Get today's total
                const todayTotal = await databaseService.getTodayTotal(userPhone);
                
                const confirmMsg = `✅ *Expense Saved!*
💰 Amount: ₹${expenseData.amount}
📝 Description: ${expenseData.description}
📂 Category: ${expenseData.category}
${expenseData.merchant ? `🏪 Merchant: ${expenseData.merchant}` : ''}

📊 Today's total: ₹${todayTotal.toFixed(2)}`;
                
                await whatsappService.sendMessage(userPhone, confirmMsg);
            } else {
                await whatsappService.sendMessage(userPhone, 
                    "❌ I couldn't understand your expense. Try: \"Spent 250 on lunch\" or \"Paid 500 for groceries\"");
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
            
        } else if (msgLower.includes('insights') || msgLower === 'insights') {
            await whatsappService.sendMessage(userPhone, "🧠 Analyzing your spending patterns...");
            
            const recentExpenses = await databaseService.getMonthExpenses(userPhone);
            const insights = await groqService.generateInsights(recentExpenses);
            await whatsappService.sendMessage(userPhone, `💡 *Your Spending Insights*\n\n${insights}`);
            
        } else if (msgLower.includes('help') || msgLower === 'hi' || msgLower === 'hello') {
            const helpMsg = `👋 *Welcome to AI Expense Tracker!*

📸 *Send receipt photos* - I'll extract details automatically

✍️ *Type expenses* like:
• "Spent 250 on lunch"
• "Paid 500 for groceries"
• "Bus fare 30 rupees"

📊 *Check your spending:*
• *today* - Today's expenses
• *week* - This week's expenses  
• *month* - This month's expenses
• *insights* - AI spending analysis

Just send a message or photo to get started! 🚀`;
            
            await whatsappService.sendMessage(userPhone, helpMsg);
            
        } else {
            await whatsappService.sendMessage(userPhone, 
                "🤔 I didn't understand that. Send \"help\" to see commands or try:\n\n• Send receipt photo\n• Type \"Spent 250 on lunch\"\n• Ask \"today\"");
        }
        
    } catch (error) {
        console.error('Error in handleTextMessage:', error);
        await whatsappService.sendMessage(userPhone, 
            "Something went wrong processing your message. Please try again.");
    }
}

// Handle image messages (receipts)
async function handleImageMessage(userPhone, imageData, messageId) {
    console.log(`Processing receipt image from ${userPhone}`);
    
    await whatsappService.sendMessage(userPhone, "📸 Processing your receipt... Please wait.");
    
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
            
            const confirmMsg = `✅ *Receipt Processed!*
💰 Amount: ₹${receiptData.amount}
🏪 Merchant: ${receiptData.merchant || 'Unknown'}
📂 Category: ${receiptData.category}
${receiptData.items && receiptData.items.length > 0 ? `\n🛍️ Items: ${receiptData.items.join(', ')}` : ''}

📊 Today's total: ₹${todayTotal.toFixed(2)}`;
            
            await whatsappService.sendMessage(userPhone, confirmMsg);
            
        } else {
            await whatsappService.sendMessage(userPhone, 
                "❌ I couldn't extract clear details from this receipt.\n\n💡 Try:\n• Taking a clearer photo\n• Or typing manually: \"Spent 250 on lunch\"");
        }
        
    } catch (error) {
        console.error('Error processing receipt:', error);
        await whatsappService.sendMessage(userPhone, 
            "⚠️ Error processing your receipt. Please try again or type your expense manually.");
    }
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        webhook_configured: !!process.env.WEBHOOK_VERIFY_TOKEN,
        apis_configured: {
            gemini: !!process.env.GEMINI_API_KEY,
            groq: !!process.env.GROQ_API_KEY,
            whatsapp: !!process.env.META_ACCESS_TOKEN
        }
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message
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
app.listen(PORT, () => {
    console.log(`🚀 WhatsApp Expense Tracker Bot running on port ${PORT}`);
    console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔐 Webhook verify token: ${process.env.WEBHOOK_VERIFY_TOKEN ? 'configured' : 'missing'}`);
    console.log('✅ Server is ready for webhook verification!');
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    process.exit(0);
});

module.exports = app;
