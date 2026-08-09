# AI Interview Agent — ABTalks AI Cohort

An adaptive, multi-turn technical interview agent built for the **AB Talks Vibe-Code Hackathon** — problem statement: *The Interview Agent*.

The application conducts personalized technical interviews based on a candidate's curriculum progress, resume, previous responses, and interview context. It dynamically selects topics, asks follow-up questions, evaluates responses, and produces structured feedback at the end.

## Features

- **Adaptive technical interviews** based on candidate progress
- **Resume upload** for personalized interview context
- **Multi-turn conversation** with adaptive follow-up questions
- **Curriculum-aware questioning** across the ABTalks AI Cohort
- Prioritization of skipped topics, failed attempts, and weaker areas
- **Voice interaction** with microphone input and spoken responses
- Structured final interview feedback
- Persistent interview sessions for serverless deployment
- Responsive web interface
- Local terminal simulation for end-to-end testing

## How It Works

The interview starts when a new `sessionId` and candidate profile are provided.

For each subsequent turn, the application:

1. Loads the candidate's curriculum history.
2. Matches the candidate's progress against `data/curriculum.json`.
3. Identifies topics that need more attention.
4. Incorporates resume information when available.
5. Sends the relevant interview context and conversation history to the LLM.
6. Generates the next interview question or follow-up.
7. Stores the updated interview session.
8. Continues until the interview requirements are satisfied.
9. Produces structured feedback when the interview ends.

A minimum of 8 questions across 4+ distinct curriculum days is enforced in code as a guardrail so the interview does not end prematurely.

## Resume-Based Interview

Candidates can upload their resume through the web interface.

The resume is processed by the application and used to create additional interview context. This allows the agent to ask questions that are more relevant to the candidate's background, skills, and experience.

## Voice Interaction

The application supports voice-based interaction:

- Microphone input for candidate responses
- Spoken AI interview questions
- Text-based interaction remains available as a fallback

This provides a more realistic interview experience compared with a text-only chatbot.

## Session Persistence

Interview sessions are stored using persistent Redis storage for production/serverless environments.

The application uses **Upstash Redis** when the required environment variables are configured.

For local development, an in-memory fallback is available.

Session data includes information such as:

- Conversation history
- Interview progress
- Question/day coverage
- Current session state

## LLM

The application uses **Groq** for LLM inference.

The current model is configurable through the environment:

```env
GROQ_MODEL=llama-3.1-8b-instant
