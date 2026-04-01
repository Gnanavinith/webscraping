import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
const PORT = 3000;

// NVIDIA API Configuration
const NVIDIA_API_KEY = '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';
const TTS_API_URL = 'https://api.nvcf.nvidia.com/v2/nvcf/functions/4a10e722-0d23-4d89-b8b7-2c3a8c9e1a0f/invoke';

// Middleware - MUST be before routes
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));

// Enable preflight for all routes
app.options('*', cors());

// Routes - define BEFORE catch-all
app.get('/', (req, res) => {
  res.json({ message: 'TTS Server is running! 🎵' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', endpoint: '/api/text-to-speech' });
});

// Text-to-Speech endpoint - handle both with and without trailing slash
app.post(['/api/text-to-speech', '/api/text-to-speech/'], async (req, res) => {
  console.log('📩 POST /api/text-to-speech received');
  console.log('Request body:', JSON.stringify(req.body, null, 2));
  
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      console.error('❌ Invalid text provided');
      return res.status(400).json({ success: false, error: 'Text is required and must be a string' });
    }

    console.log('📝 Received text:', text.substring(0, 50) + '...');

    // First, get the audio file URL
    const response = await fetch(TTS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NVIDIA_API_KEY}`,
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        input: text,
        voice: 'en-US-standard-A',
        audio_format: 'mp3'
      })
    });

    console.log('📊 Response status:', response.status);

    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ NVIDIA API Error:', errorData);
      throw new Error(errorData.message || `NVIDIA API returned status ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ Audio generated successfully');
    console.log('Response data:', data);
    
    res.json({
      success: true,
      audioUrl: data.audio_url || data.url || null,
      message: 'Audio generated successfully'
    });

  } catch (error) {
    console.error('💥 Server Error:', error.message);
    console.error('Stack trace:', error.stack);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Catch-all 404 handler - MUST be last (only for non-API routes)
app.use((req, res, next) => {
  // Don't catch API routes
  if (req.path.startsWith('/api/')) {
    console.log(`⚠️ 404 - API Route not found: ${req.method} ${req.path}`);
    return res.status(404).json({ 
      error: 'Not Found', 
      message: `Cannot ${req.method} ${req.path}`,
      availableRoutes: ['GET /', 'GET /api/health', 'POST /api/text-to-speech']
    });
  }
  // For non-API routes, serve index or static files (if needed later)
  next();
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🎵 TTS endpoint: http://localhost:${PORT}/api/text-to-speech`);
  console.log(`📋 Test URLs:`);
  console.log(`   - http://localhost:${PORT}/`);
  console.log(`   - http://localhost:${PORT}/api/health`);
  console.log(`   - POST http://localhost:${PORT}/api/text-to-speech`);
});
