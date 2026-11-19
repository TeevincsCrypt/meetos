import {
  arrayUnion,
  collection,
  doc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
  type DocumentReference,
  type WriteBatch,
} from 'firebase/firestore';
import {
  personKey,
  type Commitment,
  type CommitmentEvent,
  type CommitmentEventType,
  type CommitmentStatus,
  type Evidence,
  type InferenceSourceLabel,
  type Meeting,
  type Priority,
} from '@meetos/shared';
import { db, fromSnap, newId, ts, wsCol, wsItem } from './db';
import { logActivity, type Actor } from './activity';

export function listenCommitments(wid: string, cb: (c: Commitment[]) => void, onError?: (e: Error) => void) {
  return onSnapshot(
    query(wsCol(wid, 'commitments'), orderBy('createdAt', 'desc'), limit(1000)),
    (snap) => cb(snap.docs.map((d) => fromSnap<Commitment>(d))),
    onError,
  );
}

export function listenEvents(wid: string, cid: string, cb: (e: CommitmentEvent[]) => void) {
  return onSnapshot(
    query(collection(wsItem(wid, 'commitments', cid), 'events'), orderBy('at', 'asc')),
    (snap) => cb(snap.docs.map((d) => fromSnap<CommitmentEvent>(d))),
    () => cb([]),
  );
}

export const commitmentRef = (wid: string, id: string) => wsItem(wid, 'commitments', id);

export interface EventInput {
  type: CommitmentEventType;
  actor: Actor | null;
  meeting?: Pick<Meeting, 'id' | 'title'> | null;
  quote?: string | null;
  from?: string | null;
  to?: string | null;
  note?: string | null;
  origin: 'ai' | 'user';
  at?: number;
}

export function addEvent(b: WriteBatch, cRef: DocumentReference, e: EventInput) {
  b.set(doc(collection(cRef, 'events')), {
    type: e.type,
    at: e.at ? ts(e.at) : serverTimestamp(),
    byUid: e.actor?.uid ?? null,
    byName: e.actor?.name ?? null,
    meetingId: e.meeting?.id ?? null,
    meetingTitle: e.meeting?.title ?? null,
    quote: e.quote ?? null,
    from: e.from ?? null,
    to: e.to ?? null,
    note: e.note?.slice(0, 2000) ?? null,
    origin: e.origin === 'user' ? 'manual' : 'ai',
  });
}

export interface NewCommitment {
  description: string;
  ownerName: string | null;
  deadline: number | null;
  deadlineText: string | null;
  priority: Priority;
  meeting: Pick<Meeting, 'id' | 'title' | 'projectId'>;
  evidence: Evidence[];
  origin: 'ai' | 'manual';
  inferenceSource: InferenceSourceLabel | null;
  /** When the promise was made (meeting time). Defaults to now. */
  madeAt?: number;
}

/** Writes a new commitment + its "created" event into `b`. Returns the id. */
export function stageCommitment(b: WriteBatch, wid: string, actor: Actor, c: NewCommitment): string {
  const id = newId(wid, 'commitments');
  const ref = commitmentRef(wid, id);
  b.set(ref, {
    workspaceId: wid,
    description: c.description.trim().slice(0, 2000),
    ownerName: c.ownerName?.trim().slice(0, 120) || null,
    ownerKey: personKey(c.ownerName),
    deadline: ts(c.deadline),
    deadlineText: c.deadlineText,
    originalDeadline: ts(c.deadline),
    deadlineChangeCount: 0,
    priority: c.priority,
    status: 'open',
    originMeetingId: c.meeting.id,
    originMeetingTitle: c.meeting.title,
    relatedMeetingIds: [],
    meetingIds: [c.meeting.id],
    evidence: c.evidence.slice(0, 50),
    projectId: c.meeting.projectId ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    completedAt: null,
    completion: null,
    pendingCompletion: null,
    lastMentionedAt: null,
    mentionCount: 0,
    origin: c.origin,
    inferenceSource: c.inferenceSource,
    editedByUser: c.origin === 'manual',
    createdBy: actor.uid,
  });
  addEvent(b, ref, {
    type: 'created',
    actor: c.origin === 'manual' ? actor : null,
    meeting: c.meeting,
    quote: c.evidence[0]?.quote ?? null,
    note: c.origin === 'ai' ? `Extracted from the transcript (${sourceText(c.inferenceSource)}).` : 'Added manually.',
    origin: c.origin === 'manual' ? 'user' : 'ai',
    at: c.madeAt,
  });
  return id;
}

