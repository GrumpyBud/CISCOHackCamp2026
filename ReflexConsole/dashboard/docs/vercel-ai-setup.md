# Vercel deployment for the dashboard AI summary

This setup keeps the dashboard on Vercel and sends AI summary requests to a model server you control.

Flow:

1. The Training tab calls `/api/ai/health-summary`.
2. The Next.js route runs on Vercel.
3. The route forwards a bounded prompt to your model endpoint.
4. The response is shown in the Training tab.

The model does not receive free-text health notes.

## What you need

- A Vercel project for the dashboard
- Clerk secrets in Vercel environment variables
- `POSTGRES_URL` in Vercel environment variables
- A reachable model endpoint, either:
  - your Pi exposed through a tunnel or public HTTPS URL, or
  - a remote OpenAI-compatible server

## 1. Set Vercel environment variables

In the Vercel project settings, add:

```sh
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
POSTGRES_URL=...
RESEARCH_HASH_SALT=...
LOCAL_AI_PROVIDER=ollama
LOCAL_AI_BASE_URL=https://your-model-endpoint.example.com
LOCAL_AI_MODEL="lfm2.5-thinking:1.2b"
LOCAL_AI_TIMEOUT_MS=45000
```

Notes:

- `POSTGRES_URL` is what the app reads at runtime.
- `LOCAL_AI_BASE_URL` must be reachable from Vercel over the network.
- `http://127.0.0.1:11434` will not work once the dashboard is deployed to Vercel.
- If your model server is behind a tunnel, use that tunnel URL here.

## 2. Prepare the model server on the Pi

If you want to keep the model on the Pi, run Ollama there and expose it through a tunnel or public HTTPS endpoint.

Example local setup on the Pi:

```sh
curl -fsSL https://ollama.com/install.sh | sh
ollama pull "lfm2.5-thinking:1.2b"
ollama serve
```

Then connect the tunnel to Ollama’s HTTP port and set `LOCAL_AI_BASE_URL` to the tunnel URL.

If you want the quickest one-command path, run:

```sh
./tools/start-ai-tunnel.sh
```

That script starts Ollama if needed, opens a Cloudflare quick tunnel, and prints the public HTTPS URL to paste into Vercel.

If the tunnel returns `403`, restart it with the origin host header preserved. The script now does this automatically by forwarding `localhost:11434` as the host header.

If you use an OpenAI-compatible server instead, point `LOCAL_AI_BASE_URL` at its `/v1` base and set `LOCAL_AI_PROVIDER=openai-compatible`.

## 3. Deploy to Vercel

Use your normal Vercel deployment flow, then confirm the production environment has the same variables as above.

If the dashboard builds but AI generation fails, the most common causes are:

- `LOCAL_AI_BASE_URL` still points at localhost
- the tunnel is down
- the model name does not match what your server exposes
- the model endpoint is refusing the request

## 4. Use the summary

After deployment, open the dashboard and go to the Training tab.

1. Make sure there is some session history or health data.
2. Click `Generate Summary`.
3. Wait for the model response.

If Vercel cannot reach the model endpoint, the panel will show a clear connection error.

## Local development

You can still run the dashboard locally with the same env values:

```sh
npm install
npm run dev
```

Just keep the model endpoint reachable from the machine running Next.js.
