import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker, {
  replyFor, fitSms, extractPrompt, isValidTwilioSignature, FALLBACK_PROMPT, HELP_TEXT, WELCOME_TEXT, ERROR_TEXT,
} from "../src/worker.js";

const fakeGrok = (answer) => async (url, opts) => {
  if (String(url).includes("raw.githubusercontent")) return new Response("```\nTest prompt\n```");
  const body = JSON.parse(opts.body);
  assert.match(body.messages[0].content, /SMS/);
  return Response.json({ choices: [{ message: { content: answer } }] });
};
const env = { XAI_API_KEY: "test" };

test("fallback prompt matches prompts/system-prompt.md", () => {
  const md = readFileSync(new URL("../prompts/system-prompt.md", import.meta.url), "utf8");
  assert.equal(extractPrompt(md), FALLBACK_PROMPT);
});

test("keywords: HELP, STOP, START, empty", async () => {
  assert.equal(await replyFor("help", env), HELP_TEXT);
  assert.equal(await replyFor(" Stop ", env), null);
  assert.equal(await replyFor("UNSUBSCRIBE", env), null);
  assert.equal(await replyFor("start", env), WELCOME_TEXT);
  assert.equal(await replyFor("", env), WELCOME_TEXT);
  assert.ok(HELP_TEXT.length <= 306, "HELP fits 2 segments");
});

test("question goes to Grok and comes back SMS-sized", async () => {
  const long = "**Beach parking:** " + "You can buy a pass online. ".repeat(40) + "See https://virginiabeach.gov/parking";
  const out = await replyFor("How do I get a beach parking permit?", env, fakeGrok(long));
  assert.ok(out.length <= 450, `length ${out.length}`);
  assert.ok(!out.includes("**"));
  assert.ok(out.endsWith("https://virginiabeach.gov/parking"), "keeps the source link");
});

test("LLM failure gives a friendly fallback", async () => {
  const boom = async (url) => {
    if (String(url).includes("raw.githubusercontent")) throw new Error("offline");
    return new Response("nope", { status: 500 });
  };
  assert.equal(await replyFor("pothole on my street", env, boom), ERROR_TEXT);
  assert.equal(await replyFor("pothole", {}, boom), ERROR_TEXT); // missing key
});

test("fitSms converts curly quotes/emoji to plain GSM text", () => {
  assert.equal(fitSms("It\u2019s \u201Cfree\u201D \u2014 call 311 \u{1F44D}"), `It's "free" - call 311`);
});

test("webhook returns TwiML, escapes XML, rejects bad signatures", async () => {
  const req = (sig) => new Request("https://example.workers.dev/", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "X-Twilio-Signature": sig },
    body: "From=%2B17575550100&Body=HELP",
  });
  const res = await worker.fetch(req("bad"), { TWILIO_AUTH_TOKEN: "tok" });
  assert.equal(res.status, 403);

  const params = { From: "+17575550100", Body: "HELP" };
  // compute a valid signature the same way Twilio does
  const { createHmac } = await import("node:crypto");
  const data = "https://example.workers.dev/" + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const sig = createHmac("sha1", "tok").update(data).digest("base64");
  assert.ok(await isValidTwilioSignature("tok", "https://example.workers.dev/", params, sig));
  const ok = await worker.fetch(req(sig), { TWILIO_AUTH_TOKEN: "tok" });
  assert.equal(ok.status, 200);
  const xml = await ok.text();
  assert.match(xml, /^<\?xml.*<Response><Message>VB Local Guide/);

  const stop = await worker.fetch(new Request("https://x.dev/", { method: "POST", body: "Body=STOP" }), { SKIP_SIGNATURE_CHECK: "true" });
  assert.match(await stop.text(), /<Response><\/Response>$/);
});
