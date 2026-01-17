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
const Validator = require('./utils/validator');

// Import middleware
const { verifySignature } = require('./middleware/validation');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Validate required environment variables
const requiredEnvVars = [
    'WEBHOOK_VERIFY_TOKEN',
    'META_ACCESS_TOKEN',
    'META_PHONE_NUMBER_ID',
    'GEMINI_API_KEY',
    'GROQ_API_KEY'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
    logger.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
    logger.error('Please check your .env file and ensure all required variables are set.');
    process.exit(1);
}

if (!process.env.META_APP_SECRET && process.env.NODE_ENV === 'production') {
    logger.error('❌ META_APP_SECRET is required in production for webhook signature verification');
    process.exit(1);
}

logger.info('✅ All required environment variables are configured');

// Trust proxy for reverse proxy environments (Render, Heroku, etc.)
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

// Security middleware
app.use(helmet());
app.use(cors());

// Rate limiting for webhook endpoint
const webhookLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many webhook requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
        res.status(429).json({
            error: 'Too many requests',
            message: 'Please try again later'
        });
    }
});

// Body parsing middleware with raw body capture for signature verification
app.use(express.json({
    limit: '50mb',
    verify: (req, res, buf) => {
        req.rawBody = buf.toString();
    }
}));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files (landing page)
const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));

// Webhook verification endpoint (GET request from Meta)
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    logger.info('Webhook verification attempt', {
        mode,
        token: token ? 'present' : 'missing',
        challenge: challenge ? 'present' : 'missing'
    });

    if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
        logger.info('✅ WEBHOOK VERIFIED SUCCESSFULLY');
        // CRITICAL: Must send back the challenge as plain text
        res.status(200).send(challenge);
    } else {
        logger.error('❌ VERIFICATION FAILED - Token mismatch or invalid mode');
        res.sendStatus(403);
    }
});

