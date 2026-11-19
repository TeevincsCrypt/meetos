import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ClipboardList,
  Cpu,
  FileText,
  Gavel,
  GitBranch,
  Handshake,
  ListChecks,
  Mic,
  MoreHorizontal,
  Pencil,
  Plus,
  ShieldAlert,
  Trash2,
  Users,
} from 'lucide-react';
import { getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { parseTranscript, type Activity, type Meeting, type Participant, type TranscriptSource } from '@meetos/shared';
import { useSession } from '@/state/auth';
import { useWs } from '@/state/workspace';
import { deleteMeeting, listenMeeting, listenTranscript, saveTranscript, setMeetingArchived, updateMeeting } from '@/data/meetings';
import { fromSnap, wsCol } from '@/data/db';
import { fmtDate, fmtDateTime, fmtRelative, fromDateTimeInput, toDateTimeInput } from '@/lib/format';
import { Avatar, Badge, Button, ButtonLink, Card, CardHeader, EmptyState, ErrorNote, Field, Input, Menu, Modal, Notice, PageHeader, Skeleton, Tabs, Textarea } from '@/components/ui';
import { EvidenceQuote, InferenceBadge, SampleBadge } from '@/components/domain';
import { AnalyzePanel } from '@/components/AnalyzePanel';
import { CommitmentRow, DecisionCard, PendingCompletionBar, QuestionRow } from '@/components/Items';
import { CommitmentFormModal, ConfirmModal, DecisionFormModal, QuestionFormModal } from '@/components/Forms';
import { ParticipantsInput } from '@/components/ParticipantsInput';
import { ProjectSelect } from '@/components/ProjectSelect';
import { MeetingStatusBadge } from './Meetings';

type Tab = 'overview' | 'transcript' | 'summary' | 'topics' | 'decisions' | 'commitments' | 'questions' | 'related' | 'activity';

const SOURCE_LABEL: Record<TranscriptSource, string> = {
  web_speech: 'Live capture · browser speech recognition',
  android_speech: 'Live capture · Android speech recognition',
  paste: 'Pasted transcript',
  upload: 'Uploaded file',
  sample: 'Sample transcript (fictional)',
};

function EditMeetingModal({ meeting, open, onOpenChange }: { meeting: Meeting; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { wid, people } = useWs();
  const [title, setTitle] = useState(meeting.title);
  const [description, setDescription] = useState(meeting.description);
  const [projectId, setProjectId] = useState(meeting.projectId);
  const [participants, setParticipants] = useState<Participant[]>(meeting.participants);
  const [when, setWhen] = useState(toDateTimeInput(meeting.scheduledAt));
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Edit meeting" wide>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await updateMeeting(wid, meeting.id, { title, description, projectId, participants, scheduledAt: fromDateTimeInput(when) });
            toast.success('Meeting updated');
            onOpenChange(false);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not save');
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Title" htmlFor="e-title"><Input id="e-title" required value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date & time" htmlFor="e-when"><Input id="e-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
          <Field label="Project" htmlFor="e-project"><ProjectSelect id="e-project" value={projectId} onChange={setProjectId} /></Field>
        </div>
        <Field label="Participants" htmlFor="e-people"><ParticipantsInput id="e-people" value={participants} onChange={setParticipants} suggestions={people} /></Field>
        <Field label="Description" htmlFor="e-desc"><Textarea id="e-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}>Save</Button>
        </div>
      </form>
    </Modal>
  );
}

function TranscriptView({ meeting, text, source, editInitially }: { meeting: Meeting; text: string; source: TranscriptSource | null; editInitially: boolean }) {
  const { wid } = useWs();
  const { actor } = useSession();
  const [editing, setEditing] = useState(editInitially || !text);
  const [draft, setDraft] = useState(text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setDraft(text), [text]);
  const lines = useMemo(() => parseTranscript(text), [text]);

  if (editing) {
    return (
      <Card className="p-5">
        <Field label="Transcript" htmlFor="t-edit" hint='Use "Name: what they said" lines. Saving replaces the stored transcript.'>
          <Textarea id="t-edit" rows={16} className="font-mono text-[12.5px]" value={draft} onChange={(e) => setDraft(e.target.value)} />
        </Field>
        {error && <ErrorNote className="mt-3">{error}</ErrorNote>}
        <div className="mt-4 flex justify-end gap-2">
          {text && <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>}
          <Button
            variant="primary"
            loading={busy}
            disabled={!draft.trim()}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await saveTranscript(wid, actor, meeting, draft, text ? (source ?? 'paste') : 'paste');
                setEditing(false);
                toast.success('Transcript saved');
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Could not save');
              } finally {
                setBusy(false);
              }
            }}
          >
            Save transcript
          </Button>
        </div>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader
        icon={FileText}
        title="Transcript"
        subtitle={`${source ? SOURCE_LABEL[source] : 'Transcript'} · ${text.length.toLocaleString()} characters · stored in this workspace`}
        action={<Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(true)}>Edit</Button>}
      />
      <div className="max-h-[65vh] space-y-2 overflow-y-auto border-t border-line px-5 py-4">
        {lines.map((l) => (
          <p key={l.index} className="text-[13.5px] leading-relaxed text-fg-2">
            {l.speaker && <span className="font-semibold text-fg">{l.speaker}: </span>}
            {l.text}
          </p>
        ))}
      </div>
    </Card>
  );
}

