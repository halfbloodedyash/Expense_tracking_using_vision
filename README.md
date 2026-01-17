# 💰 WhatsApp AI Expense Tracker

An intelligent expense tracking bot for WhatsApp that uses AI (Gemini + Groq) to parse text messages and receipt images, automatically categorizing and tracking your spending.

## 🚀 Features

- **Natural Language Parsing**: "Spent 250 on lunch" or "Paid 500 for groceries"
- **Receipt Scanning**: Send a photo of a receipt to automatically extract details
- **Auto-Categorization**: Automatically categorizes expenses (Food, Transport, Utilities, etc.)
- **Spending Insights**: Ask for "insights" to get AI-powered analysis of your spending habits
- **Reports**: Get daily, weekly, and monthly summaries
- **Secure**: Implements Meta's webhook security standards

## 🛠️ Setup & Installation

### Prerequisites
- Node.js (v18+)
- A Meta Developer Account & WhatsApp Business App
- Gemini API Key
- Groq API Key

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd expense-tracker
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment Variables**
   Create a `.env` file in the root directory:
   ```env
   PORT=3000
   NODE_ENV=development
   
   # Database
   DATABASE_URL=sqlite:expenses.db
   
   # WhatsApp API
   META_ACCESS_TOKEN=your_meta_access_token
   META_PHONE_NUMBER_ID=your_phone_number_id
   META_APP_SECRET=your_app_secret
   WEBHOOK_VERIFY_TOKEN=your_verify_token
   
   # AI Services
   GEMINI_API_KEY=your_gemini_key
   GROQ_API_KEY=your_groq_key
   
   # Security
   SKIP_SIGNATURE_VERIFICATION=false # Set to true only for local dev
   ```

4. **Start the server**
   ```bash
   npm start
   ```

## 📱 Usage Commands

Just text the bot on WhatsApp:

- **Track Expense**: "Spent 150 on coffee", "Cab 300 rupees", "Movie tickets 500"
- **Scan Receipt**: Send a photo of any bill/receipt
- **Check Total**: "Today", "Week", "Month"
- **Analysis**: "Insights"
- **Help**: "Help"

## 📚 API Endpoints

- `GET /webhook` - Meta webhook verification
- `POST /webhook` - Receives WhatsApp messages (secured with HMAC SHA-256)
- `GET /health` - Health check and system status

## 🏗️ Architecture

- **Server**: Express.js
- **Database**: SQLite (local file `expenses.db`)
- **AI Services**: 
  - **Groq (Llama 3)**: Fast text parsing and categorization
  - **Gemini Vision**: Image analysis for receipts
- **Logging**: Winston logger

## 🔒 Security

- **Webhook Signature**: Verifies `x-hub-signature-256` header from Meta
- **Rate Limiting**: Protects against webhook spam
- **Input Sanitization**: Basic validation for message content

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
