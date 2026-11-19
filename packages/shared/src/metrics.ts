/**
 * Execution analytics, the Daily Brief facts and meeting-prep context. All
 * computed from stored workspace records; nothing here is estimated.
 */
import { ACTIVE_COMMITMENT_STATUSES, type Commitment, type Decision, type Meeting, type Question, type Risk } from './types';
import { personKey } from './text';

const DAY = 86_400_000;

export function isOverdue(c: Pick<Commitment, 'deadline' | 'status'>, now = Date.now()): boolean {
  return !!c.deadline && c.deadline < now && ACTIVE_COMMITMENT_STATUSES.includes(c.status);
}

export function isActive(c: Pick<Commitment, 'status'>): boolean {
  return ACTIVE_COMMITMENT_STATUSES.includes(c.status);
}

export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export interface ExecutionFilter {
  from?: number | null;
  to?: number | null;
  ownerKey?: string | null;
  projectId?: string | null;
}

export interface ExecutionMetrics {
  created: number;
  completed: number;
  open: number;
  inProgress: number;
  blocked: number;
  cancelled: number;
  overdue: number;
  /** null when no commitments are eligible (avoids a misleading 0%). */
  completionRate: number | null;
  /** null when fewer than MIN_COMPLETIONS_FOR_AVG completions exist. */
  avgDaysToComplete: number | null;
  completedForAvg: number;
  postponed: Commitment[];
  stale: Commitment[];
  byOwner: { owner: string; open: number; overdue: number; completed: number; total: number }[];
  weekly: { weekStart: number; created: number; completed: number }[];
}

export const MIN_COMPLETIONS_FOR_AVG = 3;

export function filterCommitments(commitments: Commitment[], f: ExecutionFilter): Commitment[] {
  return commitments.filter(
    (c) =>
      (!f.from || c.createdAt >= f.from) &&
      (!f.to || c.createdAt <= f.to) &&
      (!f.ownerKey || c.ownerKey === f.ownerKey) &&
      (!f.projectId || c.projectId === f.projectId),
  );
}

function weekStart(ms: number): number {
  const d = new Date(startOfDay(ms));
  const day = (d.getDay() + 6) % 7; // Monday start
  d.setDate(d.getDate() - day);
  return d.getTime();
}

export function computeExecutionMetrics(all: Commitment[], f: ExecutionFilter = {}, now = Date.now()): ExecutionMetrics {
  const cs = filterCommitments(all, f);
  const count = (s: Commitment['status']) => cs.filter((c) => c.status === s).length;
  const completedList = cs.filter((c) => c.status === 'completed' && c.completedAt);
  const eligible = cs.filter((c) => c.status !== 'cancelled').length;
  const durations = completedList.map((c) => ((c.completedAt as number) - c.createdAt) / DAY).filter((d) => d >= 0);

  const owners = new Map<string, ExecutionMetrics['byOwner'][number]>();
  for (const c of cs) {
    const name = c.ownerName ?? 'Unassigned';
    const row = owners.get(name) ?? { owner: name, open: 0, overdue: 0, completed: 0, total: 0 };
    row.total++;
    if (isActive(c)) row.open++;
    if (isOverdue(c, now)) row.overdue++;
    if (c.status === 'completed') row.completed++;
    owners.set(name, row);
  }

  const weeks = new Map<number, { weekStart: number; created: number; completed: number }>();
  const bump = (ms: number, key: 'created' | 'completed') => {
    const w = weekStart(ms);
    const row = weeks.get(w) ?? { weekStart: w, created: 0, completed: 0 };
    row[key]++;
    weeks.set(w, row);
  };
  for (const c of cs) {
    bump(c.createdAt, 'created');
    if (c.completedAt) bump(c.completedAt, 'completed');
  }

  return {
    created: cs.length,
    completed: count('completed'),
    open: count('open'),
    inProgress: count('in_progress'),
    blocked: count('blocked'),
    cancelled: count('cancelled'),
    overdue: cs.filter((c) => isOverdue(c, now)).length,
    completionRate: eligible ? count('completed') / eligible : null,
    avgDaysToComplete:
      durations.length >= MIN_COMPLETIONS_FOR_AVG ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
    completedForAvg: durations.length,
    postponed: cs.filter((c) => c.deadlineChangeCount >= 2 && isActive(c)).sort((a, b) => b.deadlineChangeCount - a.deadlineChangeCount),
    stale: cs
      .filter((c) => isActive(c) && now - (c.lastMentionedAt ?? c.createdAt) > 14 * DAY)
      .sort((a, b) => (a.lastMentionedAt ?? a.createdAt) - (b.lastMentionedAt ?? b.createdAt)),
    byOwner: [...owners.values()].sort((a, b) => b.open - a.open || b.total - a.total),
    weekly: [...weeks.values()].sort((a, b) => a.weekStart - b.weekStart),
  };
}

