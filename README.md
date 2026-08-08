# AI Interview Agent — ABTalks AI Cohort

An adaptive, multi-turn technical interview agent built for the **AB Talks
Vibe-Code Hackathon** — problem statement: *The Interview Agent*.

The agent conducts a realistic technical interview personalized to each
candidate's actual progress through the 31-day ABTalks AI Cohort — probing
skipped topics, failed attempts, and low-confidence passes, while confirming
genuine strengths — and produces structured feedback at the end.

## How it works

- `POST /api/interview` is the single endpoint required by the technical
  spec. The first call (with a new `sessionId` + `candidate` object) starts
  the interview; every following call (with `sessionId` + `message`) is a
  conversation turn.
- Each turn, the candidate's curriculum history (from `candidate.missions`)
  is matched against `data/curriculum.json`, prioritized by struggle signals
  (skipped / failed / many attempts), and fed to an LLM (Groq, free tier)
  along with the full conversation so far. The model decides whether to ask
  a follow-up, move to a new topic, or end the interview — and returns
  strict JSON per the spec.
- A minimum of 8 questions across 4+ distinct curriculum days is enforced in
  code as a guardrail, not just prompted — the interview won't end early
  even if the model tries to.
- Session state (conversation history, question/day coverage) is persisted
  via the **Breeth AI Memory Layer** when `BREETH_API_KEY` is set, so state
  survives across serverless invocations. Falls back to in-memory storage
  automatically if Breeth isn't configured (e.g. local dev).

## Local setup

```bash
npm install
cp .env.example .env.local
# add your GROQ_API_KEY (free — get one at console.groq.com/keys) to .env.local
# and optionally BREETH_API_KEY
npm run dev
```

Open http://localhost:3000 to try the interview in the browser with any
sample candidate from `data/sample-candidates.json`.

## Simulating a full interview from the terminal

Useful for testing the flow end-to-end or recording the demo video:

```bash
npm run dev            # in one terminal
npm run test:sim       # in another — pass a candidate id, e.g.:
node scripts/simulate-interview.mjs CAND-016
```

This uses a second Groq call to role-play the candidate's answers, so you
can watch a complete interview + feedback run without typing anything.

## API contract

Matches `technical-spec.md` exactly:

```
POST /api/interview
{ "sessionId": "abc-123", "candidate": { ...candidate.json } }
→ { "reply": "...", "done": false }

POST /api/interview
{ "sessionId": "abc-123", "message": "..." }
→ { "reply": "...", "done": false }
  ... repeats ...
→ {
    "reply": "Interview completed.",
    "done": true,
    "feedback": { "summary": "...", "strengths": [], "gaps": [], "next": [] }
  }
```

## Deploying

1. Push this repo to GitHub (public).
2. Import into Vercel.
3. Add `GROQ_API_KEY` (required, free) and `BREETH_API_KEY` / `BREETH_BASE_URL`
   (optional, for persistent memory) as environment variables in the Vercel
   project settings.
4. Deploy — the live `/api/interview` endpoint is what the evaluator calls.

## Demo video

_(Add your unlisted YouTube link here once recorded.)_

## AI usage log

See [`PROMPTS.md`](./PROMPTS.md) for the prompt log.
