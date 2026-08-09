const GROQ_BASE_URL =
  process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";

const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Keep the model you want
const MODEL =
  process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

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
 * Calls Groq and asks the interviewer model to return
 * one strict JSON decision object.
 */
export async function getInterviewerDecision(
  systemPrompt: string,
  userPrompt: string
): Promise<LLMTurnDecision> {
  if (!GROQ_API_KEY) {
    throw new Error(
      "GROQ_API_KEY is not set. Add it to your environment variables."
    );
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

        // Slightly lower temperature makes interview decisions
        // more consistent.
        temperature: 0.5,

        // Enough for interview questions + feedback,
        // while avoiding unnecessarily large responses.
        max_tokens: 2048,

        response_format: {
          type: "json_object",
        },

        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
      }),
    });

    const text = await res.text();

    if (!res.ok) {
      let errorMessage = text;

      try {
        const errorJson = JSON.parse(text);
        errorMessage =
          errorJson?.error?.message ||
          errorJson?.message ||
          text;
      } catch {
        // Keep original text if response isn't JSON.
      }

      // Do NOT retry daily token-limit errors.
      if (
        res.status === 429 ||
        errorMessage.toLowerCase().includes("rate limit") ||
        errorMessage.toLowerCase().includes("tokens per day") ||
        errorMessage.toLowerCase().includes("tpd")
      ) {
        throw new Error(
          `Groq rate limit reached for ${MODEL}. ${errorMessage}`
        );
      }

      throw new Error(
        `Groq API error ${res.status}: ${errorMessage}`
      );
    }

    let data: any;

    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Groq returned invalid JSON.");
    }

    return data.choices?.[0]?.message?.content ?? "";
  };

  const parse = (raw: string): LLMTurnDecision => {
    const cleaned = raw
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    let parsed: any;

    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      console.error(
        "Failed to parse LLM JSON. Raw response:",
        raw
      );
      throw new Error("LLM returned malformed JSON.");
    }

    if (!parsed.action || !parsed.reply) {
      console.error(
        "LLM response missing required fields:",
        raw
      );

      throw new Error(
        "LLM response missing required fields: action/reply"
      );
    }

    return parsed as LLMTurnDecision;
  };

  // Only retry transient failures.
  // Don't repeatedly hit Groq when the daily quota is exhausted.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await call();
      return parse(raw);
    } catch (err: any) {
      const message = String(err?.message || err);

      const isRateLimit =
        message.toLowerCase().includes("rate limit") ||
        message.toLowerCase().includes("tokens per day") ||
        message.toLowerCase().includes("tpd");

      if (isRateLimit) {
        throw err;
      }

      if (attempt === 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, 800)
        );
      } else {
        throw err;
      }
    }
  }

  throw new Error("Unable to get a response from Groq.");
}