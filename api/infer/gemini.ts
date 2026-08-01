export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request): Promise<Response> {
  // Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-synthia-secret',
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

  // Get Gemini API Key
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Server Error: Gemini API key is not configured.' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

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

  // Try parsing to find a model parameter, or use query param, or default
  let model = 'gemini-2.0-flash';
  const urlObj = new URL(req.url);
  const queryModel = urlObj.searchParams.get('model');
  if (queryModel) {
    model = queryModel;
  } else {
    try {
      const parsedBody = JSON.parse(bodyText);
      if (parsedBody.model) {
        model = parsedBody.model;
        // Clean model from body if standard Gemini payload is desired,
        // though Gemini stream API tolerates extra fields or we can pass it as is.
      }
    } catch {
      // Body might be plain or invalid JSON; let Gemini API handle body validation
    }
  }

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  try {
    const providerResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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
        error: 'Fetch Error to Gemini',
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
