require('dotenv').config();
const database = require('../database');
const logger = require('../utils/logger');

async function setupDatabase() {
    console.log('🗄️ Setting up database...\n');
    
    try {
        // Database is initialized automatically when required
        console.log('✅ Database setup completed successfully!');
        
        // Test database connection
        const testExpense = {
            amount: 1.00,
            description: 'Database setup test',
            category: 'other',
            date: new Date().toISOString().split('T')[0]
        };
        
        const expenseId = await database.saveExpense('setup_test', testExpense);
        console.log('✅ Database write test successful! Expense ID:', expenseId);
        
        const expenses = await database.getTodayExpenses('setup_test');
        console.log('✅ Database read test successful! Found', expenses.length, 'test expenses');
        
        console.log('\n📊 Database is ready for use!');
        
    } catch (error) {
        logger.error('Database setup failed:', error);
        console.error('❌ Database setup failed:', error.message);
        process.exit(1);
    }
}

setupDatabase();