export function sourceText(s: InferenceSourceLabel | null) {
  return s === 'on_device' ? 'processed on this device' : s === 'cloud_fallback' ? 'cloud fallback' : s === 'in_cloud' ? 'processed in the cloud' : 'manual';
}

export async function createManualCommitment(wid: string, actor: Actor, c: Omit<NewCommitment, 'origin' | 'inferenceSource'>) {
  const b = writeBatch(db());
  const id = stageCommitment(b, wid, actor, { ...c, origin: 'manual', inferenceSource: null });
  await b.commit();
  await logActivity(wid, actor, 'commitment_created', `added the commitment "${c.description}"`, { meetingId: c.meeting.id, entityId: id });
  return id;
}

export const STATUS_LABEL: Record<CommitmentStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  completed: 'Completed',
  blocked: 'Blocked',
  cancelled: 'Cancelled',
};

export async function setCommitmentStatus(wid: string, actor: Actor, c: Commitment, status: CommitmentStatus, note?: string) {
  if (status === c.status) return;
  if (status === 'completed') return confirmCompletion(wid, actor, c, { useSuggestedEvidence: false, note });
  const b = writeBatch(db());
  const ref = commitmentRef(wid, c.id);
  b.update(ref, {
    status,
    completedAt: null,
    completion: null,
    ...(status === 'cancelled' ? { pendingCompletion: null } : {}),
    editedByUser: true,
    updatedAt: serverTimestamp(),
  });
  addEvent(b, ref, { type: 'status_changed', actor, from: c.status, to: status, note: note ?? null, origin: 'user' });
  await b.commit();
  await logActivity(wid, actor, 'commitment_updated', `marked "${c.description}" as ${STATUS_LABEL[status].toLowerCase()}`, { entityId: c.id });
}

/**
 * The only way a commitment becomes completed: an explicit user confirmation,
 * optionally accepting the transcript evidence MEETOS found.
 */
export async function confirmCompletion(
  wid: string,
  actor: Actor,
  c: Commitment,
  opts: { useSuggestedEvidence: boolean; note?: string },
) {
  const evidence = opts.useSuggestedEvidence ? (c.pendingCompletion?.evidence ?? null) : null;
  const b = writeBatch(db());
  const ref = commitmentRef(wid, c.id);
  b.update(ref, {
    status: 'completed',
    completedAt: serverTimestamp(),
    completion: { method: 'user_confirmed', confirmedBy: actor.uid, confirmedByName: actor.name, at: serverTimestamp(), evidence },
    pendingCompletion: null,
    editedByUser: true,
    updatedAt: serverTimestamp(),
  });
  addEvent(b, ref, {
    type: 'completion_confirmed',
    actor,
    from: c.status,
    to: 'completed',
    quote: evidence?.quote ?? null,
    meeting: evidence ? { id: evidence.meetingId, title: evidence.meetingTitle ?? '' } : null,
    note: opts.note ?? null,
    origin: 'user',
  });
  await b.commit();
  await logActivity(wid, actor, 'commitment_completed', `confirmed "${c.description}" as completed`, { entityId: c.id });
}

