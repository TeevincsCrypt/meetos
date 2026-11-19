import {
  arrayUnion,
  collection,
  collectionGroup,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import type { Invite, Member, Project, Role, UserProfile, Workspace } from '@meetos/shared';
import { BatchWriter, db, fromSnap, newId, wsCol, wsDoc, wsItem } from './db';
import { logActivity, type Actor } from './activity';

export interface AuthUserLike {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

export const displayNameOf = (u: AuthUserLike) => u.displayName || u.email?.split('@')[0] || 'You';

// ---------------------------------------------------------------- user profile

export async function ensureUserProfile(u: AuthUserLike): Promise<UserProfile> {
  const ref = doc(db(), 'users', u.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const p = fromSnap<UserProfile & { id: string }>(snap);
    return { ...p, uid: u.uid };
  }
  const profile = {
    displayName: displayNameOf(u),
    email: u.email,
    photoURL: u.photoURL,
    lastWorkspaceId: null,
    createdAt: serverTimestamp(),
  };
  await setDoc(ref, profile);
  return { uid: u.uid, displayName: profile.displayName, email: u.email, photoURL: u.photoURL, lastWorkspaceId: null, createdAt: Date.now() };
}

export async function updateUserProfile(uid: string, patch: Partial<Pick<UserProfile, 'displayName' | 'lastWorkspaceId'>>) {
  await setDoc(doc(db(), 'users', uid), patch, { merge: true });
}

// ---------------------------------------------------------------- workspaces

export function listenMyWorkspaces(uid: string, cb: (ws: Workspace[]) => void, onError: (e: Error) => void) {
  return onSnapshot(
    query(collection(db(), 'workspaces'), where('memberIds', 'array-contains', uid)),
    (snap) => cb(snap.docs.map((d) => fromSnap<Workspace>(d)).sort((a, b) => a.name.localeCompare(b.name))),
    onError,
  );
}

export async function createWorkspace(user: AuthUserLike, input: { name: string; description: string; isDemo?: boolean }) {
  const ref = doc(collection(db(), 'workspaces'));
  const batch = writeBatch(db());
  batch.set(ref, {
    name: input.name.trim().slice(0, 80),
    description: input.description.trim().slice(0, 500),
    ownerId: user.uid,
    roles: { [user.uid]: 'owner' },
    memberIds: [user.uid],
    isDemo: !!input.isDemo,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
  // Member profile doc can only be written once membership exists.
  await setDoc(doc(db(), 'workspaces', ref.id, 'members', user.uid), memberDoc(user, 'owner'));
  await updateUserProfile(user.uid, { lastWorkspaceId: ref.id });
  await logActivity(ref.id, { uid: user.uid, name: displayNameOf(user) }, 'workspace_created', `created the workspace "${input.name}"`);
  return ref.id;
}

function memberDoc(user: AuthUserLike, role: Role) {
  return {
    uid: user.uid,
    role,
    displayName: displayNameOf(user),
    email: user.email,
    photoURL: user.photoURL,
    joinedAt: serverTimestamp(),
  };
}

export async function updateWorkspace(wid: string, patch: { name: string; description: string }) {
  await updateDoc(wsDoc(wid), { name: patch.name.trim().slice(0, 80), description: patch.description.trim().slice(0, 500), updatedAt: serverTimestamp() });
}

export function listenMembers(wid: string, cb: (m: Member[]) => void) {
  return onSnapshot(wsCol(wid, 'members'), (snap) =>
    cb(snap.docs.map((d) => ({ ...fromSnap<Member>(d), uid: d.id })).sort((a, b) => a.displayName.localeCompare(b.displayName))),
  );
}

export async function changeMemberRole(ws: Workspace, uid: string, role: Exclude<Role, 'owner'>) {
  await updateDoc(wsDoc(ws.id), { [`roles.${uid}`]: role, updatedAt: serverTimestamp() });
  await updateDoc(wsItem(ws.id, 'members', uid), { role });
}

export async function removeMember(ws: Workspace, uid: string) {
  await updateDoc(wsDoc(ws.id), {
    [`roles.${uid}`]: deleteField(),
    memberIds: ws.memberIds.filter((m) => m !== uid),
    updatedAt: serverTimestamp(),
  });
  await deleteDoc(wsItem(ws.id, 'members', uid)).catch(() => undefined);
}

export async function leaveWorkspace(ws: Workspace, uid: string) {
  await deleteDoc(wsItem(ws.id, 'members', uid)).catch(() => undefined);
  await updateDoc(wsDoc(ws.id), {
    [`roles.${uid}`]: deleteField(),
    memberIds: ws.memberIds.filter((m) => m !== uid),
    updatedAt: serverTimestamp(),
  });
}

/** Deletes all workspace data (children first, as rules require membership). */
export async function deleteWorkspace(wid: string) {
  const writer = new BatchWriter();
  for (const name of ['activity', 'questions', 'decisions', 'projects', 'invites'] as const) {
    const snap = await getDocs(wsCol(wid, name));
    snap.docs.forEach((d) => writer.run((b) => b.delete(d.ref)));
  }
  const commitments = await getDocs(wsCol(wid, 'commitments'));
  for (const c of commitments.docs) {
    const events = await getDocs(collection(c.ref, 'events'));
    writer.run((b) => {
      events.docs.forEach((e) => b.delete(e.ref));
      b.delete(c.ref);
    }, events.size + 1);
  }
  const meetings = await getDocs(wsCol(wid, 'meetings'));
  for (const m of meetings.docs) {
    for (const sub of ['content', 'segments']) {
      const s = await getDocs(collection(m.ref, sub));
      s.docs.forEach((d) => writer.run((b) => b.delete(d.ref)));
    }
    writer.run((b) => b.delete(m.ref));
  }
  const members = await getDocs(wsCol(wid, 'members'));
  members.docs.forEach((d) => writer.run((b) => b.delete(d.ref)));
  await writer.commit();
  await deleteDoc(wsDoc(wid));
}

// ---------------------------------------------------------------- invites

export async function createInvite(ws: Workspace, actor: Actor, email: string, role: Exclude<Role, 'owner'>) {
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error('Enter a valid email address.');
  await setDoc(wsItem(ws.id, 'invites', e), {
    email: e,
    role,
    workspaceId: ws.id,
    workspaceName: ws.name,
    invitedBy: actor.uid,
    invitedByName: actor.name,
    createdAt: serverTimestamp(),
  });
}

export function listenInvites(wid: string, cb: (i: (Invite & { id: string })[]) => void) {
  return onSnapshot(
    wsCol(wid, 'invites'),
    (snap) => cb(snap.docs.map((d) => fromSnap<Invite & { id: string }>(d))),
    () => cb([]),
  );
}

export async function revokeInvite(wid: string, email: string) {
  await deleteDoc(wsItem(wid, 'invites', email));
}

/** Invites addressed to the signed-in user's verified email. */
export async function findMyInvites(email: string): Promise<(Invite & { id: string })[]> {
  const snap = await getDocs(query(collectionGroup(db(), 'invites'), where('email', '==', email.toLowerCase())));
  return snap.docs.map((d) => fromSnap<Invite & { id: string }>(d));
}

export async function acceptInvite(user: AuthUserLike, invite: Invite) {
  const email = (user.email ?? '').toLowerCase();
  // Non-members cannot read the workspace, so this is a blind update that the
  // security rules verify (verified email + matching invite + exact role).
  await updateDoc(wsDoc(invite.workspaceId), {
    [`roles.${user.uid}`]: invite.role,
    memberIds: arrayUnion(user.uid),
    updatedAt: serverTimestamp(),
  });
  await setDoc(wsItem(invite.workspaceId, 'members', user.uid), memberDoc(user, invite.role));
  await deleteDoc(wsItem(invite.workspaceId, 'invites', email)).catch(() => undefined);
  await updateUserProfile(user.uid, { lastWorkspaceId: invite.workspaceId });
  await logActivity(invite.workspaceId, { uid: user.uid, name: displayNameOf(user) }, 'member_joined', `joined the workspace as ${invite.role}`);
}

// ---------------------------------------------------------------- projects

export function listenProjects(wid: string, cb: (p: Project[]) => void) {
  return onSnapshot(wsCol(wid, 'projects'), (snap) =>
    cb(snap.docs.map((d) => fromSnap<Project>(d)).sort((a, b) => a.name.localeCompare(b.name))),
  );
}

export const PROJECT_COLORS = ['#0b5d57', '#6d43c9', '#c98a12', '#1d6fa5', '#c2372e', '#1f7a4d', '#7b8087'];

export async function saveProject(wid: string, actor: Actor, p: { id?: string; name: string; description: string; color: string; archived?: boolean }) {
  const id = p.id ?? newId(wid, 'projects');
  await setDoc(
    wsItem(wid, 'projects', id),
    {
      name: p.name.trim().slice(0, 80),
      description: p.description.trim().slice(0, 500),
      color: p.color,
      archived: !!p.archived,
      ...(p.id ? {} : { createdAt: serverTimestamp(), createdBy: actor.uid }),
    },
    { merge: true },
  );
  return id;
}

export async function deleteProject(wid: string, id: string) {
  await deleteDoc(wsItem(wid, 'projects', id));
}
