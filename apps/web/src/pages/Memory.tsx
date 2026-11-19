import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowUp, Brain, CircleSlash, FileText, Gavel, Handshake, CircleHelp, Lock, Video } from 'lucide-react';
import { useWs } from '@/state/workspace';
import { askMemory, type MemoryAnswer } from '@/lib/ai/memory';
import { cloudAllowed, getAiPreference } from '@/lib/ai/hybrid';
import { fmtDate } from '@/lib/format';
import { Badge, Button, Card, cn, EmptyState, ErrorNote, Notice, PageHeader, Skeleton } from '@/components/ui';
import { InferenceBadge } from '@/components/domain';

const EXAMPLES = [
  'What did we agree to do last week?',
  'Which commitments are still outstanding?',
  'What happened to the landing page?',
  'Have we discussed the launch date before?',
  'Which decisions have changed?',
  'What should we follow up on?',
];

const KIND_ICON = { meeting: Video, transcript: FileText, decision: Gavel, commitment: Handshake, question: CircleHelp } as const;

function linkFor(s: MemoryAnswer['sources'][number]) {
  const d = s.hit.doc;
  if (d.kind === 'commitment' && d.entityId) return `/app/commitments/${d.entityId}`;
  if (d.kind === 'decision' && d.entityId) return `/app/decisions?d=${d.entityId}`;
  if (d.meetingId) return `/app/meetings/${d.meetingId}${d.kind === 'transcript' ? '?tab=transcript' : d.kind === 'question' ? '?tab=questions' : ''}`;
  return '/app';
}

function renderAnswer(text: string, onCite: (id: string) => void): ReactNode[] {
  return text.split(/(\[S\d+\])/g).map((part, i) => {
    const m = /^\[(S\d+)\]$/.exec(part);
    if (!m) return <span key={i}>{part}</span>;
    return (
      <button key={i} onClick={() => onCite(m[1] as string)} className="mx-0.5 inline-flex -translate-y-0.5 items-center rounded bg-brand-soft px-1 text-[11px] font-semibold text-brand-text hover:bg-brand hover:text-white">
        {m[1]}
      </button>
    );
  });
}

function AnswerCard({ a }: { a: MemoryAnswer }) {
  const [active, setActive] = useState<string | null>(null);
  const shown = a.found ? a.sources.filter((s) => a.cited.has(s.id)) : a.sources.slice(0, 4);
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line bg-surface-2/50 px-5 py-3 text-[13.5px] font-medium text-fg">{a.question}</div>
      <div className="px-5 py-4">
        {!a.found && (
          <Badge tone="warning" icon={CircleSlash} className="mb-2">Not found in your workspace</Badge>
        )}
        <p className="text-[14px] leading-relaxed whitespace-pre-line text-fg">{renderAnswer(a.answer, setActive)}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-fg-3">
          {a.source ? <InferenceBadge source={a.source} detail={a.detail} /> : <Badge>No AI used</Badge>}
          <span>{a.detail}</span>
        </div>
      </div>
      {shown.length > 0 && (
        <div className="border-t border-line px-5 py-4">
          <h4 className="mb-2 text-[12px] font-semibold tracking-wide text-fg-3 uppercase">{a.found ? 'Sources' : 'Closest records found'}</h4>
          <ul className="space-y-2">
            {shown.map((s) => {
              const Icon = KIND_ICON[s.hit.doc.kind];
              return (
                <li key={s.id} className={cn('rounded-lg border p-3 transition-colors', active === s.id ? 'border-brand bg-brand-soft/40' : 'border-line')}>
                  <div className="flex flex-wrap items-center gap-2 text-[12px]">
                    {a.found && <span className="rounded bg-brand-soft px-1 font-semibold text-brand-text">{s.id}</span>}
                    <Icon className="size-3.5 text-fg-3" aria-hidden />
                    <Link to={linkFor(s)} className="font-medium text-fg hover:underline">{s.hit.doc.kind === 'transcript' ? 'Transcript excerpt' : s.hit.doc.title}</Link>
                    <span className="text-fg-3">· {s.hit.doc.meetingTitle} · {fmtDate(s.hit.doc.date, true)}</span>
                  </div>
                  <p className="mt-1.5 line-clamp-4 text-[12.5px] leading-relaxed whitespace-pre-line text-fg-2">{s.text}</p>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}

export default function MemoryPage() {
  const { wid, meetings, commitments, decisions, questions, ready } = useWs();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [answers, setAnswers] = useState<MemoryAnswer[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const asked = useRef<string | null>(null);
  const pref = getAiPreference();

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const a = await askMemory(wid, text, { meetings, commitments, decisions, questions });
      setAnswers((prev) => [a, ...prev]);
      setQ('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not answer.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const initial = params.get('q');
    if (initial && ready && asked.current !== initial) {
      asked.current = initial;
      setParams({}, { replace: true });
      void ask(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, ready]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void ask(q);
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Memory" description="Ask anything about your past meetings. Answers come only from your workspace, with sources." />
      <form onSubmit={submit} className="relative">
        <Brain className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-fg-3" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="What happened to the website redesign?"
          aria-label="Ask a question about your meetings"
          className="h-13 w-full rounded-xl border border-line bg-surface pr-14 pl-12 text-[15px] text-fg shadow-card placeholder:text-fg-3 focus:border-brand focus:outline-none focus:ring-3 focus:ring-[var(--ring)]"
        />
        <Button type="submit" variant="primary" size="icon" icon={ArrowUp} aria-label="Ask" loading={busy} disabled={!q.trim()} className="absolute top-1/2 right-2.5 -translate-y-1/2" />
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button key={ex} onClick={() => void ask(ex)} disabled={busy} className="rounded-full border border-line bg-surface px-3 py-1 text-[12.5px] text-fg-2 transition-colors hover:border-brand hover:text-brand-text disabled:opacity-50">
            {ex}
          </button>
        ))}
      </div>
      <Notice tone="neutral" icon={Lock} className="mt-4">
        {cloudAllowed(pref)
          ? 'MEETOS searches your workspace on this device, then sends only the most relevant excerpts (not whole transcripts) to Gemini in the cloud to write the answer. If the cloud is unreachable it falls back to the on-device model when available.'
          : 'Cloud processing is off: answers are written by the on-device model only, when available.'}
      </Notice>

      {error && <ErrorNote className="mt-4">{error}</ErrorNote>}
      <div className="mt-6 space-y-4">
        {busy && <Skeleton className="h-36 rounded-xl" />}
        {answers.map((a, i) => <AnswerCard key={answers.length - i} a={a} />)}
        {!busy && answers.length === 0 && meetings.length === 0 && (
          <Card>
            <EmptyState icon={Brain} title="Your workspace memory is empty">Analyse a few meetings and you'll be able to ask about decisions, commitments and discussions across all of them.</EmptyState>
          </Card>
        )}
      </div>
    </div>
  );
}
