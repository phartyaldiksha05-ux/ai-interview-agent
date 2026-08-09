import type { Candidate, ConversationTurn, SessionState } from "./types";
import { buildCandidateCurriculumContext } from "./curriculum";

export const MIN_QUESTIONS = 8;
export const MIN_DAYS = 4;
export const MAX_GAP_CHECK_QUESTIONS = 2;

/** True when this candidate profile was synthesized from an uploaded resume
 * rather than being a real ABTalks cohort member (see app/api/resume/route.ts,
 * which stamps member.id with a "RESUME-" prefix). */
function isResumeDerived(candidate: Candidate): boolean {
  return candidate.member.id.startsWith("RESUME-");
}

function candidateSummary(candidate: Candidate): string {
  const { member, signals } = candidate;
  const progressLine = isResumeDerived(candidate)
    ? `Background inferred from an uploaded resume, mapped onto ${signals.missionsCompleted} relevant technical areas for this interview.`
    : `Cohort progress: ${signals.missionsCompleted} missions completed, ${signals.missionsFirstTry} passed on first try, active on ${signals.commitDays} days.`;
  return [
    `Name: ${member.name}`,
    `Current role: ${member.jobRole} (${member.yearsExperience} yrs experience, ${member.education})`,
    progressLine,
  ].join("\n");
}

function completedTopicsSummary(candidate: Candidate): string {
  const ctx = buildCandidateCurriculumContext(candidate).filter(
    (c) => c.status === "passed"
  );

  const sorted = [...ctx].sort(
    (a, b) => (b.struggled ? 1 : 0) - (a.struggled ? 1 : 0)
  );

  if (sorted.length === 0) return "(none — see fallback rule below)";

  return sorted
    .map((c) => {
      const perf = c.struggled
        ? `mapped as a weaker area, worth confirming depth`
        : `identified as a relevant technical area`;

      if (isResumeDerived(candidate)) {
        return `- "${c.title}" [${c.type}]: ${perf}\n  Skills/Objectives: ${c.objectives.join("; ")}`;
      }

      return `- Day ${c.day} — "${c.title}" [${c.type}]: ${perf}\n  Objectives: ${c.objectives.join("; ")}`;
    })
    .join("\n");
}

function skippedTopicsSummary(candidate: Candidate): string {
  const ctx = buildCandidateCurriculumContext(candidate).filter((c) => c.status !== "passed");
  if (ctx.length === 0) return "(none — candidate has no skipped/failed days)";
  return ctx
    .map((c) => {
      const perf = c.status === "skipped" ? "SKIPPED — never attempted" : `FAILED after ${c.attempts} attempt(s)`;
      return `- Day ${c.day} — "${c.title}": ${perf}`;
    })
    .join("\n");
}

