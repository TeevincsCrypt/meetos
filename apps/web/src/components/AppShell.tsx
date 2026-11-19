import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import {
  BarChart3,
  Brain,
  Check,
  ChevronDown,
  ClipboardList,
  Gavel,
  Handshake,
  LayoutGrid,
  LogOut,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
  Video,
} from 'lucide-react';
import { useSession } from '@/state/auth';
import { useWorkspace } from '@/state/workspace';
import { Logo, LogoMark } from './brand';
import { AiStatusPill } from './AiStatus';
import { ErrorBoundary } from './ErrorBoundary';
import { Avatar, Button, cn, DropdownMenu as DM, Modal } from './ui';

const NAV = [
  { to: '/app', label: 'Overview', icon: LayoutGrid, end: true },
  { to: '/app/meetings', label: 'Meetings', icon: Video },
  { to: '/app/commitments', label: 'Commitments', icon: Handshake },
  { to: '/app/decisions', label: 'Decisions', icon: Gavel },
  { to: '/app/memory', label: 'Memory', icon: Brain },
  { to: '/app/prepare', label: 'Prepare', icon: ClipboardList },
  { to: '/app/execution', label: 'Execution', icon: BarChart3 },
  { to: '/app/settings', label: 'Settings', icon: Settings },
];

const MOBILE_TABS = ['Overview', 'Meetings', 'Commitments', 'Decisions', 'Memory'];

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

const itemCls =
  'flex cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 text-[13px] text-fg outline-none data-[highlighted]:bg-surface-2';

/** Centered pill of round icon links — labels appear as tooltips and are always available to screen readers. */
function PillNav() {
  return (
    <nav aria-label="Main" className="flex items-center gap-1 rounded-full border border-line bg-surface p-1.5 shadow-card">
      {NAV.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.end}
          aria-label={n.label}
          className={({ isActive }) =>
            cn(
              'group relative flex size-10 items-center justify-center rounded-full transition-colors',
              isActive ? 'bg-brand text-white shadow-[0_6px_16px_-6px_var(--ring)] dark:text-[#120d2b]' : 'text-fg-3 hover:bg-surface-2 hover:text-fg',
            )
          }
        >
          <n.icon className="size-[18px]" aria-hidden />
          <span
            role="tooltip"
            className="pointer-events-none absolute top-full mt-2 rounded-lg bg-fg px-2 py-1 text-[11.5px] font-medium whitespace-nowrap text-bg opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            {n.label}
          </span>
        </NavLink>
      ))}
    </nav>
  );
}

