// vb-local-guide SMS webhook (Cloudflare Worker, no dependencies).
//
// Flow: someone texts your Twilio number -> Twilio POSTs here -> we ask the
// xAI Grok API using prompts/system-prompt.md -> we answer with TwiML that
// Twilio texts back. The same webhook also works for the Twilio WhatsApp
// sandbox (handy while SMS carrier verification is pending).
//
// Settings (Cloudflare dashboard > your Worker > Settings > Variables and Secrets):
//   XAI_API_KEY         secret, required. From console.x.ai.
//   TWILIO_AUTH_TOKEN   secret, recommended. Lets us reject fake requests.
//   XAI_MODEL           optional. Default: grok-4.20-0309-non-reasoning (fast, cheap).
//   PROMPT_URL          optional. Raw URL of the system prompt, so editing
//                       prompts/system-prompt.md on GitHub updates the bot.
//   MAX_REPLY_CHARS     optional. Default 450 (about 3 SMS segments).
//   SKIP_SIGNATURE_CHECK optional. Set to "true" only for testing.

export const DEFAULT_MODEL = "grok-4.20-0309-non-reasoning";
export const DEFAULT_PROMPT_URL =
  "https://raw.githubusercontent.com/cbpramawat/vb-local-guide/main/prompts/system-prompt.md";
const XAI_URL = "https://api.x.ai/v1/chat/completions";
const LLM_TIMEOUT_MS = 10000; // Twilio gives up after 15 seconds.

// Used if PROMPT_URL can't be fetched. Keep in sync with prompts/system-prompt.md
// (test/worker.test.mjs checks this).
export const FALLBACK_PROMPT = `You are a helpful, accurate, and friendly local guide for Virginia Beach and Hampton Roads residents.
Your job is to answer questions about city services, permits, events, recreation, and practical daily life using only reliable public information.
Be clear, step-by-step, and always note when someone should verify with official sources or call a department.
If you don't know or the information might be outdated, say so and point to the official city website or phone number.
Stay neutral, practical, and focused on helping the person take the next useful action.`;

// Extra rules that make answers fit a text message.
export const SMS_RULES = `You are replying by SMS text message.
- Keep the whole reply under 400 characters: 2 to 4 short sentences, plain text.
- No markdown, no bullet symbols, no emoji.
- Give the single most useful next step first.
- End with one official source when you know it, as a bare link (for example virginiabeach.gov) or phone number. Never invent a link; if unsure, use virginiabeach.gov or VB311 (757-385-3111).
- For emergencies, say to call 911 first.
- If the question is not about Virginia Beach or Hampton Roads, say briefly what you can help with.`;

export const HELP_TEXT =
  "VB Local Guide (free community demo): text any question about Virginia Beach city services, permits, parking, events or trash pickup. Not an official city service. Emergencies: call 911. Reply STOP to opt out.";
export const WELCOME_TEXT =
  "Hi! I'm the VB Local Guide, a free community demo. Text me a Virginia Beach question, like: Do I need a permit for a yard sale? Reply HELP for info, STOP to opt out.";
export const ERROR_TEXT =
  "Sorry, I couldn't answer just now. Please try again in a minute, or check virginiabeach.gov or call VB311 at 757-385-3111.";

// Twilio handles these opt-out/opt-in words itself. We send nothing back.
const STOP_WORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPTOUT"]);
const START_WORDS = new Set(["START", "UNSTOP", "YES", "SUBSCRIBE"]);
const HELP_WORDS = new Set(["HELP", "INFO"]);
const HELLO_WORDS = new Set(["HI", "HELLO", "HEY", "MENU"]);

let promptCache = { text: null, at: 0 };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET") {
      return new Response("vb-local-guide SMS webhook is running. Point Twilio's 'A message comes in' webhook here (HTTP POST).", {
        headers: { "content-type": "text/plain" },
      });
    }
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

    const bodyText = await request.text();
    const params = Object.fromEntries(new URLSearchParams(bodyText));

    if (env.SKIP_SIGNATURE_CHECK !== "true" && env.TWILIO_AUTH_TOKEN) {
      const ok = await isValidTwilioSignature(
        env.TWILIO_AUTH_TOKEN,
        url.toString(),
        params,
        request.headers.get("X-Twilio-Signature") || ""
      );
      if (!ok) return new Response("Invalid signature", { status: 403 });
    }

    const reply = await replyFor(params.Body || "", env);
    return twiml(reply);
  },
};

