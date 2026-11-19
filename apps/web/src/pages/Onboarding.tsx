import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Beaker, Mail, Plus } from 'lucide-react';
import type { Invite } from '@meetos/shared';
import { Logo } from '@/components/brand';
import { Badge, Button, Card, ErrorNote, Field, Input, Textarea } from '@/components/ui';
import { useSession } from '@/state/auth';
import { acceptInvite, createWorkspace, findMyInvites } from '@/data/workspaces';
import { createDemoWorkspace } from '@/lib/demo';

export function OnboardingPage({ error }: { error?: string | null }) {
  const { user, actor, signOut } = useSession();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState<'create' | 'demo' | string | null>(null);
  const [err, setErr] = useState<string | null>(error ?? null);
  const [invites, setInvites] = useState<(Invite & { id: string })[]>([]);

  useEffect(() => {
    if (!user.email || !user.emailVerified) return;
    findMyInvites(user.email).then(setInvites).catch(() => setInvites([]));
  }, [user.email, user.emailVerified]);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy('create');
    setErr(null);
    try {
      await createWorkspace(user, { name, description });
      toast.success('Workspace created');
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Could not create the workspace.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen bg-bg px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between">
          <Logo />
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>Sign out</Button>
        </div>
        <h1 className="mt-10 text-[24px] font-semibold tracking-tight text-fg">Set up your workspace</h1>
        <p className="mt-1 text-[14px] text-fg-2">A workspace holds your team's meetings, commitments and decisions. Only members can see it.</p>

        {err && <ErrorNote className="mt-5">{err}</ErrorNote>}

        {invites.length > 0 && (
          <Card className="mt-6 p-5">
            <h2 className="flex items-center gap-2 text-[14px] font-semibold text-fg"><Mail className="size-4" aria-hidden /> You've been invited</h2>
            <ul className="mt-3 divide-y divide-line">
              {invites.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <div className="text-[14px] font-medium text-fg">{inv.workspaceName}</div>
                    <div className="text-[12.5px] text-fg-3">Invited by {inv.invitedByName} · <Badge>{inv.role}</Badge></div>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    loading={busy === inv.id}
                    onClick={async () => {
                      setBusy(inv.id);
                      try {
                        await acceptInvite(user, inv);
                        toast.success(`Joined ${inv.workspaceName}`);
                      } catch (e2) {
                        setErr(e2 instanceof Error ? e2.message : 'Could not accept the invite.');
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    Join
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card className="mt-6 p-5">
          <form onSubmit={create} className="space-y-4">
            <Field label="Workspace name" htmlFor="ws-name">
              <Input id="ws-name" required maxLength={80} placeholder="e.g. Acme product team" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Description (optional)" htmlFor="ws-desc">
              <Textarea id="ws-desc" rows={2} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            <Button type="submit" variant="primary" icon={Plus} loading={busy === 'create'} disabled={!name.trim()}>
              Create workspace
            </Button>
          </form>
        </Card>

        <Card className="mt-4 flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="flex-1">
            <h2 className="flex items-center gap-2 text-[14px] font-semibold text-fg"><Beaker className="size-4" aria-hidden /> Explore with sample data</h2>
            <p className="mt-1 text-[13px] text-fg-2">
              Creates a separate, clearly labelled demo workspace with two fictional meeting transcripts and one upcoming meeting. Nothing is pre-analysed — you run the AI yourself.
            </p>
          </div>
          <Button
            loading={busy === 'demo'}
            onClick={async () => {
              setBusy('demo');
              setErr(null);
              try {
                await toast.promise(createDemoWorkspace(user, actor), {
                  loading: 'Creating the demo workspace and adding sample meetings…',
                  success: 'Demo workspace ready — open a sample meeting and press Analyse',
                  error: 'Could not finish creating the demo workspace',
                }).unwrap();
              } catch (e2) {
                setErr(e2 instanceof Error ? e2.message : 'Could not create the demo workspace.');
              } finally {
                setBusy(null);
              }
            }}
          >
            Create demo workspace
          </Button>
        </Card>
        {!user.emailVerified && user.providerData.some((p) => p.providerId === 'password') && (
          <p className="mt-4 text-[12.5px] text-fg-3">Expecting an invitation? Verify your email first — check your inbox for the verification link, then reload.</p>
        )}
      </div>
    </div>
  );
}
