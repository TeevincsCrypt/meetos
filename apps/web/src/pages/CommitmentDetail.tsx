import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Flag,
  GitBranch,
  Link2,
  MessageSquare,
  Pencil,
  Sparkles,
  Trash2,
  TrendingUp,
  UserRound,
  XCircle,
} from 'lucide-react';
import { isOverdue, type Commitment, type CommitmentEvent, type CommitmentEventType, type CommitmentStatus, type Priority } from '@meetos/shared';
import { useSession } from '@/state/auth';
import { useWs } from '@/state/workspace';
import {
  addProgressNote,
  changeDeadline,
  deleteCommitment,
  editCommitment,
  linkCommitmentToMeeting,
  listenEvents,
  reassignCommitment,
  setCommitmentStatus,
  STATUS_LABEL,
} from '@/data/commitments';
import { fmtDate, fmtDateTime, fmtDue, fromDateInput, toDateInput } from '@/lib/format';
import { Avatar, Badge, Button, ButtonLink, Card, CardHeader, cn, EmptyState, Field, Input, Modal, Notice, Select, Skeleton, Textarea } from '@/components/ui';
import { DueLabel, EvidenceQuote, OriginBadge, PriorityBadge, StatusBadge } from '@/components/domain';
import { PendingCompletionBar } from '@/components/Items';
import { ConfirmModal } from '@/components/Forms';

const EVENT_META: Record<CommitmentEventType, { label: string; icon: typeof CircleDot; tone: string }> = {
  created: { label: 'Commitment made', icon: Flag, tone: 'bg-brand text-white' },
  status_changed: { label: 'Status changed', icon: CircleDot, tone: 'bg-info text-white' },
  deadline_changed: { label: 'Deadline changed', icon: CalendarClock, tone: 'bg-warning text-white' },
  owner_changed: { label: 'Owner changed', icon: UserRound, tone: 'bg-fg-3 text-white' },
  mentioned: { label: 'Discussed again', icon: MessageSquare, tone: 'bg-surface-3 text-fg-2' },
  progress_reported: { label: 'Progress reported', icon: TrendingUp, tone: 'bg-info text-white' },
  blocker_reported: { label: 'Blocker reported', icon: AlertTriangle, tone: 'bg-warning text-white' },
  completion_suggested: { label: 'Reported as done', icon: Sparkles, tone: 'bg-device text-white' },
  completion_confirmed: { label: 'Completion confirmed', icon: CheckCircle2, tone: 'bg-success text-white' },
  completion_rejected: { label: 'Completion rejected', icon: XCircle, tone: 'bg-danger text-white' },
  note: { label: 'Note', icon: MessageSquare, tone: 'bg-surface-3 text-fg-2' },
};

const fmtIso = (v: string | null) => (v ? (/^\d{4}-\d{2}-\d{2}T/.test(v) ? fmtDate(Date.parse(v), true) : v) : 'none');

