import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, BarChart3, Clock, Gavel, Hourglass, Table2, TrendingUp, Users } from 'lucide-react';
import { computeExecutionMetrics, personKey, MIN_COMPLETIONS_FOR_AVG } from '@meetos/shared';
import { useWs } from '@/state/workspace';
import { fmtDate, pct } from '@/lib/format';
import { Avatar, Badge, Card, CardHeader, EmptyState, PageHeader, Segmented, Select, Skeleton, Stat } from '@/components/ui';
import { DueLabel } from '@/components/domain';

const DAY = 86_400_000;
type Period = '30' | '90' | 'all';

function WeeklyTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: number }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-[12px] shadow-pop">
      <div className="mb-1 font-medium text-fg">Week of {fmtDate(label ?? 0)}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-fg-2">
          <span className="h-0.5 w-3 rounded" style={{ background: p.color }} aria-hidden />
          {p.name}: <span className="font-medium text-fg tabular-nums">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function ExecutionPage() {
  const { commitments, decisions, projects, ready } = useWs();
  const [period, setPeriod] = useState<Period>('90');
  const [projectId, setProjectId] = useState('');
  const [owner, setOwner] = useState('');
  const [tableView, setTableView] = useState(false);

  const owners = useMemo(() => {
    const m = new Map<string, string>();
    commitments.forEach((c) => c.ownerKey && c.ownerName && m.set(c.ownerKey, c.ownerName));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [commitments]);

  const metrics = useMemo(
    () =>
      computeExecutionMetrics(commitments, {
        from: period === 'all' ? null : Date.now() - Number(period) * DAY,
        ownerKey: owner ? personKey(owner) ?? owner : null,
        projectId: projectId || null,
      }),
    [commitments, period, owner, projectId],
  );
  const unresolvedDecisions = decisions.filter((d) => d.status === 'needs_confirmation' && (!projectId || d.projectId === projectId));

  if (!ready) return <Skeleton className="h-96" />;

  const filters = (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented<Period> value={period} onChange={setPeriod} options={[{ id: '30', label: '30 days' }, { id: '90', label: '90 days' }, { id: 'all', label: 'All time' }]} />
      <Select aria-label="Project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-40">
        <option value="">All projects</option>
        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </Select>
      <Select aria-label="Owner" value={owner} onChange={(e) => setOwner(e.target.value)} className="w-40">
        <option value="">Everyone</option>
        {owners.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
      </Select>
    </div>
  );

  if (commitments.length === 0) {
    return (
      <div>
        <PageHeader title="Execution" description="Do your meetings lead to action?" />
        <Card>
          <EmptyState icon={BarChart3} title="No commitments to measure yet">
            Once meetings are analysed, this page shows how many commitments get done, how long they take, and which ones keep slipping. Nothing is estimated.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const enoughHistory = metrics.weekly.length >= 2;

  return (
    <div>
      <PageHeader title="Execution" description="Do your meetings lead to action? Every number here is computed from your stored commitments." />
      <div className="mb-5">{filters}</div>

      {metrics.created === 0 ? (
        <Card><EmptyState icon={BarChart3} title="No commitments in this selection" compact>Try a longer period or clear the filters.</EmptyState></Card>
      ) : (
        <>
          <Card className="mb-6 grid grid-cols-2 gap-x-6 gap-y-5 p-5 md:grid-cols-4 xl:grid-cols-7">
            <Stat label="Created" value={metrics.created} />
            <Stat label="Completed" value={metrics.completed} tone="success" />
            <Stat label="Open" value={metrics.open + metrics.inProgress} />
            <Stat label="Overdue" value={metrics.overdue} tone={metrics.overdue ? 'danger' : undefined} />
            <Stat label="Blocked" value={metrics.blocked} tone={metrics.blocked ? 'warning' : undefined} />
            <Stat label="Completion rate" value={pct(metrics.completionRate)} hint="excl. cancelled" tone="brand" />
            <Stat
              label="Avg. time to done"
              value={metrics.avgDaysToComplete === null ? '—' : `${metrics.avgDaysToComplete.toFixed(1)}d`}
              hint={metrics.avgDaysToComplete === null ? `needs ${MIN_COMPLETIONS_FOR_AVG}+ completed (${metrics.completedForAvg} so far)` : `${metrics.completedForAvg} completed`}
            />
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader
                icon={TrendingUp}
                title="Commitments created vs completed"
                subtitle="Per week"
                action={
                  enoughHistory && (
                    <button onClick={() => setTableView((v) => !v)} className="inline-flex items-center gap-1 text-[12px] font-medium text-fg-3 hover:text-fg" aria-pressed={tableView}>
                      {tableView ? <BarChart3 className="size-3.5" aria-hidden /> : <Table2 className="size-3.5" aria-hidden />}
                      {tableView ? 'Chart' : 'Table'}
                    </button>
                  )
                }
              />
              {!enoughHistory ? (
                <p className="px-5 pb-6 text-[13px] text-fg-3">Trends appear after commitments span at least two weeks. So far everything falls in one week.</p>
              ) : tableView ? (
                <div className="overflow-x-auto px-5 pb-5">
                  <table className="w-full text-[13px]">
                    <thead><tr className="text-left text-fg-3"><th className="py-1.5 font-medium">Week of</th><th className="font-medium">Created</th><th className="font-medium">Completed</th></tr></thead>
                    <tbody>{metrics.weekly.map((w) => <tr key={w.weekStart} className="border-t border-line text-fg-2"><td className="py-1.5">{fmtDate(w.weekStart, true)}</td><td className="tabular-nums">{w.created}</td><td className="tabular-nums">{w.completed}</td></tr>)}</tbody>
                  </table>
                </div>
              ) : (
                <div className="h-64 px-2 pb-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={metrics.weekly} margin={{ top: 8, right: 24, left: -12, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="weekStart" tickFormatter={(v: number) => fmtDate(v)} tick={{ fill: 'var(--text-3)', fontSize: 11 }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fill: 'var(--text-3)', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<WeeklyTooltip />} cursor={{ stroke: 'var(--border-strong)' }} />
                      <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: 'var(--text-2)' }} />
                      <Line name="Created" type="monotone" dataKey="created" stroke="var(--series-1)" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }} activeDot={{ r: 5 }} />
                      <Line name="Completed" type="monotone" dataKey="completed" stroke="var(--series-2)" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <Card>
              <CardHeader icon={Users} title="By owner" />
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-y border-line text-left text-[12px] text-fg-3">
                    <th className="px-5 py-2 font-medium">Owner</th>
                    <th className="py-2 font-medium">Open</th>
                    <th className="py-2 font-medium">Overdue</th>
                    <th className="py-2 pr-5 font-medium">Done</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.byOwner.slice(0, 10).map((o) => (
                    <tr key={o.owner} className="border-b border-line last:border-0">
                      <td className="px-5 py-2"><span className="inline-flex items-center gap-2 text-fg"><Avatar name={o.owner} size={20} />{o.owner}</span></td>
                      <td className="tabular-nums text-fg-2">{o.open}</td>
                      <td className={o.overdue ? 'font-medium text-danger tabular-nums' : 'text-fg-3 tabular-nums'}>{o.overdue}</td>
                      <td className="pr-5 tabular-nums text-fg-2">{o.completed}/{o.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader icon={Clock} title="Repeatedly postponed" subtitle="Deadline moved 2+ times" />
              {metrics.postponed.length === 0 ? (
                <p className="px-5 pb-5 text-[13px] text-fg-3">No commitment has been postponed more than once.</p>
              ) : (
                <ul className="space-y-2.5 px-5 pb-5">
                  {metrics.postponed.slice(0, 6).map((c) => (
                    <li key={c.id} className="text-[13px]">
                      <Link to={`/app/commitments/${c.id}`} className="text-fg hover:underline">{c.description}</Link>
                      <div className="flex gap-2 text-[12px] text-fg-3"><Badge tone="warning">Moved {c.deadlineChangeCount}×</Badge>{c.ownerName ?? 'Unassigned'} · <DueLabel c={c} /></div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader icon={Hourglass} title="Gone quiet" subtitle="Open, not discussed for 14+ days" />
              {metrics.stale.length === 0 ? (
                <p className="px-5 pb-5 text-[13px] text-fg-3">Every open commitment has come up recently.</p>
              ) : (
                <ul className="space-y-2.5 px-5 pb-5">
                  {metrics.stale.slice(0, 6).map((c) => (
                    <li key={c.id} className="text-[13px]">
                      <Link to={`/app/commitments/${c.id}`} className="text-fg hover:underline">{c.description}</Link>
                      <div className="text-[12px] text-fg-3">Last discussed {fmtDate(c.lastMentionedAt ?? c.createdAt, true)} · {c.ownerName ?? 'Unassigned'}</div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader icon={Gavel} title="Unresolved decisions" subtitle="Tentative — need confirmation" />
              {unresolvedDecisions.length === 0 ? (
                <p className="px-5 pb-5 text-[13px] text-fg-3">No decisions waiting for confirmation.</p>
              ) : (
                <ul className="space-y-2.5 px-5 pb-5">
                  {unresolvedDecisions.slice(0, 6).map((d) => (
                    <li key={d.id} className="text-[13px]">
                      <Link to={`/app/decisions?d=${d.id}`} className="text-fg hover:underline">{d.title}</Link>
                      <div className="text-[12px] text-fg-3">{d.meetingTitle}</div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
          {metrics.overdue > 0 && (
            <p className="mt-4 flex items-center gap-1.5 text-[12px] text-fg-3"><AlertTriangle className="size-3.5" aria-hidden /> Overdue = past its deadline and not completed or cancelled.</p>
          )}
        </>
      )}
    </div>
  );
}
