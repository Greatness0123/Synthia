# Running SYNTHIA with Docker 🐳

This guide covers running, developing, and deploying **SYNTHIA** using Docker and Docker Compose.

---

## ⚡ Quickstart (Production Mode)

To launch the production container with a single command:

```bash
docker compose up -d
```

Once started, open your browser at **[http://localhost:3000](http://localhost:3000)**.

To stop the container:
```bash
docker compose down
```

### Custom Port
By default, SYNTHIA runs on port `3000`. You can change the port by setting the `PORT` environment variable:
```bash
PORT=8080 docker compose up -d
```

---

## 🛠️ Development Mode (with Live Reload / HMR)

For developers working on the source code without needing to install Node.js locally:

```bash
docker compose -f docker-compose.dev.yml up
```

* **URL:** **[http://localhost:5173](http://localhost:5173)**
* Any edits made to `src/`, `public/`, `index.html`, etc. will trigger instant Hot Module Replacement (HMR) inside the container.

To stop the dev container:
```bash
docker compose -f docker-compose.dev.yml down
```

---

## 📦 Building the Docker Image Manually

### 1. Build the image
```bash
docker build -t synthia:latest .
```

### 2. Run the container
```bash
docker run -d --name synthia -p 3000:80 synthia:latest
```

---

## 🏗️ Architecture & Features

* **Multi-Stage Build:**
  * **Build Stage:** Uses `node:20-alpine` with `npm ci` for fast, reproducible builds.
  * **Runtime Stage:** Uses `nginx:alpine-slim` for a lightweight, secure container (< 35 MB).
* **High Performance Nginx:**
  * Configured with Single-Page Application (SPA) fallback routing (`index.html`).
  * Optimized MIME types for WebAssembly (`.wasm`), 3D assets (`.glb`, `.gltf`), and audio.
  * Gzip compression enabled for all text, json, and wasm streams.
  * Immutable caching for static assets (`/assets/`).
* **Healthcheck:** Includes automated container health monitoring on `/healthz`.

---

## ☁️ Deployment

### Deploying to a Cloud VPS (AWS, GCP, DigitalOcean, Hetzner)
1. Clone the repository on your server:
   ```bash
   git clone https://github.com/your-org/synthia.git
   cd synthia
   ```
2. Start the production service:
   ```bash
   docker compose up -d --build
   ```
3. Set up a reverse proxy (e.g. Caddy, Traefik, or Nginx with Let's Encrypt) to map port `3000` to your domain with SSL.

---

## 🔍 Troubleshooting

| Issue | Solution |
| :--- | :--- |
| **Port already in use** | Change port: `PORT=3001 docker compose up` |
| **WASM files failing to load** | Ensure `nginx.conf` has MIME type `application/wasm wasm;` (already configured in this repo). |
| **Changes not reflecting in dev** | Rebuild container: `docker compose -f docker-compose.dev.yml up --build` |
