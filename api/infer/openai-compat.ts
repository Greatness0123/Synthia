export const config = {
  runtime: 'edge',
};

// Map of provider identifiers to their canonical API base endpoints
const PROVIDER_ENDPOINTS: Record<string, string> = {
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  nim: 'https://integrate.api.nvidia.com/v1',
};

// Corresponding environment variable keys for keys
const PROVIDER_ENV_KEYS: Record<string, string> = {
  groq: 'GROQ_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  nim: 'NVIDIA_NIM_API_KEY',
};

export default async function handler(req: Request): Promise<Response> {
  // Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-synthia-secret, x-provider-id',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  // Basic abuse-prevention shared secret check
  const clientSecret = req.headers.get('x-synthia-secret');
  const serverSecret = process.env.SYNTHIA_SHARED_SECRET;
  if (serverSecret && clientSecret !== serverSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized: Invalid or missing shared secret.' }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  // Determine provider from header (first fallback) or request body/query
  const urlObj = new URL(req.url);
  let providerId = req.headers.get('x-provider-id') || urlObj.searchParams.get('provider');

  // Read request body
  let bodyText: string;
  try {
    bodyText = await req.text();
  } catch (err: any) {
    return new Response(JSON.stringify({ error: `Bad Request: ${err.message}` }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  // If providerId not found in headers or query parameters, try parsing from body
  let bodyParsed: any = null;
  if (!providerId) {
    try {
      bodyParsed = JSON.parse(bodyText);
      if (bodyParsed.provider) {
        providerId = bodyParsed.provider;
        // Strip custom field so we don't break OpenAI compatibility downstream
        delete bodyParsed.provider;
        bodyText = JSON.stringify(bodyParsed);
      }
    } catch {
      // Ignored: request body is not standard JSON (or not JSON)
    }
  } else {
    // If we have a providerId but also want to strip 'provider' field from the body to be safe
    try {
      bodyParsed = JSON.parse(bodyText);
      if (bodyParsed.provider) {
        delete bodyParsed.provider;
        bodyText = JSON.stringify(bodyParsed);
      }
    } catch {
      // Ignored
    }
  }

  if (!providerId) {
    return new Response(
      JSON.stringify({
        error: 'Bad Request: Missing provider identification. Provide via x-provider-id header, provider query parameter, or "provider" field in body JSON.',
      }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }

  const normalizedProvider = providerId.toLowerCase();
  const endpointBase = PROVIDER_ENDPOINTS[normalizedProvider];
  if (!endpointBase) {
    return new Response(
      JSON.stringify({
        error: `Bad Request: Unsupported or disallowed provider identifier: "${providerId}". Supported providers are: ${Object.keys(
          PROVIDER_ENDPOINTS
        ).join(', ')}.`,
      }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }

  // Get matching server-side API Key
  const envKey = PROVIDER_ENV_KEYS[normalizedProvider];
  const apiKey = envKey ? process.env[envKey] : undefined;
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: `Server Error: API key for provider "${providerId}" (env variable ${envKey}) is not configured on the server.`,
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }

  // Target Endpoint Construction
  const openaiUrl = `${endpointBase.replace(/\/$/, '')}/chat/completions`;

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };

    const providerResponse = await fetch(openaiUrl, {
      method: 'POST',
      headers,
      body: bodyText,
    });

    if (!providerResponse.ok) {
      const errBody = await providerResponse.text();
      return new Response(
        JSON.stringify({
          error: `Provider HTTP Error ${providerResponse.status}`,
          details: errBody,
        }),
        {
          status: providerResponse.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // Set up Streaming passthrough
    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', 'text/event-stream');
    responseHeaders.set('Cache-Control', 'no-cache');
    responseHeaders.set('Connection', 'keep-alive');
    responseHeaders.set('Access-Control-Allow-Origin', '*');

    return new Response(providerResponse.body, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: `Fetch Error to OpenAI-Compat Provider (${providerId})`,
        details: err.message || err,
      }),
      {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
}
