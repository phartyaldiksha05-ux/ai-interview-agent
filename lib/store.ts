import type { SessionState } from "./types";

/**
 * Session persistence.
 *
 * Serverless functions (Vercel) don't guarantee a warm, shared process
 * between requests, so a plain in-memory Map can lose state between calls.
 * We use the Breeth AI Memory Layer as the durable store when configured
 * (BREETH_API_KEY set), and transparently fall back to an in-memory Map
 * for local dev or if Breeth isn't configured — so the app always works,
 * even before you've wired up your Breeth starter-pack key.
 */

const memoryStore = new Map<string, SessionState>();

const BREETH_BASE_URL = process.env.BREETH_BASE_URL || "https://api.thebreeth.com";
const BREETH_API_KEY = process.env.BREETH_API_KEY;

function breethEnabled(): boolean {
  return Boolean(BREETH_API_KEY);
}

function breethKey(sessionId: string): string {
  return `interview-session:${sessionId}`;
}

async function breethGet(sessionId: string): Promise<SessionState | null> {
  try {
    const res = await fetch(
      `${BREETH_BASE_URL}/v1/memory/${encodeURIComponent(breethKey(sessionId))}`,
      {
        headers: { Authorization: `Bearer ${BREETH_API_KEY}` },
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    // Breeth returns the stored value under `value` (adjust if your
    // starter-pack response shape differs).
    return (data?.value as SessionState) ?? null;
  } catch {
    return null;
  }
}

async function breethSet(sessionId: string, state: SessionState): Promise<void> {
  try {
    await fetch(
      `${BREETH_BASE_URL}/v1/memory/${encodeURIComponent(breethKey(sessionId))}`,
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
    // Non-fatal — in-memory copy still gets written below.
  }
}

export async function getSession(sessionId: string): Promise<SessionState | null> {
  if (memoryStore.has(sessionId)) return memoryStore.get(sessionId)!;
  if (breethEnabled()) {
    const remote = await breethGet(sessionId);
    if (remote) {
      memoryStore.set(sessionId, remote);
      return remote;
    }
  }
  return null;
}

export async function saveSession(state: SessionState): Promise<void> {
  state.updatedAt = new Date().toISOString();
  memoryStore.set(state.sessionId, state);
  if (breethEnabled()) {
    await breethSet(state.sessionId, state);
  }
}