// ------------------------------------------------------------------ Daily Brief

export interface DailyBriefFacts {
  dueToday: Commitment[];
  overdue: Commitment[];
  blocked: Commitment[];
  pendingCompletion: Commitment[];
  recentDecisions: Decision[];
  needsConfirmation: Decision[];
  openQuestions: Question[];
  upcomingMeetings: Meeting[];
  blockers: { meeting: Meeting; risk: Risk }[];
  isEmpty: boolean;
}

export function computeDailyBrief(
  data: { commitments: Commitment[]; decisions: Decision[]; questions: Question[]; meetings: Meeting[] },
  now = Date.now(),
): DailyBriefFacts {
  const today = startOfDay(now);
  const tomorrow = today + DAY;
  const active = data.commitments.filter(isActive);
  const liveMeetings = data.meetings.filter((m) => !m.archived);
  const recentMeetings = liveMeetings
    .filter((m) => (m.startedAt ?? m.createdAt) >= now - 14 * DAY)
    .sort((a, b) => (b.startedAt ?? b.createdAt) - (a.startedAt ?? a.createdAt));
  const facts: DailyBriefFacts = {
    dueToday: active.filter((c) => c.deadline && c.deadline >= today && c.deadline < tomorrow),
    overdue: active.filter((c) => isOverdue(c, today)).sort((a, b) => (a.deadline ?? 0) - (b.deadline ?? 0)),
    blocked: active.filter((c) => c.status === 'blocked'),
    pendingCompletion: active.filter((c) => c.pendingCompletion),
    recentDecisions: data.decisions
      .filter((d) => d.decidedAt >= now - 7 * DAY && d.status !== 'superseded')
      .sort((a, b) => b.decidedAt - a.decidedAt),
    needsConfirmation: data.decisions.filter((d) => d.status === 'needs_confirmation'),
    openQuestions: data.questions.filter((q) => q.status === 'open').sort((a, b) => b.createdAt - a.createdAt),
    upcomingMeetings: liveMeetings
      .filter((m) => m.status === 'scheduled' && m.scheduledAt && m.scheduledAt >= now - 3_600_000)
      .sort((a, b) => (a.scheduledAt ?? 0) - (b.scheduledAt ?? 0)),
    blockers: recentMeetings.flatMap((m) => m.risks.filter((r) => r.kind === 'blocker').map((risk) => ({ meeting: m, risk }))),
    isEmpty: false,
  };
  facts.isEmpty =
    !facts.dueToday.length &&
    !facts.overdue.length &&
    !facts.blocked.length &&
    !facts.pendingCompletion.length &&
    !facts.recentDecisions.length &&
    !facts.needsConfirmation.length &&
    !facts.openQuestions.length &&
    !facts.upcomingMeetings.length &&
    !facts.blockers.length;
  return facts;
}

const d10 = (ms: number | null) => (ms ? new Date(ms).toDateString() : 'no deadline');

/** Plain-text facts block given to the model for the optional narrative. */
export function briefFactsBlock(f: DailyBriefFacts): string {
  const lines: string[] = [];
  for (const c of f.overdue.slice(0, 6)) lines.push(`OVERDUE: "${c.description}" owner ${c.ownerName ?? 'unassigned'}, was due ${d10(c.deadline)}`);
  for (const c of f.dueToday.slice(0, 6)) lines.push(`DUE TODAY: "${c.description}" owner ${c.ownerName ?? 'unassigned'}`);
  for (const c of f.blocked.slice(0, 4)) lines.push(`BLOCKED: "${c.description}" owner ${c.ownerName ?? 'unassigned'}`);
  for (const c of f.pendingCompletion.slice(0, 4)) lines.push(`REPORTED DONE, NEEDS CONFIRMATION: "${c.description}"`);
  for (const d of f.needsConfirmation.slice(0, 4)) lines.push(`DECISION NEEDS CONFIRMATION: "${d.title}" from ${d.meetingTitle}`);
  for (const d of f.recentDecisions.slice(0, 4)) lines.push(`RECENT DECISION: "${d.title}" (${d10(d.decidedAt)})`);
  for (const q of f.openQuestions.slice(0, 4)) lines.push(`OPEN QUESTION: "${q.text}" from ${q.meetingTitle}`);
  for (const m of f.upcomingMeetings.slice(0, 3)) lines.push(`UPCOMING MEETING: "${m.title}" on ${d10(m.scheduledAt)}`);
  for (const b of f.blockers.slice(0, 3)) lines.push(`BLOCKER from ${b.meeting.title}: ${b.risk.description}`);
  return lines.join('\n');
}

