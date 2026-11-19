import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { serverTimestamp } from 'firebase/firestore';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  CircleHelp,
  ClipboardList,
  Gavel,
  Handshake,
  ListOrdered,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Video,
  Wand2,
} from 'lucide-react';
import {
  buildPrepPrompt,
  computePrepContext,
  prepBriefJsonSchema,
  prepBriefSchema,
  prepFactsBlock,
  ruleBasedAgenda,
  type AgendaItem,
  type InferenceSourceLabel,
} from '@meetos/shared';
import { useSession } from '@/state/auth';
import { useWs } from '@/state/workspace';
import { patchMeeting } from '@/data/meetings';
import { logActivity } from '@/data/activity';
import { runStructured } from '@/lib/ai/hybrid';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { Badge, Button, ButtonLink, Card, CardHeader, EmptyState, ErrorNote, Input, PageHeader, Select, Skeleton, Textarea } from '@/components/ui';
import { DueLabel, InferenceBadge } from '@/components/domain';

const newItemId = () => Math.random().toString(36).slice(2, 10);

export default function PreparePage() {
  const { wid, meetings, commitments, decisions, questions, ready } = useWs();
  const { actor } = useSession();
  const [params, setParams] = useSearchParams();
  const upcoming = meetings.filter((m) => !m.archived && m.status === 'scheduled').sort((a, b) => (a.scheduledAt ?? 0) - (b.scheduledAt ?? 0));
  const meetingId = params.get('meeting') ?? upcoming[0]?.id ?? '';
  const meeting = meetings.find((m) => m.id === meetingId);

  const ctx = useMemo(() => (meeting ? computePrepContext(meeting, { meetings, commitments, decisions, questions }) : null), [meeting, meetings, commitments, decisions, questions]);
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [overview, setOverview] = useState('');
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [source, setSource] = useState<{ kind: 'ai'; label: InferenceSourceLabel; detail: string } | { kind: 'rules' } | { kind: 'saved' } | null>(null);
  const [busy, setBusy] = useState<'ai' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setAgenda(meeting?.agenda ?? []);
    setSource(meeting?.agenda ? { kind: 'saved' } : null);
    setOverview('');
    setFollowUps([]);
    setDirty(false);
    setError(null);
    // only when switching meetings
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting?.id]);

  const resolveRefs = (refs: string[]) => refs.filter((r) => ctx?.facts.has(r));

  async function generate() {
    if (!ctx || !meeting) return;
    setBusy('ai');
    setError(null);
    try {
      const r = await runStructured({
        name: 'prep-brief',
        kind: 'reason',
        jsonSchema: prepBriefJsonSchema,
        schema: prepBriefSchema,
        prompt: buildPrepPrompt(meeting.title, prepFactsBlock(ctx) || 'No previous records.', new Date().toDateString()),
      });
      setOverview(r.data.overview);
      setFollowUps(r.data.followUpTopics);
      setAgenda(r.data.agenda.map((a) => ({ id: newItemId(), title: a.title, detail: a.detail, minutes: a.minutes, refs: resolveRefs(a.refs) })));
      setSource({ kind: 'ai', label: r.source, detail: r.detail });
      setDirty(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate the briefing.');
    } finally {
      setBusy(null);
    }
  }

  function applyRules() {
    if (!ctx) return;
    setAgenda(ruleBasedAgenda(ctx).map((a) => ({ ...a, id: newItemId() })));
    setOverview('');
    setSource({ kind: 'rules' });
    setDirty(true);
  }

  async function save() {
    if (!meeting) return;
    setBusy('save');
    try {
      await patchMeeting(wid, meeting.id, {
        agenda: agenda.map((a) => ({ ...a, title: a.title.slice(0, 200), detail: a.detail.slice(0, 1000) })),
        agendaUpdatedAt: serverTimestamp(),
      });
      await logActivity(wid, actor, 'agenda_saved', `saved the agenda for "${meeting.title}"`, { meetingId: meeting.id });
      setDirty(false);
      toast.success('Agenda saved to the meeting');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(null);
    }
  }

  const update = (id: string, patch: Partial<AgendaItem>) => {
    setAgenda((list) => list.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    setDirty(true);
  };
  const move = (i: number, d: -1 | 1) => {
    setAgenda((list) => {
      const next = [...list];
      const [x] = next.splice(i, 1);
      next.splice(i + d, 0, x as AgendaItem);
      return next;
    });
    setDirty(true);
  };
  const total = agenda.reduce((n, a) => n + (a.minutes ?? 0), 0);

  if (!ready) return <Skeleton className="h-80" />;

  const pickable = meetings.filter((m) => !m.archived);
  return (
    <div>
      <PageHeader
        title="Prepare for a meeting"
        description="A briefing built from what's still open across your previous meetings, with an agenda you can edit and save."
        actions={
          <Select aria-label="Meeting to prepare for" value={meetingId} onChange={(e) => setParams({ meeting: e.target.value })} className="w-72">
            {!meetingId && <option value="">Choose a meeting…</option>}
            {upcoming.length > 0 && (
              <optgroup label="Upcoming">
                {upcoming.map((m) => <option key={m.id} value={m.id}>{m.title} — {fmtDate(m.scheduledAt)}</option>)}
              </optgroup>
            )}
            <optgroup label="Other meetings">
              {pickable.filter((m) => m.status !== 'scheduled').map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
            </optgroup>
          </Select>
        }
      />

      {!meeting || !ctx ? (
        <Card>
          <EmptyState icon={CalendarClock} title="Schedule a meeting to prepare for" action={<ButtonLink to="/app/meetings/new" variant="primary" icon={Plus}>Schedule a meeting</ButtonLink>}>
            Pick an upcoming meeting and MEETOS will gather everything outstanding from earlier meetings with the same project or people.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
          <div className="space-y-6">
            <Card>
              <CardHeader icon={Video} title={meeting.title} subtitle={meeting.scheduledAt ? fmtDateTime(meeting.scheduledAt) : undefined} />
              <div className="space-y-1 px-5 pb-5 text-[13px] text-fg-2">
                <p>{meeting.participants.length ? `With ${meeting.participants.map((p) => p.name).join(', ')}` : 'No participants listed — add them to find related meetings.'}</p>
                <p className="text-fg-3">Based on {ctx.previousMeetings.length} previous meeting{ctx.previousMeetings.length === 1 ? '' : 's'}{meeting.projectId ? ' in the same project or' : ''} with overlapping participants.</p>
              </div>
            </Card>

            {ctx.previousMeetings[0] && (
              <Card>
                <CardHeader icon={ClipboardList} title="Last time" subtitle={`${ctx.previousMeetings[0].title} · ${fmtDate(ctx.previousMeetings[0].startedAt ?? ctx.previousMeetings[0].createdAt)}`} />
                <p className="px-5 pb-5 text-[13.5px] leading-relaxed text-fg-2">{ctx.previousMeetings[0].summary || 'This meeting has not been analysed yet.'}</p>
              </Card>
            )}

            <Card>
              <CardHeader icon={Handshake} title="Outstanding commitments" subtitle={`${ctx.outstanding.length} open · ${ctx.overdue.length} overdue`} />
              {ctx.outstanding.length === 0 ? (
                <p className="px-5 pb-5 text-[13px] text-fg-3">Nothing outstanding.</p>
              ) : (
                <ul className="space-y-2.5 px-5 pb-5">
                  {ctx.outstanding.slice(0, 10).map((c) => (
                    <li key={c.id} className="flex items-baseline justify-between gap-3 text-[13px]">
                      <Link to={`/app/commitments/${c.id}`} className="min-w-0 text-fg hover:underline">
                        {c.description} {c.status === 'blocked' && <Badge tone="warning">Blocked</Badge>}
                      </Link>
                      <span className="shrink-0 text-[12px] text-fg-3">{c.ownerName ?? 'Unassigned'} · <DueLabel c={c} /></span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {(ctx.decisionsSince.length > 0 || ctx.openQuestions.length > 0 || ctx.blockers.length > 0) && (
              <Card className="space-y-4 p-5">
                {ctx.decisionsSince.length > 0 && (
                  <div>
                    <h4 className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold tracking-wide text-fg-3 uppercase"><Gavel className="size-3.5" aria-hidden /> Decisions since last time</h4>
                    <ul className="space-y-1 text-[13px] text-fg-2">{ctx.decisionsSince.slice(0, 6).map((d) => <li key={d.id}>{d.title} {d.status === 'needs_confirmation' && <Badge tone="warning">Needs confirmation</Badge>}</li>)}</ul>
                  </div>
                )}
                {ctx.openQuestions.length > 0 && (
                  <div>
                    <h4 className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold tracking-wide text-fg-3 uppercase"><CircleHelp className="size-3.5" aria-hidden /> Unresolved questions</h4>
                    <ul className="space-y-1 text-[13px] text-fg-2">{ctx.openQuestions.slice(0, 6).map((q) => <li key={q.id}>{q.text}</li>)}</ul>
                  </div>
                )}
                {ctx.blockers.length > 0 && (
                  <div>
                    <h4 className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold tracking-wide text-fg-3 uppercase"><AlertTriangle className="size-3.5" aria-hidden /> Blockers raised</h4>
                    <ul className="space-y-1 text-[13px] text-fg-2">{ctx.blockers.slice(0, 5).map((b, i) => <li key={i}>{b.risk.description} <span className="text-fg-3">({b.meeting.title})</span></li>)}</ul>
                  </div>
                )}
              </Card>
            )}
          </div>

          <div>
            <Card className="sticky top-20">
              <CardHeader
                icon={ListOrdered}
                title="Agenda"
                subtitle={
                  source?.kind === 'ai' ? <span className="inline-flex items-center gap-1.5">AI-suggested <InferenceBadge source={source.label} detail={source.detail} /></span>
                  : source?.kind === 'rules' ? 'Generated from rules (no AI)'
                  : source?.kind === 'saved' ? `Saved ${meeting.agendaUpdatedAt ? fmtDate(meeting.agendaUpdatedAt) : ''}`
                  : 'Generate a suggestion or build your own'
                }
                action={
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="ghost" icon={Wand2} onClick={applyRules}>Rules</Button>
                    <Button size="sm" variant="primary" icon={Sparkles} loading={busy === 'ai'} onClick={() => void generate()}>{agenda.length ? 'Regenerate' : 'Generate'}</Button>
                  </div>
                }
              />
              {error && <ErrorNote className="mx-5 mb-3">{error} <button className="underline" onClick={applyRules}>Use the rule-based agenda instead</button></ErrorNote>}
              {overview && <p className="mx-5 mb-3 rounded-lg bg-surface-2/70 p-3 text-[13px] leading-relaxed text-fg-2">{overview}</p>}
              <ol className="space-y-2 border-t border-line px-5 py-4">
                {agenda.length === 0 && <li className="text-[13px] text-fg-3">No agenda items yet.</li>}
                {agenda.map((a, i) => (
                  <li key={a.id} className="rounded-lg border border-line p-3">
                    <div className="flex items-start gap-2">
                      <span className="mt-1.5 w-5 text-[12px] font-semibold text-fg-3 tabular-nums">{i + 1}.</span>
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <Input aria-label="Agenda item title" value={a.title} onChange={(e) => update(a.id, { title: e.target.value })} className="h-8 font-medium" />
                        <Textarea aria-label="Agenda item detail" rows={2} value={a.detail} onChange={(e) => update(a.id, { detail: e.target.value })} className="text-[12.5px]" />
                        <div className="flex flex-wrap items-center gap-1.5">
                          {a.refs.map((r) => {
                            const f = ctx.facts.get(r);
                            if (!f) return null;
                            const to = f.kind === 'commitment' ? `/app/commitments/${f.entityId}` : f.kind === 'decision' ? `/app/decisions?d=${f.entityId}` : `/app/meetings/${f.entityId}`;
                            return <Link key={r} to={to} title={f.text}><Badge>{f.label.slice(0, 32)}{f.label.length > 32 ? '…' : ''}</Badge></Link>;
                          })}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-1">
                          <Input aria-label="Minutes" type="number" min={1} max={120} value={a.minutes ?? ''} onChange={(e) => update(a.id, { minutes: e.target.value ? Number(e.target.value) : null })} className="h-8 w-16" />
                          <span className="text-[12px] text-fg-3">min</span>
                        </div>
                        <div className="flex">
                          <Button size="icon" variant="ghost" icon={ArrowUp} aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} />
                          <Button size="icon" variant="ghost" icon={ArrowDown} aria-label="Move down" disabled={i === agenda.length - 1} onClick={() => move(i, 1)} />
                          <Button size="icon" variant="ghost" icon={Trash2} aria-label="Remove" onClick={() => { setAgenda((l) => l.filter((x) => x.id !== a.id)); setDirty(true); }} />
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
              {followUps.length > 0 && (
                <div className="border-t border-line px-5 py-3 text-[12.5px] text-fg-2">
                  <span className="font-medium text-fg-3">Topics to follow up: </span>{followUps.join(' · ')}
                </div>
              )}
              <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-3">
                <Button size="sm" variant="ghost" icon={Plus} onClick={() => { setAgenda((l) => [...l, { id: newItemId(), title: 'New item', detail: '', minutes: 5, refs: [] }]); setDirty(true); }}>Add item</Button>
                <div className="flex items-center gap-3">
                  {total > 0 && <span className="text-[12px] text-fg-3">{total} min total</span>}
                  <Button variant="primary" icon={Save} loading={busy === 'save'} disabled={!dirty} onClick={() => void save()}>Save agenda</Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
