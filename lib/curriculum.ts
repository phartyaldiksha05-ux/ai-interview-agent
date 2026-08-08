import curriculumData from "@/data/curriculum.json";
import type { Candidate, Curriculum, CurriculumDay } from "./types";

const curriculum = curriculumData as Curriculum;

export function getCurriculum(): Curriculum {
  return curriculum;
}

export function getDay(day: number): CurriculumDay | undefined {
  return curriculum.days.find((d) => d.day === day);
}

/**
 * Builds a compact, LLM-friendly summary of the curriculum days that are
 * actually relevant to this candidate (i.e. the days they attempted),
 * enriched with how they performed on each. This keeps prompts small and
 * keeps the interview grounded in what the candidate actually did.
 */
export interface CandidateDayContext {
  day: number;
  title: string;
  type: string;
  objectives: string[];
  tools: string[];
  status: "passed" | "failed" | "skipped";
  attempts?: number;
  /** Rough struggle signal: skipped, failed, or took many attempts */
  struggled: boolean;
}

export function buildCandidateCurriculumContext(
  candidate: Candidate
): CandidateDayContext[] {
  const result: CandidateDayContext[] = [];
  for (const m of candidate.missions) {
    const day = getDay(m.day);
    if (!day) continue;
    const status: CandidateDayContext["status"] = m.skipped
      ? "skipped"
      : m.passed === false
      ? "failed"
      : "passed";
    const struggled =
      status === "skipped" || status === "failed" || (m.attempts ?? 0) >= 4;
    result.push({
      day: day.day,
      title: day.title,
      type: day.type,
      objectives: day.objectives,
      tools: day.tools,
      status,
      attempts: m.attempts,
      struggled,
    });
  }
  return result.sort((a, b) => a.day - b.day);
}

/**
 * Picks a prioritized list of days to draw interview questions from:
 * struggled/skipped/failed days first (best signal for probing understanding),
 * then high-value SHIP_IT/CAPSTONE days, then the rest.
 */
export function prioritizeDays(
  context: CandidateDayContext[]
): CandidateDayContext[] {
  const weight = (c: CandidateDayContext) => {
    let w = 0;
    if (c.struggled) w += 3;
    if (c.type === "SHIP_IT" || c.type === "CAPSTONE") w += 2;
    if (c.status === "passed" && !c.struggled) w += 1; // still worth confirming real understanding
    return w;
  };
  return [...context].sort((a, b) => weight(b) - weight(a));
}

/**
 * Finds the module a given curriculum day belongs to (e.g. day 8 -> "Embeddings
 * & Vector Search"), used to describe strengths/gaps at a readable topic level
 * rather than raw day numbers.
 */
export function moduleForDay(day: number): string {
  const mod = curriculum.modules.find((m) => day >= m.days[0] && day <= m.days[1]);
  return mod ? mod.title : `Day ${day}`;
}

export interface InterviewContextSummary {
  completedDays: number;
  totalDays: number;
  strongAreas: string[];
  weakAreas: string[];
}

/**
 * Summarizes a candidate's progress into the pre-interview briefing shown on
 * the setup screen: how far through the cohort they are, which modules they
 * demonstrably handled well, and which modules the interview will probe.
 * Derived entirely from candidate.missions — no invented data.
 */
export function buildInterviewContext(candidate: Candidate): InterviewContextSummary {
  const totalDays = curriculum.days.length;
  const ctx = buildCandidateCurriculumContext(candidate);
  const completedDays = ctx.filter((c) => c.status === "passed").length;

  const strongCandidates = ctx
    .filter((c) => c.status === "passed" && !c.struggled)
    .sort((a, b) => (a.attempts ?? 1) - (b.attempts ?? 1));
  const strongAreas = Array.from(
    new Set(strongCandidates.map((c) => moduleForDay(c.day)))
  ).slice(0, 3);

  const weakCandidates = prioritizeDays(ctx).filter((c) => c.struggled);
  const weakAreas = Array.from(
    new Set(weakCandidates.map((c) => moduleForDay(c.day)))
  ).slice(0, 2);

  return { completedDays, totalDays, strongAreas, weakAreas };
}