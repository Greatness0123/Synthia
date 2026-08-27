# Security Policy

## Reporting a Vulnerability

We take the security of SYNTHIA seriously. If you believe you have found a security vulnerability, please report it responsibly. Do **not** open a public issue for security problems.

**Contact:** Use GitHub's private vulnerability reporting feature on this repository, or open a security advisory directly.

Please include:
- A description of the vulnerability
- Steps to reproduce
- Impact and severity assessment
- Any suggested mitigations

We aim to respond within 7 days of a report.

---

## Security Model

SYNTHIA follows a **Bring Your Own Credentials (BYOC)** model. This section documents the security implications of that design.

### API Keys

The core application stores user API keys in **browser localStorage** and sends them directly to the configured AI provider. This means:

- API keys never transit your servers.
- API keys are scoped to the user's browser session.
- Anyone with access to the user's browser profile can read the stored keys.

**Recommendation:** Use a dedicated, low-quota API key. Do not use production keys for local experimentation.

### Optional Serverless Proxy

The `api/infer/` directory contains optional Vercel Edge functions that proxy requests to AI providers. These functions:

- Read provider API keys from **server-side environment variables** (`process.env`), never from the client.
- Validate a `x-synthia-secret` header on incoming requests to prevent abuse.
- Whitelist provider base URLs to prevent open-relay behavior.

**Important:** You must set `SYNTHIA_SHARED_SECRET` to a strong, random value in your deployment environment. Without it, the proxy will accept any request.

### Supabase Database

The application optionally uses a user's own Supabase instance for persistent memory. The default schema (`supabase/schema.sql`) uses **permissive Row Level Security (RLS) policies**:

```sql
CREATE POLICY "Public full access on memories"
  ON memories FOR ALL USING (true) WITH CHECK (true);
```

This is intentional for the BYOC model, but it means:

> **Anyone who obtains your Supabase URL and anon key can read or write your agent's memories. Treat these credentials like passwords.** Never use production credentials for public experiments.

**Mitigation:** Consider tightening the RLS policies if you deploy a shared instance. Do not commit `.env` files or Supabase credentials to the repository.

### Kaggle GPU Server

The optional `server/kaggle_server.py` (or `kaggle_server.py` at the repo root) has **no authentication by default** and allows all CORS origins. Anyone who discovers the tunnel URL can burn your GPU quota.

**Recommended mitigations:**

1. Add a shared-token header check, mirroring the `x-synthia-secret` pattern from the edge proxies.
2. Restrict CORS to your app's domain.
3. Treat the tunnel URL as a secret; rotate it frequently.

---

## Recommended Environment Configuration

For production deployments, set these server-side environment variables:

| Variable | Purpose |
|---|---|
| `SYNTHIA_SHARED_SECRET` | Shared secret checked on incoming proxy requests |
| `GEMINI_API_KEY` | Google Gemini API key (server-side only) |
| `GROQ_API_KEY` | Groq API key (server-side only) |
| `OPENROUTER_API_KEY` | OpenRouter API key (server-side only) |
| `NVIDIA_NIM_API_KEY` | NVIDIA NIM API key (server-side only) |

---

## Supported Versions

Security updates are applied to the active version of SYNTHIA. For disclosed vulnerabilities, we will focus on the latest release.

| Version | Supported |
|---|---|
| Latest release | Yes |
| Older versions | No |

---

## Asset Licensing and Third-Party Code

Some 3D models and motion-capture animations (e.g., Mixamo-authored humanoid rigs and gait data) may carry third-party license terms that restrict redistribution. Review these assets before publishing or redistributing them. See the project README's license section for details.

---

## Disclosure Policy

We follow coordinated disclosure:

1. The report is acknowledged within 7 days.
2. We validate and reproduce the issue.
3. We ship a fix (usually within 14 days of confirmation).
4. We credit the reporter in the release notes (with permission).

We will not take legal action against good-faith security researchers who report issues privately and follow responsible disclosure.