function MobileTabBar() {
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <div className="grid grid-cols-5">
        {NAV.filter((n) => MOBILE_TABS.includes(n.label)).map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              cn('flex min-w-0 flex-col items-center gap-0.5 py-2 text-[10px] font-medium', isActive ? 'text-brand-text' : 'text-fg-3')
            }
          >
            {({ isActive }) => (
              <>
                <span className={cn('flex h-7 w-10 items-center justify-center rounded-full', isActive && 'bg-brand-soft')}>
                  <n.icon className="size-[18px]" aria-hidden />
                </span>
                <span className="max-w-full truncate px-0.5">{n.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

function WorkspaceSwitcher() {
  const { workspaces, workspace, selectWorkspace } = useWorkspace();
  const navigate = useNavigate();
  if (!workspace) return null;
  return (
    <DM.Root>
      <DM.Trigger asChild>
        <button className="flex h-10 max-w-52 items-center gap-2 rounded-full border border-line bg-surface pr-3 pl-1.5 text-left transition-colors hover:border-line-strong" aria-label="Switch workspace">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[11px] font-bold text-brand-text">
            {workspace.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="hidden max-w-32 min-w-0 truncate text-[12.5px] font-medium text-fg 2xl:block">{workspace.name}</span>
          <ChevronDown className="size-3.5 shrink-0 text-fg-3" aria-hidden />
        </button>
      </DM.Trigger>
      <DM.Portal>
        <DM.Content align="end" sideOffset={8} className="z-50 w-64 rounded-2xl border border-line bg-surface p-1.5 shadow-pop">
          <DM.Label className="px-2.5 py-1.5 text-[11px] font-medium tracking-wide text-fg-3 uppercase">Workspaces</DM.Label>
          {workspaces.map((w) => (
            <DM.Item
              key={w.id}
              onSelect={() => {
                selectWorkspace(w.id);
                navigate('/app');
              }}
              className={itemCls}
            >
              <span className="flex size-6 items-center justify-center rounded-full bg-surface-2 text-[10.5px] font-bold text-fg-2">{w.name.slice(0, 1).toUpperCase()}</span>
              <span className="flex-1 truncate">{w.name}</span>
              {w.id === workspace.id && <Check className="size-4 text-brand" aria-hidden />}
            </DM.Item>
          ))}
          <DM.Separator className="my-1 h-px bg-line" />
          <DM.Item onSelect={() => navigate('/app/settings?tab=workspace&new=1')} className={itemCls}>
            <Plus className="size-4 text-fg-3" aria-hidden /> New workspace
          </DM.Item>
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

function UserMenu() {
  const { user, profile, signOut } = useSession();
  const { role } = useWorkspace();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();
  const name = profile?.displayName || user.email || 'You';
  return (
    <DM.Root>
      <DM.Trigger asChild>
        <button className="flex items-center gap-2.5 rounded-full py-1 pr-2 pl-1 text-left transition-colors hover:bg-surface" aria-label="Account menu">
          <Avatar name={name} src={user.photoURL} size={36} />
          <span className="hidden min-w-0 xl:block">
            <span className="block max-w-32 truncate text-[13px] font-medium text-fg">{name}</span>
            <span className="block text-[11.5px] text-brand-text capitalize">{role ?? 'member'}</span>
          </span>
        </button>
      </DM.Trigger>
      <DM.Portal>
        <DM.Content align="end" sideOffset={8} className="z-50 w-60 rounded-2xl border border-line bg-surface p-1.5 shadow-pop">
          <div className="px-2.5 py-2">
            <div className="truncate text-[13px] font-medium text-fg">{name}</div>
            <div className="truncate text-[11.5px] text-fg-3">{user.email}</div>
          </div>
          <DM.Separator className="my-1 h-px bg-line" />
          {NAV.filter((n) => !MOBILE_TABS.includes(n.label) && n.label !== 'Settings').map((n) => (
            <DM.Item key={n.to} onSelect={() => navigate(n.to)} className={cn(itemCls, 'md:hidden')}>
              <n.icon className="size-4 opacity-70" aria-hidden /> {n.label}
            </DM.Item>
          ))}
          <DM.Item onSelect={() => navigate('/app/settings?tab=profile')} className={itemCls}>
            <Settings className="size-4 opacity-70" aria-hidden /> Profile & settings
          </DM.Item>
          <DM.Item onSelect={(e) => { e.preventDefault(); toggle(); }} className={itemCls}>
            {dark ? <Sun className="size-4 opacity-70" aria-hidden /> : <Moon className="size-4 opacity-70" aria-hidden />}
            {dark ? 'Light theme' : 'Dark theme'}
          </DM.Item>
          <DM.Separator className="my-1 h-px bg-line" />
          <DM.Item
            onSelect={async () => {
              await signOut();
              navigate('/');
            }}
            className={itemCls}
          >
            <LogOut className="size-4 opacity-70" aria-hidden /> Sign out
          </DM.Item>
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

/** Search opens a small dialog that sends the question to Memory. */
function SearchButton() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    navigate(`/app/memory?q=${encodeURIComponent(q.trim())}`);
    setQ('');
    setOpen(false);
  };
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Search workspace memory"
        title="Search (⌘K)"
        className="flex size-10 items-center justify-center rounded-full border border-line bg-surface text-fg-2 transition-colors hover:border-line-strong hover:text-fg"
      >
        <Search className="size-[18px]" aria-hidden />
      </button>
      <Modal open={open} onOpenChange={setOpen} title="Ask your meetings" description="Answers come only from this workspace, with sources.">
        <form onSubmit={submit} className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-fg-3" aria-hidden />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="What happened to the website redesign?"
            aria-label="Question"
            className="h-12 w-full rounded-xl border border-line bg-surface-2 pr-3 pl-10 text-[14px] text-fg placeholder:text-fg-3 focus:border-brand focus:bg-surface focus:outline-none focus:ring-3 focus:ring-[var(--ring)]"
          />
        </form>
      </Modal>
    </>
  );
}

export function AppShell({ banner }: { banner?: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/85 backdrop-blur">
        <div className="mx-auto grid h-[72px] max-w-[1440px] grid-cols-[auto_1fr] items-center gap-3 px-4 sm:px-6 md:grid-cols-[auto_1fr_auto]">
          <div className="flex items-center">
            <span className="hidden sm:block"><Logo /></span>
            <span className="sm:hidden"><LogoMark /></span>
          </div>
          <div className="hidden justify-self-center md:block">
            <PillNav />
          </div>
          <div className="flex min-w-0 items-center justify-end gap-2">
            <SearchButton />
            <AiStatusPill />
            <WorkspaceSwitcher />
            <span className="hidden sm:block 2xl:hidden">
              <Button variant="primary" size="icon" icon={Plus} aria-label="New meeting" title="New meeting" onClick={() => navigate('/app/meetings/new')} />
            </span>
            <span className="hidden 2xl:block">
              <Button variant="primary" icon={Plus} onClick={() => navigate('/app/meetings/new')}>New meeting</Button>
            </span>
            <UserMenu />
          </div>
        </div>
      </header>
      {banner}
      <main className="mx-auto w-full max-w-[1440px] px-4 pt-6 pb-28 sm:px-6 sm:pt-8 md:pb-10">
        <ErrorBoundary resetKey={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
      <MobileTabBar />
    </div>
  );
}
