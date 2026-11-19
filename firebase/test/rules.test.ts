/**
 * Firestore Security Rules tests. Run with `pnpm test:rules` from the repo
 * root (starts the Firestore emulator via `firebase emulators:exec`).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, getDocs, collection, query, where, setDoc, updateDoc, writeBatch, collectionGroup } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

const OWNER = 'owner-uid';
const ADMIN = 'admin-uid';
const MEMBER = 'member-uid';
const STRANGER = 'stranger-uid';
const INVITEE = 'invitee-uid';
const W = 'ws1';

const db = (uid: string, token: Record<string, unknown> = {}) => env.authenticatedContext(uid, token).firestore();

function commitment(over: Record<string, unknown> = {}) {
  return {
    workspaceId: W,
    description: 'Finish the landing page',
    ownerName: 'Daniel',
    status: 'open',
    priority: 'medium',
    meetingIds: ['m1'],
    originMeetingId: 'm1',
    evidence: [],
    completion: null,
    createdBy: MEMBER,
    ...over,
  };
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-meetos-rules',
    firestore: { rules: readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8') },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const fs = ctx.firestore();
    await setDoc(doc(fs, 'workspaces', W), {
      name: 'Acme',
      description: '',
      ownerId: OWNER,
      roles: { [OWNER]: 'owner', [ADMIN]: 'admin', [MEMBER]: 'member' },
      memberIds: [OWNER, ADMIN, MEMBER],
      isDemo: false,
    });
    await setDoc(doc(fs, `workspaces/${W}/meetings/m1`), { workspaceId: W, title: 'Kickoff', description: '', createdBy: MEMBER });
    await setDoc(doc(fs, `workspaces/${W}/commitments/c1`), commitment());
    await setDoc(doc(fs, `workspaces/${W}/invites/new@example.com`), {
      email: 'new@example.com',
      role: 'member',
      workspaceId: W,
      invitedBy: OWNER,
    });
  });
});

describe('workspace isolation', () => {
  it('members can read their workspace and its data', async () => {
    await assertSucceeds(getDoc(doc(db(MEMBER), 'workspaces', W)));
    await assertSucceeds(getDoc(doc(db(MEMBER), `workspaces/${W}/meetings/m1`)));
    await assertSucceeds(getDocs(query(collection(db(MEMBER), 'workspaces'), where('memberIds', 'array-contains', MEMBER))));
  });

  it('non-members cannot read or write anything', async () => {
    await assertFails(getDoc(doc(db(STRANGER), 'workspaces', W)));
    await assertFails(getDoc(doc(db(STRANGER), `workspaces/${W}/meetings/m1`)));
    await assertFails(getDoc(doc(db(STRANGER), `workspaces/${W}/commitments/c1`)));
    await assertFails(setDoc(doc(db(STRANGER), `workspaces/${W}/meetings/x`), { workspaceId: W, title: 't', description: '', createdBy: STRANGER }));
    await assertFails(getDocs(query(collection(db(STRANGER), 'workspaces'), where('memberIds', 'array-contains', MEMBER))));
  });

  it('unauthenticated users are denied', async () => {
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, 'workspaces', W)));
  });

  it('users can only access their own profile', async () => {
    await assertSucceeds(setDoc(doc(db(MEMBER), 'users', MEMBER), { displayName: 'M', lastWorkspaceId: W }));
    await assertFails(getDoc(doc(db(STRANGER), 'users', MEMBER)));
  });
});

describe('workspace creation and roles', () => {
  it('anyone signed in can create a workspace they own', async () => {
    await assertSucceeds(
      setDoc(doc(db(STRANGER), 'workspaces', 'w2'), {
        name: 'Mine',
        description: '',
        ownerId: STRANGER,
        roles: { [STRANGER]: 'owner' },
        memberIds: [STRANGER],
        isDemo: false,
      }),
    );
  });

  it('cannot create a workspace that includes other members or a different owner', async () => {
    await assertFails(
      setDoc(doc(db(STRANGER), 'workspaces', 'w3'), {
        name: 'X', description: '', ownerId: STRANGER, roles: { [STRANGER]: 'owner', [MEMBER]: 'admin' }, memberIds: [STRANGER, MEMBER], isDemo: false,
      }),
    );
    await assertFails(
      setDoc(doc(db(STRANGER), 'workspaces', 'w4'), {
        name: 'X', description: '', ownerId: OWNER, roles: { [OWNER]: 'owner' }, memberIds: [OWNER], isDemo: false,
      }),
    );
  });

  it('members cannot promote themselves', async () => {
    await assertFails(updateDoc(doc(db(MEMBER), 'workspaces', W), { [`roles.${MEMBER}`]: 'admin' }));
  });

  it('admins can rename but not change roles', async () => {
    await assertSucceeds(updateDoc(doc(db(ADMIN), 'workspaces', W), { name: 'Acme Inc' }));
    await assertFails(updateDoc(doc(db(ADMIN), 'workspaces', W), { [`roles.${MEMBER}`]: 'admin' }));
  });

  it('owner can change roles but must keep roles and memberIds in sync', async () => {
    await assertSucceeds(updateDoc(doc(db(OWNER), 'workspaces', W), { [`roles.${MEMBER}`]: 'admin' }));
    await assertFails(updateDoc(doc(db(OWNER), 'workspaces', W), { [`roles.${STRANGER}`]: 'member' }));
  });

  it('members can leave; the owner cannot remove their own ownership', async () => {
    await assertSucceeds(
      updateDoc(doc(db(MEMBER), 'workspaces', W), {
        roles: { [OWNER]: 'owner', [ADMIN]: 'admin' },
        memberIds: [OWNER, ADMIN],
      }),
    );
    await assertFails(
      updateDoc(doc(db(OWNER), 'workspaces', W), {
        roles: { [ADMIN]: 'admin' },
        memberIds: [ADMIN],
      }),
    );
  });

  it('only the owner can delete the workspace', async () => {
    await assertFails(deleteDoc(doc(db(ADMIN), 'workspaces', W)));
    await assertSucceeds(deleteDoc(doc(db(OWNER), 'workspaces', W)));
  });
});

describe('invites', () => {
  const invitee = () => db(INVITEE, { email: 'new@example.com', email_verified: true });

  it('verified invitee can find their invite and join with the invited role', async () => {
    await assertSucceeds(getDocs(query(collectionGroup(invitee(), 'invites'), where('email', '==', 'new@example.com'))));
    await assertSucceeds(
      updateDoc(doc(invitee(), 'workspaces', W), {
        [`roles.${INVITEE}`]: 'member',
        memberIds: [OWNER, ADMIN, MEMBER, INVITEE],
      }),
    );
  });

  it('invitee cannot grant themselves a higher role', async () => {
    await assertFails(
      updateDoc(doc(invitee(), 'workspaces', W), { [`roles.${INVITEE}`]: 'admin', memberIds: [OWNER, ADMIN, MEMBER, INVITEE] }),
    );
  });

  it('unverified emails cannot accept invites', async () => {
    const unverified = db(INVITEE, { email: 'new@example.com', email_verified: false });
    await assertFails(
      updateDoc(doc(unverified, 'workspaces', W), { [`roles.${INVITEE}`]: 'member', memberIds: [OWNER, ADMIN, MEMBER, INVITEE] }),
    );
  });

  it('users without an invite cannot join', async () => {
    const other = db(STRANGER, { email: 'other@example.com', email_verified: true });
    await assertFails(
      updateDoc(doc(other, 'workspaces', W), { [`roles.${STRANGER}`]: 'member', memberIds: [OWNER, ADMIN, MEMBER, STRANGER] }),
    );
    await assertFails(getDocs(query(collectionGroup(other, 'invites'), where('email', '==', 'new@example.com'))));
  });

  it('only admins can create invites', async () => {
    const invite = { email: 'x@example.com', role: 'member', workspaceId: W, invitedBy: MEMBER };
    await assertFails(setDoc(doc(db(MEMBER), `workspaces/${W}/invites/x@example.com`), invite));
    await assertSucceeds(setDoc(doc(db(ADMIN), `workspaces/${W}/invites/x@example.com`), { ...invite, invitedBy: ADMIN }));
  });
});

describe('commitments: completion requires user confirmation', () => {
  it('members can create and update commitments', async () => {
    await assertSucceeds(setDoc(doc(db(MEMBER), `workspaces/${W}/commitments/c2`), commitment()));
    await assertSucceeds(updateDoc(doc(db(ADMIN), `workspaces/${W}/commitments/c1`), { status: 'in_progress' }));
  });

  it('cannot mark completed without a confirmation by the current user', async () => {
    await assertFails(updateDoc(doc(db(MEMBER), `workspaces/${W}/commitments/c1`), { status: 'completed' }));
    await assertFails(
      updateDoc(doc(db(MEMBER), `workspaces/${W}/commitments/c1`), {
        status: 'completed',
        completion: { method: 'ai_inferred', confirmedBy: MEMBER },
      }),
    );
    await assertFails(
      updateDoc(doc(db(MEMBER), `workspaces/${W}/commitments/c1`), {
        status: 'completed',
        completion: { method: 'user_confirmed', confirmedBy: ADMIN },
      }),
    );
    await assertSucceeds(
      updateDoc(doc(db(MEMBER), `workspaces/${W}/commitments/c1`), {
        status: 'completed',
        completion: { method: 'user_confirmed', confirmedBy: MEMBER },
      }),
    );
  });

  it('cannot create a commitment that is already completed by AI', async () => {
    await assertFails(setDoc(doc(db(MEMBER), `workspaces/${W}/commitments/c3`), commitment({ status: 'completed' })));
  });

  it('rejects invalid statuses and cross-workspace ids', async () => {
    await assertFails(setDoc(doc(db(MEMBER), `workspaces/${W}/commitments/c4`), commitment({ status: 'done' })));
    await assertFails(setDoc(doc(db(MEMBER), `workspaces/${W}/commitments/c5`), commitment({ workspaceId: 'other' })));
  });

  it('timeline events are append-only until their commitment is deleted', async () => {
    const ev = doc(db(MEMBER), `workspaces/${W}/commitments/c1/events/e1`);
    await assertSucceeds(setDoc(ev, { type: 'note', byUid: MEMBER }));
    await assertFails(setDoc(doc(db(MEMBER), `workspaces/${W}/commitments/c1/events/e2`), { type: 'note', byUid: OWNER }));
    await assertFails(updateDoc(ev, { type: 'status_changed' }));
    await assertFails(deleteDoc(ev));
    const fs = db(MEMBER);
    const batch = writeBatch(fs);
    batch.delete(doc(fs, `workspaces/${W}/commitments/c1/events/e1`));
    batch.delete(doc(fs, `workspaces/${W}/commitments/c1`));
    await assertSucceeds(batch.commit());
  });
});

describe('decisions', () => {
  const decision = { workspaceId: W, title: 'Launch to waitlist', status: 'needs_confirmation', confirmedBy: null, createdBy: MEMBER };

  it('confirmation can only be recorded in your own name', async () => {
    await assertSucceeds(setDoc(doc(db(MEMBER), `workspaces/${W}/decisions/d1`), decision));
    await assertFails(updateDoc(doc(db(MEMBER), `workspaces/${W}/decisions/d1`), { status: 'active', confirmedBy: OWNER }));
    await assertSucceeds(updateDoc(doc(db(MEMBER), `workspaces/${W}/decisions/d1`), { status: 'active', confirmedBy: MEMBER }));
  });
});

describe('meeting content', () => {
  it('members can write transcripts and segments; strangers cannot', async () => {
    await assertSucceeds(setDoc(doc(db(MEMBER), `workspaces/${W}/meetings/m1/content/transcript`), { text: 'hello' }));
    await assertSucceeds(setDoc(doc(db(MEMBER), `workspaces/${W}/meetings/m1/segments/s1`), { text: 'hello', index: 0 }));
    await assertFails(getDoc(doc(db(STRANGER), `workspaces/${W}/meetings/m1/content/transcript`)));
  });

  it('only the creator or an admin can delete a meeting', async () => {
    await assertFails(deleteDoc(doc(db(STRANGER), `workspaces/${W}/meetings/m1`)));
    await assertSucceeds(deleteDoc(doc(db(MEMBER), `workspaces/${W}/meetings/m1`)));
  });

  it('activity is append-only and attributed to the actor', async () => {
    await assertSucceeds(setDoc(doc(db(MEMBER), `workspaces/${W}/activity/a1`), { actorUid: MEMBER, message: 'hi' }));
    await assertFails(setDoc(doc(db(MEMBER), `workspaces/${W}/activity/a2`), { actorUid: OWNER, message: 'hi' }));
    await assertFails(updateDoc(doc(db(MEMBER), `workspaces/${W}/activity/a1`), { message: 'edited' }));
  });
});
