import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Beaker, CalendarClock, ClipboardPaste, FileUp, Mic, UserPlus } from 'lucide-react';
import { detectSpeakers, importTranscriptFile, MAX_TRANSCRIPT_CHARS, SAMPLE_KICKOFF, SAMPLE_SYNC, type Participant, type TranscriptSource } from '@meetos/shared';
import { useSession } from '@/state/auth';
import { useWs } from '@/state/workspace';
import { createMeeting, saveTranscript } from '@/data/meetings';
import { fromDateTimeInput, toDateTimeInput } from '@/lib/format';
import { Button, Card, cn, ErrorNote, Field, Input, Notice, PageHeader, Textarea } from '@/components/ui';
import { ParticipantsInput } from '@/components/ParticipantsInput';
import { ProjectSelect } from '@/components/ProjectSelect';

type Mode = 'live' | 'paste' | 'upload' | 'schedule';

const MODES: { id: Mode; label: string; icon: typeof Mic; text: string }[] = [
  { id: 'live', label: 'Record now', icon: Mic, text: 'Live transcription in this browser, with consent.' },
  { id: 'paste', label: 'Paste transcript', icon: ClipboardPaste, text: 'From Zoom, Meet, Teams or your notes.' },
  { id: 'upload', label: 'Upload file', icon: FileUp, text: '.txt, .md, .vtt or .srt' },
  { id: 'schedule', label: 'Schedule only', icon: CalendarClock, text: 'Plan it now, capture it later.' },
];

