
const GROQ_BASE_URL = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

export interface LLMTurnDecision {
  action: "ask" | "followup" | "end";
  reply: string;
  targetDay?: number;
  isGapCheck?: boolean;
  feedback?: {
    summary: string;
    strengths: string[];
    gaps: string[];
    next: string[];
  };
}

/**
 * Calls Groq with a system prompt describing the interviewer's task and
 * full conversation-so-far, asking for a single strict-JSON decision object.
 * Retries once on malformed JSON before giving up.
 */
export async function getInterviewerDecision(
  systemPrompt: string,
  userPrompt: string
): Promise<LLMTurnDecision> {
  if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not set. Add it to your .env.local.");
  }

  const call = async () => {
    const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.7,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Groq API error ${res.status}: ${text}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
  };

  const parse = (raw: string): LLMTurnDecision => {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed.action || !parsed.reply) {
      throw new Error("Missing required fields in LLM response");
    }
    return parsed as LLMTurnDecision;
  };

  try {
    const raw = await call();
    return parse(raw);
  } catch (err) {
    // One retry — LLMs occasionally wrap JSON in prose despite instructions.
    const raw = await call();
    return parse(raw);
  }
}