function ActivityTab({ meetingId }: { meetingId: string }) {
  const { wid } = useWs();
  const [items, setItems] = useState<Activity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getDocs(query(wsCol(wid, 'activity'), where('meetingId', '==', meetingId), orderBy('createdAt', 'desc'), limit(50)))
      .then((s) => setItems(s.docs.map((d) => fromSnap<Activity>(d))))
      .catch((e: Error) => setError(e.message));
  }, [wid, meetingId]);
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!items) return <Skeleton className="h-40" />;
  return (
    <Card>
      {items.length === 0 ? (
        <EmptyState icon={ListChecks} title="No activity yet" compact />
      ) : (
        <ul className="divide-y divide-line">
          {items.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-5 py-3 text-[13px]">
              <Avatar name={a.actorName} size={22} />
              <span className="flex-1"><span className="font-medium text-fg">{a.actorName}</span> <span className="text-fg-2">{a.message}</span></span>
              <span className="text-[12px] text-fg-3">{fmtRelative(a.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function MeetingDetailPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { wid, commitments, decisions, questions, meetings, projectById, isAdmin } = useWs();
  const { actor, user } = useSession();
  const [meeting, setMeeting] = useState<Meeting | null | undefined>(undefined);
  const [transcript, setTranscript] = useState<{ text: string; source: TranscriptSource | null } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [addCommitment, setAddCommitment] = useState(false);
  const [addDecision, setAddDecision] = useState(false);
  const [addQuestion, setAddQuestion] = useState(false);
  const tab = (params.get('tab') as Tab) || 'overview';
  const setTab = (t: Tab) => setParams((p) => {
    p.set('tab', t);
    p.delete('analyze');
    return p;
  }, { replace: true });

  useEffect(() => listenMeeting(wid, id, setMeeting), [wid, id]);
  useEffect(() => listenTranscript(wid, id, (text, source) => setTranscript({ text, source })), [wid, id]);

  const created = useMemo(() => commitments.filter((c) => c.originMeetingId === id), [commitments, id]);
  const discussed = useMemo(() => commitments.filter((c) => c.originMeetingId !== id && c.relatedMeetingIds.includes(id)), [commitments, id]);
  const mDecisions = useMemo(() => decisions.filter((d) => d.meetingId === id), [decisions, id]);
  const mQuestions = useMemo(() => questions.filter((q) => q.meetingId === id), [questions, id]);
  const related = useMemo(() => {
    if (!meeting) return [];
    const out = new Map<string, { m: Meeting; reasons: string[] }>();
    const add = (mid: string, reason: string) => {
      if (mid === id) return;
      const m = meetings.find((x) => x.id === mid);
      if (!m) return;
      const row = out.get(mid) ?? { m, reasons: [] };
      if (!row.reasons.includes(reason)) row.reasons.push(reason);
      out.set(mid, row);
    };
    [...created, ...discussed].forEach((c) => c.meetingIds.forEach((mid) => add(mid, 'Shared commitments')));
    mDecisions.forEach((d) => d.relatedDecisionIds.forEach((rid) => {
      const r = decisions.find((x) => x.id === rid);
      if (r) add(r.meetingId, 'Related decisions');
    }));
    if (meeting.projectId) meetings.filter((m) => m.projectId === meeting.projectId).forEach((m) => add(m.id, 'Same project'));
    const names = new Set(meeting.participants.map((p) => p.name.toLowerCase()));
    if (names.size)
      meetings
        .filter((m) => m.participants.filter((p) => names.has(p.name.toLowerCase())).length >= Math.min(2, names.size))
        .forEach((m) => add(m.id, 'Same people'));
    return [...out.values()].sort((a, b) => b.reasons.length - a.reasons.length || (b.m.startedAt ?? b.m.createdAt) - (a.m.startedAt ?? a.m.createdAt)).slice(0, 12);
  }, [meeting, meetings, created, discussed, mDecisions, decisions, id]);

  if (meeting === undefined || transcript === null) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (meeting === null) {
    return (
      <Card>
        <EmptyState icon={FileText} title="Meeting not found" action={<ButtonLink to="/app/meetings">Back to meetings</ButtonLink>}>
          It may have been deleted, or you may not have access to it.
        </EmptyState>
      </Card>
    );
  }

  const project = projectById(meeting.projectId);
  const hasTranscript = transcript.text.trim().length > 0;
  const run = meeting.analysis;
  const canDelete = isAdmin || meeting.createdBy === user.uid;

  return (
    <div>
      <Link to="/app/meetings" className="mb-3 inline-flex items-center gap-1 text-[12.5px] text-fg-3 hover:text-fg-2">
        <ArrowLeft className="size-3.5" aria-hidden /> Meetings
      </Link>
      <PageHeader
        title={meeting.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <MeetingStatusBadge status={meeting.status} />
            {meeting.isSample && <SampleBadge />}
            {meeting.archived && <Badge>Archived</Badge>}
            <span className="text-fg-3">{fmtDateTime(meeting.startedAt ?? meeting.scheduledAt ?? meeting.createdAt)}</span>
            {project && (
              <span className="inline-flex items-center gap-1 text-fg-3">
                <span className="size-2 rounded-full" style={{ background: project.color }} aria-hidden /> {project.name}
              </span>
            )}
          </span>
        }
        actions={
          <>
            {meeting.status === 'scheduled' && (
              <ButtonLink to={`/app/prepare?meeting=${meeting.id}`} icon={ClipboardList}>Prepare</ButtonLink>
            )}
            <ButtonLink to={`/app/meetings/${meeting.id}/live`} icon={Mic} variant={hasTranscript ? 'secondary' : 'primary'}>{hasTranscript ? 'Record more' : 'Record'}</ButtonLink>
            <Menu
              trigger={<Button size="icon" icon={MoreHorizontal} aria-label="More actions" />}
              items={[
                { label: 'Edit details', icon: Pencil, onSelect: () => setEditOpen(true) },
                { label: meeting.archived ? 'Unarchive' : 'Archive', icon: meeting.archived ? ArchiveRestore : Archive, onSelect: () => void setMeetingArchived(wid, actor, meeting, !meeting.archived) },
                'separator',
                { label: 'Delete meeting…', icon: Trash2, danger: true, disabled: !canDelete, onSelect: () => setDeleteOpen(true) },
              ]}
            />
          </>
        }
      />

      <Tabs
        className="mb-6"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'transcript', label: 'Transcript' },
          { id: 'summary', label: 'Summary' },
          { id: 'topics', label: 'Topics', count: meeting.topics.length },
          { id: 'decisions', label: 'Decisions', count: mDecisions.length },
          { id: 'commitments', label: 'Commitments', count: created.length + discussed.length },
          { id: 'questions', label: 'Questions', count: mQuestions.length },
          { id: 'related', label: 'Related', count: related.length },
          { id: 'activity', label: 'Activity' },
        ]}
      />

      {tab === 'overview' && (
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-6">
            {hasTranscript ? (
              <AnalyzePanel meeting={meeting} transcript={transcript.text} autoFocus={params.get('analyze') === '1'} />
            ) : (
              <Card>
                <EmptyState
                  icon={FileText}
                  title="No transcript yet"
                  action={
                    <div className="flex gap-2">
                      <ButtonLink to={`/app/meetings/${meeting.id}/live`} variant="primary" icon={Mic}>Record live</ButtonLink>
                      <Button icon={Plus} onClick={() => setTab('transcript')}>Paste transcript</Button>
                    </div>
                  }
                >
                  Record this meeting or paste its transcript to extract decisions and commitments.
                </EmptyState>
              </Card>
            )}
            {meeting.summary && (
              <Card>
                <CardHeader icon={FileText} title="Summary" />
                <p className="px-5 pb-5 text-[14px] leading-relaxed text-fg-2">{meeting.summary}</p>
              </Card>
            )}
            {(created.length > 0 || discussed.length > 0) && (
              <Card>
                <CardHeader icon={Handshake} title="Commitments" action={<Button size="sm" variant="ghost" onClick={() => setTab('commitments')}>View all</Button>} />
                <ul className="divide-y divide-line border-t border-line">
                  {created.slice(0, 5).map((c) => <CommitmentRow key={c.id} c={c} showMeeting={false} />)}
                </ul>
              </Card>
            )}
            {meeting.risks.length > 0 && (
              <Card>
                <CardHeader icon={ShieldAlert} title="Risks & blockers" />
                <ul className="space-y-3 px-5 pb-5">
                  {meeting.risks.map((r, i) => (
                    <li key={i}>
                      <div className="flex items-center gap-2 text-[13.5px] text-fg">
                        <Badge tone={r.kind === 'blocker' ? 'danger' : 'warning'}>{r.kind === 'blocker' ? 'Blocker' : 'Risk'}</Badge> {r.description}
                      </div>
                      <EvidenceQuote evidence={r.evidence} showMeeting={false} className="mt-1.5" />
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
          <div className="space-y-6">
            <Card>
              <CardHeader icon={Users} title="Participants" action={<Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditOpen(true)}>Edit</Button>} />
              {meeting.participants.length === 0 ? (
                <p className="px-5 pb-5 text-[13px] text-fg-3">No participants listed.</p>
              ) : (
                <ul className="space-y-2 px-5 pb-5">
                  {meeting.participants.map((p) => (
                    <li key={p.name} className="flex items-center gap-2 text-[13.5px] text-fg">
                      <Avatar name={p.name} size={24} /> {p.name}
                      <span className="ml-auto text-[12px] text-fg-3">{commitments.filter((c) => c.ownerName === p.name && c.meetingIds.includes(meeting.id)).length || ''}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            {run && (
              <Card>
                <CardHeader icon={Cpu} title="AI processing" subtitle={`${fmtRelative(run.finishedAt ?? run.startedAt)} · ${run.status}`} />
                <div className="space-y-2 px-5 pb-5 text-[13px]">
                  <div className="flex flex-wrap gap-1.5">
                    {run.chunksOnDevice > 0 && <span className="inline-flex items-center gap-1"><InferenceBadge source="on_device" /> ×{run.chunksOnDevice}</span>}
                    {run.chunksInCloud > 0 && <span className="inline-flex items-center gap-1"><InferenceBadge source="in_cloud" /> ×{run.chunksInCloud}</span>}
                    {run.chunksCloudFallback > 0 && <span className="inline-flex items-center gap-1"><InferenceBadge source="cloud_fallback" /> ×{run.chunksCloudFallback}</span>}
                  </div>
                  <p className="text-fg-2">{run.chunkCount} transcript part{run.chunkCount === 1 ? '' : 's'} analysed{run.chunksFailed ? `, ${run.chunksFailed} failed` : ''}.</p>
                  {run.cloudModel && <p className="text-fg-3">Cloud model: <code className="font-mono text-[12px]">{run.cloudModel}</code></p>}
                  {run.discardedUngrounded > 0 && <p className="text-fg-3">{run.discardedUngrounded} item(s) discarded: evidence not found in transcript.</p>}
                  {run.error && <p className="text-danger">{run.error}</p>}
                </div>
              </Card>
            )}
            {meeting.followUps.length > 0 && (
              <Card>
                <CardHeader icon={ListChecks} title="Suggested follow-ups" subtitle="AI suggestions — not commitments" />
                <ul className="list-disc space-y-1 px-5 pb-5 pl-9 text-[13px] text-fg-2">
                  {meeting.followUps.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              </Card>
            )}
            {meeting.description && (
              <Card className="p-5">
                <h3 className="text-[12px] font-semibold tracking-wide text-fg-3 uppercase">Description</h3>
                <p className="mt-1.5 text-[13.5px] text-fg-2">{meeting.description}</p>
              </Card>
            )}
          </div>
        </div>
      )}

      {tab === 'transcript' && <TranscriptView meeting={meeting} text={transcript.text} source={transcript.source} editInitially={params.get('edit') === '1'} />}

      {tab === 'summary' && (
        <Card className="p-5">
          {meeting.summary ? (
            <>
              <p className="text-[14.5px] leading-relaxed text-fg">{meeting.summary}</p>
              {meeting.discussionPoints.length > 0 && (
                <>
                  <h3 className="mt-5 text-[12px] font-semibold tracking-wide text-fg-3 uppercase">Key discussion points</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-[13.5px] text-fg-2">{meeting.discussionPoints.map((p, i) => <li key={i}>{p}</li>)}</ul>
                </>
              )}
            </>
          ) : (
            <EmptyState icon={FileText} title="Not analysed yet" compact>Run the analysis from the Overview tab.</EmptyState>
          )}
        </Card>
      )}

      {tab === 'topics' && (
        <Card>
          {meeting.topics.length === 0 ? (
            <EmptyState icon={ListChecks} title="No topics yet" compact />
          ) : (
            <ul className="divide-y divide-line">
              {meeting.topics.map((t, i) => (
                <li key={i} className="px-5 py-3.5">
                  <div className="text-[14px] font-medium text-fg">{t.name}</div>
                  {t.evidence && <EvidenceQuote evidence={{ quote: t.evidence, meetingId: meeting.id }} showMeeting={false} className="mt-2" />}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'decisions' && (
        <Card>
          <CardHeader icon={Gavel} title="Decisions" action={<Button size="sm" icon={Plus} onClick={() => setAddDecision(true)}>Add</Button>} />
          {mDecisions.length === 0 ? (
            <EmptyState icon={Gavel} title="No decisions recorded" compact />
          ) : (
            <ul className="divide-y divide-line border-t border-line">{mDecisions.map((d) => <DecisionCard key={d.id} d={d} showMeeting={false} />)}</ul>
          )}
        </Card>
      )}

      {tab === 'commitments' && (
        <div className="space-y-6">
          <Card>
            <CardHeader icon={Handshake} title="Made in this meeting" action={<Button size="sm" icon={Plus} onClick={() => setAddCommitment(true)}>Add</Button>} />
            {created.length === 0 ? (
              <EmptyState icon={Handshake} title="No commitments yet" compact />
            ) : (
              <ul className="divide-y divide-line border-t border-line">{created.map((c) => <CommitmentRow key={c.id} c={c} showMeeting={false} />)}</ul>
            )}
          </Card>
          <Card>
            <CardHeader icon={GitBranch} title="Earlier commitments discussed here" subtitle="Linked by the Commitment Graph" />
            {discussed.length === 0 ? (
              <p className="px-5 pb-5 text-[13px] text-fg-3">No earlier commitments came up in this meeting.</p>
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {discussed.map((c) => (
                  <CommitmentRow
                    key={c.id}
                    c={c}
                    contextQuote={c.evidence.find((e) => e.meetingId === meeting.id)?.quote}
                    footer={c.pendingCompletion?.evidence.meetingId === meeting.id ? <PendingCompletionBar c={c} /> : undefined}
                  />
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {tab === 'questions' && (
        <Card>
          <CardHeader icon={AlertTriangle} title="Open questions" action={<Button size="sm" icon={Plus} onClick={() => setAddQuestion(true)}>Add</Button>} />
          {mQuestions.length === 0 ? (
            <EmptyState icon={AlertTriangle} title="No questions" compact />
          ) : (
            <ul className="divide-y divide-line border-t border-line">{mQuestions.map((q) => <QuestionRow key={q.id} q={q} showMeeting={false} />)}</ul>
          )}
        </Card>
      )}

      {tab === 'related' && (
        <Card>
          {related.length === 0 ? (
            <EmptyState icon={GitBranch} title="No related meetings yet" compact>Meetings are related through shared commitments, decisions, projects and participants.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {related.map(({ m, reasons }) => (
                <li key={m.id}>
                  <Link to={`/app/meetings/${m.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-surface-2/60">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-medium text-fg">{m.title}</div>
                      <div className="text-[12px] text-fg-3">{fmtDate(m.startedAt ?? m.createdAt, true)}</div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1">{reasons.map((r) => <Badge key={r}>{r}</Badge>)}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'activity' && <ActivityTab meetingId={meeting.id} />}

      {meeting.isSample && tab === 'overview' && (
        <Notice tone="neutral" className="mt-6">This meeting uses a fictional sample transcript for demonstration.</Notice>
      )}

      <EditMeetingModal key={String(editOpen)} meeting={meeting} open={editOpen} onOpenChange={setEditOpen} />
      <CommitmentFormModal open={addCommitment} onOpenChange={setAddCommitment} meeting={meeting} />
      <DecisionFormModal open={addDecision} onOpenChange={setAddDecision} meeting={meeting} />
      <QuestionFormModal open={addQuestion} onOpenChange={setAddQuestion} meeting={meeting} />
      <ConfirmModal
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        danger
        title="Delete this meeting?"
        confirmLabel="Delete permanently"
        body={
          <>
            This permanently deletes the meeting, its transcript, and the decisions, questions and commitments that came from it. Commitments that were
            discussed again in later meetings are kept. This cannot be undone.
          </>
        }
        onConfirm={async () => {
          await deleteMeeting(wid, actor, meeting);
          toast.success('Meeting deleted');
          navigate('/app/meetings');
        }}
      />
    </div>
  );
}