/** The visual Commitment Graph: meetings this commitment travelled through, in order. */
function GraphTrack({ c, events }: { c: Commitment; events: CommitmentEvent[] }) {
  const { meetingById } = useWs();
  const nodes = useMemo(() => {
    const ids = [c.originMeetingId, ...c.relatedMeetingIds.filter((id) => id !== c.originMeetingId)];
    return ids
      .map((id) => {
        const m = meetingById(id);
        const evs = events.filter((e) => e.meetingId === id);
        const at = m ? (m.startedAt ?? m.scheduledAt ?? m.createdAt) : (evs[0]?.at ?? 0);
        return { id, title: m?.title ?? evs[0]?.meetingTitle ?? (id === c.originMeetingId ? c.originMeetingTitle : 'Meeting'), at, evs, missing: !m };
      })
      .sort((a, b) => a.at - b.at);
  }, [c, events, meetingById]);

  const tag = (t: CommitmentEventType) => {
    if (t === 'created') return <Badge tone="brand">Created</Badge>;
    if (t === 'deadline_changed') return <Badge tone="warning">Deadline moved</Badge>;
    if (t === 'blocker_reported') return <Badge tone="warning">Blocker</Badge>;
    if (t === 'progress_reported') return <Badge tone="info">Progress</Badge>;
    if (t === 'completion_suggested') return <Badge tone="device">Says done</Badge>;
    if (t === 'completion_confirmed') return <Badge tone="success">Confirmed</Badge>;
    if (t === 'mentioned') return <Badge>Mentioned</Badge>;
    return null;
  };

  const end =
    c.status === 'completed' ? { label: 'Completed', sub: c.completion?.confirmedByName ? `Confirmed by ${c.completion.confirmedByName}` : 'Confirmed', tone: 'border-success bg-success-soft text-success', icon: CheckCircle2 }
    : c.status === 'cancelled' ? { label: 'Cancelled', sub: '', tone: 'border-line bg-surface-2 text-fg-3', icon: Ban }
    : isOverdue(c) ? { label: 'Overdue', sub: fmtDue(c.deadline), tone: 'border-danger/40 bg-danger-soft text-danger', icon: AlertTriangle }
    : { label: STATUS_LABEL[c.status], sub: fmtDue(c.deadline), tone: 'border-dashed border-line-strong bg-surface text-fg-2', icon: CircleDot };

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-max items-stretch gap-0 p-5">
        <div className="flex w-36 flex-col items-center justify-center rounded-xl border border-line bg-surface-2/60 p-3 text-center">
          {c.ownerName ? <Avatar name={c.ownerName} size={32} /> : <UserRound className="size-8 text-fg-3" aria-hidden />}
          <div className="mt-1.5 text-[12.5px] font-medium text-fg">{c.ownerName ?? 'Unassigned'}</div>
          <div className="text-[11px] text-fg-3">Owner</div>
        </div>
        {nodes.map((n, i) => (
          <Fragment key={n.id}>
            <div className="flex w-10 items-center" aria-hidden>
              <div className="h-px flex-1 bg-line-strong" />
              <div className="size-1.5 rotate-45 border-t border-r border-line-strong" />
            </div>
            <Link to={`/app/meetings/${n.id}?tab=commitments`} className={cn('flex w-52 flex-col rounded-xl border bg-surface p-3 shadow-card transition-colors hover:border-brand', i === 0 ? 'border-brand/50' : 'border-line')}>
              <div className="text-[11px] font-medium text-fg-3">{i === 0 ? 'Origin' : `Follow-up ${i}`} · {fmtDate(n.at)}</div>
              <div className="mt-0.5 line-clamp-2 text-[13px] font-medium text-fg">{n.title}</div>
              <div className="mt-auto flex flex-wrap gap-1 pt-2">
                {[...new Set(n.evs.map((e) => e.type))].map((t) => <span key={t}>{tag(t)}</span>)}
                {n.missing && <Badge>Archived or deleted</Badge>}
              </div>
            </Link>
          </Fragment>
        ))}
        <div className="flex w-10 items-center" aria-hidden>
          <div className="h-px flex-1 bg-line-strong" />
        </div>
        <div className={cn('flex w-36 flex-col items-center justify-center rounded-xl border p-3 text-center', end.tone)}>
          <end.icon className="size-5" aria-hidden />
          <div className="mt-1 text-[12.5px] font-semibold">{end.label}</div>
          {end.sub && <div className="text-[11px] opacity-80">{end.sub}</div>}
        </div>
      </div>
    </div>
  );
}

function EditModal({ c, open, onOpenChange }: { c: Commitment; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { wid, people, meetings } = useWs();
  const { actor } = useSession();
  const [description, setDescription] = useState(c.description);
  const [priority, setPriority] = useState<Priority>(c.priority);
  const [owner, setOwner] = useState(c.ownerName ?? '');
  const [deadline, setDeadline] = useState(toDateInput(c.deadline));
  const [linkId, setLinkId] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Edit commitment" wide>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            if (description.trim() !== c.description || priority !== c.priority) await editCommitment(wid, actor, c, { description: description.trim() !== c.description ? description : undefined, priority: priority !== c.priority ? priority : undefined });
            if ((owner.trim() || null) !== c.ownerName) await reassignCommitment(wid, actor, c, owner);
            const d = fromDateInput(deadline);
            if (toDateInput(d) !== toDateInput(c.deadline)) await changeDeadline(wid, actor, c, d);
            const m = meetings.find((x) => x.id === linkId);
            if (m) await linkCommitmentToMeeting(wid, actor, c, m);
            toast.success('Saved');
            onOpenChange(false);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not save');
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Description" htmlFor="c-desc"><Textarea id="c-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Owner" htmlFor="c-owner">
            <Input id="c-owner" list="c-people" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Unassigned" />
            <datalist id="c-people">{people.map((p) => <option key={p} value={p} />)}</datalist>
          </Field>
          <Field label="Deadline" htmlFor="c-deadline"><Input id="c-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field>
          <Field label="Priority" htmlFor="c-priority">
            <Select id="c-priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
            </Select>
          </Field>
        </div>
        <Field label="Connect to a later meeting" htmlFor="c-link" hint="Adds a manual edge in the Commitment Graph.">
          <Select id="c-link" value={linkId} onChange={(e) => setLinkId(e.target.value)}>
            <option value="">—</option>
            {meetings.filter((m) => !c.meetingIds.includes(m.id) && !m.archived).map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
          </Select>
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}>Save changes</Button>
        </div>
      </form>
    </Modal>
  );
}

