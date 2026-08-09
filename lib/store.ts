import type { SessionState } from "./types";
import { Redis } from "@upstash/redis";

const memoryStore = new Map<string, SessionState>();

const redisConfigured = Boolean(
  process.env.KV_REST_API_URL &&
  process.env.KV_REST_API_TOKEN
);

const redis = redisConfigured ? Redis.fromEnv() : null;

function sessionKey(sessionId: string): string {
  return `interview-session:${sessionId}`;
}

async function redisGet(
  sessionId: string
): Promise<SessionState | null> {
  if (!redis) return null;

  try {
    const value = await redis.get<SessionState>(
      sessionKey(sessionId)
    );

    return value ?? null;
  } catch (err) {
    console.error("Upstash Redis get failed:", err);
    return null;
  }
}

async function redisSet(
  sessionId: string,
  state: SessionState
): Promise<void> {
  if (!redis) return;

  try {
    await redis.set(
      sessionKey(sessionId),
      state,
      {
        ex: 60 * 60 * 2,
      }
    );
  } catch (err) {
    console.error("Upstash Redis set failed:", err);
  }
}

export async function getSession(
  sessionId: string
): Promise<SessionState | null> {

  // 1. Fast local cache
  const local = memoryStore.get(sessionId);

  if (local) {
    return local;
  }

  // 2. Persistent Redis store
  if (redisConfigured) {
    const remote = await redisGet(sessionId);

    if (remote) {
      memoryStore.set(sessionId, remote);
      return remote;
    }
  }

  // 3. Nothing found
  return null;
}

export async function saveSession(
  state: SessionState
): Promise<void> {

  state.updatedAt = new Date().toISOString();

  // Always keep local copy
  memoryStore.set(
    state.sessionId,
    state
  );

  // Persist for Vercel/serverless
  if (redisConfigured) {
    await redisSet(
      state.sessionId,
      state
    );
  }
}