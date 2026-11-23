import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { deleteUser } from 'firebase/auth';
import { deleteDoc, doc } from 'firebase/firestore';
import {
  Cloud,
  Cpu,
  Database,
  Download,
  FolderKanban,
  KeyRound,
  Lock,
  Mail,
  Plus,
  ShieldCheck,
  Trash2,
  UserMinus,
  UserRound,
  Users,
} from 'lucide-react';
import type { Invite, Project, Role } from '@meetos/shared';
import { useSession } from '@/state/auth';
import { useWs } from '@/state/workspace';
import {
  changeMemberRole,
  createInvite,
  createWorkspace,
  deleteProject,
  deleteWorkspace,
  leaveWorkspace,
  listenInvites,
  PROJECT_COLORS,
  removeMember,
  revokeInvite,
  saveProject,
  updateWorkspace,
} from '@/data/workspaces';
import { db } from '@/data/db';
import { describeAvailability, prepareOnDeviceModel, setAiPreference, type AiPreference } from '@/lib/ai/hybrid';
import { aiBackend, appCheckProviderLabel, appCheckSiteKey, useEmulators } from '@/lib/config';
import { rcString } from '@/lib/firebase';
import { useAiStatus } from '@/components/AiStatus';
import { useTheme } from '@/components/AppShell';
import { Avatar, Badge, Button, Card, CardHeader, cn, ErrorNote, Field, Input, Notice, PageHeader, Segmented, Select, Tabs, Textarea } from '@/components/ui';
import { ConfirmModal } from '@/components/Forms';
import { fmtDate } from '@/lib/format';
import { diagnoseAppCheck, type AppCheckDiagnosis } from '@/lib/appCheckDiagnostics';

type Tab = 'profile' | 'workspace' | 'members' | 'projects' | 'ai' | 'data';

function ProfileTab() {
  const { user, profile, updateName } = useSession();
  const { dark, toggle } = useTheme();
  const [name, setName] = useState(profile?.displayName ?? '');
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <CardHeader icon={UserRound} title="Profile" />
      <div className="space-y-4 px-5 pb-5">
        <div className="flex items-center gap-3">
          <Avatar name={name || 'You'} src={user.photoURL} size={44} />
          <div>
            <div className="text-[14px] font-medium text-fg">{user.email}</div>
            <div className="text-[12.5px] text-fg-3">
              Signed in with {user.providerData.map((p) => (p.providerId === 'google.com' ? 'Google' : 'email & password')).join(', ')}
              {user.emailVerified ? ' · email verified' : ' · email not verified'}
            </div>
          </div>
        </div>
        <form
          className="flex max-w-md items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await updateName(name);
              toast.success('Name updated');
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Display name" htmlFor="p-name" className="flex-1"><Input id="p-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></Field>
          <Button type="submit" loading={busy} disabled={!name.trim()}>Save</Button>
        </form>
        <div className="flex items-center justify-between rounded-lg border border-line p-3">
          <div><div className="text-[13.5px] font-medium text-fg">Dark theme</div><div className="text-[12.5px] text-fg-3">Stored on this device.</div></div>
          <Segmented value={dark ? 'dark' : 'light'} onChange={(v) => (v === 'dark') !== dark && toggle()} options={[{ id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }]} size="sm" />
        </div>
      </div>
    </Card>
  );
}

