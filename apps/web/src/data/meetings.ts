import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { MAX_TRANSCRIPT_CHARS, normalizeTranscript, type Meeting, type Participant, type TranscriptSource } from '@meetos/shared';
import { BatchWriter, fromSnap, newId, ts, wsCol, wsItem } from './db';
import { logActivity, type Actor } from './activity';

export interface MeetingInput {
  title: string;
  description: string;
  projectId: string | null;
  participants: Participant[];
  scheduledAt: number | null;
  isSample?: boolean;
}

export async function createMeeting(wid: string, actor: Actor, input: MeetingInput): Promise<string> {
  const id = newId(wid, 'meetings');
  await setDoc(wsItem(wid, 'meetings', id), {
    workspaceId: wid,
    title: input.title.trim().slice(0, 200) || 'Untitled meeting',
    description: input.description.trim().slice(0, 2000),
    projectId: input.projectId,
    participants: cleanParticipants(input.participants),
    scheduledAt: ts(input.scheduledAt),
    startedAt: null,
    endedAt: null,
    status: 'scheduled',
    archived: false,
    transcriptSource: null,
    transcriptChars: 0,
    summary: '',
    topics: [],
    discussionPoints: [],
    risks: [],
    followUps: [],
    analysis: null,
    agenda: null,
    agendaUpdatedAt: null,
    isSample: !!input.isSample,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: actor.uid,
  });
  await logActivity(wid, actor, 'meeting_created', `created the meeting "${input.title}"`, { meetingId: id });
  return id;
}

export function cleanParticipants(ps: Participant[]): Participant[] {
  const seen = new Set<string>();
  const out: Participant[] = [];
  for (const p of ps) {
    const name = p.name.trim().slice(0, 120);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push({ name, email: p.email?.trim() || null, uid: p.uid ?? null });
  }
  return out.slice(0, 50);
}

export async function updateMeeting(wid: string, id: string, patch: Partial<MeetingInput>) {
  const data: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (patch.title !== undefined) data.title = patch.title.trim().slice(0, 200) || 'Untitled meeting';
  if (patch.description !== undefined) data.description = patch.description.trim().slice(0, 2000);
  if (patch.projectId !== undefined) data.projectId = patch.projectId;
  if (patch.participants !== undefined) data.participants = cleanParticipants(patch.participants);
  if (patch.scheduledAt !== undefined) data.scheduledAt = ts(patch.scheduledAt);
  await updateDoc(wsItem(wid, 'meetings', id), data);
}

export async function setMeetingArchived(wid: string, actor: Actor, m: Meeting, archived: boolean) {
  await updateDoc(wsItem(wid, 'meetings', m.id), { archived, updatedAt: serverTimestamp() });
  if (archived) await logActivity(wid, actor, 'meeting_archived', `archived "${m.title}"`, { meetingId: m.id });
}

export async function patchMeeting(wid: string, id: string, data: Record<string, unknown>) {
  await updateDoc(wsItem(wid, 'meetings', id), { ...data, updatedAt: serverTimestamp() });
}

// ---------------------------------------------------------------- listening & pagination

export function listenRecentMeetings(wid: string, cb: (m: Meeting[]) => void, onError?: (e: Error) => void) {
  return onSnapshot(
    query(wsCol(wid, 'meetings'), orderBy('createdAt', 'desc'), limit(300)),
    (snap) => cb(snap.docs.map((d) => fromSnap<Meeting>(d))),
    onError,
  );
}

export function listenMeeting(wid: string, id: string, cb: (m: Meeting | null) => void) {
  return onSnapshot(wsItem(wid, 'meetings', id), (snap) => cb(snap.exists() ? fromSnap<Meeting>(snap) : null), () => cb(null));
}

export interface MeetingPage {
  items: Meeting[];
  cursor: QueryDocumentSnapshot | null;
  hasMore: boolean;
}

export async function fetchMeetingPage(wid: string, opts: { archived: boolean; cursor: QueryDocumentSnapshot | null; pageSize?: number }): Promise<MeetingPage> {
  const size = opts.pageSize ?? 20;
  const q = query(
    wsCol(wid, 'meetings'),
    where('archived', '==', opts.archived),
    orderBy('createdAt', 'desc'),
    ...(opts.cursor ? [startAfter(opts.cursor)] : []),
    limit(size + 1),
  );
  const snap = await getDocs(q);
  const docs = snap.docs.slice(0, size);
  return { items: docs.map((d) => fromSnap<Meeting>(d)), cursor: docs.at(-1) ?? null, hasMore: snap.docs.length > size };
}

// ---------------------------------------------------------------- transcript

const transcriptRef = (wid: string, mid: string) => doc(wsItem(wid, 'meetings', mid), 'content', 'transcript');

