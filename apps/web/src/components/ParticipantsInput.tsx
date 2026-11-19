import { useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import type { Participant } from '@meetos/shared';
import { Avatar } from './ui';

export function ParticipantsInput({ value, onChange, suggestions, id }: { value: Participant[]; onChange: (v: Participant[]) => void; suggestions: string[]; id?: string }) {
  const [text, setText] = useState('');
  const names = new Set(value.map((p) => p.name.toLowerCase()));
  const add = (name: string) => {
    const n = name.trim();
    if (!n || names.has(n.toLowerCase())) return;
    onChange([...value, { name: n }]);
    setText('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(text);
    } else if (e.key === 'Backspace' && !text && value.length) {
      onChange(value.slice(0, -1));
    }
  };
  const matches = suggestions.filter((s) => !names.has(s.toLowerCase()) && (!text || s.toLowerCase().includes(text.toLowerCase()))).slice(0, 6);
  return (
    <div>
      <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1.5 shadow-card focus-within:border-brand focus-within:ring-3 focus-within:ring-[var(--ring)]">
        {value.map((p) => (
          <span key={p.name} className="inline-flex items-center gap-1.5 rounded-md bg-surface-2 py-0.5 pr-1 pl-1 text-[12.5px] text-fg">
            <Avatar name={p.name} size={18} />
            {p.name}
            <button type="button" aria-label={`Remove ${p.name}`} onClick={() => onChange(value.filter((x) => x.name !== p.name))} className="rounded p-0.5 text-fg-3 hover:bg-surface-3 hover:text-fg">
              <X className="size-3" aria-hidden />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => add(text)}
          placeholder={value.length ? '' : 'Type a name and press Enter'}
          className="min-w-32 flex-1 bg-transparent px-1 text-[13.5px] text-fg placeholder:text-fg-3 focus:outline-none"
        />
      </div>
      {matches.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {matches.map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className="rounded-md border border-dashed border-line px-2 py-0.5 text-[12px] text-fg-2 hover:border-brand hover:text-brand-text">
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
