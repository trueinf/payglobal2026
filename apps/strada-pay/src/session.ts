// Live feed for one conversation: transcript lines, state changes and representative audio over the runtime WebSocket.
import { useEffect, useRef, useState } from "react";
import { api, BASE, connect, type Conversation, type Line } from "./api";

export interface Feed { conversation: Conversation | null; lines: Line[]; repName: string; }

export function useSessionFeed(conversationId: string | null, initial?: { conversation: Conversation; lines?: Line[] }, onAudio?: (a: { lineId: number; text: string; url: string | null }) => void) {
  const [feed, setFeed] = useState<Feed>({ conversation: initial?.conversation ?? null, lines: initial?.lines ?? [], repName: "a payroll specialist" });
  const onAudioRef = useRef(onAudio); onAudioRef.current = onAudio;
  useEffect(() => {
    if (!conversationId) return;
    let alive = true;
    api.get(conversationId).then(d => alive && setFeed(f => ({ ...f, conversation: d.conversation, lines: mergeLines(f.lines, d.lines), repName: (d.conversation as any).assignedTo ?? f.repName }))).catch(() => {});
    const stop = connect((kind, data) => {
      if (!alive) return;
      if (kind === "transcript.line" && data.conversationId === conversationId) setFeed(f => ({ ...f, lines: mergeLines(f.lines, [data]) }));
      else if (kind === "conversation.updated" && data.id === conversationId) setFeed(f => ({ ...f, conversation: data, repName: data.assignedTo ?? f.repName }));
      else if (kind === "voice.audio" && data.conversationId === conversationId) onAudioRef.current?.({ lineId: data.lineId, text: data.text, url: data.url ? BASE + data.url : null });
    });
    return () => { alive = false; stop(); };
  }, [conversationId]);
  const addLocal = (l: Line) => setFeed(f => ({ ...f, lines: mergeLines(f.lines, [l]) }));
  return { ...feed, setFeed, addLocal };
}

function mergeLines(cur: Line[], add: Line[]): Line[] {
  const seen = new Set(cur.map(l => l.id)); const out = [...cur];
  for (const l of add) if (!seen.has(l.id)) { out.push(l); seen.add(l.id); }
  return out.sort((a, b) => a.id - b.id);
}

// ---- speech helpers ----
let _audioEl: HTMLAudioElement | null = null;
export async function playUrl(url: string): Promise<void> {
  _audioEl?.pause();
  const a = new Audio(url); _audioEl = a;
  await a.play().catch(() => {});
  await new Promise<void>(res => { a.onended = () => res(); a.onerror = () => res(); });
}

export function speakFallback(text: string): Promise<void> {
  return new Promise(res => {
    try {
      const s = window.speechSynthesis; if (!s) return res();
      const u = new SpeechSynthesisUtterance(text);
      const v = s.getVoices().find(v => /en/i.test(v.lang) && /female|samantha|zira|google uk english female/i.test(v.name)) ?? s.getVoices().find(v => /en/i.test(v.lang));
      if (v) u.voice = v;
      u.onend = () => res(); u.onerror = () => res(); s.speak(u);
    } catch { res(); }
  });
}

/** Push-to-talk: MediaRecorder clip → runtime (Scribe); falls back to the browser's SpeechRecognition when STT is not configured. */
export function usePushToTalk(conversationId: string | null, sttAvailable: boolean, onText: (t: string) => void) {
  const [talking, setTalking] = useState(false);
  const rec = useRef<MediaRecorder | null>(null); const chunks = useRef<Blob[]>([]); const sr = useRef<any>(null);
  const start = async () => {
    if (!conversationId) return;
    setTalking(true);
    if (sttAvailable && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
        const r = new MediaRecorder(stream, { mimeType: mime }); chunks.current = [];
        r.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data); };
        r.onstop = async () => {
          stream.getTracks().forEach(t => t.stop());
          const blob = new Blob(chunks.current, { type: mime });
          if (blob.size < 2000) return;
          try { const { text } = await api.speech(conversationId, blob, mime); if (text) onText(text); } catch (e) { console.warn("stt", e); }
        };
        r.start(); rec.current = r; return;
      } catch (e) { console.warn("mic", e); }
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SR) {
      const s = new SR(); s.lang = "en-US"; s.interimResults = false;
      s.onresult = (e: any) => { const t = e.results[0][0].transcript; if (t) { onText(t); api.line(conversationId, "user", t).catch(() => {}); } };
      s.onend = () => setTalking(false); s.start(); sr.current = s;
    }
  };
  const stop = () => { setTalking(false); rec.current?.state === "recording" && rec.current.stop(); rec.current = null; try { sr.current?.stop(); } catch {} sr.current = null; };
  return { talking, start, stop };
}
