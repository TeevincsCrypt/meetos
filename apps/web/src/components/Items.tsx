import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Check, CheckCircle2, CircleHelp, GitBranch, Link2, MoreHorizontal, Trash2 } from 'lucide-react';
import type { Commitment, CommitmentStatus, Decision, Question } from '@meetos/shared';
import { useSession } from '@/state/auth';
import { useWs } from '@/state/workspace';
import { confirmCompletion, deleteCommitment, setCommitmentStatus, STATUS_LABEL } from '@/data/commitments';
import { confirmDecision, deleteDecision, deleteQuestion, reopenQuestion, resolveQuestion } from '@/data/decisions';
import { fmtDate } from '@/lib/format';
import { Avatar, Badge, Button, cn, Input, Menu } from './ui';
import { DecisionStatusBadge, DueLabel, EvidenceQuote, OriginBadge, PriorityBadge, StatusBadge } from './domain';

const STATUSES: CommitmentStatus[] = ['open', 'in_progress', 'blocked', 'completed', 'cancelled'];

export function CommitmentRow({ c, showMeeting = true, contextQuote }: { c: Commitment; showMeeting?: boolean; contextQuote?: string | null }) {
  const { wid } = useWs();
  const { actor } = useSession();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const change = async (s: CommitmentStatus) => {
    setBusy(true);
    try {
      await setCommitmentStatus(wid, actor, c, s);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="group flex gap-3 px-5 py-3.5 transition-colors hover:bg-surface-2/50">
      <button
        aria-label={c.status === 'completed' ? 'Completed' : 'Mark as completed'}
        title={c.status === 'completed' ? `Confirmed by ${c.completion?.confirmedByName ?? 'a teammate'}` : 'Confirm completed'}
        disabled={busy || c.status === 'completed' || c.status === 'cancelled'}
        onClick={() => void change('completed')}
        className={cn(
          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors',
          c.status === 'completed' ? 'border-success bg-success text-white' : 'border-line-strong hover:border-success hover:bg-success-soft',
        )}
      >
        {c.status === 'completed' && <Check className="size-3" aria-hidden />}
      </button>
      <div className="min-w-0 flex-1">
        <Link to={`/app/commitments/${c.id}`} className={cn('text-[13.5px] font-medium hover:underline', c.status === 'completed' || c.status === 'cancelled' ? 'text-fg-3 line-through decoration-fg-3/40' : 'text-fg')}>
          {c.description}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-fg-3">
          <span className="inline-flex items-center gap-1.5">
            {c.ownerName ? <Avatar name={c.ownerName} size={16} /> : null}
            {c.ownerName ?? <span className="italic">Unassigned</span>}
          </span>
          <DueLabel c={c} />
          {showMeeting && (
            <Link to={`/app/meetings/${c.originMeetingId}`} className="truncate hover:underline">{c.originMeetingTitle}</Link>
          )}
          {c.relatedMeetingIds.length > 0 && (
            <span className="inline-flex items-center gap-1" title="Discussed in later meetings"><GitBranch className="size-3" aria-hidden />{c.relatedMeetingIds.length + 1} meetings</span>
          )}
          {c.deadlineChangeCount > 0 && <Badge tone="warning">Deadline moved {c.deadlineChangeCount}×</Badge>}
          {c.pendingCompletion && <Badge tone="device">Reported done · confirm</Badge>}
        </div>
        {contextQuote && <p className="mt-1.5 text-[12.5px] text-fg-2 italic">“{contextQuote}”</p>}
      </div>
      <div className="flex shrink-0 items-start gap-2">
        <PriorityBadge priority={c.priority} />
        <StatusBadge status={c.status} />
        <Menu
          trigger={<Button variant="ghost" size="icon" icon={MoreHorizontal} aria-label="Commitment actions" className="opacity-60 group-hover:opacity-100" />}
          items={[
            ...STATUSES.filter((s) => s !== c.status).map((s) => ({ label: s === 'completed' ? 'Confirm completed' : `Mark ${STATUS_LABEL[s].toLowerCase()}`, onSelect: () => void change(s) })),
            'separator' as const,
            { label: 'Open timeline', icon: GitBranch, onSelect: () => navigate(`/app/commitments/${c.id}`) },
            { label: 'Delete', icon: Trash2, danger: true, onSelect: () => void deleteCommitment(wid, actor, c).catch((e: Error) => toast.error(e.message)) },
          ]}
        />
      </div>
    </li>
  );
}

export function PendingCompletionBar({ c }: { c: Commitment }) {
  const { wid } = useWs();
  const { actor } = useSession();
  const [busy, setBusy] = useState(false);
  if (!c.pendingCompletion) return null;
  return (
    <div className="rounded-lg border border-device/30 bg-device-soft p-3">
      <div className="text-[13px] font-medium text-fg">A later meeting says this is done. Confirm?</div>
      <EvidenceQuote evidence={c.pendingCompletion.evidence} className="mt-2 bg-surface/70" />
      <div className="mt-2 flex gap-2">
        <Button
          size="sm"
          variant="primary"
          icon={CheckCircle2}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await confirmCompletion(wid, actor, c, { useSuggestedEvidence: true });
              toast.success('Marked completed');
            } finally {
              setBusy(false);
            }
          }}
        >
          Yes, it's done
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            const { rejectCompletion } = await import('@/data/commitments');
            await rejectCompletion(wid, actor, c);
          }}
        >
          Not yet
        </Button>
      </div>
    </div>
  );
}

