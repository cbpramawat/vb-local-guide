# vb-local-guide

An open-source AI local guide for Virginia Beach and Hampton Roads residents.

**Phone-first:** most people don't have a laptop, so the guide works by plain text message. Text a question to the guide's number and get a short answer back, with the official source to check. It works on any phone, with no app and no data plan needed.

## Why this exists

Finding clear answers about city services, permits, events, and everyday life in Virginia Beach often means digging through several websites or waiting on hold. This project builds a friendly, accurate AI assistant that helps residents figure out the next step, and points them to the official source when it matters.

Everything here, including the prompts, the test questions, and the evaluation notes, is public so anyone in the community can inspect it, improve it, or adapt it for their own neighborhood or organization.

## What it does (first version)

- Answers common resident questions about city services, permits, recreation, and events
- Gives step-by-step guidance and names the department, website, or phone number to verify with
- Says plainly when it doesn't know or when information may be out of date

## What it is not

- Not an official City of Virginia Beach service
- Not legal, medical, or financial advice
- Not a replacement for calling the right department when something is urgent (for emergencies, call 911)

## Project layout

| Path | What's in it |
| --- | --- |
| `prompts/system-prompt.md` | The core instructions the AI guide runs on |
| `examples/test-questions.md` | Real local questions used to test and improve answers |
| `src/worker.js` | The text-message bot: receives a text through Twilio, asks Grok, and texts back an answer (Cloudflare Worker) |
| `docs/sms-setup.md` | Step-by-step setup you can do entirely from a phone browser |
| `docs/privacy-and-terms.md` | Text-message terms, opt-out (STOP), and privacy notice |
| `scripts/simulate.mjs`, `test/` | Try the bot or run tests without a phone number |

## How to try it

**By text message:** once a number is live, text it any Virginia Beach question. Reply HELP for info or STOP to opt out. To run your own number, follow [docs/sms-setup.md](docs/sms-setup.md).

**In any AI chat app:**

1. Open Grok (or any AI chat tool).
2. Paste the contents of `prompts/system-prompt.md` as the first message or custom instructions.
3. Ask one of the questions in `examples/test-questions.md` and compare the answer to the official source.

## How to contribute

Everyone in the 757 is welcome, technical or not.

- **Suggest a question** residents commonly ask: open an issue with the question and, if you know it, the official source that answers it.
- **Report a wrong or outdated answer:** open an issue with what the guide said and what's actually correct.
- **Improve the prompt:** open a pull request with your change and a short note on why it helps.

## Roadmap

- [ ] Collect 25+ real resident questions with verified official sources
- [ ] Test and refine the system prompt against them
- [ ] Add topic guides (beach parking, trash and recycling, flooding, small business startup)
- [ ] Explore a veteran and military-family resource version
- [x] Text-message (SMS) demo through the Grok API (`src/worker.js`)
- [ ] Get the toll-free number verified so anyone can text it
- [ ] Make a flyer with a QR code that opens a text to the number

## License

MIT
