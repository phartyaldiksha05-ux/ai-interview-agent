import type { SessionState } from "./types";

/**
 * Session persistence, in priority order:
 *
 * 1. Vercel KV — official Vercel storage, auto-configured via the Vercel
 *    dashboard (Storage tab → Create KV database). This is the RECOMMENDED
 *    backend for production: serverless functions on Vercel don't share
 *    memory between invocations, so an in-memory Map alone WILL lose
 *    session state mid-interview in production, even though it works fine
 *    in local dev (single long-running process).
 * 2. Breeth AI Memory Layer — used if BREETH_API_KEY is set and Vercel KV
 *    isn't configured.
 * 3. In-memory Map — local dev fallback only. Do not rely on this in
 *    production; it will intermittently lose sessions.
 */

const memoryStore = new Map<string, SessionState>();

const KV_CONFIGURED = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

const BREETH_BASE_URL = process.env.BREETH_BASE_URL || "https://api.thebreeth.com";
const BREETH_API_KEY = process.env.BREETH_API_KEY;
const BREETH_CONFIGURED = Boolean(BREETH_API_KEY) && !KV_CONFIGURED;

function sessionKey(sessionId: string): string {
  return `interview-session:${sessionId}`;
}

async function kvGet(sessionId: string): Promise<SessionState | null> {
  try {
    const { kv } = await import("@vercel/kv");
    const value = await kv.get<SessionState>(sessionKey(sessionId));
    return value ?? null;
  } catch (err) {
    console.error("Vercel KV get failed:", err);
    return null;
  }
}

async function kvSet(sessionId: string, state: SessionState): Promise<void> {
  try {
    const { kv } = await import("@vercel/kv");
    // Sessions are short-lived (a single interview) — expire after 2 hours
    // so old sessions don't accumulate indefinitely.
    await kv.set(sessionKey(sessionId), state, { ex: 60 * 60 * 2 });
  } catch (err) {
    console.error("Vercel KV set failed:", err);
  }
}

async function breethGet(sessionId: string): Promise<SessionState | null> {
  try {
    const res = await fetch(
      `${BREETH_BASE_URL}/v1/memory/${encodeURIComponent(sessionKey(sessionId))}`,
      { headers: { Authorization: `Bearer ${BREETH_API_KEY}` }, cache: "no-store" }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return (data?.value as SessionState) ?? null;
  } catch {
    return null;
  }
}

async function breethSet(sessionId: string, state: SessionState): Promise<void> {
  try {
    await fetch(
      `${BREETH_BASE_URL}/v1/memory/${encodeURIComponent(sessionKey(sessionId))}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${BREETH_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ value: state }),
      }
    );
  } catch {
    // Non-fatal — in-memory copy still gets written by the caller.
  }
}

export async function getSession(sessionId: string): Promise<SessionState | null> {
  if (memoryStore.has(sessionId)) return memoryStore.get(sessionId)!;

  if (KV_CONFIGURED) {
    const remote = await kvGet(sessionId);
    if (remote) memoryStore.set(sessionId, remote);
    return remote;
  }
  if (BREETH_CONFIGURED) {
    const remote = await breethGet(sessionId);
    if (remote) memoryStore.set(sessionId, remote);
    return remote;
  }
  return null;
}

export async function saveSession(state: SessionState): Promise<void> {
  state.updatedAt = new Date().toISOString();
  memoryStore.set(state.sessionId, state);

  if (KV_CONFIGURED) {
    await kvSet(state.sessionId, state);
  } else if (BREETH_CONFIGURED) {
    await breethSet(state.sessionId, state);
  }
}