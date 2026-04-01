# 🤖 NVIDIA AI Chatbot - Full Stack Setup

This chatbot uses NVIDIA's Llama 4 Maverick API through a backend proxy to avoid CORS issues.

## 📁 Project Structure

```
Good/
├── Client/          # React frontend (Vite)
└── Server/          # Node.js backend (Express)
```

## 🚀 How to Run

### Step 1: Install and Start the Backend Server

Open a **NEW terminal** and run:

```bash
cd Server
npm install
npm start
```

You should see:
```
🚀 Server running on http://localhost:3000
🤖 Chat endpoint: http://localhost:3000/api/chat
```

### Step 2: Install and Start the Frontend

Open **another terminal** and run:

```bash
cd Client
npm install
npm run dev
```

You should see:
```
VITE ready in XXX ms
➜  Local:   http://localhost:5173/
```

### Step 3: Open Your Browser

Navigate to: **http://localhost:5173/**

## 💡 How It Works

1. **Frontend (React)** → Sends chat messages to your local Express server
2. **Backend (Express)** → Forwards requests to NVIDIA API with your API key
3. **NVIDIA API** → Returns AI responses using Llama 4 Maverick model

## 🔧 API Configuration

- **Model**: `meta/llama-4-maverick-17b-128e-instruct`
- **API Key**: Stored securely in `Server/server.js`
- **Max Tokens**: 512
- **Temperature**: 1.00

## ⚠️ Important Notes

- Keep both terminals running while using the chatbot
- The backend server handles all API calls to avoid CORS errors
- Never expose your API key in frontend code for production apps!

## 🛠️ Troubleshooting

**If you get connection errors:**
1. Make sure the backend server is running on port 3000
2. Check that both terminals are still active
3. Verify your internet connection

**If the chatbot doesn't respond:**
1. Check the browser console for errors
2. Verify the NVIDIA API key is valid
3. Check the server terminal for API errors

Enjoy chatting with NVIDIA Llama AI! 🎉
