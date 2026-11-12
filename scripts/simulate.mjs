// Pretend to be Twilio and text the bot, without a phone number.
//
//   node scripts/simulate.mjs "Who do I call about a pothole?"
//
// With XAI_API_KEY set, it calls the real Grok API (costs a fraction of a cent).
// Without it, it uses a canned answer so you can see the SMS formatting.
import worker from "../src/worker.js";

const question = process.argv.slice(2).join(" ") || "How do I get a beach parking permit?";
const env = { ...process.env, SKIP_SIGNATURE_CHECK: "true" };

if (!env.XAI_API_KEY) {
  console.log("(No XAI_API_KEY set: using a canned Grok answer.)\n");
  env.XAI_API_KEY = "offline";
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes("api.x.ai")) {
      return Response.json({ choices: [{ message: { content:
        "Report potholes to VB311: use the VB311 app, go to virginiabeach.gov, or call 757-385-3111. Give the street address and nearest cross street. If it's a hazard right now, call 911." } }] });
    }
    return realFetch(url, opts);
  };
}

const body = new URLSearchParams({ From: "+17575550100", To: "+18885550100", Body: question });
const res = await worker.fetch(new Request("https://local.test/", { method: "POST", body }), env);
const xml = await res.text();
const msg = (xml.match(/<Message>([\s\S]*)<\/Message>/) || [])[1] || "(no reply)";
const text = msg.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const segments = text.length <= 160 ? 1 : Math.ceil(text.length / 153);
console.log(`You: ${question}\nBot: ${text}\n\n[${text.length} chars, about ${segments} SMS segment(s)]`);
