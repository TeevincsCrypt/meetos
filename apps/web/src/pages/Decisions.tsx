import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Brain, Gavel, Plus, Search } from 'lucide-react';
import type { Decision } from '@meetos/shared';
import { useWs } from '@/state/workspace';
import { Button, ButtonLink, Card, EmptyState, Input, PageHeader, Select, SkeletonList } from '@/components/ui';
import { DecisionCard } from '@/components/Items';
import { DecisionFormModal } from '@/components/Forms';

export default function DecisionsPage() {
  const { decisions, projects, meetings, ready } = useWs();
  const [params] = useSearchParams();
  const focus = params.get('d');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | Decision['status']>('');
  const [projectId, setProjectId] = useState('');
  const [meetingId, setMeetingId] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (focus && ready) document.getElementById(`decision-${focus}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focus, ready]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return decisions.filter(
      (d) =>
        (!status || d.status === status) &&
        (!projectId || d.projectId === projectId) &&
        (!meetingId || d.meetingId === meetingId) &&
        (!q || `${d.title} ${d.description} ${d.participants.join(' ')} ${d.alternatives.join(' ')} ${d.meetingTitle}`.toLowerCase().includes(q)),
    );
  }, [decisions, search, status, projectId, meetingId]);

  const groups = useMemo(() => {
    const map = new Map<string, Decision[]>();
    for (const d of filtered) {
      const key = new Date(d.decidedAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      map.set(key, [...(map.get(key) ?? []), d]);
    }
    return [...map.entries()];
  }, [filtered]);

  return (
    <div>
      <PageHeader
        title="Decisions"
        description="What your team decided, who agreed, what else was considered — and what changed later."
        actions={
          <>
            <ButtonLink to={`/app/memory${search ? `?q=${encodeURIComponent(`What did we decide about ${search}?`)}` : ''}`} icon={Brain}>Ask about decisions</ButtonLink>
            <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>Record decision</Button>
          </>
        }
      />
      <Card className="mb-6">
        <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-3" aria-hidden />
            <Input aria-label="Search decisions" placeholder="Search decisions, people, alternatives…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as Decision['status'] | '')} className="lg:w-48">
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="needs_confirmation">Needs confirmation</option>
            <option value="superseded">Superseded</option>
            <option value="reversed">Reversed</option>
          </Select>
          <Select aria-label="Project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className="lg:w-44">
            <option value="">All projects</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Select aria-label="Meeting" value={meetingId} onChange={(e) => setMeetingId(e.target.value)} className="lg:w-52">
            <option value="">All meetings</option>
            {meetings.filter((m) => decisions.some((d) => d.meetingId === m.id)).map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
          </Select>
        </div>
      </Card>

      {!ready ? (
        <Card><SkeletonList rows={4} /></Card>
      ) : filtered.length === 0 ? (
        <Card>
          {decisions.length === 0 ? (
            <EmptyState icon={Gavel} title="No decisions yet">Decisions appear here when you analyse meetings. Each one links back to the exact moment it was made.</EmptyState>
          ) : (
            <EmptyState icon={Search} title="No decisions match" compact />
          )}
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map(([month, list]) => (
            <section key={month}>
              <h2 className="mb-2 text-[12px] font-semibold tracking-wide text-fg-3 uppercase">{month}</h2>
              <Card>
                <ul className="divide-y divide-line">
                  {list.map((d) => <DecisionCard key={d.id} d={d} highlight={focus === d.id} />)}
                </ul>
              </Card>
            </section>
          ))}
        </div>
      )}
      <DecisionFormModal open={adding} onOpenChange={setAdding} />
    </div>
  );
}