// ------------------------------------------------------------------ Meeting prep

export interface PrepContext {
  previousMeetings: Meeting[];
  outstanding: Commitment[];
  overdue: Commitment[];
  decisionsSince: Decision[];
  openQuestions: Question[];
  blockers: { meeting: Meeting; risk: Risk }[];
  /** Fact ids -> text, used both for the prompt and to resolve agenda refs. */
  facts: Map<string, { label: string; text: string; kind: 'commitment' | 'decision' | 'question' | 'meeting' | 'blocker'; entityId: string }>;
}

/**
 * Pick the context relevant to an upcoming meeting: earlier meetings in the
 * same project or with overlapping participants, plus everything still open.
 */
export function computePrepContext(
  target: Meeting,
  data: { meetings: Meeting[]; commitments: Commitment[]; decisions: Decision[]; questions: Question[] },
  now = Date.now(),
): PrepContext {
  const targetTime = target.scheduledAt ?? now;
  const people = new Set(target.participants.map((p) => personKey(p.name)).filter(Boolean) as string[]);
  const related = (m: Meeting) =>
    m.id !== target.id &&
    !m.archived &&
    (m.startedAt ?? m.scheduledAt ?? m.createdAt) <= targetTime &&
    m.status !== 'scheduled' &&
    ((target.projectId && m.projectId === target.projectId) ||
      m.participants.some((p) => people.has(personKey(p.name) ?? '')) ||
      (!target.projectId && people.size === 0));
  const previousMeetings = data.meetings
    .filter(related)
    .sort((a, b) => (b.startedAt ?? b.createdAt) - (a.startedAt ?? a.createdAt))
    .slice(0, 5);
  const prevIds = new Set(previousMeetings.map((m) => m.id));
  const lastTime = previousMeetings[0] ? previousMeetings[0].startedAt ?? previousMeetings[0].createdAt : 0;
  const inScope = (meetingIds: string[], projectId: string | null) =>
    meetingIds.some((id) => prevIds.has(id)) || (!!target.projectId && projectId === target.projectId);

  const outstanding = data.commitments
    .filter((c) => isActive(c) && inScope(c.meetingIds, c.projectId))
    .sort((a, b) => (a.deadline ?? Infinity) - (b.deadline ?? Infinity));
  const overdue = outstanding.filter((c) => isOverdue(c, now));
  const decisionsSince = data.decisions
    .filter((d) => inScope([d.meetingId], d.projectId) && (d.decidedAt >= lastTime - DAY || d.status === 'needs_confirmation'))
    .sort((a, b) => b.decidedAt - a.decidedAt);
  const openQuestions = data.questions.filter((q) => q.status === 'open' && inScope([q.meetingId], q.projectId));
  const blockers = previousMeetings.flatMap((m) => m.risks.filter((r) => r.kind === 'blocker').map((risk) => ({ meeting: m, risk })));

  const facts: PrepContext['facts'] = new Map();
  previousMeetings.forEach((m, i) =>
    facts.set(`M${i + 1}`, { kind: 'meeting', entityId: m.id, label: m.title, text: `Previous meeting "${m.title}" (${d10(m.startedAt ?? m.createdAt)}): ${m.summary || 'no summary yet'}` }),
  );
  outstanding.slice(0, 15).forEach((c, i) =>
    facts.set(`C${i + 1}`, {
      kind: 'commitment',
      entityId: c.id,
      label: c.description,
      text: `Commitment "${c.description}" — owner ${c.ownerName ?? 'unassigned'}, status ${c.status.replace('_', ' ')}, ${
        c.deadline ? `due ${d10(c.deadline)}${isOverdue(c, now) ? ' (OVERDUE)' : ''}` : 'no deadline'
      }${c.deadlineChangeCount ? `, deadline moved ${c.deadlineChangeCount}x` : ''}${c.pendingCompletion ? ', reported done but not confirmed' : ''}`,
    }),
  );
  decisionsSince.slice(0, 10).forEach((d, i) =>
    facts.set(`D${i + 1}`, { kind: 'decision', entityId: d.id, label: d.title, text: `Decision "${d.title}" (${d.status.replace('_', ' ')}) from "${d.meetingTitle}"` }),
  );
  openQuestions.slice(0, 10).forEach((q, i) =>
    facts.set(`Q${i + 1}`, { kind: 'question', entityId: q.id, label: q.text, text: `Unresolved question: "${q.text}" (from "${q.meetingTitle}")` }),
  );
  blockers.slice(0, 6).forEach((b, i) =>
    facts.set(`B${i + 1}`, { kind: 'blocker', entityId: b.meeting.id, label: b.risk.description, text: `Blocker raised in "${b.meeting.title}": ${b.risk.description}` }),
  );
  return { previousMeetings, outstanding, overdue, decisionsSince, openQuestions, blockers, facts };
}

