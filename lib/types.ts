// ---- Candidate profile (matches candidates.json schema) ----

export interface CandidateMission {
  day: number;
  title: string;
  passed?: boolean;
  skipped?: boolean;
  attempts?: number;
}

export interface CandidateSignals {
  commitDays: number;
  missionsCompleted: number;
  missionsFirstTry: number;
}

export interface CandidateMember {
  id: string;
  name: string;
  jobRole: string;
  yearsExperience: number;
  education: string;
  status: string;
}

export interface Candidate {
  member: CandidateMember;
  missions: CandidateMission[];
  signals: CandidateSignals;
}

// ---- Curriculum (matches curriculum.json schema) ----

export interface CurriculumDay {
  day: number;
  title: string;
  type: string;
  tools: string[];
  objectives: string[];
}

export interface CurriculumModule {
  n: number;
  title: string;
  days: [number, number];
}

export interface Curriculum {
  cohort: string;
  modules: CurriculumModule[];
  days: CurriculumDay[];
}

// ---- Request/response contract (technical-spec.md) ----

export interface InterviewStartRequest {
  sessionId: string;
  candidate: Candidate;
}

export interface InterviewTurnRequest {
  sessionId: string;
  message: string;
}

export type InterviewRequest = InterviewStartRequest | InterviewTurnRequest;

export interface InterviewFeedback {
  summary: string;
  strengths: string[];
  gaps: string[];
  next: string[];
}

export interface InterviewResponse {
  reply: string;
  done: boolean;
  feedback?: InterviewFeedback;
}

// ---- Internal session state ----

export interface ConversationTurn {
  role: "interviewer" | "candidate";
  content: string;
  day?: number;
}

export interface SessionState {
  sessionId: string;
  candidate: Candidate;
  history: ConversationTurn[];
  /** Distinct COMPLETED (passed) curriculum days asked about so far — the primary coverage quota. */
  coveredDays: number[];
  /** Distinct SKIPPED/FAILED days asked about as acknowledged, optional gap-checks (capped, not primary). */
  skippedDaysAsked: number[];
  questionCount: number;
  lastTargetDay?: number;
  done: boolean;
  createdAt: string;
  updatedAt: string;
}