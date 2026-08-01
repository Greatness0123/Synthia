import geminiHandler from '../api/infer/gemini.ts';
import openaiCompatHandler from '../api/infer/openai-compat.ts';

// Helper to assert conditions and log results
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

// Helper to convert a Web ReadableStream to text/incremental chunks
async function readStream(stream: ReadableStream<Uint8Array>, onChunk?: (chunk: string) => void): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunkText = decoder.decode(value, { stream: true });
    result += chunkText;
    if (onChunk) {
      onChunk(chunkText);
    }
  }
  return result;
}

async function runTests() {
  console.log('--- STARTING SYNTHIA CLIENT REFACTOR PHASE 1 PROXY TESTS ---');

  // Backup env variables so we can restore them at the end
  const backupEnv = { ...process.env };

  // Setup simulated environment keys
  process.env.SYNTHIA_SHARED_SECRET = 'super-secret-synthia-key';
  process.env.GEMINI_API_KEY = 'mock-gemini-key-12345';
  process.env.GROQ_API_KEY = 'mock-groq-key-54321';

  // Define Mock fetch to intercept downstream calls
  const originalFetch = globalThis.fetch;
  let lastFetchUrl = '';
  let lastFetchOptions: any = null;
  let simulatedStreamController: ReadableStreamDefaultController<Uint8Array> | null = null;

  globalThis.fetch = (async (url: string, options: any) => {
    lastFetchUrl = url;
    lastFetchOptions = options;

    // Simulate standard streaming response
    const stream = new ReadableStream({
      start(controller) {
        simulatedStreamController = controller;
        // Enqueue some incremental stream blocks
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'));
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":" World!"}}]}\n\n'));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    });

    return new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' }
    });
  }) as any;

  // ==========================================
  // Test 1: OPTIONS CORS Preflight Check (Gemini)
  // ==========================================
  {
    const req = new Request('http://localhost/api/infer/gemini', {
      method: 'OPTIONS',
    });
    const res = await geminiHandler(req);
    assert(res.status === 204, 'OPTIONS should return 204 No Content status');
    assert(res.headers.get('Access-Control-Allow-Origin') === '*', 'CORS preflight should allow any origin');
    assert(res.headers.get('Access-Control-Allow-Headers')?.includes('x-synthia-secret') === true, 'CORS preflight should allow x-synthia-secret header');
  }

  // ==========================================
  // Test 2: Shared-Secret Check: Missing Secret
  // ==========================================
  {
    const req = new Request('http://localhost/api/infer/gemini', {
      method: 'POST',
      body: JSON.stringify({ messages: [] })
    });
    const res = await geminiHandler(req);
    assert(res.status === 401, 'Request with missing shared secret should return 401');
    const body = await res.json();
    assert(body.error.includes('Unauthorized'), 'Error message should say Unauthorized');
  }

  // ==========================================
  // Test 3: Shared-Secret Check: Invalid Secret
  // ==========================================
  {
    const req = new Request('http://localhost/api/infer/gemini', {
      method: 'POST',
      headers: {
        'x-synthia-secret': 'wrong-secret'
      },
      body: JSON.stringify({ messages: [] })
    });
    const res = await geminiHandler(req);
    assert(res.status === 401, 'Request with incorrect shared secret should return 401');
  }

  // ==========================================
  // Test 4: Gemini Stream Request - Successful Passthrough & Keys Secret Check
  // ==========================================
  {
    const reqPayload = {
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: 'Who are you?' }] }]
    };
    const req = new Request('http://localhost/api/infer/gemini', {
      method: 'POST',
      headers: {
        'x-synthia-secret': 'super-secret-synthia-key',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(reqPayload)
    });

    const res = await geminiHandler(req);
    assert(res.status === 200, 'Valid Gemini request should return 200 OK');
    assert(res.headers.get('Content-Type') === 'text/event-stream', 'Response should be a text/event-stream');

    // Read the streamed contents
    let chunkCount = 0;
    const fullText = await readStream(res.body!, (chunk) => {
      chunkCount++;
      // Confirm individual chunk structure does not contain process.env.GEMINI_API_KEY
      assert(!chunk.includes(process.env.GEMINI_API_KEY!), 'Individual stream chunk must not leak Gemini API key');
    });

    assert(chunkCount > 0, 'Incremental tokens should arrive as multiple chunks');
    assert(fullText.includes('Hello') && fullText.includes('World!'), 'Full text should have streamed correct simulated content');

    // Inspect downstream call details
    assert(lastFetchUrl.includes('https://generativelanguage.googleapis.com'), 'Downstream URL should target generativelanguage.googleapis.com');
    assert(lastFetchUrl.includes(process.env.GEMINI_API_KEY!), 'Downstream URL should carry the secret API key in request parameters');
    assert(lastFetchOptions.method === 'POST', 'Downstream request should be a POST');

    // Ensure no client bundle or network response payload can contain the server API key
    assert(!fullText.includes(process.env.GEMINI_API_KEY!), 'Full response body must not leak Gemini API key');
  }

  // ==========================================
  // Test 5: OpenAI-Compatible preflight & CORS
  // ==========================================
  {
    const req = new Request('http://localhost/api/infer/openai-compat', {
      method: 'OPTIONS',
    });
    const res = await openaiCompatHandler(req);
    assert(res.status === 204, 'openai-compat OPTIONS should return 204');
    assert(res.headers.get('Access-Control-Allow-Origin') === '*', 'CORS preflight should allow any origin');
  }

  // ==========================================
  // Test 6: OpenAI-Compatible Provider Mapping Validation
  // ==========================================
  {
    const reqPayload = {
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: 'Say Test' }]
    };

    // Make request specifying "groq" as the provider via header
    const req = new Request('http://localhost/api/infer/openai-compat', {
      method: 'POST',
      headers: {
        'x-synthia-secret': 'super-secret-synthia-key',
        'x-provider-id': 'groq',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(reqPayload)
    });

    const res = await openaiCompatHandler(req);
    assert(res.status === 200, 'Valid Groq request should return 200 OK');

    const fullText = await readStream(res.body!);
    assert(!fullText.includes(process.env.GROQ_API_KEY!), 'Full response body must not leak Groq API key');

    // Confirm URL endpoint is mapped to the correct Groq base URL and Authorization headers are set
    assert(lastFetchUrl === 'https://api.groq.com/openai/v1/chat/completions', 'Endpoint should be correctly mapped to groq endpoint');
    assert(lastFetchOptions.headers['Authorization'] === `Bearer ${process.env.GROQ_API_KEY}`, 'Authorization header should be bearer token with the correct API key');
  }

  // ==========================================
  // Test 7: OpenAI-Compatible: Provider specified in JSON Body
  // ==========================================
  {
    const reqPayload = {
      provider: 'groq',
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: 'Say Test body' }]
    };

    const req = new Request('http://localhost/api/infer/openai-compat', {
      method: 'POST',
      headers: {
        'x-synthia-secret': 'super-secret-synthia-key',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(reqPayload)
    });

    const res = await openaiCompatHandler(req);
    assert(res.status === 200, 'Request with provider in body should succeed with 200 OK');
    assert(lastFetchUrl === 'https://api.groq.com/openai/v1/chat/completions', 'Endpoint should map correctly from JSON body provider key');

    // Ensure "provider" is stripped from the payload sent downstream to maintain compatibility
    const sentBody = JSON.parse(lastFetchOptions.body);
    assert(sentBody.provider === undefined, 'The "provider" parameter must be stripped from downstream body to avoid breaking upstream schemas');
  }

  // ==========================================
  // Test 8: OpenAI-Compatible: Invalid Provider ID Error Handling
  // ==========================================
  {
    const reqPayload = {
      provider: 'unknown-provider',
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: 'Say Test body' }]
    };

    const req = new Request('http://localhost/api/infer/openai-compat', {
      method: 'POST',
      headers: {
        'x-synthia-secret': 'super-secret-synthia-key',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(reqPayload)
    });

    const res = await openaiCompatHandler(req);
    assert(res.status === 400, 'Invalid provider should return 400 Bad Request');
    const body = await res.json();
    assert(body.error.includes('Unsupported or disallowed provider'), 'Error message should clearly state the unsupported provider restriction');
  }

  // ==========================================
  // Test 9: OpenAI-Compatible: Provider Key Unconfigured
  // ==========================================
  {
    const reqPayload = {
      provider: 'openrouter',
      model: 'meta-llama/llama-3.1-8b-instruct',
      messages: [{ role: 'user', content: 'Say Test' }]
    };

    const req = new Request('http://localhost/api/infer/openai-compat', {
      method: 'POST',
      headers: {
        'x-synthia-secret': 'super-secret-synthia-key',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(reqPayload)
    });

    // We have not set process.env.OPENROUTER_API_KEY
    const res = await openaiCompatHandler(req);
    assert(res.status === 500, 'Requesting provider with missing key should return 500 Internal Server Error');
    const body = await res.json();
    assert(body.error.includes('is not configured on the server'), 'Error should highlight missing server key config');
  }

  // ==========================================
  // Test 10: Downstream Provider Error Handling
  // ==========================================
  {
    // Override fetch to return an HTTP error
    globalThis.fetch = (async () => {
      return new Response('Mock OpenAI quota exceeded error', {
        status: 429,
        statusText: 'Too Many Requests'
      });
    }) as any;

    const reqPayload = {
      provider: 'groq',
      model: 'llama-3.1-8b-instant',
      messages: []
    };

    const req = new Request('http://localhost/api/infer/openai-compat', {
      method: 'POST',
      headers: {
        'x-synthia-secret': 'super-secret-synthia-key',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(reqPayload)
    });

    const res = await openaiCompatHandler(req);
    assert(res.status === 429, 'Proxy should forward downstream HTTP status code on failure');
    const body = await res.json();
    assert(body.error.includes('Provider HTTP Error 429'), 'Proxy should wrap downsteam error status nicely');
    assert(body.details === 'Mock OpenAI quota exceeded error', 'Proxy should expose the error details safely to client');
  }

  // Clean up
  globalThis.fetch = originalFetch;
  for (const k of Object.keys(process.env)) {
    if (!(k in backupEnv)) {
      delete process.env[k];
    } else {
      process.env[k] = backupEnv[k];
    }
  }

  console.log('\n⭐⭐⭐ ALL TESTS PASSED SUCCESSFULLY ⭐⭐⭐');
}

runTests().catch((err) => {
  console.error('Unhandled failure during verification suite run:', err);
  process.exit(1);
});
