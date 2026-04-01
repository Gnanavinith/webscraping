import fetch from 'node-fetch';

const NVIDIA_API_KEY = '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';
const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

console.log('Testing NVIDIA API connection...\n');

const testPayload = {
  model: 'meta/llama-4-maverick-17b-128e-instruct',
  messages: [{ role: 'user', content: 'Hello' }],
  max_tokens: 10,
  temperature: 1.00,
  top_p: 1.00,
  frequency_penalty: 0.00,
  presence_penalty: 0.00,
  stream: false
};

try {
  const response = await fetch(NVIDIA_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${NVIDIA_API_KEY}`,
      'Accept': 'application/json'
    },
    body: JSON.stringify(testPayload)
  });

  console.log('Status:', response.status);
  console.log('Status Text:', response.statusText);

  const data = await response.json();
  
  if (response.ok) {
    console.log('\n✅ API Key is VALID!');
    console.log('Response:', data.choices?.[0]?.message?.content);
  } else {
    console.log('\n❌ API Key is INVALID or there was an error');
    console.log('Error:', data);
  }
} catch (error) {
  console.error('\n💥 Connection Error:', error.message);
  console.error('Check your internet connection and API key');
}
