import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, ClipboardPaste, Info, Languages, Mic, MicOff, Pause, Pin, ShieldCheck, Users } from 'lucide-react';
import type { Meeting } from '@meetos/shared';
import { useSession } from '@/state/auth';
import { useWs } from '@/state/workspace';
import { appendSegment, getSegments, getTranscript, listenMeeting, patchMeeting, saveTranscript, segmentsToTranscript } from '@/data/meetings';
import { Avatar, Badge, Button, ButtonLink, Card, cn, ErrorNote, Field, Notice, PageHeader, RoundButton, Select, Skeleton } from '@/components/ui';
import { MeetingHeader } from '@/components/MeetingHeader';
import { fmtDate } from '@/lib/format';
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
  at?: number;
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
          const seg: Segment = { index: indexRef.current++, speaker: speakerRef.current, text: text.charAt(0).toUpperCase() + text.slice(1), at: Date.now() };
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
  const latest = [...segments].reverse().find((x) => x.text);
  const stageSpeaker = speaker ?? latest?.speaker ?? null;
  const others = speakerOptions.filter((n) => n !== stageSpeaker);
  const clock = (ms?: number) => (ms ? new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');

  const header = (
    <MeetingHeader
      title={meeting.title}
      subtitle={meeting.description || 'Live transcription with consent'}
      topLeft={
        active ? (
          <Badge tone="success" icon={CheckCircle2}>Consent confirmed</Badge>
        ) : (
          <Badge tone="neutral" icon={ShieldCheck}>Consent required</Badge>
        )
      }
      topRight={<Badge tone="brand" icon={Users}>{speakerOptions.length} participants</Badge>}
      bottomLeft={{ label: 'Meet date', value: fmtDate(meeting.startedAt ?? meeting.scheduledAt ?? Date.now(), true) }}
      bottomRight={{
        label: 'Recording time',
        value: (
          <>
            <span className={cn('size-3 rounded-full', phase === 'recording' ? 'rec-dot bg-danger' : 'bg-fg-3/40')} aria-hidden />
            <span className="font-mono">{elapsed}</span>
          </>
        ),
      }}
    />
  );

  const participantsCard = (
    <Card>
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h2 className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.01em] text-fg">
          Participants <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-white dark:text-[#120d2b]">{speakerOptions.length}</span>
        </h2>
      </div>
      {speakerOptions.length === 0 ? (
        <p className="px-5 pb-5 text-[13px] text-fg-3">No participants listed. Speech will be saved without speaker labels.</p>
      ) : (
        <ul className="border-t border-line pb-2">
          {speakerOptions.map((n) => {
            const current = speaker === n;
            return (
              <li key={n} className={cn('flex items-center gap-3 px-5 py-2.5', current && 'bg-surface-2')}>
                <Avatar name={n} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-medium text-fg">{n}</div>
                  <div className={cn('text-[11.5px]', current ? 'text-brand-text' : 'text-fg-3')}>{current ? 'Speaking now' : 'Participant'}</div>
                </div>
                <button
                  type="button"
                  disabled={!active}
                  onClick={() => setSpeaker(current ? null : n)}
                  aria-pressed={current}
                  aria-label={current ? `Unpin ${n} as current speaker` : `Set ${n} as current speaker`}
                  title={current ? 'Current speaker' : 'Set as current speaker'}
                  className={cn('flex size-9 items-center justify-center rounded-full transition-colors disabled:opacity-40', current ? 'bg-brand-soft text-brand-text' : 'text-fg-3 hover:bg-surface-3')}
                >
                  <Pin className="size-4" aria-hidden />
                </button>
                <span className={cn('flex size-9 items-center justify-center rounded-full', current && phase === 'recording' ? 'bg-brand-soft text-brand-text' : 'text-fg-3')} aria-hidden>
                  {current && phase === 'recording' ? <Mic className="size-4" /> : <MicOff className="size-4" />}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      {active && (
        <div role="status" aria-live="polite" className="sr-only">
          {phase === 'recording' ? 'Recording' : phase === 'saving' ? 'Saving' : 'Paused'}
        </div>
      )}
      <div className="min-w-0 space-y-5">
        <h2 className="sr-only">Live capture</h2>
        {header}

        {phase === 'consent' ? (
          <Card className="p-6">
            <div className="flex items-center gap-2 text-[16px] font-semibold text-fg">
              <span className="flex size-8 items-center justify-center rounded-full bg-brand-soft text-brand-text"><ShieldCheck className="size-4" aria-hidden /></span>
              Before you record
            </div>
            <ul className="mt-4 space-y-2 text-[13px] text-fg-2">
              <li className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />Tell everyone in the meeting that it's being transcribed, and get their agreement. Recording laws differ by location.</li>
              <li className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden /><span>MEETOS stores the <strong className="text-fg">text</strong> transcript in this workspace. Audio is not stored.</span></li>
              <li className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />Transcription is performed by your browser's built-in speech recognition (Web Speech API). In Chrome, audio is sent to Google's speech service to be converted to text.</li>
              <li className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />AI analysis runs only when you start it afterwards, and shows whether it ran on this device or in the cloud.</li>
            </ul>
            {existingTranscript && (
              <Notice tone="warning" icon={Info} className="mt-4">This meeting already has a transcript. New speech will be appended to it.</Notice>
            )}
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Spoken language" htmlFor="lang">
                <Select id="lang" value={lang} onChange={(e) => setLang(e.target.value)}>
                  {LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              </Field>
            </div>
            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-surface-2 p-4">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 accent-[var(--brand)]" />
              <span className="text-[13.5px] text-fg">Everyone in this meeting knows it is being transcribed and has agreed.</span>
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => navigate(`/app/meetings/${id}`)}>Cancel</Button>
              <Button variant="primary" icon={Mic} disabled={!consent} onClick={() => void start()}>Start recording</Button>
            </div>
          </Card>
        ) : (
          <>
            {/* Stage: the current speaker and what they just said. */}
            <Card className="p-3">
              <div className="relative flex min-h-72 flex-col items-center justify-center overflow-hidden rounded-2xl border border-brand/15 bg-gradient-to-b from-surface-2 to-surface px-6 py-10 text-center">
                <span className="absolute top-4 left-4 inline-flex items-center gap-2 rounded-full bg-surface/90 py-1 pr-3 pl-1 text-[12.5px] font-medium text-fg shadow-card">
                  {stageSpeaker ? <Avatar name={stageSpeaker} size={22} /> : <span className="size-[22px] rounded-full bg-surface-3" />}
                  {stageSpeaker ?? 'Unlabelled speaker'}
                </span>
                <span className={cn('absolute top-4 right-4 flex size-10 items-center justify-center rounded-full', phase === 'recording' ? 'bg-brand-soft text-brand-text' : 'bg-surface-2 text-fg-3')} aria-hidden>
                  {phase === 'recording' ? <Mic className="size-[18px]" /> : <MicOff className="size-[18px]" />}
                </span>
                {stageSpeaker ? <Avatar name={stageSpeaker} size={96} /> : (
                  <span className="flex size-24 items-center justify-center rounded-full bg-surface-3 text-fg-3"><Mic className="size-8" aria-hidden /></span>
                )}
                <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-fg" aria-live="polite">
                  {interim ? <span className="text-fg-3 italic">{interim}</span> : latest ? `“${latest.text}”` : phase === 'recording' ? 'Listening… start speaking.' : 'Paused.'}
                </p>
              </div>
              {others.length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {others.slice(0, 2).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setSpeaker(n)}
                      aria-label={`Set ${n} as current speaker`}
                      className="relative flex h-32 flex-col items-center justify-center rounded-2xl bg-surface-2 transition-colors hover:bg-surface-3"
                    >
                      <Avatar name={n} size={52} />
                      <span className="absolute bottom-2.5 left-2.5 rounded-full bg-surface/90 px-2.5 py-0.5 text-[12px] font-medium text-fg">{n}</span>
                      <span className="absolute top-2.5 right-2.5 flex size-7 items-center justify-center rounded-full bg-surface/90 text-fg-3" aria-hidden><MicOff className="size-3.5" /></span>
                    </button>
                  ))}
                  <div className="relative hidden h-32 flex-col items-center justify-center rounded-2xl bg-surface-2 sm:flex">
                    <span className="flex items-center gap-1.5 rounded-full bg-surface/90 px-3 py-1.5 text-[14px] font-semibold text-fg"><Users className="size-4 text-fg-3" aria-hidden />{speakerOptions.length}</span>
                    <span className="mt-1.5 text-[11.5px] text-fg-3">{segments.length} segments saved</span>
                  </div>
                </div>
              )}
            </Card>

            {/* Control bar */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div><RoundButton icon={Languages} label={`Language: ${lang}`} disabled /></div>
              <div className="flex items-center gap-3">
                {phase === 'recording' ? (
                  <RoundButton icon={Pause} label="Pause" tone="brand" onClick={pause} />
                ) : (
                  <RoundButton icon={Mic} label="Resume" onClick={resume} disabled={phase === 'saving'} />
                )}
                <Button variant="danger" size="lg" className="min-w-36 justify-center" loading={phase === 'saving'} onClick={() => void stop()}>
                  {phase === 'saving' ? 'Saving' : 'End & save'}
                </Button>
              </div>
              <span className="hidden text-right text-[12px] text-fg-3 sm:block">Browser speech recognition</span>
            </div>
            {saveErrors > 0 && (
              <Notice tone="warning" icon={AlertTriangle}>
                {saveErrors} segment{saveErrors === 1 ? '' : 's'} could not be saved immediately. They're kept on this page and will be included when you stop.
              </Notice>
            )}
          </>
        )}
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>

      <div className="min-w-0 space-y-5">
        {participantsCard}
        <Card className="flex flex-col">
          <div className="px-5 pt-5 pb-3">
            <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-fg">Live transcript</h2>
            <p className="text-[12px] text-fg-3">Each phrase is saved to the workspace as it's recognised.</p>
          </div>
          <div ref={listRef} className="max-h-[52vh] min-h-60 space-y-3 overflow-y-auto border-t border-line px-4 py-4" aria-live="polite">
            {segments.length === 0 && !interim && (
              <p className="py-8 text-center text-[13px] text-fg-3">{active ? 'Nothing captured yet.' : 'The transcript will appear here once you start.'}</p>
            )}
            {segments.map((s) => (
              <div key={s.index} className="ml-auto max-w-[92%] overflow-hidden rounded-2xl rounded-tr-md border border-line bg-surface">
                <div className="flex items-center justify-end gap-2 bg-brand-soft/70 px-3 py-1.5 text-[11px] text-brand-text">
                  {s.at && <span>{clock(s.at)}</span>}
                  <span className="font-medium">• {s.speaker ?? 'Unlabelled'}</span>
                  {s.speaker && <Avatar name={s.speaker} size={18} />}
                </div>
                <p className="px-3 py-2 text-right text-[13px] leading-relaxed text-fg-2">{s.text}</p>
              </div>
            ))}
            {interim && (
              <div className="mr-auto max-w-[92%] rounded-2xl rounded-tl-md bg-surface-2 px-3 py-2 text-[13px] text-fg-3 italic">{interim}</div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
