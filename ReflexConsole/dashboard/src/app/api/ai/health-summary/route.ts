import { NextResponse } from "next/server";
import { buildHealthSummaryPrompt, cleanModelText, AiHealthSummaryRequest, AiHealthSummaryResponse } from "@/lib/ai-health-summary";

export const runtime = "nodejs";

const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434";
const DEFAULT_MODEL = "lfm2.5-thinking:1.2b";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function isLoopbackHost(value: string) {
  try {
    const host = new URL(value).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

function timeoutMs() {
  const value = Number(process.env.LOCAL_AI_TIMEOUT_MS ?? 45_000);
  return Number.isFinite(value) && value > 0 ? value : 45_000;
}

async function postWithTimeout(url: string, body: unknown) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());
  try {
    return await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function readErrorBody(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  const raw = await response.text().catch(() => "");
  if (contentType.includes("application/json")) {
    try {
      const payload = JSON.parse(raw) as unknown;
      if (isRecord(payload) && typeof payload.error === "string" && payload.error.trim()) {
        return payload.error.trim();
      }
    } catch {
      // Fall through to the raw body below.
    }
  }
  return raw.trim().slice(0, 500);
}

async function callOllama(prompt: string, model: string) {
  const baseUrl = (process.env.LOCAL_AI_BASE_URL ?? DEFAULT_OLLAMA_URL).replace(/\/$/, "");
  if (process.env.VERCEL && isLoopbackHost(baseUrl)) {
    throw new Error("Set LOCAL_AI_BASE_URL to a publicly reachable HTTPS endpoint. Vercel cannot reach localhost on your Pi.");
  }
  const response = await postWithTimeout(`${baseUrl}/api/generate`, {
    model,
    prompt,
    stream: false,
    options: {
      temperature: 0.35,
      num_predict: 240,
    },
  });
  if (!response.ok) {
    const error = await readErrorBody(response);
    throw new Error(error || `Local AI request failed with ${response.status}`);
  }
  const payload = await response.json().catch(() => ({})) as unknown;
  if (!isRecord(payload)) throw new Error("Local AI returned an unexpected response.");
  return cleanModelText(payload.response);
}

async function callOpenAiCompatible(prompt: string, model: string) {
  const baseUrl = (process.env.LOCAL_AI_BASE_URL ?? "http://127.0.0.1:8080/v1").replace(/\/$/, "");
  if (process.env.VERCEL && isLoopbackHost(baseUrl)) {
    throw new Error("Set LOCAL_AI_BASE_URL to a publicly reachable HTTPS endpoint. Vercel cannot reach localhost on your Pi.");
  }
  const response = await postWithTimeout(`${baseUrl}/chat/completions`, {
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.35,
    max_tokens: 240,
  });
  if (!response.ok) {
    const error = await readErrorBody(response);
    throw new Error(error || `Local AI request failed with ${response.status}`);
  }
  const payload = await response.json().catch(() => ({})) as unknown;
  if (!isRecord(payload) || !Array.isArray(payload.choices)) throw new Error("Local AI returned an unexpected response.");
  const first = payload.choices[0] as unknown;
  if (!isRecord(first) || !isRecord(first.message)) throw new Error("Local AI response did not include a message.");
  return cleanModelText(first.message.content);
}

export async function POST(request: Request) {
  try {
    const input = await request.json() as AiHealthSummaryRequest;
    const prompt = buildHealthSummaryPrompt(input);
    const provider = process.env.LOCAL_AI_PROVIDER === "openai-compatible" ? "openai-compatible" : "ollama";
    const model = process.env.LOCAL_AI_MODEL || DEFAULT_MODEL;
    const summary = provider === "openai-compatible"
      ? await callOpenAiCompatible(prompt, model)
      : await callOllama(prompt, model);

    if (!summary) throw new Error("Local AI returned an empty summary.");
    const result: AiHealthSummaryResponse = { summary, model, provider };
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not generate local AI summary.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