export async function rejectCompletion(wid: string, actor: Actor, c: Commitment, note?: string) {
  const b = writeBatch(db());
  const ref = commitmentRef(wid, c.id);
  b.update(ref, { pendingCompletion: null, editedByUser: true, updatedAt: serverTimestamp() });
  addEvent(b, ref, { type: 'completion_rejected', actor, note: note ?? 'Not actually complete.', origin: 'user' });
  await b.commit();
}

export async function changeDeadline(wid: string, actor: Actor, c: Commitment, deadline: number | null, note?: string) {
  const b = writeBatch(db());
  const ref = commitmentRef(wid, c.id);
  b.update(ref, {
    deadline: ts(deadline),
    deadlineText: null,
    deadlineChangeCount: c.deadline ? increment(1) : c.deadlineChangeCount,
    originalDeadline: ts(c.originalDeadline ?? deadline),
    editedByUser: true,
    updatedAt: serverTimestamp(),
  });
  addEvent(b, ref, {
    type: 'deadline_changed',
    actor,
    from: c.deadline ? new Date(c.deadline).toISOString() : null,
    to: deadline ? new Date(deadline).toISOString() : null,
    note: note ?? null,
    origin: 'user',
  });
  await b.commit();
}

export async function reassignCommitment(wid: string, actor: Actor, c: Commitment, ownerName: string | null) {
  const b = writeBatch(db());
  const ref = commitmentRef(wid, c.id);
  const clean = ownerName?.trim() || null;
  b.update(ref, { ownerName: clean, ownerKey: personKey(clean), editedByUser: true, updatedAt: serverTimestamp() });
  addEvent(b, ref, { type: 'owner_changed', actor, from: c.ownerName, to: clean, origin: 'user' });
  await b.commit();
}

export async function editCommitment(wid: string, actor: Actor, c: Commitment, patch: { description?: string; priority?: Priority }) {
  const b = writeBatch(db());
  const ref = commitmentRef(wid, c.id);
  b.update(ref, {
    ...(patch.description ? { description: patch.description.trim().slice(0, 2000) } : {}),
    ...(patch.priority ? { priority: patch.priority } : {}),
    editedByUser: true,
    updatedAt: serverTimestamp(),
  });
  addEvent(b, ref, {
    type: 'note',
    actor,
    note: patch.description ? `Edited description (was: "${c.description}")` : `Priority set to ${patch.priority}`,
    origin: 'user',
  });
  await b.commit();
}

export async function addProgressNote(wid: string, actor: Actor, c: Commitment, note: string) {
  const b = writeBatch(db());
  const ref = commitmentRef(wid, c.id);
  b.update(ref, { updatedAt: serverTimestamp() });
  addEvent(b, ref, { type: 'note', actor, note: note.trim(), origin: 'user' });
  await b.commit();
}

/** Manually connect a commitment to a later meeting (Commitment Graph edge). */
export async function linkCommitmentToMeeting(wid: string, actor: Actor, c: Commitment, meeting: Pick<Meeting, 'id' | 'title'>, note?: string) {
  if (c.meetingIds.includes(meeting.id)) return;
  const b = writeBatch(db());
  const ref = commitmentRef(wid, c.id);
  b.update(ref, {
    relatedMeetingIds: arrayUnion(meeting.id),
    meetingIds: arrayUnion(meeting.id),
    lastMentionedAt: serverTimestamp(),
    mentionCount: increment(1),
    updatedAt: serverTimestamp(),
  });
  addEvent(b, ref, { type: 'mentioned', actor, meeting, note: note || 'Linked manually.', origin: 'user' });
  await b.commit();
}

export async function deleteCommitment(wid: string, actor: Actor, c: Commitment) {
  const ref = commitmentRef(wid, c.id);
  const events = await getDocs(collection(ref, 'events'));
  const b = writeBatch(db());
  events.docs.forEach((e) => b.delete(e.ref));
  b.delete(ref);
  await b.commit();
  await logActivity(wid, actor, 'commitment_updated', `deleted the commitment "${c.description}"`);
}
