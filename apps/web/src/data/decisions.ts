import { arrayUnion, onSnapshot, orderBy, query, serverTimestamp, updateDoc, writeBatch, deleteDoc, limit } from 'firebase/firestore';
import type { Decision, DecisionStatus, Evidence, InferenceSourceLabel, Meeting, Question } from '@meetos/shared';
import { db, fromSnap, newId, ts, wsCol, wsItem } from './db';
import { logActivity, type Actor } from './activity';
import type { WriteBatch } from 'firebase/firestore';

// ---------------------------------------------------------------- decisions

export function listenDecisions(wid: string, cb: (d: Decision[]) => void, onError?: (e: Error) => void) {
  return onSnapshot(
    query(wsCol(wid, 'decisions'), orderBy('decidedAt', 'desc'), limit(1000)),
    (snap) => cb(snap.docs.map((d) => fromSnap<Decision>(d))),
    onError,
  );
}

export interface NewDecision {
  title: string;
  description: string;
  meeting: Pick<Meeting, 'id' | 'title' | 'projectId'>;
  decidedAt: number;
  participants: string[];
  evidence: Evidence[];
  alternatives: string[];
  status: DecisionStatus;
  relatedDecisionIds: string[];
  origin: 'ai' | 'manual';
  inferenceSource: InferenceSourceLabel | null;
}

export function stageDecision(b: WriteBatch, wid: string, actor: Actor, d: NewDecision): string {
  const id = newId(wid, 'decisions');
  b.set(wsItem(wid, 'decisions', id), {
    workspaceId: wid,
    title: d.title.trim().slice(0, 300),
    description: d.description.trim().slice(0, 3000),
    meetingId: d.meeting.id,
    meetingTitle: d.meeting.title,
    decidedAt: ts(d.decidedAt),
    participants: d.participants.slice(0, 30),
    evidence: d.evidence.slice(0, 20),
    alternatives: d.alternatives.slice(0, 10),
    status: d.status,
    supersededBy: null,
    supersedes: null,
    relatedDecisionIds: d.relatedDecisionIds,
    projectId: d.meeting.projectId ?? null,
    confirmedBy: null,
    confirmedByName: null,
    origin: d.origin,
    inferenceSource: d.inferenceSource,
    editedByUser: d.origin === 'manual',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: actor.uid,
  });
  return id;
}

export async function createManualDecision(wid: string, actor: Actor, d: Omit<NewDecision, 'origin' | 'inferenceSource'>) {
  const b = writeBatch(db());
  const id = stageDecision(b, wid, actor, { ...d, origin: 'manual', inferenceSource: null });
  await b.commit();
  await logActivity(wid, actor, 'decision_created', `recorded the decision "${d.title}"`, { meetingId: d.meeting.id, entityId: id });
  return id;
}

export async function updateDecision(wid: string, id: string, patch: Partial<Pick<Decision, 'title' | 'description' | 'alternatives' | 'participants'>>) {
  await updateDoc(wsItem(wid, 'decisions', id), { ...patch, editedByUser: true, updatedAt: serverTimestamp() });
}

/** A person confirms a tentative decision. Recorded in their own name only (enforced by rules). */
export async function confirmDecision(wid: string, actor: Actor, d: Decision) {
  await updateDoc(wsItem(wid, 'decisions', d.id), {
    status: 'active',
    confirmedBy: actor.uid,
    confirmedByName: actor.name,
    editedByUser: true,
    updatedAt: serverTimestamp(),
  });
  await logActivity(wid, actor, 'decision_updated', `confirmed the decision "${d.title}"`, { entityId: d.id });
}

export async function setDecisionStatus(wid: string, actor: Actor, d: Decision, status: DecisionStatus) {
  await updateDoc(wsItem(wid, 'decisions', d.id), { status, editedByUser: true, updatedAt: serverTimestamp() });
  await logActivity(wid, actor, 'decision_updated', `marked "${d.title}" as ${status.replace('_', ' ')}`, { entityId: d.id });
}

/** Record that `newer` replaces `older` (user action; never automatic). */
export async function markSupersedes(wid: string, actor: Actor, newer: Decision, older: Decision) {
  const b = writeBatch(db());
  b.update(wsItem(wid, 'decisions', older.id), {
    status: 'superseded',
    supersededBy: newer.id,
    relatedDecisionIds: arrayUnion(newer.id),
    editedByUser: true,
    updatedAt: serverTimestamp(),
  });
  b.update(wsItem(wid, 'decisions', newer.id), {
    supersedes: older.id,
    relatedDecisionIds: arrayUnion(older.id),
    editedByUser: true,
    updatedAt: serverTimestamp(),
  });
  await b.commit();
  await logActivity(wid, actor, 'decision_updated', `marked "${newer.title}" as replacing "${older.title}"`, { entityId: newer.id });
}

export async function deleteDecision(wid: string, id: string) {
  await deleteDoc(wsItem(wid, 'decisions', id));
}

// ---------------------------------------------------------------- questions

export function listenQuestions(wid: string, cb: (q: Question[]) => void, onError?: (e: Error) => void) {
  return onSnapshot(
    query(wsCol(wid, 'questions'), orderBy('createdAt', 'desc'), limit(1000)),
    (snap) => cb(snap.docs.map((d) => fromSnap<Question>(d))),
    onError,
  );
}

export interface NewQuestion {
  text: string;
  askedBy: string | null;
  meeting: Pick<Meeting, 'id' | 'title' | 'projectId'>;
  evidence: Evidence[];
  origin: 'ai' | 'manual';
  inferenceSource: InferenceSourceLabel | null;
}

export function stageQuestion(b: WriteBatch, wid: string, actor: Actor, q: NewQuestion): string {
  const id = newId(wid, 'questions');
  b.set(wsItem(wid, 'questions', id), {
    workspaceId: wid,
    text: q.text.trim().slice(0, 1000),
    askedBy: q.askedBy,
    meetingId: q.meeting.id,
    meetingTitle: q.meeting.title,
    evidence: q.evidence.slice(0, 10),
    status: 'open',
    answer: null,
    resolvedAt: null,
    projectId: q.meeting.projectId ?? null,
    origin: q.origin,
    inferenceSource: q.inferenceSource,
    editedByUser: q.origin === 'manual',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: actor.uid,
  });
  return id;
}

export async function createManualQuestion(wid: string, actor: Actor, q: Omit<NewQuestion, 'origin' | 'inferenceSource'>) {
  const b = writeBatch(db());
  stageQuestion(b, wid, actor, { ...q, origin: 'manual', inferenceSource: null });
  await b.commit();
}

export async function resolveQuestion(wid: string, actor: Actor, q: Question, answer: string) {
  await updateDoc(wsItem(wid, 'questions', q.id), {
    status: 'resolved',
    answer: answer.trim().slice(0, 2000) || null,
    resolvedAt: serverTimestamp(),
    editedByUser: true,
    updatedAt: serverTimestamp(),
  });
  await logActivity(wid, actor, 'question_resolved', `resolved the question "${q.text}"`, { entityId: q.id });
}

export async function reopenQuestion(wid: string, q: Question) {
  await updateDoc(wsItem(wid, 'questions', q.id), { status: 'open', resolvedAt: null, updatedAt: serverTimestamp() });
}

export async function deleteQuestion(wid: string, id: string) {
  await deleteDoc(wsItem(wid, 'questions', id));
}
