# Text-message (SMS) setup, phone-only

This gets you a real phone number that anyone can text a Virginia Beach question to and get an answer back. Every step works in a phone browser (Chrome or Safari). You don't need a laptop.

**What you'll set up**

| Piece | What it does | Cost |
| --- | --- | --- |
| [Twilio](https://www.twilio.com) | The phone number that sends and receives texts | $20 to start (the minimum top-up), then about $2.15 a month for a toll-free number plus about 1.2 cents per SMS segment, so roughly 4 to 5 cents for each question and 3-segment answer |
| [xAI API](https://console.x.ai) | Grok writes the answers | Prepaid credits. A few dollars covers thousands of answers (roughly $0.001 each) |
| [Cloudflare Workers](https://workers.cloudflare.com) | Runs the small program in `src/worker.js` that connects the two | Free (100,000 requests a day) |

> **Timing warning:** US carriers won't deliver texts from a new business number until it's verified. Toll-free verification is free and usually takes about 3 business days, but it can take longer. Until it's approved, use the **WhatsApp stopgap** in step 6. It uses the same program and works the same day.

---

## 1. Get a Grok API key (about 5 minutes)

1. Open **console.x.ai** and sign in with your X or Google account.
2. Go to **Billing** and add a small amount of prepaid credit ($5 is plenty for a demo). The API isn't free, but each answer costs a fraction of a cent.
3. Go to **API Keys**, then **Create API key**. Copy the key (it starts with `xai-`) into a private note. **Never post it on GitHub.**

## 2. Put the program on Cloudflare (about 10 minutes)

1. Open **dash.cloudflare.com** and create a free account.
2. Tap **Workers & Pages**, then **Create**, then **Import a repository**.
3. Connect GitHub and pick **cbpramawat/vb-local-guide**. Keep the default settings and tap **Deploy**. Cloudflare reads `wrangler.toml` and deploys `src/worker.js`.
   - *If import isn't offered:* choose **Create Worker** (Hello World), tap **Edit code**, delete everything, and paste in the contents of `src/worker.js`. To copy it, open the file on GitHub and tap **Raw**, then select all and copy. Then tap **Deploy**.
4. Open your new Worker, then **Settings**, then **Variables and Secrets**, then **Add**:
   - `XAI_API_KEY`: type **Secret**, value is your `xai-...` key.
   - Tap **Deploy** to save.
5. Copy your Worker's address. It looks like `https://vb-local-guide-sms.YOURNAME.workers.dev`. Open it in your browser. You should see "vb-local-guide SMS webhook is running."

## 3. Make a Twilio account and upgrade it (about 15 minutes)

Twilio's free trial **can't** run this bot. Trial accounts only text a handful of pre-verified numbers and add "Sent from your Twilio trial account" to messages. The newer trial also only allows Twilio's template messages, not custom answers.

1. Sign up at **twilio.com** and verify your email and cell number.
2. Tap **Upgrade account**, then add a card and the $20 minimum balance.
3. Buy a number: **Phone Numbers**, then **Buy a number**. Pick **Toll-free** with SMS turned on. It's about $2.15 a month, and Twilio says the first month is free after upgrading.

## 4. Point the number at your Worker (about 2 minutes)

1. Go to **Phone Numbers**, then **Active numbers**, and tap your number.
2. Under **Messaging configuration**, set **A message comes in** to **Webhook**, then paste your Worker address, and pick **HTTP POST**. Save.
3. Back in Cloudflare, add one more secret, `TWILIO_AUTH_TOKEN`. Copy it from the Twilio Console home page (**Account Info**, then **Auth Token**). This stops strangers from sending fake requests to your Worker and running up your Grok bill. Tap **Deploy**.

## 5. Submit toll-free verification (about 15 minutes, then wait)

Open your number, then **Regulatory Information**, then **Verify this toll-free number**. Use the suggested answers below and change anything that doesn't fit:

- **Business type:** Sole proprietor. You don't need an EIN for this type.
- **Business name:** your name, or "VB Local Guide" as the doing-business-as name.
- **Website:** `https://github.com/cbpramawat/vb-local-guide`
- **Use case:** Customer care
- **Use case summary:** "Free community Q&A service. Virginia Beach residents text a question about city services, permits, parking or events and receive one automated informational reply. We only reply to people who text us first. No marketing."
- **Sample message:** "Report potholes through VB311: the VB311 app, virginiabeach.gov, or 757-385-3111. Not an official city service. Reply STOP to opt out."
- **Opt-in type:** Via text. People opt in by texting the number first.
- **Opt-in image:** a screenshot of a flyer or QR code that shows the number and the words "Text your Virginia Beach question to (number). Msg & data rates may apply. Reply HELP for help, STOP to opt out." You can screenshot `docs/privacy-and-terms.md` on GitHub.
- **Privacy policy / terms URL:** the link to `docs/privacy-and-terms.md` in this repo.
- **Monthly volume:** 1,000

Twilio says it reviews within about 3 business days. You'll get an email. Texts won't be delivered until the status says **Approved**.

## 6. Stopgap while you wait: WhatsApp sandbox (same day)

This uses the same Worker, so there's nothing new to build.

1. In Twilio, open **Messaging**, then **Try it out**, then **Send a WhatsApp message**. If you don't see it, switch to the legacy Console.
2. Under **Sandbox settings**, set **When a message comes in** to your Worker address (HTTP POST). Save.
3. On any phone with WhatsApp, text the `join your-code` message shown on that page to **+1 415 523 8886**. You can also scan the page's QR code.
4. Now ask a question in that WhatsApp chat.

Limits: everyone has to send the join message first, the sandbox shows Twilio's name, and each person's session ends after 3 days, so they'd need to re-join. It's fine for showing people at an event. It costs about half a cent per message.

## 7. Test it

Text **HELP** to your number. You should get the info message right away. Then text a real question, like "How do I get a beach parking permit?"

If nothing comes back, check these:
- In Twilio, open **Monitor**, then **Logs**, then **Messaging**, and tap the message to see the error.
  - **30032** means verification isn't approved yet.
  - **11200** means Twilio couldn't reach your Worker. Check the URL.
  - **11205** or **12300** points to a problem in the Worker.
- In Cloudflare, open your Worker, then **Logs**. The `LLM error:` lines show problems with Grok, such as a wrong key or no credits.
- The bot replies "Sorry, I couldn't answer just now": the Grok key is missing or out of credit.

## Changing how the bot answers

The Worker reads `prompts/system-prompt.md` straight from GitHub, checking about every 10 minutes. Edit that file in the GitHub app or website, and the bot changes with no redeploy. SMS-specific rules, like length and no emoji, are in `SMS_RULES` in `src/worker.js`.

## Optional settings (Cloudflare variables)

| Name | Default | What it does |
| --- | --- | --- |
| `XAI_MODEL` | `grok-4.20-0309-non-reasoning` | Which Grok model to use. Non-reasoning models answer fast enough for Twilio's 15-second limit. |
| `MAX_REPLY_CHARS` | `450` | Longest reply, about 3 SMS segments. |
| `PROMPT_URL` | this repo's prompt on GitHub | Use a different prompt file. |

## For people with a computer

```bash
npm test                                        # runs the tests, no keys needed
node scripts/simulate.mjs "Where do I report a pothole?"   # fake a text message
XAI_API_KEY=xai-... node scripts/simulate.mjs "..."        # same, with the real Grok API
npx wrangler deploy                             # deploy from the command line
```

## Sources

- Twilio trial limits: https://www.twilio.com/docs/usage/trials and https://help.twilio.com/articles/11853148778523
- Toll-free verification: https://www.twilio.com/docs/messaging/compliance/toll-free/console-onboarding and https://www.twilio.com/docs/messaging/compliance/toll-free/api-onboarding
- A2P 10DLC fees (the other route, for a local 757 number): https://help.twilio.com/articles/1260803965530
- Twilio US SMS pricing: https://www.twilio.com/en-us/sms/pricing/us
- WhatsApp sandbox: https://www.twilio.com/docs/whatsapp/sandbox
- xAI models and prices: https://docs.x.ai/developers/models
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/
