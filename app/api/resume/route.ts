import { NextRequest, NextResponse } from "next/server";
import { getCurriculum } from "@/lib/curriculum";
import type { Candidate } from "@/lib/types";

const GROQ_BASE_URL = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

export async function POST(req: NextRequest) {
  if (!GROQ_API_KEY) {
    return NextResponse.json({ error: "GROQ_API_KEY is not set." }, { status: 500 });
  }

  const form = await req.formData();
  const file = form.get("resume") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No resume file provided." }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  let text = "";
  try {
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      // Import the internal lib file directly, NOT "pdf-parse" itself —
      // the package's index.js has a debug-mode check that tries to read a
      // test PDF from its own repo (not shipped in the npm package), which
      // throws ENOENT in Next.js API routes. This path skips that check.
      // @ts-ignore — no bundled types for this internal path
      const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
      const parsed = await pdfParse(buf);
      text = parsed.text;
    } else {
      text = buf.toString("utf-8");
    }
  } catch (err: any) {
    console.error("Resume parse error:", err);
    return NextResponse.json(
      { error: `Could not read that file (${err?.message || "unknown error"}). Try a .pdf or .txt resume.` },
      { status: 400 }
    );
  }

  text = text.slice(0, 12000); // keep the prompt a manageable size
  if (!text.trim()) {
    return NextResponse.json({ error: "Resume appears to be empty." }, { status: 400 });
  }

  const curriculum = getCurriculum();
  const daysSummary = curriculum.days
    .map((d) => `Day ${d.day}: ${d.title} — ${d.objectives.slice(0, 2).join("; ")}`)
    .join("\n");

  const systemPrompt = `You convert a candidate's resume into a synthetic ABTalks AI Cohort
progress profile, so an interview agent can ask personalized technical questions.

CURRICULUM DAYS
${daysSummary}

From the resume text, infer the candidate's name, current job role, years of
experience, and education. Then, based on the skills and projects evidenced
in the resume, select 6-10 curriculum days most relevant to their background.
For each selected day, decide a plausible status:
- "passed" (attempts 1-2) where the resume shows real, evidenced experience
- "skipped" or "failed" (attempts 3-5) for 2-3 adjacent/advanced days where
  the resume shows little or no evidence — these become good interview probes

Respond with ONLY strict JSON, no prose, no markdown fences, matching this shape:
{
  "member": { "name": string, "jobRole": string, "yearsExperience": number, "education": string },
  "missions": [ { "day": number, "title": string, "passed": boolean, "skipped": boolean, "attempts": number } ]
}`;

  const groqRes = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `RESUME TEXT:\n${text}` },
      ],
    }),
  });

  if (!groqRes.ok) {
    const errText = await groqRes.text();
    return NextResponse.json({ error: `LLM error: ${errText}` }, { status: 502 });
  }

  const data = await groqRes.json();
  let parsed: any;
  try {
    const raw = (data.choices?.[0]?.message?.content ?? "{}").replace(/```json|```/g, "").trim();
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { error: "Failed to parse a candidate profile from that resume. Try again." },
      { status: 502 }
    );
  }

  const missions = Array.isArray(parsed.missions) ? parsed.missions : [];
  const missionsCompleted = missions.filter((m: any) => m.passed).length;
  const missionsFirstTry = missions.filter((m: any) => m.passed && m.attempts === 1).length;

  const candidate: Candidate = {
    member: {
      id: `RESUME-${Date.now()}`,
      name: parsed.member?.name || "Candidate",
      jobRole: parsed.member?.jobRole || "AI Engineer",
      yearsExperience: Number(parsed.member?.yearsExperience) || 0,
      education: parsed.member?.education || "Not specified",
      status: "active",
    },
    missions,
    signals: {
      commitDays: missions.length,
      missionsCompleted,
      missionsFirstTry,
    },
  };

  return NextResponse.json({ candidate });
}