/**
 * MEETOS shared domain model.
 *
 * All timestamps in the domain model are epoch milliseconds (number). The
 * Firestore data layers (web + Android) convert to/from Firestore Timestamps.
 * The Android app mirrors these shapes in Kotlin (see apps/android/.../model).
 */

export type Role = 'owner' | 'admin' | 'member';

export type CommitmentStatus = 'open' | 'in_progress' | 'completed' | 'blocked' | 'cancelled';
export const COMMITMENT_STATUSES: CommitmentStatus[] = [
  'open',
  'in_progress',
  'completed',
  'blocked',
  'cancelled',
];
export const ACTIVE_COMMITMENT_STATUSES: CommitmentStatus[] = ['open', 'in_progress', 'blocked'];

export type Priority = 'low' | 'medium' | 'high';
export const PRIORITIES: Priority[] = ['low', 'medium', 'high'];

/** `needs_confirmation` = the transcript only shows a tentative agreement. */
export type DecisionStatus = 'active' | 'needs_confirmation' | 'superseded' | 'reversed';
export type QuestionStatus = 'open' | 'resolved';

/**
 * Where an AI result actually came from. These values are only ever set from
 * the SDK's reported `inferenceSource` (plus our own record of whether we had
 * to retry in the cloud after an on-device failure). Never inferred from
 * network state.
 */
export type InferenceSourceLabel = 'on_device' | 'in_cloud' | 'cloud_fallback';

export type TranscriptSource =
  | 'web_speech'
  | 'android_speech'
  | 'paste'
  | 'upload'
  | 'sample';

export type MeetingStatus = 'scheduled' | 'live' | 'captured' | 'analyzing' | 'analyzed' | 'analysis_failed';

export type ItemOrigin = 'ai' | 'manual';

export interface Participant {
  name: string;
  email?: string | null;
  uid?: string | null;
}

export interface Evidence {
  meetingId: string;
  meetingTitle?: string | null;
  quote: string;
  speaker?: string | null;
}

