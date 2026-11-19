/** Firestore helpers: path builders and Timestamp <-> epoch-ms conversion. */
import {
  collection,
  doc,
  Timestamp,
  writeBatch,
  type DocumentData,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
  type WriteBatch,
} from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';

export const db = () => getFirebase().db;

export type WsCollection =
  | 'members'
  | 'invites'
  | 'projects'
  | 'meetings'
  | 'commitments'
  | 'decisions'
  | 'questions'
  | 'activity';

export const wsDoc = (wid: string) => doc(db(), 'workspaces', wid);
export const wsCol = (wid: string, name: WsCollection) => collection(db(), 'workspaces', wid, name);
export const wsItem = (wid: string, name: WsCollection, id: string) => doc(db(), 'workspaces', wid, name, id);
export const newId = (wid: string, name: WsCollection) => doc(wsCol(wid, name)).id;

function convert(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toMillis();
  if (Array.isArray(value)) return value.map(convert);
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = convert(v);
    return out;
  }
  return value;
}

/** Snapshot -> plain domain object with timestamps as epoch ms. */
export function fromSnap<T>(snap: QueryDocumentSnapshot<DocumentData> | DocumentSnapshot<DocumentData>): T {
  const data = snap.data({ serverTimestamps: 'estimate' }) ?? {};
  return { id: snap.id, ...(convert(data) as object) } as T;
}

export const ts = (ms: number | null | undefined) => (ms == null ? null : Timestamp.fromMillis(ms));

/** Firestore batches are limited to 500 writes; this splits work transparently. */
export class BatchWriter {
  private batch: WriteBatch = writeBatch(db());
  private count = 0;
  private readonly pending: Promise<void>[] = [];

  /** `ops` = number of writes `fn` performs; they are guaranteed to land in the same batch. */
  run(fn: (b: WriteBatch) => void, ops = 1) {
    if (this.count > 0 && this.count + ops > 450) this.flushNow();
    fn(this.batch);
    this.count += ops;
  }

  private flushNow() {
    this.pending.push(this.batch.commit());
    this.batch = writeBatch(db());
    this.count = 0;
  }

  async commit() {
    if (this.count > 0) this.flushNow();
    await Promise.all(this.pending);
  }
}