export function prepFactsBlock(ctx: PrepContext): string {
  return [...ctx.facts.entries()].map(([id, f]) => `${id}: ${f.text}`).join('\n');
}

/**
 * Deterministic agenda used when AI is unavailable or disabled. Clearly
 * labelled in the UI as rule-based.
 */
export function ruleBasedAgenda(ctx: PrepContext): { title: string; detail: string; minutes: number; refs: string[] }[] {
  const items: { title: string; detail: string; minutes: number; refs: string[] }[] = [];
  const refOf = (kind: string, id: string) => [...ctx.facts.entries()].find(([, f]) => f.kind === kind && f.entityId === id)?.[0];
  if (ctx.previousMeetings[0]) {
    items.push({ title: 'Recap of last meeting', detail: ctx.previousMeetings[0].title, minutes: 5, refs: ['M1'] });
  }
  if (ctx.overdue.length) {
    items.push({
      title: 'Overdue commitments',
      detail: ctx.overdue.slice(0, 4).map((c) => `${c.description} (${c.ownerName ?? 'unassigned'})`).join('; '),
      minutes: 10,
      refs: ctx.overdue.map((c) => refOf('commitment', c.id)).filter(Boolean) as string[],
    });
  }
  const blocked = ctx.outstanding.filter((c) => c.status === 'blocked');
  if (blocked.length || ctx.blockers.length) {
    items.push({
      title: 'Unblock stuck work',
      detail: [...blocked.map((c) => c.description), ...ctx.blockers.map((b) => b.risk.description)].slice(0, 4).join('; '),
      minutes: 10,
      refs: [...blocked.map((c) => refOf('commitment', c.id)), ...ctx.blockers.map((_, i) => `B${i + 1}`)].filter(Boolean) as string[],
    });
  }
  const unconfirmed = ctx.decisionsSince.filter((d) => d.status === 'needs_confirmation');
  if (unconfirmed.length) {
    items.push({
      title: 'Confirm tentative decisions',
      detail: unconfirmed.map((d) => d.title).join('; '),
      minutes: 5,
      refs: unconfirmed.map((d) => refOf('decision', d.id)).filter(Boolean) as string[],
    });
  }
  if (ctx.openQuestions.length) {
    items.push({
      title: 'Resolve open questions',
      detail: ctx.openQuestions.slice(0, 4).map((q) => q.text).join('; '),
      minutes: 10,
      refs: ctx.openQuestions.map((q) => refOf('question', q.id)).filter(Boolean) as string[],
    });
  }
  const remaining = ctx.outstanding.filter((c) => !ctx.overdue.includes(c) && c.status !== 'blocked');
  if (remaining.length) {
    items.push({
      title: 'Progress check on open commitments',
      detail: remaining.slice(0, 5).map((c) => `${c.description} (${c.ownerName ?? 'unassigned'})`).join('; '),
      minutes: 10,
      refs: remaining.map((c) => refOf('commitment', c.id)).filter(Boolean) as string[],
    });
  }
  return items;
}