// Webhook message handler (POST request from Meta)
app.post('/webhook', webhookLimiter, verifySignature, async (req, res) => {
    try {
        const body = req.body;
        logger.info('📨 Webhook received', { object: body.object, entries: body.entry?.length || 0 });

        if (body.object === 'whatsapp_business_account') {
            // Respond immediately to Meta
            res.status(200).send('EVENT_RECEIVED');

            // Process webhook asynchronously (don't block response)
            processWebhookEntries(body.entry || []).catch(error => {
                logger.error('Async webhook processing error:', error);
            });
        } else {
            logger.warn('Unknown webhook object type:', body.object);
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
        // Create or update user
        await databaseService.createOrUpdateUser(userPhone, message.profile?.name || 'User');

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
        // Budget commands
        if (msgLower.startsWith('set budget')) {
            // Format: "set budget food 5000"
            const parts = msgLower.split(' ');
            if (parts.length >= 4) {
                const category = parts[2].toLowerCase();
                const amount = parseFloat(parts[3]);

                if (Validator.validateCategory(category) && Validator.validateAmount(amount)) {
                    await databaseService.setBudget(userPhone, category, amount);
                    await whatsappService.sendMessage(userPhone, `✅ Budget set for *${category}*: ₹${amount}`);
                } else {
                    await whatsappService.sendMessage(userPhone, "❌ Invalid category or amount. Try: \"set budget food 5000\"");
                }
            } else {
                await whatsappService.sendMessage(userPhone, "⚠️ Usage: \"set budget [category] [amount]\"\nExample: \"set budget food 5000\"");
            }
            return;

        } else if (msgLower === 'budget' || msgLower === 'budgets' || msgLower.includes('budget status')) {
            const status = await databaseService.getBudgetStatus(userPhone);
            if (status.length === 0) {
                await whatsappService.sendMessage(userPhone, "📊 No budgets set. Start by sending: \"set budget food 5000\"");
            } else {
                let msg = "📊 *Monthly Budget Status*\n\n";
                status.forEach(b => {
                    const percent = Math.round((b.spent / b.budget_limit) * 100);
                    const bar = '▓'.repeat(Math.floor(percent / 10)) + '░'.repeat(10 - Math.floor(percent / 10));
                    msg += `*${b.category}*: ${percent}%\n${bar}\n₹${b.spent} / ₹${b.budget_limit}\n\n`;
                });
                await whatsappService.sendMessage(userPhone, msg);
            }
            return;
        }


        // Edit/Delete commands
        if (msgLower === 'delete last' || msgLower === 'undo') {
            const lastExpense = await databaseService.getLastExpense(userPhone);
            if (!lastExpense) {
                await whatsappService.sendMessage(userPhone, "⚠️ No expenses found to delete.");
            } else {
                await databaseService.deleteExpense(lastExpense.id, userPhone);
                await whatsappService.sendMessage(userPhone, `🗑️ Deleted last expense: ₹${lastExpense.amount} (${lastExpense.category})`);
            }
            return;
        }

        if (msgLower.startsWith('edit last amount ')) {
            const amount = parseFloat(msgLower.split(' ')[3]);
            if (!Validator.validateAmount(amount)) {
                await whatsappService.sendMessage(userPhone, "❌ Invalid amount.");
                return;
            }
            const lastExpense = await databaseService.getLastExpense(userPhone);
            if (!lastExpense) {
                await whatsappService.sendMessage(userPhone, "⚠️ No expenses found to edit.");
            } else {
                await databaseService.updateExpense(lastExpense.id, userPhone, { amount });
                await whatsappService.sendMessage(userPhone, `✅ Updated amount to ₹${amount}`);
            }
            return;
        }

        if (msgLower.startsWith('edit last category ')) {
            const category = msgLower.split(' ')[3];
            if (!Validator.validateCategory(category)) {
                await whatsappService.sendMessage(userPhone, `❌ Invalid category. Valid: ${Validator.VALID_CATEGORIES?.join(', ') || 'food, transport, etc.'}`);
                return;
            }
            const lastExpense = await databaseService.getLastExpense(userPhone);
            if (!lastExpense) {
                await whatsappService.sendMessage(userPhone, "⚠️ No expenses found to edit.");
            } else {
                await databaseService.updateExpense(lastExpense.id, userPhone, { category });
                await whatsappService.sendMessage(userPhone, `✅ Updated category to ${category}`);
            }
            return;
        }



        if (msgLower.startsWith('search ')) {
            const query = messageText.slice(7).trim();
            if (query.length < 2) {
                await whatsappService.sendMessage(userPhone, "⚠️ Search term too short.");
                return;
            }

            await whatsappService.sendMessage(userPhone, `🔍 Searching for "${query}"...`);
            const results = await databaseService.searchExpenses(userPhone, query);

            const summary = whatsappService.formatExpenseSummary(results);
            await whatsappService.sendMessage(userPhone, `🔎 *Search Results*\n\n${summary}`);
            return;
        }

        if (msgLower.includes('spent') || msgLower.includes('paid') || msgLower.includes('bought') || msgLower.startsWith('cab ') || msgLower.startsWith('uber ')) {
            await whatsappService.sendMessage(userPhone, "💭 Processing your expense...");

            // Parse expense with Groq
            const expenseData = await groqService.parseTextExpense(messageText);

            // Validate parsed data
            const validationErrors = Validator.validateExpenseData(expenseData);

            if (validationErrors.length === 0) {
                // Save to database
                await databaseService.saveExpense(userPhone, expenseData);

                // Get today's total
                const todayTotal = await databaseService.getTodayTotal(userPhone);

                const confirmMsg = `✅ *Expense Saved!*
💰 Amount: ₹${expenseData.amount}
📝 Description: ${expenseData.description || 'No description'}
📂 Category: ${expenseData.category || 'other'}
${expenseData.merchant ? `🏪 Merchant: ${expenseData.merchant}` : ''}

📊 Today's total: ₹${todayTotal.toFixed(2)}`;

                await whatsappService.sendMessage(userPhone, confirmMsg);
            } else {
                logger.warn(`Validation failed for '${messageText}':`, validationErrors);
                await whatsappService.sendMessage(userPhone,
                    `⚠️ I understood the amount, but there were issues:\n${validationErrors.join('\n')}\n\nPlease try again with a clearer message.`);
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
    logger.info(`Processing receipt image from ${userPhone}`);

    await whatsappService.sendMessage(userPhone, "📸 Processing your receipt... Please wait.");

    try {
        // Download image using media ID
        const imageBuffer = await whatsappService.downloadMedia(imageData.id);

        // Extract data using Gemini Vision
        const receiptData = await geminiService.extractReceiptData(imageBuffer);

        // Validate receipt data
        const validationErrors = Validator.validateExpenseData(receiptData);

        if (validationErrors.length === 0) {
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
            logger.warn('Receipt validation failed:', validationErrors);
            await whatsappService.sendMessage(userPhone,
                `⚠️ Receipt processed but data was invalid:\n${validationErrors.join('\n')}\n\nPlease try taking a clearer photo.`);
        }

    } catch (error) {
        logger.error('Error processing receipt:', error);
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
// Graceful shutdown handling
process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    await databaseService.close();
    process.exit(0);
});

process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully');
    await databaseService.close();
    process.exit(0);
});

module.exports = app;