export interface Workspace {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  roles: Record<string, Role>;
  memberIds: string[];
  isDemo: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Member {
  uid: string;
  role: Role;
  displayName: string;
  email: string | null;
  photoURL: string | null;
  joinedAt: number;
}

export interface Invite {
  email: string;
  role: Exclude<Role, 'owner'>;
  workspaceId: string;
  workspaceName: string;
  invitedBy: string;
  invitedByName: string;
  createdAt: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  archived: boolean;
  createdAt: number;
  createdBy: string;
}

export interface Topic {
  name: string;
  evidence: string;
}

export interface Risk {
  description: string;
  kind: 'risk' | 'blocker';
  evidence: Evidence;
}

export interface AnalysisRun {
  status: 'running' | 'succeeded' | 'partial' | 'failed';
  startedAt: number;
  finishedAt: number | null;
  chunkCount: number;
  chunksOnDevice: number;
  chunksInCloud: number;
  chunksCloudFallback: number;
  chunksFailed: number;
  /** Items the model returned whose evidence could not be found in the transcript. */
  discardedUngrounded: number;
  inferenceMode: string;
  cloudModel: string | null;
  /** On-device model name as reported by the device (Android), when any part ran on-device. */
  onDeviceModel?: string | null;
  error: string | null;
}

export interface AgendaItem {
  id: string;
  title: string;
  detail: string;
  minutes: number | null;
  /** IDs of commitments/decisions/questions this item came from. */
  refs: string[];
}

export interface Meeting {
  id: string;
  workspaceId: string;
  title: string;
  description: string;
  projectId: string | null;
  participants: Participant[];
  scheduledAt: number | null;
  startedAt: number | null;
  endedAt: number | null;
  status: MeetingStatus;
  archived: boolean;
  transcriptSource: TranscriptSource | null;
  transcriptChars: number;
  summary: string;
  topics: Topic[];
  discussionPoints: string[];
  risks: Risk[];
  followUps: string[];
  analysis: AnalysisRun | null;
  agenda: AgendaItem[] | null;
  agendaUpdatedAt: number | null;
  isSample: boolean;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

export interface CompletionRecord {
  method: 'user_confirmed';
  confirmedBy: string;
  confirmedByName: string | null;
  at: number;
  /** Transcript evidence the user accepted when confirming, if any. */
  evidence: Evidence | null;
}

export interface Commitment {
  id: string;
  workspaceId: string;
  description: string;
  ownerName: string | null;
  /** Normalised owner name used for filtering ("maya chen"). */
  ownerKey: string | null;
  deadline: number | null;
  /** Deadline phrase as it was stated ("before Friday"). */
  deadlineText: string | null;
  originalDeadline: number | null;
  deadlineChangeCount: number;
  priority: Priority;
  status: CommitmentStatus;
  originMeetingId: string;
  originMeetingTitle: string;
  /** Meetings (other than the origin) where this commitment came up again. */
  relatedMeetingIds: string[];
  /** origin + related; used for array-contains queries. */
  meetingIds: string[];
  evidence: Evidence[];
  projectId: string | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  completion: CompletionRecord | null;
  /** A later transcript claims this is done. Requires user confirmation. */
  pendingCompletion: { evidence: Evidence; suggestedAt: number } | null;
  lastMentionedAt: number | null;
  mentionCount: number;
  origin: ItemOrigin;
  inferenceSource: InferenceSourceLabel | null;
  editedByUser: boolean;
  createdBy: string;
}

export type CommitmentEventType =
  | 'created'
  | 'status_changed'
  | 'deadline_changed'
  | 'owner_changed'
  | 'mentioned'
  | 'progress_reported'
  | 'blocker_reported'
  | 'completion_suggested'
  | 'completion_confirmed'
  | 'completion_rejected'
  | 'note';

export interface CommitmentEvent {
  id: string;
  type: CommitmentEventType;
  at: number;
  byUid: string | null;
  byName: string | null;
  meetingId: string | null;
  meetingTitle: string | null;
  quote: string | null;
  from: string | null;
  to: string | null;
  note: string | null;
  origin: ItemOrigin;
}

export interface Decision {
  id: string;
  workspaceId: string;
  title: string;
  description: string;
  meetingId: string;
  meetingTitle: string;
  decidedAt: number;
  /** People named in the transcript as making/agreeing to it. Never invented. */
  participants: string[];
  evidence: Evidence[];
  alternatives: string[];
  status: DecisionStatus;
  supersededBy: string | null;
  supersedes: string | null;
  relatedDecisionIds: string[];
  projectId: string | null;
  confirmedBy: string | null;
  confirmedByName: string | null;
  origin: ItemOrigin;
  inferenceSource: InferenceSourceLabel | null;
  editedByUser: boolean;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

export interface Question {
  id: string;
  workspaceId: string;
  text: string;
  askedBy: string | null;
  meetingId: string;
  meetingTitle: string;
  evidence: Evidence[];
  status: QuestionStatus;
  answer: string | null;
  resolvedAt: number | null;
  projectId: string | null;
  origin: ItemOrigin;
  inferenceSource: InferenceSourceLabel | null;
  editedByUser: boolean;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

export type ActivityType =
  | 'workspace_created'
  | 'member_joined'
  | 'meeting_created'
  | 'meeting_updated'
  | 'meeting_archived'
  | 'meeting_deleted'
  | 'transcript_saved'
  | 'analysis_completed'
  | 'analysis_failed'
  | 'commitment_created'
  | 'commitment_updated'
  | 'commitment_completed'
  | 'decision_created'
  | 'decision_updated'
  | 'question_resolved'
  | 'agenda_saved';

export interface Activity {
  id: string;
  type: ActivityType;
  actorUid: string;
  actorName: string;
  message: string;
  meetingId: string | null;
  entityId: string | null;
  createdAt: number;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string | null;
  photoURL: string | null;
  lastWorkspaceId: string | null;
  createdAt: number;
}
