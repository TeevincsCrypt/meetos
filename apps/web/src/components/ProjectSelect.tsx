import { useState } from 'react';
import { toast } from 'sonner';
import { useSession } from '@/state/auth';
import { useWs } from '@/state/workspace';
import { PROJECT_COLORS, saveProject } from '@/data/workspaces';
import { Button, Input, Select } from './ui';

export function ProjectSelect({ value, onChange, id }: { value: string | null; onChange: (v: string | null) => void; id?: string }) {
  const { projects, wid } = useWs();
  const { actor } = useSession();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  if (creating) {
    return (
      <div className="flex gap-2">
        <Input autoFocus placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        <Button
          variant="primary"
          loading={busy}
          disabled={!name.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              const pid = await saveProject(wid, actor, { name, description: '', color: PROJECT_COLORS[projects.length % PROJECT_COLORS.length]! });
              onChange(pid);
              setCreating(false);
              setName('');
            } catch (e) {
              toast.error(e instanceof Error ? e.message : 'Could not create project');
            } finally {
              setBusy(false);
            }
          }}
        >
          Add
        </Button>
        <Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
      </div>
    );
  }
  return (
    <Select
      id={id}
      value={value ?? ''}
      onChange={(e) => {
        if (e.target.value === '__new') setCreating(true);
        else onChange(e.target.value || null);
      }}
    >
      <option value="">No project</option>
      {projects.filter((p) => !p.archived || p.id === value).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      <option value="__new">+ New project…</option>
    </Select>
  );
}
