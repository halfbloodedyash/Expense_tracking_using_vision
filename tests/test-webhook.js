require('dotenv').config();
const axios = require('axios');

const WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://localhost:3000/webhook';

async function testWebhookVerification() {
    console.log('🧪 Testing Webhook Verification...\n');
    
    try {
        const verifyUrl = `${WEBHOOK_URL}?hub.mode=subscribe&hub.verify_token=${process.env.WEBHOOK_VERIFY_TOKEN}&hub.challenge=test_challenge_123`;
        
        const response = await axios.get(verifyUrl);
        
        if (response.status === 200 && response.data === 'test_challenge_123') {
            console.log('✅ Webhook verification test successful!');
            console.log('Response:', response.data);
        } else {
            console.log('❌ Webhook verification test failed!');
            console.log('Expected: test_challenge_123');
            console.log('Got:', response.data);
        }
        
    } catch (error) {
        console.error('❌ Webhook verification test failed:');
        console.error('Error:', error.message);
    }
}

async function testWebhookMessage() {
    console.log('\n🧪 Testing Webhook Message Processing...\n');
    
    const testMessage = {
        object: 'whatsapp_business_account',
        entry: [
            {
                id: 'test_entry_id',
                changes: [
                    {
                        field: 'messages',
                        value: {
                            messaging_product: 'whatsapp',
                            metadata: {
                                display_phone_number: '1234567890',
                                phone_number_id: process.env.META_PHONE_NUMBER_ID
                            },
                            messages: [
                                {
                                    from: 'test_phone_number',
                                    id: 'test_message_id',
                                    timestamp: Date.now().toString(),
                                    type: 'text',
                                    text: {
                                        body: 'Spent 25 on lunch'
                                    }
                                }
                            ]
                        }
                    }
                ]
            }
        ]
    };

    try {
        const response = await axios.post(WEBHOOK_URL, testMessage, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.status === 200) {
            console.log('✅ Webhook message test successful!');
            console.log('Response:', response.data);
        } else {
            console.log('❌ Webhook message test failed!');
            console.log('Status:', response.status);
        }
        
    } catch (error) {
        console.error('❌ Webhook message test failed:');
        console.error('Error:', error.message);
    }
}

async function testHealthEndpoint() {
    console.log('\n🧪 Testing Health Endpoint...\n');
    
    try {
        const healthUrl = WEBHOOK_URL.replace('/webhook', '/health');
        const response = await axios.get(healthUrl);
        
        if (response.status === 200) {
            console.log('✅ Health endpoint test successful!');
            console.log('Response:', response.data);
        } else {
            console.log('❌ Health endpoint test failed!');
        }
        
    } catch (error) {
        console.error('❌ Health endpoint test failed:');
        console.error('Error:', error.message);
    }
}

async function runWebhookTests() {
    console.log('🚀 Running Webhook Tests\n');
    console.log('Webhook URL:', WEBHOOK_URL);
    console.log('=' .repeat(50));
    
    await testHealthEndpoint();
    await testWebhookVerification();
    await testWebhookMessage();
    
    console.log('\n' + '='.repeat(50));
    console.log('🏁 Webhook tests completed!\n');
}

// Run tests
runWebhookTests().catch(console.error);
