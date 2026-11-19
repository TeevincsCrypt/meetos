import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  Activity as ActivityIcon,
  AlertTriangle,
  ArrowRight,
  Beaker,
  CalendarClock,
  CheckCircle2,
  CircleHelp,
  ClipboardList,
  Gavel,
  Handshake,
  Mic,
  Plus,
  Sparkles,
  Sun,
  Video,
} from 'lucide-react';
import {
  briefFactsBlock,
  briefNarrativeJsonSchema,
  briefNarrativeSchema,
  buildBriefPrompt,
  computeDailyBrief,
  isActive,
  isOverdue,
  type Activity,
  type BriefNarrativeOutput,
  type InferenceSourceLabel,
} from '@meetos/shared';
import { useSession } from '@/state/auth';
import { useWs } from '@/state/workspace';
import { listenActivity } from '@/data/activity';
import { runStructured } from '@/lib/ai/hybrid';
import { seedSampleMeetings } from '@/lib/demo';
import { fmtDate, fmtDateTime, fmtRelative } from '@/lib/format';
import { Avatar, Badge, Button, ButtonLink, Card, CardHeader, EmptyState, ErrorNote, PageHeader, Skeleton, Stat } from '@/components/ui';
import { DecisionStatusBadge, DueLabel, InferenceBadge, SampleBadge } from '@/components/domain';
import { MeetingStatusBadge } from './Meetings';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function BriefSection({ title, icon: Icon, tone, children, empty }: { title: string; icon: typeof Sun; tone: string; children: React.ReactNode; empty?: boolean }) {
  if (empty) return null;
  return (
    <div>
      <h4 className={`mb-2 flex items-center gap-1.5 text-[12px] font-semibold tracking-wide uppercase ${tone}`}>
        <Icon className="size-3.5" aria-hidden /> {title}
      </h4>
      <ul className="space-y-1.5">{children}</ul>
    </div>
  );
}

