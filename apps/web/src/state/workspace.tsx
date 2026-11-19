import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Commitment, Decision, Meeting, Member, Project, Question, Role, Workspace } from '@meetos/shared';
import { listenMembers, listenMyWorkspaces, listenProjects, updateUserProfile } from '@/data/workspaces';
import { listenRecentMeetings } from '@/data/meetings';
import { listenCommitments } from '@/data/commitments';
import { listenDecisions, listenQuestions } from '@/data/decisions';
import { useSession } from './auth';

interface Collections {
  meetings: Meeting[];
  commitments: Commitment[];
  decisions: Decision[];
  questions: Question[];
  projects: Project[];
  members: Member[];
}

interface WorkspaceState extends Collections {
  workspaces: Workspace[];
  workspacesLoaded: boolean;
  workspace: Workspace | null;
  role: Role | null;
  isAdmin: boolean;
  /** true once every collection for the current workspace has delivered its first snapshot */
  ready: boolean;
  error: string | null;
  selectWorkspace(id: string): void;
  meetingById(id: string | null | undefined): Meeting | undefined;
  projectById(id: string | null | undefined): Project | undefined;
  /** Known people: members + meeting participants + commitment owners. */
  people: string[];
}

const Ctx = createContext<WorkspaceState | null>(null);
const EMPTY: Collections = { meetings: [], commitments: [], decisions: [], questions: [], projects: [], members: [] };
const KEYS: (keyof Collections)[] = ['meetings', 'commitments', 'decisions', 'questions', 'projects', 'members'];

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useSession();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspacesLoaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [data, setData] = useState<Collections>(EMPTY);
  const [loadedKeys, setLoadedKeys] = useState<Set<keyof Collections>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () =>
      listenMyWorkspaces(
        user.uid,
        (ws) => {
          setWorkspaces(ws);
          setLoaded(true);
        },
        (e) => {
          setError(e.message);
          setLoaded(true);
        },
      ),
    [user.uid],
  );

  const workspace = useMemo(() => {
    if (!workspaces.length) return null;
    const pick = selectedId ?? profile?.lastWorkspaceId ?? null;
    return workspaces.find((w) => w.id === pick) ?? workspaces[0] ?? null;
  }, [workspaces, selectedId, profile?.lastWorkspaceId]);

  const wid = workspace?.id ?? null;

  useEffect(() => {
    setData(EMPTY);
    setLoadedKeys(new Set());
    if (!wid) return;
    const set = <K extends keyof Collections>(k: K) => (v: Collections[K]) => {
      setData((d) => ({ ...d, [k]: v }));
      setLoadedKeys((s) => (s.has(k) ? s : new Set([...s, k])));
    };
    const onErr = (e: Error) => setError(e.message);
    const unsubs = [
      listenRecentMeetings(wid, set('meetings'), onErr),
      listenCommitments(wid, set('commitments'), onErr),
      listenDecisions(wid, set('decisions'), onErr),
      listenQuestions(wid, set('questions'), onErr),
      listenProjects(wid, set('projects')),
      listenMembers(wid, set('members')),
    ];
    return () => unsubs.forEach((u) => u());
  }, [wid]);

  const selectWorkspace = useCallback(
    (id: string) => {
      setSelectedId(id);
      void updateUserProfile(user.uid, { lastWorkspaceId: id }).catch(() => undefined);
    },
    [user.uid],
  );

  const value = useMemo<WorkspaceState>(() => {
    const role = workspace ? (workspace.roles[user.uid] ?? null) : null;
    const meetingMap = new Map(data.meetings.map((m) => [m.id, m]));
    const projectMap = new Map(data.projects.map((p) => [p.id, p]));
    const people = new Set<string>();
    data.members.forEach((m) => people.add(m.displayName));
    data.meetings.forEach((m) => m.participants.forEach((p) => people.add(p.name)));
    data.commitments.forEach((c) => c.ownerName && people.add(c.ownerName));
    return {
      ...data,
      workspaces,
      workspacesLoaded,
      workspace,
      role,
      isAdmin: role === 'owner' || role === 'admin' || workspace?.ownerId === user.uid,
      ready: !!workspace && KEYS.every((k) => loadedKeys.has(k)),
      error,
      selectWorkspace,
      meetingById: (id) => (id ? meetingMap.get(id) : undefined),
      projectById: (id) => (id ? projectMap.get(id) : undefined),
      people: [...people].filter(Boolean).sort((a, b) => a.localeCompare(b)),
    };
  }, [data, workspaces, workspacesLoaded, workspace, user.uid, loadedKeys, error, selectWorkspace]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useWorkspace outside WorkspaceProvider');
  return v;
}

/** For pages that render only when a workspace is selected. */
export function useWs() {
  const v = useWorkspace();
  if (!v.workspace) throw new Error('No workspace selected');
  return { ...v, workspace: v.workspace, wid: v.workspace.id };
}
