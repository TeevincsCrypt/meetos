/**
 * Demo workspace seeding. Creates a workspace flagged `isDemo` containing the
 * SAMPLE transcripts from @meetos/shared. No AI results are pre-filled: the
 * user runs analysis themselves, so everything shown is produced for real.
 */
import { SAMPLE_MEETINGS, SAMPLE_KICKOFF } from '@meetos/shared';
import { serverTimestamp, Timestamp, updateDoc } from 'firebase/firestore';
import { createWorkspace, type AuthUserLike } from '@/data/workspaces';
import { createMeeting, saveTranscript } from '@/data/meetings';
import { wsItem } from '@/data/db';
import type { Actor } from '@/data/activity';

const DAY = 86_400_000;

export async function createDemoWorkspace(user: AuthUserLike, actor: Actor): Promise<string> {
  const wid = await createWorkspace(user, {
    name: 'Lumen demo (sample data)',
    description: 'A demo workspace with fictional sample meetings. Safe to delete.',
    isDemo: true,
  });
  await seedSampleMeetings(wid, actor);
  return wid;
}

export async function seedSampleMeetings(wid: string, actor: Actor) {
  const now = Date.now();
  for (const s of SAMPLE_MEETINGS) {
    const at = now + s.dayOffset * DAY;
    const id = await createMeeting(wid, actor, {
      title: s.title,
      description: s.description,
      projectId: null,
      participants: s.participants.map((name) => ({ name })),
      scheduledAt: at,
      isSample: true,
    });
    await updateDoc(wsItem(wid, 'meetings', id), { startedAt: Timestamp.fromMillis(at), updatedAt: serverTimestamp() });
    await saveTranscript(wid, actor, { id, title: s.title, status: 'scheduled', startedAt: at }, s.transcript, 'sample');
  }
  await createMeeting(wid, actor, {
    title: 'Beta launch review (sample)',
    description: 'SAMPLE DATA — upcoming meeting. Use "Prepare" to generate a briefing from the earlier sample meetings.',
    projectId: null,
    participants: SAMPLE_KICKOFF.participants.map((name) => ({ name })),
    scheduledAt: now + 2 * DAY,
    isSample: true,
  });
}
