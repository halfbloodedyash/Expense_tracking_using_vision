module.exports = {
    // Expense categories
    CATEGORIES: {
        FOOD: 'food',
        TRANSPORT: 'transport',
        SHOPPING: 'shopping',
        ENTERTAINMENT: 'entertainment',
        HEALTHCARE: 'healthcare',
        UTILITIES: 'utilities',
        OTHER: 'other'
    },

    // Category emojis
    CATEGORY_EMOJIS: {
        food: '🍔',
        transport: '🚗',
        shopping: '🛒',
        entertainment: '🎬',
        healthcare: '🏥',
        utilities: '⚡',
        other: '📦'
    },

    // Message types
    MESSAGE_TYPES: {
        TEXT: 'text',
        IMAGE: 'image',
        DOCUMENT: 'document',
        AUDIO: 'audio',
        VIDEO: 'video',
        LOCATION: 'location'
    },

    // API limits
    LIMITS: {
        MAX_AMOUNT: 1000000, // $1M
        MAX_DESCRIPTION_LENGTH: 200,
        MAX_MERCHANT_LENGTH: 100,
        MAX_ITEMS_COUNT: 50,
        MAX_IMAGE_SIZE: 16 * 1024 * 1024, // 16MB
        RATE_LIMIT_WINDOW: 15 * 60 * 1000, // 15 minutes
        RATE_LIMIT_MAX: 100 // requests per window
    },

    // Date formats
    DATE_FORMATS: {
        DB_DATE: 'YYYY-MM-DD',
        DISPLAY_DATE: 'MMM DD, YYYY',
        TIMESTAMP: 'YYYY-MM-DD HH:mm:ss'
    },

    // WhatsApp API
    WHATSAPP: {
        API_VERSION: 'v21.0',
        BASE_URL: 'https://graph.facebook.com'
    },

    // Error messages
    ERRORS: {
        INVALID_AMOUNT: 'Invalid amount provided',
        INVALID_CATEGORY: 'Invalid expense category',
        PROCESSING_FAILED: 'Failed to process your request',
        OCR_FAILED: 'Could not read receipt image',
        DATABASE_ERROR: 'Database operation failed',
        UNAUTHORIZED: 'Unauthorized request',
        RATE_LIMITED: 'Too many requests'
    },

    // Success messages
    SUCCESS: {
        EXPENSE_SAVED: '✅ Expense saved successfully!',
        RECEIPT_PROCESSED: '✅ Receipt processed successfully!',
        WEBHOOK_VERIFIED: '✅ Webhook verified successfully!'
    }
};
