import { NextRequest, NextResponse } from "next/server";
import type {
  Candidate,
  ConversationTurn,
  InterviewResponse,
  SessionState,
} from "@/lib/types";
import { getSession, saveSession } from "@/lib/store";
import { buildSystemPrompt, buildUserPrompt, MIN_QUESTIONS, MIN_DAYS } from "@/lib/prompts";
import { getInterviewerDecision } from "@/lib/llm";
import { buildCandidateCurriculumContext } from "@/lib/curriculum";

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { sessionId } = body;
  if (!sessionId || typeof sessionId !== "string") {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  let session = await getSession(sessionId);

  // --- Start of interview: candidate object present, no prior session ---
  if (!session) {
    const candidate: Candidate | undefined = body.candidate;
    if (!candidate) {
      return NextResponse.json(
        { error: "First request for a new sessionId must include `candidate`." },
        { status: 400 }
      );
    }
    const now = new Date().toISOString();
    session = {
      sessionId,
      candidate,
      history: [],
      coveredDays: [],
      skippedDaysAsked: [],
      questionCount: 0,
      done: false,
      createdAt: now,
      updatedAt: now,
    };
  } else if (session.done) {
    // Interview already completed for this session.
    return NextResponse.json<InterviewResponse>({
      reply: "This interview has already been completed.",
      done: true,
    });
  } else if (typeof body.message === "string" && body.message.trim().length > 0) {
    // --- Conversation turn: record candidate's answer ---
    const turn: ConversationTurn = {
      role: "candidate",
      content: body.message,
      day: session.lastTargetDay,
    };
    session.history.push(turn);
  }

  const systemPrompt = buildSystemPrompt(session);
  const userPrompt = buildUserPrompt(session);

  let decision;
  try {
    decision = await getInterviewerDecision(systemPrompt, userPrompt);
  } catch (err) {
    console.error("LLM decision failed:", err);
    return NextResponse.json(
      { error: "Failed to generate interviewer response." },
      { status: 502 }
    );
  }

  session.history.push({
    role: "interviewer",
    content: decision.reply,
    day: decision.targetDay,
  });

  if (decision.action === "ask" || decision.action === "followup") {
    session.questionCount += 1;
    if (decision.targetDay) {
      // Determine completed-vs-skipped from the candidate's actual data —
      // don't just trust the model's own `isGapCheck` label — so the
      // completed/skipped distinction is enforced by code, not just prompted.
      const dayCtx = buildCandidateCurriculumContext(session.candidate).find(
        (c) => c.day === decision.targetDay
      );
      const isCompletedDay = dayCtx?.status === "passed";
      if (isCompletedDay) {
        if (!session.coveredDays.includes(decision.targetDay)) {
          session.coveredDays.push(decision.targetDay);
        }
      } else if (!session.skippedDaysAsked.includes(decision.targetDay)) {
        session.skippedDaysAsked.push(decision.targetDay);
      }
    }
    session.lastTargetDay = decision.targetDay;
  }

  const completedDaysAvailable = buildCandidateCurriculumContext(session.candidate).filter(
    (c) => c.status === "passed"
  ).length;
  const totalDistinctDaysCovered = session.coveredDays.length + session.skippedDaysAsked.length;

  // Normal case: require MIN_DAYS distinct COMPLETED days covered.
  // Fallback: if the candidate genuinely completed fewer than MIN_DAYS days,
  // allow reaching MIN_DAYS total using acknowledged gap-check days too —
  // otherwise the interview could never satisfy the requirement.
  const enoughCoverage =
    session.questionCount >= MIN_QUESTIONS &&
    (session.coveredDays.length >= MIN_DAYS ||
      (completedDaysAvailable < MIN_DAYS &&
        session.coveredDays.length >= completedDaysAvailable &&
        totalDistinctDaysCovered >= MIN_DAYS));

  let response: InterviewResponse;

if (enoughCoverage) {
  session.done = true;

  response = {
    reply:
      decision.action === "end"
        ? decision.reply
        : "Interview completed.",
    done: true,
    feedback:
      decision.feedback ?? {
        summary:
          "The interview covered the required technical areas and provided enough signal to assess the candidate.",
        strengths: [],
        gaps: [],
        next: [],
      },
  };
} else if (decision.action === "end") {
  // Do not allow the LLM to end before minimum coverage is reached.
  session.done = false;
  response = {
    reply: decision.reply,
    done: false,
  };
} else {
  response = {
    reply: decision.reply,
    done: false,
  };
}

  await saveSession(session);

  return NextResponse.json(response);
}

export async function GET() {
  return NextResponse.json(
    { error: "Use POST /api/interview per the technical specification." },
    { status: 405 }
  );
}