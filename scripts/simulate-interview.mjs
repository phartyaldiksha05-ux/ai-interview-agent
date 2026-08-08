// Simulates a full interview end-to-end against a running local server
// (`npm run dev` in another terminal), using a sample candidate and a
// second Groq call to play the "candidate" and generate answers.
//
// Usage: node scripts/simulate-interview.mjs [candidateId] [baseUrl]
// Example: node scripts/simulate-interview.mjs CAND-016 http://localhost:3000

import fs from "node:fs";

const candidateId = process.argv[2] || "CAND-003";
const baseUrl = process.argv[3] || "http://localhost:3000";

const data = JSON.parse(fs.readFileSync("./data/sample-candidates.json", "utf-8"));
const candidate = data.candidates.find((c) => c.member.id === candidateId);
if (!candidate) {
  console.error(`Candidate ${candidateId} not found in sample-candidates.json`);
  process.exit(1);
}

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

async function candidateAnswer(question) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.8,
      messages: [
        {
          role: "system",
          content: `You are role-playing as ${candidate.member.name}, a ${candidate.member.jobRole}
who just finished an AI engineering cohort. Answer the interviewer's question
briefly (2-4 sentences) and realistically, as this person would based on their
role and experience level. Answer only — no preamble.`,
        },
        { role: "user", content: question },
      ],
    }),
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "I'm not sure.";
}

async function main() {
  const sessionId = `sim-${Date.now()}`;
  console.log(`\n=== Simulating interview for ${candidate.member.name} (${candidateId}) ===\n`);

  let res = await fetch(`${baseUrl}/api/interview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, candidate }),
  });
  let data1 = await res.json();
  console.log("INTERVIEWER:", data1.reply, "\n");

  let turns = 0;
  while (!data1.done && turns < 20) {
    const answer = await candidateAnswer(data1.reply);
    console.log("CANDIDATE:", answer, "\n");

    res = await fetch(`${baseUrl}/api/interview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, message: answer }),
    });
    data1 = await res.json();
    console.log("INTERVIEWER:", data1.reply, "\n");
    turns += 1;
  }

  if (data1.feedback) {
    console.log("=== FEEDBACK ===");
    console.log(JSON.stringify(data1.feedback, null, 2));
  }
}

main().catch(console.error);

async function main() {
  const sessionId = `sim-${Date.now()}`;
  console.log(`\n=== Simulating interview for ${candidate.member.name} (${candidateId}) ===\n`);

  let res = await fetch(`${baseUrl}/api/interview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, candidate }),
  });
  let data1 = await res.json();
  console.log("INTERVIEWER:", data1.reply, "\n");

  let turns = 0;
  while (!data1.done && turns < 20) {
    const answer = await candidateAnswer(data1.reply);
    console.log("CANDIDATE:", answer, "\n");

    res = await fetch(`${baseUrl}/api/interview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, message: answer }),
    });
    data1 = await res.json();
    console.log("INTERVIEWER:", data1.reply, "\n");
    turns += 1;
  }

  if (data1.feedback) {
    console.log("=== FEEDBACK ===");
    console.log(JSON.stringify(data1.feedback, null, 2));
  }
}

main().catch(console.error);
