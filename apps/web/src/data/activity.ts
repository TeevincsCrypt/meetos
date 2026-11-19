import { addDoc, serverTimestamp } from 'firebase/firestore';
import type { ActivityType } from '@meetos/shared';
import { wsCol } from './db';
import { limit as qLimit, onSnapshot, orderBy, query, getDocs, startAfter, type QueryDocumentSnapshot } from 'firebase/firestore';
import type { Activity } from '@meetos/shared';
import { fromSnap } from './db';

export interface Actor {
  uid: string;
  name: string;
}

/** Append-only activity log. Failures are non-fatal (logging must never block the user). */
export async function logActivity(
  wid: string,
  actor: Actor,
  type: ActivityType,
  message: string,
  refs: { meetingId?: string | null; entityId?: string | null } = {},
) {
  try {
    await addDoc(wsCol(wid, 'activity'), {
      type,
      actorUid: actor.uid,
      actorName: actor.name,
      message: message.slice(0, 480),
      meetingId: refs.meetingId ?? null,
      entityId: refs.entityId ?? null,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn('Activity log failed', e);
  }
}


export function listenActivity(wid: string, n: number, cb: (a: Activity[]) => void) {
  return onSnapshot(
    query(wsCol(wid, 'activity'), orderBy('createdAt', 'desc'), qLimit(n)),
    (snap) => cb(snap.docs.map((d) => fromSnap<Activity>(d))),
    () => cb([]),
  );
}

export async function fetchActivityPage(wid: string, cursor: QueryDocumentSnapshot | null, size = 25) {
  const snap = await getDocs(
    query(wsCol(wid, 'activity'), orderBy('createdAt', 'desc'), ...(cursor ? [startAfter(cursor)] : []), qLimit(size + 1)),
  );
  const docs = snap.docs.slice(0, size);
  return { items: docs.map((d) => fromSnap<Activity>(d)), cursor: docs.at(-1) ?? null, hasMore: snap.docs.length > size };
}