function WorkspaceTab() {
  const { workspace, isAdmin, role } = useWs();
  const { user } = useSession();
  const [params] = useSearchParams();
  const [name, setName] = useState(workspace.name);
  const [description, setDescription] = useState(workspace.description);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(params.get('new') === '1');
  useEffect(() => {
    setName(workspace.name);
    setDescription(workspace.description);
  }, [workspace.id, workspace.name, workspace.description]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader icon={FolderKanban} title="Workspace" subtitle={`Your role: ${role ?? 'member'}`} />
        <form
          className="space-y-4 px-5 pb-5"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy('save');
            try {
              await updateWorkspace(workspace.id, { name, description });
              toast.success('Workspace updated');
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'Could not save');
            } finally {
              setBusy(null);
            }
          }}
        >
          <Field label="Name" htmlFor="w-name"><Input id="w-name" disabled={!isAdmin} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Description" htmlFor="w-desc"><Textarea id="w-desc" disabled={!isAdmin} rows={2} value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} /></Field>
          {isAdmin && <Button type="submit" variant="primary" loading={busy === 'save'}>Save</Button>}
        </form>
      </Card>
      <Card>
        <CardHeader icon={Plus} title="Create another workspace" subtitle="Workspaces are fully separate: members, meetings and commitments never cross between them." />
        <div className="px-5 pb-5">
          {showNew ? (
            <form
              className="flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy('new');
                try {
                  await createWorkspace(user, { name: newName, description: '' });
                  toast.success('Workspace created — switch to it from the sidebar');
                  setNewName('');
                  setShowNew(false);
                } finally {
                  setBusy(null);
                }
              }}
            >
              <Input autoFocus placeholder="Workspace name" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={80} />
              <Button type="submit" variant="primary" loading={busy === 'new'} disabled={!newName.trim()}>Create</Button>
            </form>
          ) : (
            <Button icon={Plus} onClick={() => setShowNew(true)}>New workspace</Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function MembersTab() {
  const { workspace, members, isAdmin } = useWs();
  const { actor, user } = useSession();
  const [invites, setInvites] = useState<(Invite & { id: string })[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Exclude<Role, 'owner'>>('member');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isOwner = workspace.ownerId === user.uid;
  useEffect(() => (isAdmin ? listenInvites(workspace.id, setInvites) : undefined), [workspace.id, isAdmin]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader icon={Users} title="Members" subtitle={`${members.length} in ${workspace.name}`} />
        <ul className="divide-y divide-line border-t border-line">
          {members.map((m) => {
            const r = workspace.roles[m.uid] ?? m.role;
            return (
              <li key={m.uid} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <Avatar name={m.displayName} src={m.photoURL} size={30} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-medium text-fg">{m.displayName}{m.uid === user.uid && <span className="text-fg-3"> (you)</span>}</div>
                  <div className="text-[12px] text-fg-3">{m.email}</div>
                </div>
                {isOwner && m.uid !== workspace.ownerId ? (
                  <Select aria-label={`Role for ${m.displayName}`} value={r} onChange={(e) => void changeMemberRole(workspace, m.uid, e.target.value as Exclude<Role, 'owner'>)} className="w-32">
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                  </Select>
                ) : (
                  <Badge tone={r === 'owner' ? 'brand' : 'neutral'}>{r}</Badge>
                )}
                {isOwner && m.uid !== workspace.ownerId && (
                  <Button size="icon" variant="ghost" icon={UserMinus} aria-label={`Remove ${m.displayName}`} onClick={() => void removeMember(workspace, m.uid).then(() => toast.success('Member removed'))} />
                )}
              </li>
            );
          })}
        </ul>
        {!isOwner && (
          <div className="border-t border-line p-4">
            <Button
              variant="ghost"
              icon={UserMinus}
              onClick={async () => {
                await leaveWorkspace(workspace, user.uid);
                toast.success('You left the workspace');
              }}
            >
              Leave this workspace
            </Button>
          </div>
        )}
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader icon={Mail} title="Invite people" subtitle="Invitees sign in with this email (verified) and join from their onboarding screen." />
          <form
            className="flex flex-col gap-2 px-5 pb-4 sm:flex-row"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              try {
                await createInvite(workspace, actor, email, role);
                setEmail('');
                toast.success('Invitation created');
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Could not invite');
              } finally {
                setBusy(false);
              }
            }}
          >
            <Input type="email" required placeholder="teammate@company.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email to invite" />
            <Select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value as Exclude<Role, 'owner'>)} className="sm:w-32">
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </Select>
            <Button type="submit" variant="primary" loading={busy}>Invite</Button>
          </form>
          {error && <ErrorNote className="mx-5 mb-4">{error}</ErrorNote>}
          <p className="px-5 pb-4 text-[12px] text-fg-3">MEETOS doesn't send email. Let your teammate know they've been invited.</p>
          {invites.length > 0 && (
            <ul className="divide-y divide-line border-t border-line">
              {invites.map((i) => (
                <li key={i.id} className="flex items-center gap-3 px-5 py-2.5 text-[13px]">
                  <Mail className="size-4 text-fg-3" aria-hidden />
                  <span className="flex-1 text-fg">{i.email}</span>
                  <Badge>{i.role}</Badge>
                  <span className="text-[12px] text-fg-3">{fmtDate(i.createdAt)}</span>
                  <Button size="sm" variant="ghost" onClick={() => void revokeInvite(workspace.id, i.id)}>Revoke</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

function ProjectsTab() {
  const { wid, projects, commitments, meetings } = useWs();
  const { actor } = useSession();
  const [editing, setEditing] = useState<Partial<Project> | null>(null);
  return (
    <Card>
      <CardHeader icon={FolderKanban} title="Projects" subtitle="Group meetings, commitments and decisions." action={<Button size="sm" icon={Plus} onClick={() => setEditing({ name: '', description: '', color: PROJECT_COLORS[projects.length % PROJECT_COLORS.length] })}>New project</Button>} />
      {editing && (
        <form
          className="mx-5 mb-4 space-y-3 rounded-lg border border-line p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            await saveProject(wid, actor, { id: editing.id, name: editing.name ?? '', description: editing.description ?? '', color: editing.color ?? PROJECT_COLORS[0]!, archived: editing.archived });
            setEditing(null);
          }}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Name" htmlFor="pr-name"><Input id="pr-name" required value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <Field label="Colour" htmlFor="pr-color">
              <div className="flex gap-1.5 pt-1.5">
                {PROJECT_COLORS.map((c) => (
                  <button key={c} type="button" aria-label={`Colour ${c}`} onClick={() => setEditing({ ...editing, color: c })} className={cn('size-6 rounded-full ring-offset-2 ring-offset-surface', editing.color === c && 'ring-2 ring-fg')} style={{ background: c }} />
                ))}
              </div>
            </Field>
          </div>
          <Field label="Description" htmlFor="pr-desc"><Input id="pr-desc" value={editing.description ?? ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></Field>
          <div className="flex gap-2"><Button type="submit" variant="primary">Save</Button><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button></div>
        </form>
      )}
      {projects.length === 0 ? (
        <p className="px-5 pb-5 text-[13px] text-fg-3">No projects yet.</p>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {projects.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-5 py-3">
              <span className="size-3 rounded-full" style={{ background: p.color }} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-medium text-fg">{p.name} {p.archived && <Badge>Archived</Badge>}</div>
                <div className="text-[12px] text-fg-3">{meetings.filter((m) => m.projectId === p.id).length} meetings · {commitments.filter((c) => c.projectId === p.id).length} commitments</div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={() => void saveProject(wid, actor, { ...p, archived: !p.archived })}>{p.archived ? 'Unarchive' : 'Archive'}</Button>
              <Button size="icon" variant="ghost" icon={Trash2} aria-label={`Delete ${p.name}`} onClick={() => void deleteProject(wid, p.id).catch((e: Error) => toast.error(e.message))} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function AiTab() {
  const { pref, availability, refresh } = useAiStatus();
  const [progress, setProgress] = useState<number | null>(null);
  const choose = (p: AiPreference) => {
    setAiPreference(p);
    toast.success('AI preference saved on this device');
  };
  const options: { id: AiPreference; title: string; text: string; icon: typeof Cpu }[] = [
    { id: 'prefer_on_device', title: 'Hybrid — on-device first (recommended)', text: 'Transcript extraction runs on this device when its model is available, otherwise in the cloud. Cross-meeting questions and briefings use the cloud.', icon: Cpu },
    { id: 'on_device_only', title: 'On-device only', text: 'Nothing is sent to an AI model in the cloud. Features that need the cloud are unavailable unless this device can run them.', icon: Lock },
    { id: 'cloud_only', title: 'Cloud only', text: 'Always use Gemini in the cloud via Firebase AI Logic. Useful on devices without a built-in model.', icon: Cloud },
  ];
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader icon={Cpu} title="Where AI runs" subtitle="Saved on this device, because on-device capability is per device." />
        <div className="space-y-2 px-5 pb-5" role="radiogroup">
          {options.map((o) => (
            <button
              key={o.id}
              role="radio"
              aria-checked={pref === o.id}
              onClick={() => choose(o.id)}
              className={cn('flex w-full gap-3 rounded-xl border p-3.5 text-left transition-colors', pref === o.id ? 'border-brand bg-brand-soft/50 ring-1 ring-brand' : 'border-line hover:border-line-strong')}
            >
              <o.icon className={cn('mt-0.5 size-4 shrink-0', pref === o.id ? 'text-brand-text' : 'text-fg-3')} aria-hidden />
              <span><span className="block text-[13.5px] font-medium text-fg">{o.title}</span><span className="block text-[12.5px] text-fg-2">{o.text}</span></span>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader icon={Cpu} title="This device" />
        <div className="space-y-3 px-5 pb-5 text-[13px]">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={availability === 'available' ? 'device' : availability === 'downloadable' || availability === 'downloading' ? 'info' : 'neutral'}>
              {availability ? describeAvailability(availability) : 'Checking…'}
            </Badge>
            <Button size="sm" variant="ghost" onClick={() => void refresh()}>Re-check</Button>
          </div>
          {(availability === 'downloadable' || availability === 'downloading') && (
            <Button
              icon={Download}
              loading={progress !== null}
              onClick={async () => {
                setProgress(0);
                try {
                  await prepareOnDeviceModel(setProgress);
                  await refresh();
                  toast.success('On-device model ready');
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : 'Download failed');
                } finally {
                  setProgress(null);
                }
              }}
            >
              {progress !== null ? `Downloading ${Math.round(progress * 100)}%` : 'Download on-device model'}
            </Button>
          )}
          {availability === 'unsupported' && (
            <p className="text-fg-2">
              On-device inference on the web uses Chrome's built-in Prompt API through Firebase AI Logic. It needs a recent desktop Chrome on a supported device
              (see docs/HYBRID_AI.md). On other browsers MEETOS uses the cloud, and says so on every result.
            </p>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader icon={ShieldCheck} title="What happens to your transcripts" />
        <ul className="space-y-3 px-5 pb-5 text-[13px] text-fg-2">
          <li className="flex gap-2.5"><Database className="mt-0.5 size-4 shrink-0 text-fg-3" aria-hidden /><span><strong className="text-fg">Stored in your workspace.</strong> Transcripts and results are saved in Cloud Firestore, readable only by members of this workspace (enforced by security rules). Audio is never stored.</span></li>
          <li className="flex gap-2.5"><Cpu className="mt-0.5 size-4 shrink-0 text-device" aria-hidden /><span><strong className="text-fg">Processed on this device</strong> when the on-device model is available: transcript chunks go to the model inside your browser and don't leave the device for analysis.</span></li>
          <li className="flex gap-2.5"><Cloud className="mt-0.5 size-4 shrink-0 text-cloud" aria-hidden /><span><strong className="text-fg">Processed in the cloud</strong> otherwise: chunks (max ~3,000 characters each) are sent to Gemini through Firebase AI Logic ({aiBackend === 'agentplatform' ? 'Vertex AI Gemini API' : 'Gemini Developer API'}). For Memory and Prepare, only the retrieved excerpts are sent — never every transcript.</span></li>
          <li className="flex gap-2.5"><Trash2 className="mt-0.5 size-4 shrink-0 text-fg-3" aria-hidden /><span><strong className="text-fg">Deletion.</strong> Delete a meeting from its ⋯ menu to remove its transcript and AI results. Workspace owners can delete everything under Data.</span></li>
        </ul>
        <div className="border-t border-line px-5 py-3 text-[12px] text-fg-3">
          Cloud models: extraction <code className="font-mono">{rcString('ai_cloud_model')}</code> · reasoning <code className="font-mono">{rcString('ai_reasoning_model')}</code> (Remote Config)
        </div>
      </Card>

      <Card>
        <CardHeader icon={KeyRound} title="App Check" />
        <div className="px-5 pb-5 text-[13px]">
          {useEmulators ? (
            <Notice tone="neutral">Running against local emulators — App Check is not used.</Notice>
          ) : appCheckSiteKey ? (
            <div className="space-y-3">
              <Notice tone="neutral" icon={ShieldCheck}>App Check is set up with {appCheckProviderLabel}. Firebase AI Logic requests carry an App Check token.</Notice>
              <AppCheckTest />
            </div>
          ) : (
            <Notice tone="warning" icon={ShieldCheck}>App Check isn't configured for this build. If App Check enforcement is on for Firebase AI Logic, cloud requests will be rejected. See docs/SETUP.md.</Notice>
          )}
        </div>
      </Card>
    </div>
  );
}

function AppCheckTest() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AppCheckDiagnosis | null>(null);
  return (
    <div className="space-y-3">
      <Button
        variant="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            setResult(await diagnoseAppCheck());
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Testing…' : 'Test App Check'}
      </Button>
      {result && (
        <div className="space-y-2" aria-live="polite">
          <Notice tone={result.ok ? 'success' : 'warning'} icon={ShieldCheck}>
            <strong>{result.title}</strong>
            {result.steps.length > 0 && (
              <ol className="mt-1.5 list-decimal space-y-1 pl-4">
                {result.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            )}
          </Notice>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 rounded-lg bg-surface-2 px-3 py-2.5 text-[12px] sm:grid-cols-[auto_minmax(0,1fr)]">
            {result.facts.map((f) => (
              <div key={f.label} className="contents">
                <dt className="text-fg-3">{f.label}</dt>
                <dd className="break-all font-mono text-fg">{f.value}</dd>
              </div>
            ))}
            {result.technical && (
              <div className="contents">
                <dt className="text-fg-3">Technical detail</dt>
                <dd className="break-all font-mono text-fg">{result.technical}</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}

function DataTab() {
  const { workspace, meetings, commitments, decisions } = useWs();
  const { user } = useSession();
  const navigate = useNavigate();
  const [confirmWs, setConfirmWs] = useState(false);
  const [confirmAccount, setConfirmAccount] = useState(false);
  const isOwner = workspace.ownerId === user.uid;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader icon={Database} title="Workspace data" subtitle={`${meetings.length} meetings · ${commitments.length} commitments · ${decisions.length} decisions`} />
        <div className="space-y-3 px-5 pb-5 text-[13px] text-fg-2">
          <p>Delete individual meetings from their ⋯ menu. That removes the transcript, live-capture segments and the AI results that came from it.</p>
          {isOwner ? (
            <Button variant="danger" icon={Trash2} onClick={() => setConfirmWs(true)}>Delete this workspace</Button>
          ) : (
            <p className="text-fg-3">Only the workspace owner can delete the whole workspace.</p>
          )}
        </div>
      </Card>
      <Card>
        <CardHeader icon={UserRound} title="Your account" />
        <div className="space-y-3 px-5 pb-5 text-[13px] text-fg-2">
          <p>Deletes your MEETOS profile and sign-in. Delete or hand over workspaces you own first; content you created in shared workspaces stays with the team.</p>
          <Button variant="danger" icon={Trash2} onClick={() => setConfirmAccount(true)}>Delete my account</Button>
        </div>
      </Card>
      <ConfirmModal
        open={confirmWs}
        onOpenChange={setConfirmWs}
        danger
        title={`Delete “${workspace.name}”?`}
        confirmLabel="Delete everything"
        body="All meetings, transcripts, commitments, decisions, questions, projects and activity in this workspace will be permanently deleted for every member. This cannot be undone."
        onConfirm={async () => {
          await deleteWorkspace(workspace.id);
          toast.success('Workspace deleted');
          navigate('/app');
        }}
      />
      <ConfirmModal
        open={confirmAccount}
        onOpenChange={setConfirmAccount}
        danger
        title="Delete your account?"
        confirmLabel="Delete my account"
        body="Your profile and sign-in will be removed. You may be asked to sign in again first."
        onConfirm={async () => {
          await deleteDoc(doc(db(), 'users', user.uid));
          try {
            await deleteUser(user);
          } catch (e) {
            const code = (e as { code?: string }).code;
            if (code === 'auth/requires-recent-login') throw new Error('For security, sign out, sign back in, and try again.', { cause: e });
            throw e;
          }
          navigate('/');
        }}
      />
    </div>
  );
}

export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'profile';
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Settings" />
      <Tabs
        className="mb-6"
        value={tab}
        onChange={(t) => setParams({ tab: t })}
        tabs={[
          { id: 'profile', label: 'Profile' },
          { id: 'workspace', label: 'Workspace' },
          { id: 'members', label: 'Members' },
          { id: 'projects', label: 'Projects' },
          { id: 'ai', label: 'AI & privacy' },
          { id: 'data', label: 'Data' },
        ]}
      />
      {tab === 'profile' && <ProfileTab />}
      {tab === 'workspace' && <WorkspaceTab />}
      {tab === 'members' && <MembersTab />}
      {tab === 'projects' && <ProjectsTab />}
      {tab === 'ai' && <AiTab />}
      {tab === 'data' && <DataTab />}
    </div>
  );
}