export async function getTranscript(wid: string, mid: string): Promise<string> {
  const snap = await getDoc(transcriptRef(wid, mid));
  return snap.exists() ? String(snap.data().text ?? '') : '';
}

export function listenTranscript(wid: string, mid: string, cb: (text: string, source: TranscriptSource | null) => void) {
  return onSnapshot(
    transcriptRef(wid, mid),
    (snap) => cb(snap.exists() ? String(snap.data().text ?? '') : '', snap.exists() ? (snap.data().source ?? null) : null),
    () => cb('', null),
  );
}

export async function saveTranscript(
  wid: string,
  actor: Actor,
  meeting: Pick<Meeting, 'id' | 'title' | 'status' | 'startedAt'>,
  text: string,
  source: TranscriptSource,
) {
  const clean = normalizeTranscript(text);
  if (clean.length > MAX_TRANSCRIPT_CHARS) {
    throw new Error(`Transcript is too long (${clean.length.toLocaleString()} characters; max ${MAX_TRANSCRIPT_CHARS.toLocaleString()}).`);
  }
  await setDoc(transcriptRef(wid, meeting.id), { text: clean, source, updatedAt: serverTimestamp(), updatedBy: actor.uid });
  await updateDoc(wsItem(wid, 'meetings', meeting.id), {
    transcriptSource: source,
    transcriptChars: clean.length,
    status: meeting.status === 'analyzed' ? 'analyzed' : 'captured',
    startedAt: meeting.startedAt ? ts(meeting.startedAt) : serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await logActivity(wid, actor, 'transcript_saved', `added a transcript to "${meeting.title}"`, { meetingId: meeting.id });
  return clean;
}

// ---------------------------------------------------------------- live capture segments

export async function appendSegment(wid: string, mid: string, seg: { index: number; speaker: string | null; text: string; source: TranscriptSource }) {
  await setDoc(doc(collection(wsItem(wid, 'meetings', mid), 'segments'), String(seg.index).padStart(6, '0')), {
    ...seg,
    text: seg.text.slice(0, 20000),
    createdAt: serverTimestamp(),
  });
}

export async function getSegments(wid: string, mid: string) {
  const snap = await getDocs(query(collection(wsItem(wid, 'meetings', mid), 'segments'), orderBy('index', 'asc')));
  return snap.docs.map((d) => d.data() as { index: number; speaker: string | null; text: string });
}

export function segmentsToTranscript(segs: { speaker: string | null; text: string }[]): string {
  return segs.map((s) => (s.speaker ? `${s.speaker}: ${s.text}` : s.text)).join('\n');
}

// ---------------------------------------------------------------- deletion

/**
 * Delete a meeting with its transcript, live segments, and the AI items that
 * originated in it. Commitments that were later discussed in other meetings
 * are kept (only the reference to this meeting is removed).
 */
export async function deleteMeeting(wid: string, actor: Actor, m: Meeting) {
  const writer = new BatchWriter();
  const meetingRef = wsItem(wid, 'meetings', m.id);
  for (const sub of ['content', 'segments']) {
    const snap = await getDocs(collection(meetingRef, sub));
    snap.docs.forEach((d) => writer.run((b) => b.delete(d.ref)));
  }
  for (const name of ['decisions', 'questions'] as const) {
    const snap = await getDocs(query(wsCol(wid, name), where('meetingId', '==', m.id)));
    snap.docs.forEach((d) => writer.run((b) => b.delete(d.ref)));
  }
  const commitments = await getDocs(query(wsCol(wid, 'commitments'), where('meetingIds', 'array-contains', m.id)));
  for (const c of commitments.docs) {
    const data = c.data() as { originMeetingId: string; relatedMeetingIds: string[]; meetingIds: string[]; evidence: { meetingId: string }[] };
    if (data.originMeetingId === m.id && data.relatedMeetingIds.length === 0) {
      const events = await getDocs(collection(c.ref, 'events'));
      writer.run((b) => {
        events.docs.forEach((e) => b.delete(e.ref));
        b.delete(c.ref);
      }, events.size + 1);
    } else {
      writer.run((b) =>
        b.update(c.ref, {
          relatedMeetingIds: data.relatedMeetingIds.filter((id) => id !== m.id),
          meetingIds: data.meetingIds.filter((id) => id !== m.id || id === data.originMeetingId),
          evidence: data.evidence.filter((e) => e.meetingId !== m.id || data.originMeetingId === m.id),
          updatedAt: serverTimestamp(),
        }),
      );
    }
  }
  writer.run((b) => b.delete(meetingRef));
  await writer.commit();
  await logActivity(wid, actor, 'meeting_deleted', `deleted the meeting "${m.title}" and its transcript`);
}
