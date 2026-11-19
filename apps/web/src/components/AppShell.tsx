import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import {
  BarChart3,
  Brain,
  Check,
  ChevronsUpDown,
  ClipboardList,
  Gavel,
  Handshake,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
  Video,
  X,
} from 'lucide-react';
import { useSession } from '@/state/auth';
import { useWorkspace } from '@/state/workspace';
import { Logo } from './brand';
import { AiStatusPill } from './AiStatus';
import { ErrorBoundary } from './ErrorBoundary';
import { Avatar, Button, cn, DropdownMenu as DM } from './ui';

const NAV = [
  { to: '/app', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/app/meetings', label: 'Meetings', icon: Video },
  { to: '/app/commitments', label: 'Commitments', icon: Handshake },
  { to: '/app/decisions', label: 'Decisions', icon: Gavel },
  { to: '/app/memory', label: 'Memory', icon: Brain },
  { to: '/app/prepare', label: 'Prepare', icon: ClipboardList },
  { to: '/app/execution', label: 'Execution', icon: BarChart3 },
  { to: '/app/settings', label: 'Settings', icon: Settings },
];

export function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('meetos-theme', next ? 'dark' : 'light');
    } catch {
      /* ignore */
    }
    setDark(next);
  };
  return { dark, toggle };
}

function WorkspaceSwitcher() {
  const { workspaces, workspace, selectWorkspace } = useWorkspace();
  const navigate = useNavigate();
  if (!workspace) return null;
  return (
    <DM.Root>
      <DM.Trigger asChild>
        <button className="flex w-full items-center gap-2.5 rounded-lg border border-line bg-surface px-2.5 py-2 text-left shadow-card transition-colors hover:border-line-strong">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-brand-soft text-[11px] font-bold text-brand-text">
            {workspace.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-fg">{workspace.name}</span>
            <span className="block text-[11px] text-fg-3">
              {workspace.memberIds.length} member{workspace.memberIds.length === 1 ? '' : 's'}
              {workspace.isDemo ? ' · demo' : ''}
            </span>
          </span>
          <ChevronsUpDown className="size-4 text-fg-3" aria-hidden />
        </button>
      </DM.Trigger>
      <DM.Portal>
        <DM.Content align="start" sideOffset={6} className="z-50 w-60 rounded-xl border border-line bg-surface p-1 shadow-pop">
          <DM.Label className="px-2.5 py-1.5 text-[11px] font-medium tracking-wide text-fg-3 uppercase">Workspaces</DM.Label>
          {workspaces.map((w) => (
            <DM.Item
              key={w.id}
              onSelect={() => {
                selectWorkspace(w.id);
                navigate('/app');
              }}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-fg outline-none data-[highlighted]:bg-surface-2"
            >
              <span className="flex-1 truncate">{w.name}</span>
              {w.id === workspace.id && <Check className="size-4 text-brand" aria-hidden />}
            </DM.Item>
          ))}
          <DM.Separator className="my-1 h-px bg-line" />
          <DM.Item
            onSelect={() => navigate('/app/settings?tab=workspace&new=1')}
            className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-fg-2 outline-none data-[highlighted]:bg-surface-2"
          >
            <Plus className="size-4" aria-hidden /> New workspace
          </DM.Item>
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

function UserMenu() {
  const { user, profile, signOut } = useSession();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();
  const name = profile?.displayName || user.email || 'You';
  return (
    <DM.Root>
      <DM.Trigger asChild>
        <button className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-2" aria-label="Account menu">
          <Avatar name={name} src={user.photoURL} size={26} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-fg">{name}</span>
            <span className="block truncate text-[11px] text-fg-3">{user.email}</span>
          </span>
        </button>
      </DM.Trigger>
      <DM.Portal>
        <DM.Content side="top" align="start" sideOffset={6} className="z-50 w-56 rounded-xl border border-line bg-surface p-1 shadow-pop">
          <DM.Item onSelect={() => navigate('/app/settings?tab=profile')} className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-fg outline-none data-[highlighted]:bg-surface-2">
            <Settings className="size-4 opacity-70" aria-hidden /> Profile & settings
          </DM.Item>
          <DM.Item onSelect={(e) => { e.preventDefault(); toggle(); }} className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-fg outline-none data-[highlighted]:bg-surface-2">
            {dark ? <Sun className="size-4 opacity-70" aria-hidden /> : <Moon className="size-4 opacity-70" aria-hidden />}
            {dark ? 'Light theme' : 'Dark theme'}
          </DM.Item>
          <DM.Separator className="my-1 h-px bg-line" />
          <DM.Item
            onSelect={async () => {
              await signOut();
              navigate('/');
            }}
            className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-fg outline-none data-[highlighted]:bg-surface-2"
          >
            <LogOut className="size-4 opacity-70" aria-hidden /> Sign out
          </DM.Item>
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();
  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <div className="px-1.5 pt-1">
        <Logo />
      </div>
      <WorkspaceSwitcher />
      <Button
        variant="primary"
        icon={Plus}
        className="w-full justify-center"
        onClick={() => {
          onNavigate?.();
          navigate('/app/meetings/new');
        }}
      >
        New meeting
      </Button>
      <nav className="flex flex-col gap-0.5" aria-label="Main">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13.5px] font-medium transition-colors',
                isActive ? 'bg-surface text-fg shadow-card ring-1 ring-line' : 'text-fg-2 hover:bg-surface-2 hover:text-fg',
              )
            }
          >
            <n.icon className="size-4 opacity-80" aria-hidden />
            {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto space-y-2">
        <AiStatusPill />
        <UserMenu />
      </div>
    </div>
  );
}

export function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) navigate(`/app/memory?q=${encodeURIComponent(q.trim())}`);
        setQ('');
      }}
      className="relative w-full max-w-md"
    >
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-3" aria-hidden />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Ask or search your meetings…"
        aria-label="Search workspace memory"
        className="h-9 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-[13px] text-fg placeholder:text-fg-3 shadow-card focus:border-brand focus:outline-none focus:ring-3 focus:ring-[var(--ring)]"
      />
    </form>
  );
}

export function AppShell({ banner }: { banner?: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setMobileOpen(false), [location.pathname]);

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line bg-bg lg:block">
        <SidebarContent />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-line bg-bg shadow-pop">
            <Button variant="ghost" size="icon" icon={X} aria-label="Close menu" className="absolute top-3 right-3" onClick={() => setMobileOpen(false)} />
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur sm:px-6">
          <Button variant="ghost" size="icon" icon={MenuIcon} aria-label="Open menu" className="lg:hidden" onClick={() => setMobileOpen(true)} />
          <div className="lg:hidden">
            <Logo />
          </div>
          <div className="hidden flex-1 sm:flex">
            <GlobalSearch />
          </div>
        </header>
        {banner}
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
          <ErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
