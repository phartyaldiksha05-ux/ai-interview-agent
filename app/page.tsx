"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import sampleCandidates from "@/data/sample-candidates.json";
import type { Candidate } from "@/lib/types";
import { buildInterviewContext } from "@/lib/curriculum";

type Msg = { role: "interviewer" | "candidate"; text:string ; day?: number };
type Phase = "setup" | "interview" | "done";
type VoiceState = "idle" | "listening" | "speaking";

const candidates = (sampleCandidates as any).candidates as Candidate[];

function newSessionId() {
  return `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function Page() {
  const [candidateId, setCandidateId] = useState(candidates[0].member.id);
  const [source, setSource] = useState<"sample" | "resume">("sample");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeCandidate, setResumeCandidate] = useState<Candidate | null>(null);
  const [resumeParsing, setResumeParsing] = useState(false);
  const [resumeError, setResumeError] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<Phase>("setup");
  const [feedback, setFeedback] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [questionCount, setQuestionCount] = useState(0);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceOutOn, setVoiceOutOn] = useState(true);
  const [speechSupported, setSpeechSupported] = useState(false);

  const recognitionRef = useRef<any>(null);
  const wantListeningRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const loadVoices = () => setVoices(window.speechSynthesis.getVoices());
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  function isFemaleVoice(v: SpeechSynthesisVoice): boolean {
    const n = v.name.toLowerCase();
    return (
      n.includes("female") ||
      n.includes("zira") || // Windows
      n.includes("samantha") || // macOS/iOS
      n.includes("susan") ||
      n.includes("heera") || // en-IN female (Windows)
      n.includes("google uk english female") ||
      n.includes("google us english") === false && n.includes("google") && n.includes("female")
    );
  }

  function pickVoice(): SpeechSynthesisVoice | undefined {
    const en = voices.filter((v) => v.lang?.startsWith("en"));
    const byPriority = (pool: SpeechSynthesisVoice[]) =>
      pool.find((v) => v.lang === "en-IN" && isFemaleVoice(v)) ||
      pool.find((v) => v.lang?.startsWith("en-IN") && isFemaleVoice(v)) ||
      pool.find((v) => v.lang === "en-GB" && isFemaleVoice(v)) ||
      pool.find((v) => isFemaleVoice(v)) ||
      pool.find((v) => v.lang === "en-IN") ||
      pool.find((v) => v.lang === "en-GB") ||
      pool[0];
    return byPriority(en);
  }

  useEffect(() => {
    const SR =
      typeof window !== "undefined" &&
      ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    if (SR) {
      const rec = new SR();
      rec.continuous = true; // keep listening through short pauses
      rec.interimResults = true;
      rec.lang = "en-US";
      rec.onresult = (e: any) => {
        let text = "";
        for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
        setInput(text);
      };
      rec.onend = () => {
        // Some browsers still auto-stop after a silence timeout even in
        // continuous mode. If the user hasn't clicked "stop" themselves,
        // silently restart so it keeps listening through the pause.
        if (wantListeningRef.current) {
          try {
            rec.start();
            return;
          } catch {
            // already running or briefly unrestartable — fall through
          }
        }
        setVoiceState((s) => (s === "listening" ? "idle" : s));
      };
      rec.onerror = (e: any) => {
        if (e.error === "no-speech" || e.error === "aborted") return; // ignore, onend will restart
        wantListeningRef.current = false;
        setVoiceState("idle");
      };
      recognitionRef.current = rec;
      setSpeechSupported(true);
    }
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const speechKeepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopKeepAlive() {
    if (speechKeepAliveRef.current) {
      clearInterval(speechKeepAliveRef.current);
      speechKeepAliveRef.current = null;
    }
  }

  function speak(text: string) {
    if (!voiceOutOn || typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    stopKeepAlive();
    const utter = new SpeechSynthesisUtterance(text);
    const voice = pickVoice();
    if (voice) {
      utter.voice = voice;
      utter.lang = voice.lang;
      utter.pitch = isFemaleVoice(voice) ? 1 : 1.15;
    } else {
      utter.lang = "en-IN";
      utter.pitch = 1.15;
    }
    utter.rate = 1;
    utter.onstart = () => {
      setVoiceState("speaking");
      // Chrome bug workaround: speechSynthesis silently cuts off long
      // utterances after ~15s of the tab being backgrounded/idle. Nudging
      // pause+resume periodically resets that internal timer.
      speechKeepAliveRef.current = setInterval(() => {
        if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }
      }, 10000);
    };
    utter.onend = () => {
      stopKeepAlive();
      setVoiceState("idle");
    };
    utter.onerror = () => {
      stopKeepAlive();
      setVoiceState("idle");
    };
    window.speechSynthesis.speak(utter);
  }

  function toggleMic() {
    if (!recognitionRef.current) return;
    if (voiceState === "listening") {
      wantListeningRef.current = false;
      recognitionRef.current.stop();
      setVoiceState("idle");
    } else {
      window.speechSynthesis?.cancel();
      setInput("");
      wantListeningRef.current = true;
      recognitionRef.current.start();
      setVoiceState("listening");
    }
  }

  async function uploadResume(file: File) {
    setResumeFile(file);
    setResumeError("");
    setResumeCandidate(null);
    setResumeParsing(true);
    try {
      const fd = new FormData();
      fd.append("resume", file);
      const res = await fetch("/api/resume", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not parse resume.");
      setResumeCandidate(data.candidate);
    } catch (err: any) {
      setResumeError(err.message || "Something went wrong parsing the resume.");
    } finally {
      setResumeParsing(false);
    }
  }

  const selectedCandidate: Candidate | null =
    source === "resume" ? resumeCandidate : candidates.find((c) => c.member.id === candidateId) || null;

  const interviewContext = useMemo(
    () => (selectedCandidate ? buildInterviewContext(selectedCandidate) : null),
    [selectedCandidate]
  );

  async function start() {
    const candidate =
      source === "resume" ? resumeCandidate! : candidates.find((c) => c.member.id === candidateId)!;
    const sid = newSessionId();
    setSessionId(sid);
    setMessages([]);
    setFeedback(null);
    setQuestionCount(0);
    setLoading(true);
    setPhase("interview");
    const res = await fetch("/api/interview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: sid, candidate }),
    });
    const data = await res.json();
    setMessages([{ role: "interviewer", text: data.reply }]);
    speak(data.reply);
    setLoading(false);
  }

  async function send() {
    if (!input.trim() || loading) return;
    if (voiceState === "listening") {
      wantListeningRef.current = false;
      recognitionRef.current?.stop();
    }
    const text = input;
    setMessages((m) => [...m, { role: "candidate", text }]);
    setInput("");
    setLoading(true);
    const res = await fetch("/api/interview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, message: text }),
    });
    const data = await res.json();
    setMessages((m) => [...m, { role: "interviewer", text: data.reply }]);
    setQuestionCount((q) => q + 1);
    if (data.done) {
      setPhase("done");
      setFeedback(data.feedback);
    } else {
      speak(data.reply);
    }
    setLoading(false);
  }

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={styles.logo}>AI TALKS</span>
          <span style={styles.pillBadge}>INTERVIEW AGENT</span>
        </div>
        {phase === "interview" && (
          <div style={styles.sessionTag}>
            <span style={styles.liveDot(voiceState !== "idle")} />
            Q{questionCount + 1}{questionCount + 1 >= 8 ? "" : " / MIN 8"}
          </div>
        )}
      </header>

      {phase === "setup" && (
        <section style={styles.setupCard}>
          <p style={styles.setupLede}>
            A live, adaptive technical interview — grounded in what the candidate
            actually built, skipped, and struggled with during the cohort.
          </p>

          <div style={styles.sourceToggle}>
            <button
              onClick={() => setSource("sample")}
              style={styles.sourceTab(source === "sample")}
            >
              Existing candidate
            </button>
            <button
              onClick={() => setSource("resume")}
              style={styles.sourceTab(source === "resume")}
            >
              Upload resume
            </button>
          </div>

          {source === "sample" ? (
            <>
              <label style={styles.label}>CANDIDATE</label>
              <select
                value={candidateId}
                onChange={(e) => setCandidateId(e.target.value)}
                style={styles.select}
              >
                {candidates.map((c) => (
                  <option key={c.member.id} value={c.member.id}>
                    {c.member.name} — {c.member.jobRole}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              <label style={styles.label}>RESUME (PDF OR TXT)</label>
              <input
                type="file"
                accept=".pdf,.txt"
                onChange={(e) => e.target.files?.[0] && uploadResume(e.target.files[0])}
                style={styles.fileInput}
              />
              {resumeParsing && (
                <p style={styles.hint}>Reading resume and mapping it to the cohort curriculum…</p>
              )}
              {resumeError && <p style={styles.errorText}>{resumeError}</p>}
              {resumeCandidate && !resumeParsing && (
                <div style={styles.resumePreview}>
                  <b>{resumeCandidate.member.name}</b> — {resumeCandidate.member.jobRole}
                  <br />
                  <span style={{ color: "var(--text-dim)" }}>
                    Matched {resumeCandidate.missions.length} curriculum days from the resume
                  </span>
                </div>
              )}
            </>
          )}

          {interviewContext && (
            <div style={styles.contextCard}>
              <div style={styles.contextHeader}>INTERVIEW CONTEXT</div>
              <ul style={styles.contextList}>
                <li>
                  {interviewContext.completedDays}/{interviewContext.totalDays} days completed
                </li>
                <li>
                  Strong areas:{" "}
                  {interviewContext.strongAreas.length > 0
                    ? interviewContext.strongAreas.join(", ")
                    : "not enough data yet"}
                </li>
                <li>
                  Needs review:{" "}
                  {interviewContext.weakAreas.length > 0
                    ? interviewContext.weakAreas.join(", ")
                    : "none flagged"}
                </li>
                <li>
                  Resume:{" "}
                  {source === "resume" && resumeCandidate ? (
                    <span style={{ color: "var(--good)" }}>Uploaded ✓</span>
                  ) : (
                    "Not uploaded"
                  )}
                </li>
              </ul>
            </div>
          )}

          <button
            onClick={start}
            style={styles.primaryBtn}
            disabled={loading || (source === "resume" && !resumeCandidate)}
          >
            {loading ? "Starting…" : "Begin interview →"}
          </button>
          {!speechSupported && (
            <p style={styles.hint}>
              Voice input isn't supported in this browser — try Chrome for mic input.
              Text still works everywhere.
            </p>
          )}
        </section>
      )}

      {phase !== "setup" && (
        <>
          <div ref={scrollRef} style={styles.transcript}>
            {messages.map((m, i) => (
              <div
                key={i}
                style={m.role === "interviewer" ? styles.rowLeft : styles.rowRight}
              >
                <span style={styles.speakerLabel(m.role)}>
                  {m.role === "interviewer" ? "INTERVIEWER" : "YOU"}
                </span>
                <div style={m.role === "interviewer" ? styles.bubbleI : styles.bubbleC}>
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div style={styles.rowLeft}>
                <span style={styles.speakerLabel("interviewer")}>INTERVIEWER</span>
                <div style={styles.bubbleI}>
                  <span className="typing-dots">
                    <i /><i /><i />
                  </span>
                </div>
              </div>
            )}
          </div>

          {phase === "done" && feedback && (
            <section style={styles.feedbackCard}>
              <div style={styles.feedbackHeader}>Interview feedback</div>
              <p style={styles.feedbackSummary}>{feedback.summary}</p>
              <div style={styles.feedbackGrid}>
                <FeedbackCol title="Strengths" items={feedback.strengths} accent="var(--good)" />
                <FeedbackCol title="Gaps" items={feedback.gaps} accent="var(--live)" />
                <FeedbackCol title="Next steps" items={feedback.next} accent="var(--accent)" />
              </div>
            </section>
          )}

          {phase === "interview" && (
            <div style={styles.controlBar}>
              <div className="wave-wrap" data-active={voiceState !== "idle"} style={styles.waveWrap}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <span
                    key={i}
                    className="wave-bar"
                    style={{
                      animationDelay: `${i * 0.12}s`,
                      background: voiceState === "listening" ? "var(--led)" : "var(--accent)",
                      opacity: voiceState === "idle" ? 0.25 : 1,
                    }}
                  />
                ))}
              </div>

              {speechSupported && (
                <button
                  onClick={toggleMic}
                  aria-label={voiceState === "listening" ? "Stop recording" : "Start recording"}
                  style={styles.micBtn(voiceState === "listening")}
                >
                  {voiceState === "listening" ? "■" : "●"}
                </button>
              )}

              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder={voiceState === "listening" ? "Listening…" : "Type or speak your answer…"}
                style={styles.input}
              />

              <button
                onClick={() => setVoiceOutOn((v) => !v)}
                title={voiceOutOn ? "Voice replies on" : "Voice replies off"}
                style={styles.toggleBtn(voiceOutOn)}
              >
                {voiceOutOn ? "🔊" : "🔇"}
              </button>

              <button onClick={send} style={styles.sendBtn} disabled={loading || !input.trim()}>
                Send
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}

function FeedbackCol({ title, items, accent }: { title: string; items: string[]; accent: string }) {
  return (
    <div style={{ borderLeft: `2px solid ${accent}`, paddingLeft: 14 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: 1, color: accent, marginBottom: 8 }}>
        {title.toUpperCase()}
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text)", fontSize: 14, lineHeight: 1.6 }}>
        {items.map((s, i) => (
          <li key={i} style={{ marginBottom: 4 }}>{s}</li>
        ))}
      </ul>
    </div>
  );
}

const styles: Record<string, any> = {
  page: {
    maxWidth: 720,
    margin: "0 auto",
    padding: "28px 20px 100px",
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 22,
  },
  logo: {
    fontFamily: "var(--font-display)",
    fontSize: 22,
    letterSpacing: 1,
    color: "var(--text)",
  },
  pillBadge: {
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    letterSpacing: 1.2,
    color: "var(--accent)",
    background: "var(--accent-dim)",
    border: "1px solid var(--accent)",
    borderRadius: 20,
    padding: "4px 10px",
  },
  sessionTag: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    letterSpacing: 1,
    color: "var(--good)",
    border: "1px solid var(--border)",
    borderRadius: 20,
    padding: "5px 12px",
    background: "var(--surface)",
  },
  liveDot: (active: boolean) => ({
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: active ? "var(--live)" : "var(--good)",
    boxShadow: active ? "0 0 8px var(--live)" : "0 0 6px var(--good)",
    transition: "all 0.2s ease",
  }),
  setupCard: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 20,
    padding: 24,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  setupLede: {
    color: "var(--text-dim)",
    fontSize: 15,
    lineHeight: 1.6,
    margin: "0 0 8px",
  },
  label: {
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    letterSpacing: 1.5,
    color: "var(--text-dim)",
  },
  select: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--surface-2)",
    color: "var(--text)",
    fontSize: 14,
  },
  primaryBtn: {
    marginTop: 8,
    padding: "12px 20px",
    borderRadius: 12,
    border: "none",
    background: "var(--accent)",
    color: "#0B0B0F",
    fontWeight: 800,
    fontSize: 14,
    cursor: "pointer",
  },
  hint: {
    fontSize: 12,
    color: "var(--text-dim)",
    marginTop: 4,
  },
  contextCard: {
    background: "var(--surface-2)",
    border: "1px solid var(--border)",
    borderLeft: "3px solid var(--accent)",
    borderRadius: 12,
    padding: "14px 16px",
  },
  contextHeader: {
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    letterSpacing: 1.5,
    color: "var(--accent)",
    marginBottom: 8,
  },
  contextList: {
    margin: 0,
    paddingLeft: 18,
    color: "var(--text)",
    fontSize: 13,
    lineHeight: 1.8,
  },
  sourceToggle: {
    display: "flex",
    gap: 6,
    background: "var(--surface-2)",
    padding: 4,
    borderRadius: 10,
    width: "fit-content",
  },
  sourceTab: (active: boolean) => ({
    padding: "7px 14px",
    borderRadius: 8,
    border: "none",
    background: active ? "var(--accent)" : "transparent",
    color: active ? "#0B0B0F" : "var(--text-dim)",
    fontWeight: active ? 700 : 500,
    fontSize: 13,
    cursor: "pointer",
  }),
  fileInput: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px dashed var(--border)",
    background: "var(--surface-2)",
    color: "var(--text)",
    fontSize: 13,
  },
  resumePreview: {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--surface-2)",
    fontSize: 13,
    lineHeight: 1.6,
    color: "var(--text)",
  },
  errorText: {
    fontSize: 12,
    color: "var(--live)",
    margin: 0,
  },
  transcript: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 16,
    overflowY: "auto",
    padding: "4px 2px",
  },
  rowLeft: { display: "flex", flexDirection: "column", alignItems: "flex-start", maxWidth: "85%" },
  rowRight: { display: "flex", flexDirection: "column", alignItems: "flex-end", maxWidth: "85%", alignSelf: "flex-end" },
  speakerLabel: (role: string) => ({
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    letterSpacing: 1,
    color: role === "interviewer" ? "var(--accent)" : "var(--candidate-border)",
    marginBottom: 4,
    paddingLeft: role === "interviewer" ? 2 : 0,
  }),
  bubbleI: {
    background: "var(--surface)",
    borderLeft: "2px solid var(--accent)",
    borderRadius: "4px 16px 16px 16px",
    padding: "12px 16px",
    fontSize: 15,
    lineHeight: 1.55,
    color: "var(--text)",
  },
  bubbleC: {
    background: "var(--candidate)",
    border: "1px solid var(--candidate-border)",
    borderRadius: "16px 4px 16px 16px",
    padding: "12px 16px",
    fontSize: 15,
    lineHeight: 1.55,
    color: "var(--text)",
  },
  controlBar: {
    position: "sticky",
    bottom: 0,
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "var(--bg)",
    paddingTop: 14,
  },
  waveWrap: {
    display: "flex",
    alignItems: "center",
    gap: 3,
    height: 20,
    width: 30,
    flexShrink: 0,
  },
  micBtn: (active: boolean) => ({
    width: 42,
    height: 42,
    borderRadius: "50%",
    border: active ? "2px solid var(--live)" : "1px solid var(--border)",
    background: active ? "rgba(229,72,77,0.12)" : "var(--surface-2)",
    color: active ? "var(--live)" : "var(--text-dim)",
    fontSize: 14,
    cursor: "pointer",
    flexShrink: 0,
  }),
  input: {
    flex: 1,
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--text)",
    fontSize: 14,
  },
  toggleBtn: (on: boolean) => ({
    width: 40,
    height: 40,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--surface-2)",
    opacity: on ? 1 : 0.5,
    cursor: "pointer",
    fontSize: 15,
    flexShrink: 0,
  }),
  sendBtn: {
    padding: "12px 18px",
    borderRadius: 12,
    border: "none",
    background: "var(--accent)",
    color: "#0B0B0F",
    fontWeight: 800,
    fontSize: 14,
    cursor: "pointer",
    flexShrink: 0,
  },
  feedbackCard: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 20,
    padding: 24,
    marginTop: 20,
  },
  feedbackHeader: {
    fontFamily: "var(--font-display)",
    fontSize: 22,
    marginBottom: 10,
    color: "var(--text)",
  },
  feedbackSummary: {
    color: "var(--text-dim)",
    fontSize: 14,
    lineHeight: 1.6,
    marginBottom: 20,
  },
  feedbackGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 18,
  },
};
