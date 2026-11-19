import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { Archive, CalendarClock, Mic, Plus, Search, Video } from 'lucide-react';
import type { Meeting, MeetingStatus } from '@meetos/shared';
import { useWs } from '@/state/workspace';
import { fetchMeetingPage } from '@/data/meetings';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { Badge, Button, Card, EmptyState, ErrorNote, Input, PageHeader, Select, SkeletonList, Tabs } from '@/components/ui';
import { SampleBadge } from '@/components/domain';

const STATUS: Record<MeetingStatus, { label: string; tone: 'neutral' | 'info' | 'success' | 'danger' | 'warning' | 'brand' }> = {
  scheduled: { label: 'Scheduled', tone: 'neutral' },
  live: { label: 'Recording', tone: 'danger' },
  captured: { label: 'Ready to analyse', tone: 'info' },
  analyzing: { label: 'Analysing…', tone: 'brand' },
  analyzed: { label: 'Analysed', tone: 'success' },
  analysis_failed: { label: 'Analysis failed', tone: 'warning' },
};

export function MeetingStatusBadge({ status }: { status: MeetingStatus }) {
  const s = STATUS[status] ?? STATUS.scheduled;
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

function MeetingRow({ m }: { m: Meeting }) {
  const { projectById, commitments } = useWs();
  const project = projectById(m.projectId);
  const count = commitments.filter((c) => c.originMeetingId === m.id).length;
  const when = m.status === 'scheduled' ? m.scheduledAt : (m.startedAt ?? m.createdAt);
  return (
    <li>
      <Link to={`/app/meetings/${m.id}`} className="flex flex-col gap-2 px-5 py-3.5 transition-colors hover:bg-surface-2/60 sm:flex-row sm:items-center sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[14px] font-medium text-fg">{m.title}</span>
            {m.isSample && <SampleBadge />}
            {project && (
              <span className="inline-flex items-center gap-1 text-[12px] text-fg-3">
                <span className="size-2 rounded-full" style={{ background: project.color }} aria-hidden />
                {project.name}
              </span>
            )}
          </div>
          <div className="mt-0.5 line-clamp-1 text-[12.5px] text-fg-3">
            {m.summary || m.description || (m.participants.length ? m.participants.map((p) => p.name).join(', ') : 'No transcript yet')}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-[12px] text-fg-3">
          {count > 0 && <span>{count} commitment{count === 1 ? '' : 's'}</span>}
          <span className="tabular-nums">{m.status === 'scheduled' ? fmtDateTime(when) : fmtDate(when, true)}</span>
          <MeetingStatusBadge status={m.status} />
        </div>
      </Link>
    </li>
  );
}

export default function MeetingsPage() {
  const { wid, meetings: recent, projects, ready } = useWs();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'active' | 'archived'>('active');
  const [search, setSearch] = useState('');
  const [projectId, setProjectId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState<{ items: Meeting[]; cursor: QueryDocumentSnapshot | null; hasMore: boolean } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFirst = useCallback(async () => {
    try {
      setError(null);
      setPage(await fetchMeetingPage(wid, { archived: tab === 'archived', cursor: null }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load meetings.');
    }
  }, [wid, tab]);

  // Refresh the first page whenever the realtime meeting set changes.
  useEffect(() => {
    void loadFirst();
  }, [loadFirst, recent]);

  const searching = search.trim().length > 0 || !!projectId || !!status;
  const filtered = useMemo(() => {
    if (!searching) return null;
    const q = search.trim().toLowerCase();
    return recent
      .filter((m) => (tab === 'archived' ? m.archived : !m.archived))
      .filter((m) => !projectId || m.projectId === projectId)
      .filter((m) => !status || m.status === status)
      .filter(
        (m) =>
          !q ||
          [m.title, m.description, m.summary, ...m.participants.map((p) => p.name), ...m.topics.map((t) => t.name)]
            .join(' ')
            .toLowerCase()
            .includes(q),
      );
  }, [searching, search, projectId, status, recent, tab]);

  const list = filtered ?? page?.items ?? null;

  return (
    <div>
      <PageHeader
        title="Meetings"
        description="Every meeting, its transcript, and what came out of it."
        actions={
          <>
            <Button icon={Plus} onClick={() => navigate('/app/meetings/new')}>New meeting</Button>
            <Button variant="primary" icon={Mic} onClick={() => navigate('/app/meetings/new?live=1')}>Start a meeting</Button>
          </>
        }
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-3" aria-hidden />
            <Input aria-label="Search meetings" placeholder="Search titles, summaries, people, topics…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select aria-label="Filter by project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className="md:w-44">
            <option value="">All projects</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} className="md:w-44">
            <option value="">Any status</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </div>
        <Tabs
          className="px-4"
          value={tab}
          onChange={(t) => {
            setTab(t);
            setPage(null);
          }}
          tabs={[
            { id: 'active', label: 'Active' },
            { id: 'archived', label: 'Archived' },
          ]}
        />
        {error && <ErrorNote className="m-4">{error}</ErrorNote>}
        {!ready || list === null ? (
          <SkeletonList rows={5} />
        ) : list.length === 0 ? (
          searching ? (
            <EmptyState icon={Search} title="No meetings match" compact>
              Search covers your 300 most recent meetings. Try different words or clear the filters.
            </EmptyState>
          ) : tab === 'archived' ? (
            <EmptyState icon={Archive} title="No archived meetings" compact>Archived meetings keep their transcripts and results but leave your active list.</EmptyState>
          ) : (
            <EmptyState icon={Video} title="No meetings yet" action={<Button variant="primary" icon={Plus} onClick={() => navigate('/app/meetings/new')}>Create your first meeting</Button>}>
              Record a live meeting or import a transcript to get started.
            </EmptyState>
          )
        ) : (
          <>
            <ul className="divide-y divide-line">{list.map((m) => <MeetingRow key={m.id} m={m} />)}</ul>
            {!searching && page?.hasMore && (
              <div className="border-t border-line p-3 text-center">
                <Button
                  variant="ghost"
                  loading={loadingMore}
                  onClick={async () => {
                    setLoadingMore(true);
                    try {
                      const next = await fetchMeetingPage(wid, { archived: tab === 'archived', cursor: page.cursor });
                      setPage({ items: [...page.items, ...next.items], cursor: next.cursor, hasMore: next.hasMore });
                    } finally {
                      setLoadingMore(false);
                    }
                  }}
                >
                  Load more
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
      {list && list.some((m) => m.status === 'scheduled') && (
        <p className="mt-3 flex items-center gap-1.5 text-[12px] text-fg-3"><CalendarClock className="size-3.5" aria-hidden /> Scheduled meetings show their planned time.</p>
      )}
    </div>
  );
}
