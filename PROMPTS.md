# AI Prompt Log

This file logs the prompts used during the development and iteration of this project for vibe-coding verification.

---

## 1. Initial Project Scaffold

**Tool:** Claude

**Prompt:**

> Build a Next.js interview agent implementing the technical specification: POST /api/interview, session-based state, curriculum + candidate-driven question generation, minimum 8 questions across 4+ curriculum days, structured feedback at the end, and persistent session memory.

**Key output:**

- Next.js project structure
- Interview API route
- Session state management
- Curriculum and candidate matching
- LLM interview decision logic
- Demo interface
- Local interview simulation

---

## 2. Adaptive Interview Logic

**Tool:** Claude

**Prompt:**

> Make the interview adaptive based on candidate curriculum progress. Prioritize completed topics, identify weaker areas using skipped/failed/multiple-attempt signals, ask follow-up questions when appropriate, and move to new topics when enough understanding has been demonstrated.

**Key output:**

- Candidate curriculum context
- Completed/skipped topic prioritization
- Adaptive follow-up logic
- Question and curriculum-day tracking

---

## 3. Resume-Based Interview Support

**Tool:** Claude

**Prompt:**

> Add resume upload support so a candidate can upload a PDF or text resume. Extract the resume content and create a synthetic technical profile that can be used to personalize the interview.

**Key output:**

- Resume upload endpoint
- PDF/text extraction
- Resume-based candidate profile
- Resume-aware interview context

---

## 4. Resume Candidate Phrasing Fix

**Tool:** Claude

**Prompt:**

> If the candidate profile was created from an uploaded resume rather than real ABTalks cohort participation, do not imply that the candidate completed specific cohort days. Ask questions based on the candidate's actual resume skills and projects instead.

**Key output:**

- Resume-derived candidate detection
- Resume-specific interviewer phrasing
- Removed misleading cohort/day references for resume candidates

---

## 5. Voice Interview Interaction

**Tool:** Claude

**Prompt:**

> Add voice interaction to the interview interface so the candidate can use microphone input and hear interviewer responses while keeping text interaction available as a fallback.

**Key output:**

- Microphone input
- Spoken interviewer responses
- Text fallback interaction

---

## 6. Persistent Session Storage

**Tool:** Claude

**Prompt:**

> Make interview sessions persistent for serverless deployment. Use a Redis-backed store in production and retain an in-memory fallback for local development.

**Key output:**

- Persistent session storage
- Redis integration
- Local development fallback
- Conversation and progress persistence

---

## 7. Token Usage Optimization

**Tool:** Claude

**Prompt:**

> Optimize the Groq interview requests so the application uses fewer output tokens while maintaining strict JSON responses and enough detail for interview questions and final feedback.

**Key output:**

- Reduced LLM response token budget
- Lower token usage
- Maintained structured interview responses

---

## 8. Interview Completion Guardrail

**Tool:** Claude

**Prompt:**

> The interviewer sometimes continues asking questions beyond the required minimum and does not return final feedback. Add a code-level guardrail so that once the interview has reached the required minimum number of questions and required curriculum coverage, the API forces the interview to complete and returns feedback even if the LLM asks another question.

**Key output:**

- Code-level interview completion guardrail
- Minimum question enforcement
- Minimum curriculum coverage enforcement
- Guaranteed final feedback response

---

## 9. Final Testing and Deployment

**Tool:** Claude

**Prompt:**

> Review the interview flow for deployment and fix issues affecting resume-based interviews, session persistence, token usage, and final interview completion while keeping the API contract unchanged.

**Key output:**

- Production-oriented fixes
- Stable `/api/interview` flow
- Vercel deployment
- Final public demo

---

## Development Notes

The project was developed iteratively using AI-assisted coding. Prompts were used to scaffold the application, implement individual features, debug runtime issues, optimize LLM usage, and improve the final interview flow.