export function buildSystemPrompt(session: SessionState): string {
  const coveredList =
    session.coveredDays.length > 0 ? session.coveredDays.join(", ") : "none yet";
  const gapCheckList =
    session.skippedDaysAsked.length > 0 ? session.skippedDaysAsked.join(", ") : "none yet";

  const completedDaysAvailable = buildCandidateCurriculumContext(session.candidate).filter(
    (c) => c.status === "passed"
  ).length;
  const fallbackNote =
    completedDaysAvailable < MIN_DAYS
      ? `\nNOTE: This candidate only completed ${completedDaysAvailable} curriculum day(s) — fewer than
the usual minimum of ${MIN_DAYS}. In this case only, you may use a few extra acknowledged
gap-check questions (still explicitly flagged as topics they didn't complete) to reach
${MIN_DAYS} distinct days total. Don't pretend they studied it — just say so plainly.`
      : "";

  const resumeMode = isResumeDerived(session.candidate);
  const phrasingRule = resumeMode
    ? `\nPHRASING RULE — THIS CANDIDATE'S PROFILE WAS BUILT FROM A RESUME, NOT REAL
COHORT PARTICIPATION. They did not actually go through the ABTalks cohort, so
NEVER say "Day ${"{n}"}", "on day X", "in the cohort", or anything implying they took
this specific course. Instead, phrase every question around their actual resume
background — e.g. "In your resume you mention building X — can you walk me
through how you designed the prompt strategy for it?" or "You list experience
with LangChain agents — how did you decide which tool the agent should call?".
Use the topic/skill area (e.g. "prompt engineering", "agent tool-calling") as
the subject, never the day number or the word "cohort".`
    : "";

  return `You are a senior technical interviewer for the ABTalks AI Cohort, a 31-day
enterprise AI engineering program (RAG, vector databases, prompt engineering,
agentic AI, MCP, AI deployment). You are conducting a realistic, adaptive,
multi-turn technical interview with a candidate${resumeMode ? " whose background comes from their resume" : " who just completed the cohort"}.

CANDIDATE
${candidateSummary(session.candidate)}
${phrasingRule}

IMPORTANT CURRICULUM RULE
Prioritize topics the candidate has COMPLETED. Do NOT ask technical questions
from skipped or incomplete curriculum days as if the candidate studied them.
Skipped topics may only be used as OPTIONAL knowledge-gap questions, and you
must explicitly acknowledge that the candidate did not complete that topic
when you ask${resumeMode ? " (phrase it as \"your resume doesn't mention X — do you know conceptually...\")" : " (e.g. \"I see you skipped the MCP day — just curious, do you know\nconceptually what problem it solves?\")"}. The interview should primarily
evaluate the candidate's actual learning journey: completed missions,
attempts, and demonstrated understanding of what they really did. Use
COMPLETED curriculum days to satisfy the requirement of covering at least
${MIN_DAYS} distinct curriculum days.

COMPLETED CURRICULUM DAYS (primary source for your questions):
${completedTopicsSummary(session.candidate)}

SKIPPED / NOT COMPLETED DAYS (optional gap-check only — max ${MAX_GAP_CHECK_QUESTIONS} such
questions in the whole interview, and each one must explicitly acknowledge
the candidate didn't complete it):
${skippedTopicsSummary(session.candidate)}
${fallbackNote}

INTERVIEW RULES
- Ask a minimum of ${MIN_QUESTIONS} questions total, covering at least ${MIN_DAYS} distinct
  COMPLETED curriculum days (by "day" number from the COMPLETED list above).
- So far: ${session.questionCount} question(s) asked. Completed days covered: ${coveredList}.
  Optional gap-check days already used: ${gapCheckList} (max ${MAX_GAP_CHECK_QUESTIONS}).
- Draw your questions from the COMPLETED list first and primarily. Only reach into the
  SKIPPED list if you have budget left (max ${MAX_GAP_CHECK_QUESTIONS} total) and you clearly
  frame it as an optional, acknowledged gap-check — never imply they built or studied it.
  Days where the candidate struggled (many attempts) are good candidates for a deeper
  follow-up — don't assume a first-try pass means shallow understanding either; confirm
  genuine strengths hold up too.
- After a candidate answers, decide whether to:
  (a) ask a natural verbal follow-up on the SAME day/topic if their answer was
      vague, incomplete, or invites a deeper "why"/"how would you handle X" question, or
  (b) move to a NEW day/topic.
- Keep the tone conversational and professional, like a real technical interview —
  not a scripted quiz. One question at a time. Do not repeat a question already asked.
- Once you've asked at least ${MIN_QUESTIONS} questions across at least ${MIN_DAYS} distinct
  COMPLETED days AND you have enough signal to assess the candidate, end the interview.
- On the very first turn (no candidate answer yet), greet the candidate by name in
  one short sentence, then ask your first question from the COMPLETED list.

OUTPUT FORMAT
Respond with ONLY a single strict JSON object, no markdown fences, no prose outside
the JSON. Schema:
{
  "action": "ask" | "followup" | "end",
  "reply": string,           // what the interviewer says next (or final closing message if "end")
  "targetDay": number,       // the curriculum day this question targets (omit only when action is "end")
  "isGapCheck": boolean,     // true only if targetDay is a SKIPPED/NOT COMPLETED day, false otherwise
  "feedback": {              // ONLY include when action is "end"
    "summary": string,
    "strengths": string[],
    "gaps": string[],
    "next": string[]
  }
}`;
}

export function buildUserPrompt(session: SessionState): string {
  if (session.history.length === 0) {
    return "Begin the interview now. Greet the candidate and ask your first question.";
  }
  const transcript = session.history
    .map((t: ConversationTurn) =>
      t.role === "interviewer"
        ? `INTERVIEWER: ${t.content}`
        : `CANDIDATE: ${t.content}`
    )
    .join("\n\n");
  return `Conversation so far:\n\n${transcript}\n\nDecide your next action now.`;
}