export default function CommitmentDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { wid, commitments, ready, meetingById } = useWs();
  const { actor } = useSession();
  const c = commitments.find((x) => x.id === id);
  const [events, setEvents] = useState<CommitmentEvent[] | null>(null);
  const [note, setNote] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  useEffect(() => listenEvents(wid, id, setEvents), [wid, id]);

  if (!ready) return <Skeleton className="h-72" />;
  if (!c) {
    return (
      <Card>
        <EmptyState icon={GitBranch} title="Commitment not found" action={<ButtonLink to="/app/commitments">All commitments</ButtonLink>}>It may have been deleted.</EmptyState>
      </Card>
    );
  }

  const evidenceByMeeting = c.evidence.reduce<Record<string, typeof c.evidence>>((acc, e) => {
    (acc[e.meetingId] ??= []).push(e);
    return acc;
  }, {});

  return (
    <div>
      <Link to="/app/commitments" className="mb-3 inline-flex items-center gap-1 text-[12.5px] text-fg-3 hover:text-fg-2">
        <ArrowLeft className="size-3.5" aria-hidden /> Commitments
      </Link>

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={c.status} />
            <PriorityBadge priority={c.priority} />
            <OriginBadge origin={c.origin} source={c.inferenceSource} />
            {c.deadlineChangeCount > 0 && <Badge tone="warning">Deadline changed {c.deadlineChangeCount}×</Badge>}
          </div>
          <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-fg">{c.description}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-fg-2">
            <span className="inline-flex items-center gap-1.5">{c.ownerName && <Avatar name={c.ownerName} size={20} />}{c.ownerName ?? 'Unassigned'}</span>
            <DueLabel c={c} className="text-[13px]" />
            {c.deadline && <span className="text-fg-3">{fmtDate(c.deadline, true)}{c.deadlineText ? ` (“${c.deadlineText}”)` : ''}</span>}
            {c.originalDeadline && c.originalDeadline !== c.deadline && <span className="text-fg-3">Originally {fmtDate(c.originalDeadline, true)}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select
            aria-label="Status"
            value={c.status}
            onChange={(e) => void setCommitmentStatus(wid, actor, c, e.target.value as CommitmentStatus).catch((err: Error) => toast.error(err.message))}
            className="w-40"
          >
            {(['open', 'in_progress', 'blocked', 'completed', 'cancelled'] as CommitmentStatus[]).map((s) => (
              <option key={s} value={s}>{s === 'completed' && c.status !== 'completed' ? 'Confirm completed' : STATUS_LABEL[s]}</option>
            ))}
          </Select>
          <Button icon={Pencil} onClick={() => setEditOpen(true)}>Edit</Button>
          <Button variant="ghost" size="icon" icon={Trash2} aria-label="Delete" onClick={() => setDeleteOpen(true)} />
        </div>
      </div>

      {c.pendingCompletion && <div className="mb-6"><PendingCompletionBar c={c} /></div>}
      {c.status === 'completed' && c.completion && (
        <Notice tone="success" icon={CheckCircle2} className="mb-6">
          Completed on {fmtDate(c.completedAt, true)} — confirmed by <strong>{c.completion.confirmedByName ?? 'a teammate'}</strong>
          {c.completion.evidence ? ', based on the transcript evidence below.' : '.'}
        </Notice>
      )}

      <Card className="mb-6">
        <CardHeader icon={GitBranch} title="Commitment Graph" subtitle={`Tracked across ${c.meetingIds.length} meeting${c.meetingIds.length === 1 ? '' : 's'}`} />
        <div className="border-t border-line">
          {events === null ? <Skeleton className="m-5 h-28" /> : <GraphTrack c={c} events={events} />}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader icon={CalendarClock} title="Timeline" subtitle="Append-only history. AI-detected events cite the transcript." />
          {events === null ? (
            <Skeleton className="m-5 h-40" />
          ) : (
            <ol className="relative space-y-5 border-t border-line px-5 py-5">
              {events.map((e) => {
                const meta = EVENT_META[e.type] ?? EVENT_META.note;
                return (
                  <li key={e.id} className="relative flex gap-3">
                    <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-full', meta.tone)}>
                      <meta.icon className="size-3.5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 text-[13px]">
                        <span className="font-medium text-fg">{meta.label}</span>
                        {e.type === 'status_changed' && <span className="text-fg-2">{STATUS_LABEL[e.from as CommitmentStatus] ?? e.from} → {STATUS_LABEL[e.to as CommitmentStatus] ?? e.to}</span>}
                        {(e.type === 'deadline_changed') && <span className="text-fg-2">{fmtIso(e.from)} → {fmtIso(e.to)}</span>}
                        {e.type === 'owner_changed' && <span className="text-fg-2">{e.from ?? 'Unassigned'} → {e.to ?? 'Unassigned'}</span>}
                        {e.origin === 'ai' && <Badge tone="brand" icon={Sparkles}>AI</Badge>}
                      </div>
                      <div className="text-[12px] text-fg-3">
                        {fmtDateTime(e.at)}
                        {e.byName && ` · ${e.byName}`}
                        {e.meetingId && (
                          <> · <Link to={`/app/meetings/${e.meetingId}`} className="hover:underline">{e.meetingTitle || meetingById(e.meetingId)?.title || 'meeting'}</Link></>
                        )}
                      </div>
                      {e.quote && <EvidenceQuote evidence={{ quote: e.quote, meetingId: e.meetingId ?? '' }} showMeeting={false} className="mt-1.5" />}
                      {e.note && <p className="mt-1 text-[13px] text-fg-2">{e.note}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          <form
            className="flex gap-2 border-t border-line p-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!note.trim()) return;
              await addProgressNote(wid, actor, c, note);
              setNote('');
            }}
          >
            <Input placeholder="Add a progress note…" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Progress note" />
            <Button type="submit" disabled={!note.trim()}>Add note</Button>
          </form>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader icon={Link2} title="Evidence" subtitle="Exact transcript lines this commitment is based on" />
            {c.evidence.length === 0 ? (
              <p className="px-5 pb-5 text-[13px] text-fg-3">Added manually — no transcript evidence.</p>
            ) : (
              <div className="space-y-4 px-5 pb-5">
                {Object.entries(evidenceByMeeting).map(([mid, evs]) => (
                  <div key={mid}>
                    <Link to={`/app/meetings/${mid}`} className="text-[12px] font-medium text-brand-text hover:underline">{evs[0]?.meetingTitle ?? meetingById(mid)?.title ?? 'Meeting'}</Link>
                    <div className="mt-1.5 space-y-2">{evs.map((ev, i) => <EvidenceQuote key={i} evidence={ev} showMeeting={false} />)}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card className="p-5 text-[13px]">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <dt className="text-fg-3">Created</dt><dd className="text-fg">{fmtDate(c.createdAt, true)}</dd>
              <dt className="text-fg-3">Updated</dt><dd className="text-fg">{fmtDate(c.updatedAt, true)}</dd>
              <dt className="text-fg-3">Origin meeting</dt><dd><Link to={`/app/meetings/${c.originMeetingId}`} className="text-brand-text hover:underline">{c.originMeetingTitle}</Link></dd>
              <dt className="text-fg-3">Last discussed</dt><dd className="text-fg">{c.lastMentionedAt ? fmtDate(c.lastMentionedAt, true) : 'Not since it was made'}</dd>
              <dt className="text-fg-3">Times discussed</dt><dd className="text-fg">{c.mentionCount}</dd>
            </dl>
          </Card>
        </div>
      </div>

      <EditModal key={String(editOpen)} c={c} open={editOpen} onOpenChange={setEditOpen} />
      <ConfirmModal
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        danger
        title="Delete this commitment?"
        confirmLabel="Delete"
        body="This removes the commitment and its timeline. Use “Cancelled” instead if you want to keep the history."
        onConfirm={async () => {
          await deleteCommitment(wid, actor, c);
          navigate('/app/commitments');
        }}
      />
    </div>
  );
}
