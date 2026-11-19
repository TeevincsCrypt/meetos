import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { AlertTriangle, Handshake, Plus, Search } from 'lucide-react';
import { isActive, isOverdue, personKey, type Commitment, type CommitmentStatus } from '@meetos/shared';
import { useWs } from '@/state/workspace';
import { Button, Card, cn, EmptyState, Input, PageHeader, Select, SkeletonList } from '@/components/ui';
import { CommitmentRow } from '@/components/Items';
import { CommitmentFormModal } from '@/components/Forms';
import { STATUS_LABEL } from '@/data/commitments';

type Sort = 'deadline' | 'created' | 'updated' | 'priority';
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;
const PAGE = 30;

export default function CommitmentsPage() {
  const { commitments, projects, ready } = useWs();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const owner = params.get('owner') ?? '';
  const status = params.get('status') ?? 'active';
  const projectId = params.get('project') ?? '';
  const overdueOnly = params.get('overdue') === '1';
  const sort = (params.get('sort') as Sort) ?? 'deadline';
  const set = (k: string, v: string) =>
    setParams((p) => {
      if (v) p.set(k, v);
      else p.delete(k);
      return p;
    }, { replace: true });

  const owners = useMemo(() => {
    const map = new Map<string, string>();
    commitments.forEach((c) => c.ownerName && c.ownerKey && map.set(c.ownerKey, c.ownerName));
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [commitments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = commitments.filter((c) => {
      if (status === 'active' && !isActive(c)) return false;
      if (status && status !== 'active' && status !== 'all' && c.status !== status) return false;
      if (owner === '__none' ? c.ownerName : owner && c.ownerKey !== personKey(owner) && c.ownerKey !== owner) return false;
      if (projectId && c.projectId !== projectId) return false;
      if (overdueOnly && !isOverdue(c)) return false;
      if (q && !`${c.description} ${c.ownerName ?? ''} ${c.originMeetingTitle}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const cmp: Record<Sort, (a: Commitment, b: Commitment) => number> = {
      deadline: (a, b) => (a.deadline ?? Infinity) - (b.deadline ?? Infinity) || b.createdAt - a.createdAt,
      created: (a, b) => b.createdAt - a.createdAt,
      updated: (a, b) => b.updatedAt - a.updatedAt,
      priority: (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (a.deadline ?? Infinity) - (b.deadline ?? Infinity),
    };
    return list.sort(cmp[sort]);
  }, [commitments, search, status, owner, projectId, overdueOnly, sort]);

  const overdueCount = commitments.filter((c) => isOverdue(c)).length;
  const counts: Partial<Record<CommitmentStatus | 'active', number>> = { active: commitments.filter(isActive).length };
  commitments.forEach((c) => (counts[c.status] = (counts[c.status] ?? 0) + 1));

  return (
    <div>
      <PageHeader
        title="Commitments"
        description="Every promise made in your meetings — who owns it, when it's due, and what happened since."
        actions={<Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>Add commitment</Button>}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {(['active', 'open', 'in_progress', 'blocked', 'completed', 'cancelled', 'all'] as const).map((s) => (
          <button
            key={s}
            onClick={() => set('status', s === 'active' ? '' : s)}
            className={cn(
              'rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors',
              (status || 'active') === s ? 'border-brand bg-brand-soft text-brand-text' : 'border-line bg-surface text-fg-2 hover:border-line-strong',
            )}
          >
            {s === 'active' ? 'Active' : s === 'all' ? 'All' : STATUS_LABEL[s]}
            {s !== 'all' && <span className="ml-1.5 text-fg-3">{counts[s] ?? 0}</span>}
          </button>
        ))}
        <button
          onClick={() => set('overdue', overdueOnly ? '' : '1')}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors',
            overdueOnly ? 'border-danger bg-danger-soft text-danger' : 'border-line bg-surface text-fg-2 hover:border-line-strong',
          )}
        >
          <AlertTriangle className="size-3.5" aria-hidden /> Overdue <span className="text-fg-3">{overdueCount}</span>
        </button>
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-3" aria-hidden />
            <Input aria-label="Search commitments" placeholder="Search commitments…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select aria-label="Filter by owner" value={owner} onChange={(e) => set('owner', e.target.value)} className="lg:w-44">
            <option value="">Everyone</option>
            <option value="__none">Unassigned</option>
            {owners.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
          </Select>
          <Select aria-label="Filter by project" value={projectId} onChange={(e) => set('project', e.target.value)} className="lg:w-44">
            <option value="">All projects</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Select aria-label="Sort" value={sort} onChange={(e) => set('sort', e.target.value === 'deadline' ? '' : e.target.value)} className="lg:w-44">
            <option value="deadline">Sort: deadline</option>
            <option value="priority">Sort: priority</option>
            <option value="created">Sort: newest</option>
            <option value="updated">Sort: recently updated</option>
          </Select>
        </div>
        {!ready ? (
          <SkeletonList rows={6} />
        ) : filtered.length === 0 ? (
          commitments.length === 0 ? (
            <EmptyState icon={Handshake} title="No commitments yet">
              Analyse a meeting transcript and MEETOS will pull out every promise with its owner and deadline. You can also add them manually.
            </EmptyState>
          ) : (
            <EmptyState icon={Search} title="Nothing matches these filters" compact />
          )
        ) : (
          <>
            <ul className="divide-y divide-line">{filtered.slice(0, shown).map((c) => <CommitmentRow key={c.id} c={c} />)}</ul>
            {filtered.length > shown && (
              <div className="border-t border-line p-3 text-center">
                <Button variant="ghost" onClick={() => setShown((n) => n + PAGE)}>Show more ({filtered.length - shown} remaining)</Button>
              </div>
            )}
          </>
        )}
      </Card>
      <CommitmentFormModal open={adding} onOpenChange={setAdding} />
    </div>
  );
}