export default function NewMeetingPage() {
  const [params] = useSearchParams();
  const { wid, people } = useWs();
  const { actor } = useSession();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>(params.get('live') ? 'live' : 'paste');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [when, setWhen] = useState(toDateTimeInput(Date.now()));
  const [transcript, setTranscript] = useState('');
  const [source, setSource] = useState<TranscriptSource>('paste');
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const speakers = useMemo(() => detectSpeakers(transcript), [transcript]);
  const missingSpeakers = speakers.filter((s) => !participants.some((p) => p.name.toLowerCase() === s.toLowerCase()));

  async function onFile(file: File) {
    setError(null);
    if (file.size > 2_000_000) return setError('That file is larger than 2 MB. Transcripts are plain text and are usually much smaller.');
    if (!/\.(txt|md|vtt|srt|text)$/i.test(file.name) && !file.type.startsWith('text/')) {
      return setError('Unsupported file type. Use a plain-text transcript (.txt, .md, .vtt or .srt).');
    }
    const text = importTranscriptFile(file.name, await file.text());
    if (!text.trim()) return setError('That file contains no transcript text.');
    setTranscript(text);
    setSource('upload');
    setFileName(file.name);
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
  }

  function loadSample(which: 'kickoff' | 'sync') {
    const s = which === 'kickoff' ? SAMPLE_KICKOFF : SAMPLE_SYNC;
    setTranscript(s.transcript);
    setSource('sample');
    setTitle(s.title);
    setDescription(s.description);
    setParticipants(s.participants.map((name) => ({ name })));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const needsTranscript = mode === 'paste' || mode === 'upload';
    if (needsTranscript && !transcript.trim()) return setError(mode === 'upload' ? 'Choose a transcript file first.' : 'Paste the transcript first.');
    if (transcript.length > MAX_TRANSCRIPT_CHARS) return setError('This transcript is too long.');
    setBusy(true);
    try {
      const scheduledAt = fromDateTimeInput(when);
      const id = await createMeeting(wid, actor, {
        title: title || 'Untitled meeting',
        description,
        projectId,
        participants,
        scheduledAt,
        isSample: source === 'sample',
      });
      if (needsTranscript) {
        await saveTranscript(wid, actor, { id, title: title || 'Untitled meeting', status: 'scheduled', startedAt: scheduledAt }, transcript, source);
        toast.success('Meeting saved. Ready to analyse.');
        navigate(`/app/meetings/${id}?analyze=1`);
      } else if (mode === 'live') {
        navigate(`/app/meetings/${id}/live`);
      } else {
        toast.success('Meeting scheduled');
        navigate(`/app/meetings/${id}`);
      }
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : 'Could not save the meeting.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl">
      <PageHeader title="New meeting" description="Add the details, then record live or bring a transcript." />

      <Card className="p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" htmlFor="m-title" className="sm:col-span-2">
            <Input id="m-title" required maxLength={200} placeholder="e.g. Weekly product sync" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Date & time" htmlFor="m-when">
            <Input id="m-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </Field>
          <Field label="Project" htmlFor="m-project">
            <ProjectSelect id="m-project" value={projectId} onChange={setProjectId} />
          </Field>
          <Field label="Participants" htmlFor="m-people" className="sm:col-span-2" hint="Only people you add or who speak in the transcript are used as owners.">
            <ParticipantsInput id="m-people" value={participants} onChange={setParticipants} suggestions={people} />
          </Field>
          <Field label="Description (optional)" htmlFor="m-desc" className="sm:col-span-2">
            <Textarea id="m-desc" rows={2} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
      </Card>

      <h2 className="mt-8 mb-3 text-[14px] font-semibold text-fg">How will you capture it?</h2>
      <div className="grid gap-3 sm:grid-cols-4" role="radiogroup" aria-label="Capture method">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={mode === m.id}
            onClick={() => setMode(m.id)}
            className={cn(
              'rounded-xl border p-3.5 text-left transition-colors',
              mode === m.id ? 'border-brand bg-brand-soft/60 ring-1 ring-brand' : 'border-line bg-surface hover:border-line-strong',
            )}
          >
            <m.icon className={cn('size-4', mode === m.id ? 'text-brand-text' : 'text-fg-3')} aria-hidden />
            <div className="mt-2 text-[13.5px] font-medium text-fg">{m.label}</div>
            <div className="mt-0.5 text-[12px] text-fg-3">{m.text}</div>
          </button>
        ))}
      </div>

      {(mode === 'paste' || mode === 'upload') && (
        <Card className="mt-4 p-5">
          {mode === 'upload' && (
            <div className="mb-4">
              <input ref={fileRef} type="file" accept=".txt,.md,.vtt,.srt,text/plain,text/vtt" className="hidden" onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f) void onFile(f);
                }}
                className="flex w-full flex-col items-center rounded-xl border-2 border-dashed border-line bg-surface-2/50 px-4 py-8 text-center transition-colors hover:border-brand"
              >
                <FileUp className="size-6 text-fg-3" aria-hidden />
                <span className="mt-2 text-[13.5px] font-medium text-fg">{fileName ?? 'Drop a transcript file or click to choose'}</span>
                <span className="text-[12px] text-fg-3">Plain text, Markdown, WebVTT or SRT · up to 2 MB</span>
              </button>
            </div>
          )}
          <Field
            label={mode === 'upload' ? 'Imported text (you can edit it)' : 'Transcript'}
            htmlFor="m-transcript"
            hint={`Use "Name: what they said" lines so MEETOS can attribute commitments. ${transcript.length.toLocaleString()} characters.`}
          >
            <Textarea
              id="m-transcript"
              rows={12}
              className="font-mono text-[12.5px]"
              placeholder={'Maya: Let’s get started…\nDaniel: I’ll finish the landing page before Friday.'}
              value={transcript}
              onChange={(e) => {
                setTranscript(e.target.value);
                if (source === 'sample') setSource('paste');
              }}
            />
          </Field>
          {missingSpeakers.length > 0 && (
            <Notice tone="neutral" icon={UserPlus} className="mt-3">
              Speakers found in the transcript: <strong>{missingSpeakers.join(', ')}</strong>.{' '}
              <button type="button" className="font-medium text-brand-text hover:underline" onClick={() => setParticipants([...participants, ...missingSpeakers.map((name) => ({ name }))])}>
                Add as participants
              </button>
            </Notice>
          )}
          {mode === 'paste' && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] text-fg-3">
              <Beaker className="size-3.5" aria-hidden /> Try it with fictional sample data:
              <button type="button" className="font-medium text-brand-text hover:underline" onClick={() => loadSample('kickoff')}>Sample meeting 1</button>
              <span>·</span>
              <button type="button" className="font-medium text-brand-text hover:underline" onClick={() => loadSample('sync')}>Sample meeting 2 (follow-up)</button>
            </div>
          )}
        </Card>
      )}

      {mode === 'live' && (
        <Notice tone="info" icon={Mic} className="mt-4">
          Next you'll see a consent notice. Recording only starts when you press <strong>Start recording</strong>, and a recording indicator stays visible the whole time.
        </Notice>
      )}

      {error && <ErrorNote className="mt-4">{error}</ErrorNote>}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => navigate(-1)}>Cancel</Button>
        <Button type="submit" variant="primary" loading={busy} icon={mode === 'live' ? Mic : undefined}>
          {mode === 'live' ? 'Continue to recording' : mode === 'schedule' ? 'Schedule meeting' : 'Save meeting'}
        </Button>
      </div>
    </form>
  );
}
