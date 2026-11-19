import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import type { Meeting, Priority } from '@meetos/shared';
import { useSession } from '@/state/auth';
import { useWs } from '@/state/workspace';
import { createManualCommitment } from '@/data/commitments';
import { createManualDecision, createManualQuestion } from '@/data/decisions';
import { fromDateInput } from '@/lib/format';
import { Button, ErrorNote, Field, Input, Modal, Select, Textarea } from './ui';

function MeetingPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { meetings } = useWs();
  return (
    <Select id="f-meeting" required value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="" disabled>Choose the meeting…</option>
      {meetings.filter((m) => !m.archived).map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
    </Select>
  );
}

export function CommitmentFormModal({ open, onOpenChange, meeting }: { open: boolean; onOpenChange: (o: boolean) => void; meeting?: Meeting }) {
  const { wid, meetingById, people } = useWs();
  const { actor } = useSession();
  const [description, setDescription] = useState('');
  const [owner, setOwner] = useState('');
  const [deadline, setDeadline] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [meetingId, setMeetingId] = useState(meeting?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const m = meeting ?? meetingById(meetingId);
    if (!m) return setError('Choose the meeting this commitment came from.');
    setBusy(true);
    setError(null);
    try {
      await createManualCommitment(wid, actor, {
        description,
        ownerName: owner || null,
        deadline: fromDateInput(deadline),
        deadlineText: null,
        priority,
        meeting: m,
        evidence: [],
      });
      toast.success('Commitment added');
      setDescription('');
      setOwner('');
      setDeadline('');
      onOpenChange(false);
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Add a commitment" description="Record a promise someone made that the AI didn't capture.">
      <form id="commitment-form" onSubmit={submit} className="space-y-4">
        <Field label="What was promised" htmlFor="f-desc">
          <Textarea id="f-desc" required rows={2} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Owner" htmlFor="f-owner">
            <Input id="f-owner" list="people-list" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Unassigned" />
            <datalist id="people-list">{people.map((p) => <option key={p} value={p} />)}</datalist>
          </Field>
          <Field label="Deadline" htmlFor="f-deadline">
            <Input id="f-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </Field>
          <Field label="Priority" htmlFor="f-priority">
            <Select id="f-priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </Select>
          </Field>
          {!meeting && (
            <Field label="From meeting" htmlFor="f-meeting">
              <MeetingPicker value={meetingId} onChange={setMeetingId} />
            </Field>
          )}
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!description.trim()}>Add commitment</Button>
        </div>
      </form>
    </Modal>
  );
}

export function DecisionFormModal({ open, onOpenChange, meeting }: { open: boolean; onOpenChange: (o: boolean) => void; meeting?: Meeting }) {
  const { wid, meetingById } = useWs();
  const { actor } = useSession();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [people, setPeople] = useState('');
  const [alternatives, setAlternatives] = useState('');
  const [meetingId, setMeetingId] = useState(meeting?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const m = meeting ?? meetingById(meetingId);
    if (!m) return setError('Choose the meeting where this was decided.');
    setBusy(true);
    try {
      await createManualDecision(wid, actor, {
        title,
        description: description || title,
        meeting: m,
        decidedAt: m.startedAt ?? m.scheduledAt ?? m.createdAt,
        participants: people.split(',').map((p) => p.trim()).filter(Boolean),
        evidence: [],
        alternatives: alternatives.split('\n').map((a) => a.trim()).filter(Boolean),
        status: 'active',
        relatedDecisionIds: [],
      });
      toast.success('Decision recorded');
      setTitle('');
      setDescription('');
      onOpenChange(false);
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Record a decision">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Decision" htmlFor="d-title">
          <Input id="d-title" required maxLength={300} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Launch the beta to the waitlist first" />
        </Field>
        <Field label="Details" htmlFor="d-desc">
          <Textarea id="d-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Agreed by (comma-separated)" htmlFor="d-people">
          <Input id="d-people" value={people} onChange={(e) => setPeople(e.target.value)} />
        </Field>
        <Field label="Alternatives considered (one per line)" htmlFor="d-alt">
          <Textarea id="d-alt" rows={2} value={alternatives} onChange={(e) => setAlternatives(e.target.value)} />
        </Field>
        {!meeting && (
          <Field label="Meeting" htmlFor="f-meeting">
            <MeetingPicker value={meetingId} onChange={setMeetingId} />
          </Field>
        )}
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!title.trim()}>Save decision</Button>
        </div>
      </form>
    </Modal>
  );
}

export function QuestionFormModal({ open, onOpenChange, meeting }: { open: boolean; onOpenChange: (o: boolean) => void; meeting: Meeting }) {
  const { wid } = useWs();
  const { actor } = useSession();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Add an open question">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await createManualQuestion(wid, actor, { text, askedBy: null, meeting, evidence: [] });
            setText('');
            onOpenChange(false);
          } finally {
            setBusy(false);
          }
        }}
        className="space-y-4"
      >
        <Field label="Question" htmlFor="q-text">
          <Textarea id="q-text" required rows={2} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!text.trim()}>Add question</Button>
        </div>
      </form>
    </Modal>
  );
}

export function ConfirmModal({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onOpenChange(false);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Something went wrong');
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-[13.5px] text-fg-2">{body}</div>
    </Modal>
  );
}
