require('dotenv').config();
const axios = require('axios');

async function testWhatsAppAPI() {
    console.log('🧪 Testing WhatsApp API...\n');
    
    const phoneNumber = process.env.TEST_PHONE_NUMBER || '+919470703259'; // Replace with your phone number
    const url = `https://graph.facebook.com/v21.0/${process.env.META_PHONE_NUMBER_ID}/messages`;
    
    const testMessage = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phoneNumber,
        type: 'text',
        text: {
            body: '🧪 Test message from your expense tracker bot! Reply with "help" to see available commands.'
        }
    };

    try {
        const response = await axios.post(url, testMessage, {
            headers: {
                'Authorization': `Bearer ${process.env.META_ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log('✅ WhatsApp API test successful!');
        console.log('Response:', response.data);
        
    } catch (error) {
        console.error('❌ WhatsApp API test failed:');
        console.error('Error:', error.response?.data || error.message);
    }
}

async function testGeminiAPI() {
    console.log('\n🧪 Testing Gemini API...\n');
    
    try {
        const { GoogleGenerativeAI } = require("@google/generative-ai");
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const result = await model.generateContent("Hello, this is a test. Please respond with 'Gemini API working!'");
        const response = result.response.text();
        
        console.log('✅ Gemini API test successful!');
        console.log('Response:', response);
        
    } catch (error) {
        console.error('❌ Gemini API test failed:');
        console.error('Error:', error.message);
    }
}

async function testGroqAPI() {
    console.log('\n🧪 Testing Groq API...\n');
    
    try {
        const Groq = require("groq-sdk");
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

        const completion = await groq.chat.completions.create({
            messages: [{ role: "user", content: "Hello, this is a test. Please respond with 'Groq API working!'" }],
            model: "llama-3.1-8b-instant",
            temperature: 0.1,
            max_tokens: 50
        });

        console.log('✅ Groq API test successful!');
        console.log('Response:', completion.choices[0].message.content);
        
    } catch (error) {
        console.error('❌ Groq API test failed:');
        console.error('Error:', error.message);
    }
}

async function testDatabase() {
    console.log('\n🧪 Testing Database...\n');
    
    try {
        const database = require('../services/database');
        
        // Test saving an expense
        const testExpense = {
            amount: 25.50,
            description: 'test lunch',
            category: 'food',
            merchant: 'Test Restaurant',
            date: new Date().toISOString().split('T')[0]
        };
        
        const expenseId = await database.saveExpense('test_phone', testExpense);
        console.log('✅ Database save test successful! Expense ID:', expenseId);
        
        // Test retrieving expenses
        const expenses = await database.getTodayExpenses('test_phone');
        console.log('✅ Database retrieve test successful! Found', expenses.length, 'expenses');
        
    } catch (error) {
        console.error('❌ Database test failed:');
        console.error('Error:', error.message);
    }
}

async function runAllTests() {
    console.log('🚀 Running WhatsApp Expense Tracker API Tests\n');
    console.log('=' .repeat(50));
    
    await testDatabase();
    await testGeminiAPI();
    await testGroqAPI();
    await testWhatsAppAPI();
    
    console.log('\n' + '='.repeat(50));
    console.log('🏁 All tests completed!\n');
    
    console.log('📝 Next steps:');
    console.log('1. If all tests passed, your APIs are configured correctly');
    console.log('2. Start your server: npm run dev');
    console.log('3. Set up ngrok: ngrok http 3000');
    console.log('4. Configure webhook in Meta Developer Console');
    console.log('5. Test with real WhatsApp messages');
}

// Run tests
runAllTests().catch(console.error);
