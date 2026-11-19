import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { AlertTriangle, ClipboardPaste, Info, Mic, MicOff, Pause, Play, ShieldCheck, Square } from 'lucide-react';
import type { Meeting } from '@meetos/shared';
import { useSession } from '@/state/auth';
import { useWs } from '@/state/workspace';
import { appendSegment, getSegments, getTranscript, listenMeeting, patchMeeting, saveTranscript, segmentsToTranscript } from '@/data/meetings';
import { Avatar, Button, ButtonLink, Card, cn, ErrorNote, Field, Notice, PageHeader, Select, Skeleton } from '@/components/ui';
import { Timestamp, serverTimestamp } from 'firebase/firestore';

// Minimal typings for the Web Speech API (not in TypeScript's DOM lib).
interface SRAlternative { transcript: string }
interface SRResult { isFinal: boolean; 0: SRAlternative; length: number }
interface SREvent { resultIndex: number; results: { length: number; [i: number]: SRResult } }
interface SRErrorEvent { error: string; message?: string }
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: SRErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SRCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SRCtor | null {
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

interface Segment {
  index: number;
  speaker: string | null;
  text: string;
}

type Phase = 'consent' | 'recording' | 'paused' | 'saving';

const LANGS = [
  ['en-US', 'English (US)'],
  ['en-GB', 'English (UK)'],
  ['en-IN', 'English (India)'],
  ['en-NG', 'English (Nigeria)'],
  ['en-AU', 'English (Australia)'],
];

function useElapsed(running: boolean) {
  const [ms, setMs] = useState(0);
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (!running) {
      last.current = null;
      return;
    }
    last.current = Date.now();
    const t = setInterval(() => {
      const now = Date.now();
      setMs((m) => m + (now - (last.current ?? now)));
      last.current = now;
    }, 500);
    return () => clearInterval(t);
  }, [running]);
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export default function LiveCapturePage() {
  const { id = '' } = useParams();
  const { wid, members } = useWs();
  const { actor } = useSession();
  const navigate = useNavigate();
  const [meeting, setMeeting] = useState<Meeting | null | undefined>(undefined);
  const [existingTranscript, setExisting] = useState('');
  const [phase, setPhase] = useState<Phase>('consent');
  const [consent, setConsent] = useState(false);
  const [lang, setLang] = useState('en-US');
  const [segments, setSegments] = useState<Segment[]>([]);
  const [interim, setInterim] = useState('');
  const [speaker, setSpeaker] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveErrors, setSaveErrors] = useState(0);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const phaseRef = useRef<Phase>('consent');
  const speakerRef = useRef<string | null>(null);
  const indexRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const Ctor = getRecognitionCtor();
  const elapsed = useElapsed(phase === 'recording');

  phaseRef.current = phase;
  speakerRef.current = speaker;

  useEffect(() => listenMeeting(wid, id, setMeeting), [wid, id]);
  useEffect(() => {
    void getTranscript(wid, id).then(setExisting).catch(() => undefined);
    // Resume support: continue numbering after segments saved before a reload.
    void getSegments(wid, id)
      .then((s) => {
        if (s.length) {
          setSegments(s.map((x) => ({ index: x.index, speaker: x.speaker, text: x.text })));
          indexRef.current = Math.max(...s.map((x) => x.index)) + 1;
        }
      })
      .catch(() => undefined);
  }, [wid, id]);

  // Visible recording state in the tab title + leave warning.
  useEffect(() => {
    if (phase !== 'recording' && phase !== 'paused') return;
    const prev = document.title;
    document.title = phase === 'recording' ? '● Recording — MEETOS' : '❚❚ Paused — MEETOS';
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      document.title = prev;
      window.removeEventListener('beforeunload', warn);
    };
  }, [phase]);

  useEffect(() => () => recRef.current?.abort(), []);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [segments.length, interim]);

  function startRecognition() {
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (!r) continue;
        const text = r[0].transcript.trim();
        if (r.isFinal) {
          if (!text) continue;
          const seg: Segment = { index: indexRef.current++, speaker: speakerRef.current, text: text.charAt(0).toUpperCase() + text.slice(1) };
          setSegments((s) => [...s, seg]);
          // Incremental save: each finalised phrase is written immediately.
          appendSegment(wid, id, { ...seg, source: 'web_speech' }).catch(() => setSaveErrors((n) => n + 1));
        } else {
          interimText += text + ' ';
        }
      }
      setInterim(interimText.trim());
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setError('Microphone access was denied. Allow microphone access for this site in your browser settings, or paste a transcript instead.');
        setPhase('paused');
      } else if (e.error === 'network') {
        setError("The browser's speech service could not be reached. Check your connection; recording is paused.");
        setPhase('paused');
      } else if (e.error === 'audio-capture') {
        setError('No microphone was found.');
        setPhase('paused');
      } else {
        setError(`Speech recognition error: ${e.error}`);
      }
    };
    rec.onend = () => {
      // Chrome ends sessions after silence; keep going while the user is recording.
      if (phaseRef.current === 'recording') {
        try {
          rec.start();
        } catch {
          /* already started */
        }
      }
    };
    recRef.current = rec;
    rec.start();
  }

  async function start() {
    setError(null);
    setPhase('recording');
    phaseRef.current = 'recording';
    await patchMeeting(wid, id, { status: 'live', ...(meeting?.startedAt ? {} : { startedAt: serverTimestamp() }) }).catch(() => undefined);
    startRecognition();
  }

  function pause() {
    setPhase('paused');
    phaseRef.current = 'paused';
    recRef.current?.stop();
    setInterim('');
  }

  function resume() {
    setError(null);
    setPhase('recording');
    phaseRef.current = 'recording';
    startRecognition();
  }

  async function stop() {
    if (!meeting) return;
    setPhase('saving');
    phaseRef.current = 'saving';
    recRef.current?.stop();
    setInterim('');
    try {
      const captured = segmentsToTranscript(segments);
      const text = [existingTranscript, captured].filter((t) => t.trim()).join('\n');
      if (!text.trim()) {
        await patchMeeting(wid, id, { status: 'scheduled' });
        toast.message('Nothing was captured.');
        navigate(`/app/meetings/${id}`);
        return;
      }
      await saveTranscript(wid, actor, meeting, text, 'web_speech');
      await patchMeeting(wid, id, { endedAt: Timestamp.now() });
      toast.success('Transcript saved');
      navigate(`/app/meetings/${id}?analyze=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the transcript.');
      setPhase('paused');
    }
  }

  if (meeting === undefined) return <Skeleton className="h-64" />;
  if (meeting === null) return <ErrorNote>This meeting doesn't exist or you don't have access.</ErrorNote>;

  const speakerOptions = [...new Set([...meeting.participants.map((p) => p.name), ...members.map((m) => m.displayName)])];

  if (!Ctor) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Live capture" eyebrow={meeting.title} />
        <Card className="p-6">
          <div className="flex gap-3">
            <MicOff className="size-5 shrink-0 text-warning" aria-hidden />
            <div>
              <h2 className="text-[15px] font-semibold text-fg">This browser doesn't support live speech recognition</h2>
              <p className="mt-1 text-[13.5px] text-fg-2">
                Live capture uses the browser's Web Speech API, which is available in Chrome and Edge on desktop. You can still paste or upload a transcript from your meeting tool.
              </p>
              <ButtonLink to={`/app/meetings/${id}?tab=transcript&edit=1`} className="mt-4" variant="primary" icon={ClipboardPaste}>Add a transcript instead</ButtonLink>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const active = phase === 'recording' || phase === 'paused' || phase === 'saving';

  return (
    <div className="mx-auto max-w-3xl">
      {active && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            'sticky top-14 z-10 -mx-4 mb-4 flex items-center gap-3 border-b px-4 py-2.5 sm:-mx-6 sm:px-6',
            phase === 'recording' ? 'border-danger/30 bg-danger-soft' : 'border-line bg-surface-2',
          )}
        >
          <span className={cn('size-2.5 rounded-full', phase === 'recording' ? 'rec-dot bg-danger' : 'bg-fg-3')} aria-hidden />
          <span className={cn('text-[13px] font-semibold', phase === 'recording' ? 'text-danger' : 'text-fg-2')}>
            {phase === 'recording' ? 'Recording' : phase === 'saving' ? 'Saving…' : 'Paused'}
          </span>
          <span className="font-mono text-[13px] text-fg-2 tabular-nums">{elapsed}</span>
          <span className="ml-auto hidden text-[12px] text-fg-3 sm:block">{segments.length} segments saved</span>
        </div>
      )}

      <PageHeader title="Live capture" eyebrow={meeting.title} />

      {phase === 'consent' && (
        <Card className="p-6">
          <div className="flex items-center gap-2 text-[15px] font-semibold text-fg">
            <ShieldCheck className="size-5 text-brand" aria-hidden /> Before you record
          </div>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[13.5px] text-fg-2">
            <li>Tell everyone in the meeting that it's being transcribed, and get their agreement. Recording laws differ by location.</li>
            <li>MEETOS stores the <strong className="text-fg">text</strong> transcript in this workspace. Audio is not stored.</li>
            <li>
              Transcription is performed by your browser's built-in speech recognition (Web Speech API). In Chrome, audio is sent to Google's speech service to be converted to text.
            </li>
            <li>AI analysis runs only when you start it afterwards, and shows whether it ran on this device or in the cloud.</li>
          </ul>
          {existingTranscript && (
            <Notice tone="warning" icon={Info} className="mt-4">This meeting already has a transcript. New speech will be appended to it.</Notice>
          )}
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Spoken language" htmlFor="lang">
              <Select id="lang" value={lang} onChange={(e) => setLang(e.target.value)}>
                {LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
          </div>
          <label className="mt-5 flex cursor-pointer items-start gap-2.5 rounded-lg border border-line bg-surface-2/60 p-3">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 accent-[var(--brand)]" />
            <span className="text-[13.5px] text-fg">Everyone in this meeting knows it is being transcribed and has agreed.</span>
          </label>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => navigate(`/app/meetings/${id}`)}>Cancel</Button>
            <Button variant="primary" icon={Mic} disabled={!consent} onClick={() => void start()}>Start recording</Button>
          </div>
        </Card>
      )}

      {active && (
        <>
          {speakerOptions.length > 0 && (
            <Card className="mb-4 p-4">
              <div className="mb-2 text-[12px] font-medium text-fg-3">Who is speaking? Speech recognition can't tell voices apart — tap the current speaker so commitments are attributed correctly.</div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setSpeaker(null)} className={cn('rounded-full border px-3 py-1 text-[12.5px]', speaker === null ? 'border-brand bg-brand-soft text-brand-text' : 'border-line text-fg-2 hover:border-line-strong')}>
                  Unlabelled
                </button>
                {speakerOptions.map((n) => (
                  <button key={n} onClick={() => setSpeaker(n)} className={cn('inline-flex items-center gap-1.5 rounded-full border py-1 pr-3 pl-1 text-[12.5px]', speaker === n ? 'border-brand bg-brand-soft text-brand-text' : 'border-line text-fg-2 hover:border-line-strong')}>
                    <Avatar name={n} size={20} /> {n}
                  </button>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <div ref={listRef} className="max-h-[50vh] min-h-56 space-y-2 overflow-y-auto p-5" aria-live="polite">
              {segments.length === 0 && !interim && <p className="text-[13.5px] text-fg-3">{phase === 'recording' ? 'Listening… start speaking.' : 'Paused.'}</p>}
              {segments.map((s) => (
                <p key={s.index} className="text-[14px] leading-relaxed text-fg">
                  {s.speaker && <span className="font-semibold">{s.speaker}: </span>}
                  {s.text}
                </p>
              ))}
              {interim && <p className="text-[14px] leading-relaxed text-fg-3 italic">{interim}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-line p-3">
              {phase === 'recording' ? (
                <Button icon={Pause} onClick={pause}>Pause</Button>
              ) : (
                <Button icon={Play} onClick={resume} disabled={phase === 'saving'}>Resume</Button>
              )}
              <Button variant="danger" icon={Square} loading={phase === 'saving'} onClick={() => void stop()}>Stop & save</Button>
              <span className="ml-auto text-[12px] text-fg-3">Source: browser speech recognition</span>
            </div>
          </Card>
          {saveErrors > 0 && (
            <Notice tone="warning" icon={AlertTriangle} className="mt-3">
              {saveErrors} segment{saveErrors === 1 ? '' : 's'} could not be saved immediately. They're kept on this page and will be included when you stop.
            </Notice>
          )}
        </>
      )}
      {error && <ErrorNote className="mt-4">{error}</ErrorNote>}
    </div>
  );
}