export function DecisionCard({ d, showMeeting = true }: { d: Decision; showMeeting?: boolean }) {
  const { wid, decisions } = useWs();
  const { actor } = useSession();
  const related = d.relatedDecisionIds.map((id) => decisions.find((x) => x.id === id)).filter(Boolean) as Decision[];
  return (
    <li id={`decision-${d.id}`} className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-fg">{d.title}</div>
          {d.description && d.description !== d.title && <p className="mt-0.5 text-[13px] text-fg-2">{d.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <OriginBadge origin={d.origin} source={d.inferenceSource} />
          <DecisionStatusBadge status={d.status} />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-fg-3">
        <span>{fmtDate(d.decidedAt, true)}</span>
        {showMeeting && <Link to={`/app/meetings/${d.meetingId}?tab=decisions`} className="hover:underline">{d.meetingTitle}</Link>}
        <span>{d.participants.length ? `Agreed by ${d.participants.join(', ')}` : 'Who agreed is not stated in the transcript'}</span>
        {d.confirmedByName && <span className="text-success">Confirmed by {d.confirmedByName}</span>}
      </div>
      {d.evidence[0] && <EvidenceQuote evidence={d.evidence[0]} showMeeting={false} className="mt-2.5" />}
      {d.alternatives.length > 0 && (
        <div className="mt-2 text-[12.5px] text-fg-2">
          <span className="font-medium text-fg-3">Alternatives discussed: </span>
          {d.alternatives.join(' · ')}
        </div>
      )}
      {related.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-fg-3">
          <Link2 className="size-3.5" aria-hidden /> Related:
          {related.map((r) => (
            <Link key={r.id} to={`/app/decisions?d=${r.id}`} className="rounded bg-surface-2 px-1.5 py-0.5 text-fg-2 hover:underline">
              {r.title}
              {d.supersedes === r.id && ' (replaced)'}
              {r.supersededBy === d.id && ' (replaced)'}
            </Link>
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {d.status === 'needs_confirmation' && (
          <Button size="sm" variant="primary" icon={Check} onClick={() => void confirmDecision(wid, actor, d)}>Confirm decision</Button>
        )}
        {related.filter((r) => r.status !== 'superseded' && r.decidedAt < d.decidedAt && d.supersedes !== r.id).slice(0, 1).map((r) => (
          <Button
            key={r.id}
            size="sm"
            onClick={async () => {
              const { markSupersedes } = await import('@/data/decisions');
              await markSupersedes(wid, actor, d, r);
              toast.success('Marked as replacing the earlier decision');
            }}
          >
            This replaces “{r.title.slice(0, 40)}”
          </Button>
        ))}
        <Button size="sm" variant="ghost" icon={Trash2} onClick={() => void deleteDecision(wid, d.id)}>Delete</Button>
      </div>
    </li>
  );
}

export function QuestionRow({ q, showMeeting = true }: { q: Question; showMeeting?: boolean }) {
  const { wid } = useWs();
  const { actor } = useSession();
  const [answering, setAnswering] = useState(false);
  const [answer, setAnswer] = useState('');
  return (
    <li className="px-5 py-3.5">
      <div className="flex items-start gap-3">
        <CircleHelp className={cn('mt-0.5 size-4 shrink-0', q.status === 'open' ? 'text-info' : 'text-fg-3')} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className={cn('text-[13.5px]', q.status === 'resolved' ? 'text-fg-3' : 'text-fg')}>{q.text}</div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-[12px] text-fg-3">
            {q.askedBy && <span>Asked by {q.askedBy}</span>}
            {showMeeting && <Link to={`/app/meetings/${q.meetingId}?tab=questions`} className="hover:underline">{q.meetingTitle}</Link>}
            {q.answer && <span className="text-success">Answer: {q.answer}</span>}
          </div>
          {q.evidence[0] && <EvidenceQuote evidence={q.evidence[0]} showMeeting={false} className="mt-2" />}
          {answering && (
            <form
              className="mt-2 flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                await resolveQuestion(wid, actor, q, answer);
                setAnswering(false);
              }}
            >
              <Input autoFocus placeholder="Answer (optional)" value={answer} onChange={(e) => setAnswer(e.target.value)} />
              <Button type="submit" variant="primary">Resolve</Button>
            </form>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          {q.status === 'open' ? (
            !answering && <Button size="sm" variant="ghost" onClick={() => setAnswering(true)}>Resolve</Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => void reopenQuestion(wid, q)}>Reopen</Button>
          )}
          <Button size="icon" variant="ghost" icon={Trash2} aria-label="Delete question" onClick={() => void deleteQuestion(wid, q.id)} />
        </div>
      </div>
    </li>
  );
}