// Decide what to text back. Returns null to send nothing.
export async function replyFor(rawBody, env, fetchImpl = fetch) {
  const body = rawBody.trim();
  const keyword = body.toUpperCase().replace(/[^A-Z]/g, "");
  if (!body) return WELCOME_TEXT;
  if (STOP_WORDS.has(keyword)) return null;
  if (START_WORDS.has(keyword)) return WELCOME_TEXT;
  if (HELP_WORDS.has(keyword)) return HELP_TEXT;
  if (HELLO_WORDS.has(keyword)) return WELCOME_TEXT;

  try {
    const systemPrompt = await getSystemPrompt(env, fetchImpl);
    const answer = await askGrok(body.slice(0, 600), systemPrompt, env, fetchImpl);
    return fitSms(answer, Number(env.MAX_REPLY_CHARS) || 450);
  } catch (err) {
    console.log("LLM error:", err && err.message);
    return ERROR_TEXT;
  }
}

export async function getSystemPrompt(env, fetchImpl = fetch) {
  const url = env.PROMPT_URL || DEFAULT_PROMPT_URL;
  const fresh = promptCache.text && Date.now() - promptCache.at < 10 * 60 * 1000;
  if (fresh) return promptCache.text;
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(2500) });
    if (res.ok) {
      const text = extractPrompt(await res.text());
      if (text) {
        promptCache = { text, at: Date.now() };
        return text;
      }
    }
  } catch (_) {
    // fall through to the built-in copy
  }
  return FALLBACK_PROMPT;
}

// prompts/system-prompt.md keeps the prompt inside the first ``` code block.
export function extractPrompt(markdown) {
  const m = markdown.match(/```[a-z]*\n([\s\S]*?)```/);
  return (m ? m[1] : markdown).trim();
}

export async function askGrok(question, systemPrompt, env, fetchImpl = fetch) {
  if (!env.XAI_API_KEY) throw new Error("XAI_API_KEY is not set");
  const res = await fetchImpl(XAI_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.XAI_API_KEY}` },
    body: JSON.stringify({
      model: env.XAI_MODEL || DEFAULT_MODEL,
      messages: [
        { role: "system", content: `${systemPrompt}\n\n${SMS_RULES}` },
        { role: "user", content: question },
      ],
      max_tokens: 220,
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`xAI API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("xAI API returned no text");
  return text;
}

// Make text SMS-friendly: plain GSM characters (so 160 chars/segment instead
// of 70), no markdown, and short. If we must cut, keep a trailing link.
export function fitSms(text, maxChars = 450) {
  let t = String(text)
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201F]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1 $2") // markdown links
    .replace(/[*_`#>]+/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/[^\x0A\x20-\x7E]/g, "") // drop emoji and other non-GSM symbols
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
  if (t.length <= maxChars) return t;

  const links = t.match(/(https?:\/\/\S+|\b[a-z0-9.-]+\.(?:gov|com|org|net)(?:\/\S*)?)/gi) || [];
  const keep = links.length ? links[links.length - 1] : "";
  const room = maxChars - (keep ? keep.length + 1 : 0) - 3;
  let head = t.slice(0, Math.max(room, 0));
  const lastStop = Math.max(head.lastIndexOf(". "), head.lastIndexOf("? "), head.lastIndexOf("! "));
  head = lastStop > room * 0.5 ? head.slice(0, lastStop + 1) : head.replace(/\s+\S*$/, "") + "...";
  if (keep && !head.includes(keep)) head = `${head} ${keep}`;
  return head.slice(0, maxChars);
}

export function twiml(message) {
  const inner = message ? `<Message>${escapeXml(message)}</Message>` : "";
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, {
    headers: { "content-type": "text/xml" },
  });
}

function escapeXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

// https://www.twilio.com/docs/usage/security#validating-requests
export async function isValidTwilioSignature(authToken, url, params, signature) {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(authToken), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}