function DailyBrief() {
  const { commitments, decisions, questions, meetings } = useWs();
  const facts = useMemo(() => computeDailyBrief({ commitments, decisions, questions, meetings }), [commitments, decisions, questions, meetings]);
  const [narrative, setNarrative] = useState<{ data: BriefNarrativeOutput; source: InferenceSourceLabel; detail: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attention = [...facts.overdue, ...facts.dueToday.filter((c) => !facts.overdue.includes(c))];

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const r = await runStructured({
        name: 'daily-brief',
        kind: 'extract',
        jsonSchema: briefNarrativeJsonSchema,
        schema: briefNarrativeSchema,
        prompt: buildBriefPrompt(briefFactsBlock(facts), new Date().toDateString()),
      });
      setNarrative(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate the brief.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        icon={Sun}
        title="MEETOS Daily Brief"
        subtitle={`Built from your workspace data · ${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}`}
        action={
          !facts.isEmpty && (
            <Button size="sm" variant="ghost" icon={Sparkles} loading={busy} onClick={generate}>
              {narrative ? 'Regenerate' : 'AI summary'}
            </Button>
          )
        }
      />
      <div className="space-y-5 px-5 pb-5">
        {narrative && (
          <div className="rounded-lg border border-line bg-surface-2/60 p-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[13.5px] font-medium text-fg">{narrative.data.headline}</p>
              <InferenceBadge source={narrative.source} detail={narrative.detail} />
            </div>
            {narrative.data.bullets.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-fg-2">
                {narrative.data.bullets.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            )}
            <p className="mt-2 text-[11.5px] text-fg-3">AI wording of the facts below. Check the items themselves before acting.</p>
          </div>
        )}
        {error && <ErrorNote>{error}</ErrorNote>}

        {facts.isEmpty ? (
          <p className="text-[13px] text-fg-3">Nothing needs attention right now. Analysed meetings will populate this brief with overdue work, recent decisions and open questions.</p>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <BriefSection title="Needs attention today" icon={AlertTriangle} tone="text-danger" empty={!attention.length && !facts.pendingCompletion.length && !facts.blocked.length}>
              {attention.slice(0, 5).map((c) => (
                <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-x-3 text-[13px]">
                  <Link to={`/app/commitments/${c.id}`} className="min-w-0 max-w-full truncate text-fg hover:underline">{c.description}</Link>
                  <span className="flex shrink-0 items-center gap-2 text-[12px] text-fg-3">{c.ownerName ?? 'Unassigned'} · <DueLabel c={c} /></span>
                </li>
              ))}
              {facts.blocked.slice(0, 3).map((c) => (
                <li key={c.id} className="text-[13px]"><Badge tone="warning">Blocked</Badge> <Link to={`/app/commitments/${c.id}`} className="text-fg hover:underline">{c.description}</Link></li>
              ))}
              {facts.pendingCompletion.slice(0, 3).map((c) => (
                <li key={c.id} className="text-[13px]"><Badge tone="device">Reported done</Badge> <Link to={`/app/commitments/${c.id}`} className="text-fg hover:underline">{c.description}</Link> <span className="text-fg-3">— confirm?</span></li>
              ))}
            </BriefSection>
            <BriefSection title="Agreed recently" icon={Gavel} tone="text-brand-text" empty={!facts.recentDecisions.length}>
              {facts.recentDecisions.slice(0, 4).map((d) => (
                <li key={d.id} className="flex items-baseline justify-between gap-3 text-[13px]">
                  <Link to={`/app/decisions?d=${d.id}`} className="min-w-0 truncate text-fg hover:underline">{d.title}</Link>
                  <span className="shrink-0 text-[12px] text-fg-3">{fmtDate(d.decidedAt)}</span>
                </li>
              ))}
            </BriefSection>
            <BriefSection title="Decisions to confirm" icon={CheckCircle2} tone="text-warning" empty={!facts.needsConfirmation.length}>
              {facts.needsConfirmation.slice(0, 4).map((d) => (
                <li key={d.id} className="text-[13px]">
                  <Link to={`/app/decisions?d=${d.id}`} className="text-fg hover:underline">{d.title}</Link> <span className="text-[12px] text-fg-3">· {d.meetingTitle}</span>
                </li>
              ))}
            </BriefSection>
            <BriefSection title="For the next meeting" icon={ClipboardList} tone="text-info" empty={!facts.openQuestions.length && !facts.blockers.length && !facts.upcomingMeetings.length}>
              {facts.upcomingMeetings.slice(0, 1).map((m) => (
                <li key={m.id} className="text-[13px]">
                  <Link to={`/app/prepare?meeting=${m.id}`} className="font-medium text-brand-text hover:underline">Prepare for “{m.title}”</Link> <span className="text-[12px] text-fg-3">{fmtDateTime(m.scheduledAt)}</span>
                </li>
              ))}
              {facts.openQuestions.slice(0, 3).map((q) => (
                <li key={q.id} className="text-[13px] text-fg-2"><CircleHelp className="mr-1 inline size-3.5 text-fg-3" aria-hidden />{q.text}</li>
              ))}
              {facts.blockers.slice(0, 2).map((b, i) => (
                <li key={i} className="text-[13px] text-fg-2"><AlertTriangle className="mr-1 inline size-3.5 text-warning" aria-hidden />{b.risk.description}</li>
              ))}
            </BriefSection>
          </div>
        )}
      </div>
    </Card>
  );
}

function RecentActivity() {
  const { wid } = useWs();
  const [items, setItems] = useState<Activity[] | null>(null);
  useEffect(() => listenActivity(wid, 12, setItems), [wid]);
  return (
    <Card>
      <CardHeader icon={ActivityIcon} title="Recent activity" />
      {items === null ? (
        <div className="space-y-2 px-5 pb-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-4 w-full" />)}</div>
      ) : items.length === 0 ? (
        <p className="px-5 pb-5 text-[13px] text-fg-3">No activity yet.</p>
      ) : (
        <ul className="space-y-3 px-5 pb-5">
          {items.map((a) => (
            <li key={a.id} className="flex gap-2.5 text-[13px]">
              <Avatar name={a.actorName} size={22} />
              <div className="min-w-0">
                <span className="font-medium text-fg">{a.actorName}</span> <span className="text-fg-2">{a.message}</span>
                <div className="text-[11.5px] text-fg-3">{fmtRelative(a.createdAt)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function DashboardPage() {
  const { profile, actor } = useSession();
  const { ready, meetings, commitments, decisions, questions, wid, workspace } = useWs();
  const navigate = useNavigate();
  const [seeding, setSeeding] = useState(false);

  const live = meetings.filter((m) => !m.archived);
  const upcoming = live.filter((m) => m.status === 'scheduled' && m.scheduledAt && m.scheduledAt > Date.now() - 3_600_000);
  const open = commitments.filter(isActive);
  const overdue = commitments.filter((c) => isOverdue(c));
  const recent = live.filter((m) => m.status !== 'scheduled').slice(0, 6);
  const openQuestions = questions.filter((q) => q.status === 'open');
  const firstName = (profile?.displayName ?? '').split(' ')[0];

  if (!ready) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20" />)}</div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const header = (
    <PageHeader
      eyebrow={new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
      title={`${greeting()}${firstName ? `, ${firstName}` : ''}`}
      description={workspace.isDemo ? <span className="inline-flex items-center gap-2">This is a demo workspace <SampleBadge /></span> : undefined}
      actions={
        <>
          <Button icon={Plus} onClick={() => navigate('/app/meetings/new')}>New meeting</Button>
          <Button variant="primary" icon={Mic} onClick={() => navigate('/app/meetings/new?live=1')}>Start a meeting</Button>
        </>
      }
    />
  );

  if (meetings.length === 0) {
    return (
      <div>
        {header}
        <Card>
          <EmptyState
            icon={Video}
            title="Your first meeting starts here"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="primary" icon={Mic} onClick={() => navigate('/app/meetings/new?live=1')}>Record a meeting</Button>
                <Button icon={Plus} onClick={() => navigate('/app/meetings/new')}>Import a transcript</Button>
                <Button
                  variant="ghost"
                  icon={Beaker}
                  loading={seeding}
                  onClick={async () => {
                    setSeeding(true);
                    try {
                      await seedSampleMeetings(wid, actor);
                      toast.success('Added two sample meetings (fictional data)');
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : 'Could not add samples');
                    } finally {
                      setSeeding(false);
                    }
                  }}
                >
                  Add sample meetings
                </Button>
              </div>
            }
          >
            Record a meeting with consent or import a transcript. MEETOS extracts decisions and commitments, then follows them across your next meetings.
          </EmptyState>
        </Card>
      </div>
    );
  }

  return (
    <div>
      {header}
      <Card className="mb-6 grid grid-cols-2 gap-x-6 gap-y-5 p-5 md:grid-cols-5">
        <Stat label="Meetings" value={live.length} icon={Video} />
        <Stat label="Upcoming" value={upcoming.length} icon={CalendarClock} />
        <Stat label="Open commitments" value={open.length} icon={Handshake} />
        <Stat label="Overdue" value={overdue.length} icon={AlertTriangle} tone={overdue.length ? 'danger' : undefined} />
        <Stat label="Decisions" value={decisions.filter((d) => d.status !== 'superseded').length} icon={Gavel} />
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <DailyBrief />
          <Card>
            <CardHeader icon={Video} title="Recent meetings" action={<Link to="/app/meetings" className="text-[12.5px] font-medium text-brand-text hover:underline">View all</Link>} />
            {recent.length === 0 ? (
              <p className="px-5 pb-5 text-[13px] text-fg-3">No captured meetings yet.</p>
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {recent.map((m) => (
                  <li key={m.id}>
                    <Link to={`/app/meetings/${m.id}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2/60">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[13.5px] font-medium text-fg">{m.title}</span>
                          {m.isSample && <SampleBadge />}
                        </div>
                        <div className="truncate text-[12.5px] text-fg-3">{m.summary || `${m.participants.length} participants`}</div>
                      </div>
                      <span className="hidden text-[12px] text-fg-3 sm:block">{fmtDate(m.startedAt ?? m.createdAt)}</span>
                      <MeetingStatusBadge status={m.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          {upcoming.length > 0 && (
            <Card>
              <CardHeader icon={CalendarClock} title="Upcoming" />
              <ul className="space-y-3 px-5 pb-5">
                {upcoming.slice(0, 4).map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3">
                    <Link to={`/app/meetings/${m.id}`} className="min-w-0">
                      <div className="truncate text-[13.5px] font-medium text-fg hover:underline">{m.title}</div>
                      <div className="text-[12px] text-fg-3">{fmtDateTime(m.scheduledAt)}</div>
                    </Link>
                    <ButtonLink to={`/app/prepare?meeting=${m.id}`} size="sm" variant="ghost">Prepare <ArrowRight className="size-3.5" aria-hidden /></ButtonLink>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card>
            <CardHeader icon={CircleHelp} title="Unresolved questions" subtitle={`${openQuestions.length} open`} />
            {openQuestions.length === 0 ? (
              <p className="px-5 pb-5 text-[13px] text-fg-3">No open questions.</p>
            ) : (
              <ul className="space-y-3 px-5 pb-5">
                {openQuestions.slice(0, 5).map((q) => (
                  <li key={q.id} className="text-[13px]">
                    <div className="text-fg">{q.text}</div>
                    <Link to={`/app/meetings/${q.meetingId}?tab=questions`} className="text-[12px] text-fg-3 hover:underline">{q.meetingTitle}</Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {decisions.some((d) => d.status === 'needs_confirmation') && (
            <Card>
              <CardHeader icon={Gavel} title="Decisions awaiting confirmation" />
              <ul className="space-y-2 px-5 pb-5">
                {decisions.filter((d) => d.status === 'needs_confirmation').slice(0, 4).map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 text-[13px]">
                    <Link to={`/app/decisions?d=${d.id}`} className="truncate text-fg hover:underline">{d.title}</Link>
                    <DecisionStatusBadge status={d.status} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <RecentActivity />
        </div>
      </div>
    </div>
  );
}
