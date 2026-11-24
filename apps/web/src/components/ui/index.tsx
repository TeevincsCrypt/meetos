import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as DM from '@radix-ui/react-dropdown-menu';
import { clsx } from 'clsx';
import { Loader2, X } from 'lucide-react';
import { Link } from 'react-router';
import type { LucideIcon } from 'lucide-react';

export const cn = clsx;

// ---------------------------------------------------------------- Button

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle' | 'soft';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-hover shadow-[0_6px_16px_-6px_var(--ring)] dark:text-[#120d2b]',
  secondary: 'bg-surface text-fg border border-line hover:bg-surface-2 hover:border-line-strong',
  ghost: 'text-fg-2 hover:text-fg hover:bg-surface-2',
  subtle: 'bg-surface-2 text-fg hover:bg-surface-3',
  soft: 'bg-brand-soft text-brand-text hover:brightness-95',
  danger: 'bg-danger text-white hover:brightness-95 shadow-[0_6px_16px_-6px_rgba(224,50,43,0.5)] dark:text-[#2a0c0a]',
};
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[12.5px] gap-1.5 rounded-full',
  md: 'h-10 px-4 text-[13px] gap-2 rounded-full',
  lg: 'h-12 px-6 text-[14.5px] gap-2 rounded-full',
  icon: 'size-10 rounded-full justify-center',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: LucideIcon;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon: Icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center font-medium whitespace-nowrap transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed select-none',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : Icon ? <Icon className="size-4 shrink-0" aria-hidden /> : null}
      {children}
    </button>
  );
});

/** A link that looks like a button (never nest a <button> inside an <a>). */
export function ButtonLink({ to, variant = 'secondary', size = 'md', icon: Icon, className, children, ...rest }: { to: string; variant?: Variant; size?: Size; icon?: LucideIcon; className?: string; children?: ReactNode; 'aria-label'?: string }) {
  return (
    <Link
      to={to}
      className={cn('inline-flex items-center font-medium whitespace-nowrap transition-colors duration-150 select-none', variants[variant], sizes[size], className)}
      {...rest}
    >
      {Icon ? <Icon className="size-4 shrink-0" aria-hidden /> : null}
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------- Card

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-[20px] border border-line bg-surface shadow-card', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, icon: Icon }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em] text-fg">
          {Icon && (
            <span className="flex size-7 items-center justify-center rounded-full bg-surface-2 text-fg-3">
              <Icon className="size-3.5" aria-hidden />
            </span>
          )}
          {title}
        </h3>
        {subtitle && <p className="mt-0.5 text-[12.5px] text-fg-3">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------- Badge

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'device' | 'cloud' | 'accent';
const tones: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-fg-2 border-line',
  brand: 'bg-brand-soft text-brand-text border-transparent',
  success: 'bg-success-soft text-success border-transparent',
  warning: 'bg-warning-soft text-warning border-transparent',
  danger: 'bg-danger-soft text-danger border-transparent',
  info: 'bg-info-soft text-info border-transparent',
  device: 'bg-device-soft text-device border-transparent',
  cloud: 'bg-cloud-soft text-cloud border-transparent',
  accent: 'bg-accent-soft text-accent border-transparent',
};

export function Badge({ tone = 'neutral', children, className, icon: Icon, title }: { tone?: Tone; children: ReactNode; className?: string; icon?: LucideIcon; title?: string }) {
  return (
    <span title={title} className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap', tones[tone], className)}>
      {Icon && <Icon className="size-3" aria-hidden />}
      {children}
    </span>
  );
}

// ---------------------------------------------------------------- Form controls

/** Full width unless the caller sets an explicit base width (e.g. `w-40`). */
const widthOf = (className?: string) => (/(^|\s)w-/.test(className ?? '') ? '' : 'w-full');

const control =
  'rounded-xl border border-line bg-surface-2 px-3.5 text-[13px] text-fg placeholder:text-fg-3 transition-colors focus:border-brand focus:bg-surface focus:outline-none focus:ring-3 focus:ring-[var(--ring)] disabled:opacity-60';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(control, widthOf(className), 'h-10', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(control, widthOf(className), 'py-2 leading-relaxed', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cn(control, widthOf(className), 'h-10 pr-8 appearance-none bg-[length:16px] bg-[right_8px_center] bg-no-repeat', className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%237b8087' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...rest}>
      {children}
    </select>
  );
});

export function Field({ label, hint, error, children, htmlFor, className }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string; className?: string }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-[12.5px] font-medium text-fg-2">
        {label}
      </label>
      {children}
      {error ? <p className="text-[12px] text-danger">{error}</p> : hint ? <p className="text-[12px] text-fg-3">{hint}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------- Feedback

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin text-fg-3', className)} aria-label="Loading" />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-md', className)} aria-hidden />;
}

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2.5 p-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action, compact }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={cn('flex flex-col items-center text-center', compact ? 'px-4 py-8' : 'px-6 py-14')}>
      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-brand-soft">
        <Icon className="size-5 text-brand-text" aria-hidden />
      </div>
      <h3 className="text-[14px] font-semibold text-fg">{title}</h3>
      {children && <div className="mt-1 max-w-sm text-[13px] text-fg-3">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Firestore reports a missing index with a console link that creates it. */
export function missingIndexLink(message: unknown): string | null {
  if (typeof message !== 'string' || !/requires an index|index.*(building|create)/i.test(message)) return null;
  return /https:\/\/console\.firebase\.google\.com\/\S+/.exec(message)?.[0].replace(/[.,)]+$/, '') ?? null;
}

export function ErrorNote({ children, className }: { children: ReactNode; className?: string }) {
  const indexLink = missingIndexLink(children);
  if (indexLink) {
    const building = /currently building/i.test(String(children));
    return (
      <div role="alert" className={cn('rounded-lg border border-warning/30 bg-warning-soft px-3 py-2.5 text-[13px] text-fg-2', className)}>
        <strong className="text-fg">{building ? 'The database index for this list is still being built.' : 'This list needs a database index that hasn’t been created yet.'}</strong>{' '}
        {building ? (
          'This usually takes a few minutes. Reload the page when it’s ready.'
        ) : (
          <>
            A project owner can create it in one click (it takes a few minutes to build).{' '}
            <a href={indexLink} target="_blank" rel="noreferrer" className="font-medium text-brand-text underline">
              Create the index in Firebase
            </a>
          </>
        )}
      </div>
    );
  }
  return <div role="alert" className={cn('break-words rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger', className)}>{children}</div>;
}

export function Notice({ tone = 'info', icon: Icon, children, className }: { tone?: 'info' | 'warning' | 'success' | 'device' | 'neutral'; icon?: LucideIcon; children: ReactNode; className?: string }) {
  const t = { info: 'bg-info-soft text-info', warning: 'bg-warning-soft text-warning', success: 'bg-success-soft text-success', device: 'bg-device-soft text-device', neutral: 'bg-surface-2 text-fg-2' }[tone];
  return (
    <div className={cn('flex gap-2.5 rounded-lg px-3 py-2.5 text-[13px] leading-relaxed', t, className)}>
      {Icon && <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />}
      <div className="min-w-0 text-fg-2 [&_strong]:text-fg">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------- Layout

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-[12px] font-medium text-fg-3">{eyebrow}</div>}
        <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-fg">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[13.5px] text-fg-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div role="tablist" className={cn('no-scrollbar flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border border-line bg-surface p-1', className)}>
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            'flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-medium whitespace-nowrap transition-colors',
            value === t.id ? 'bg-brand text-white dark:text-[#120d2b]' : 'text-fg-3 hover:bg-surface-2 hover:text-fg-2',
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span className={cn('rounded-full px-1.5 text-[10.5px]', value === t.id ? 'bg-white/20' : 'bg-surface-2 text-fg-3')}>{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, size = 'md' }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void; size?: 'sm' | 'md' }) {
  return (
    <div className="inline-flex rounded-full border border-line bg-surface p-1">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={cn(
            'rounded-full font-medium transition-colors',
            size === 'sm' ? 'px-2.5 py-1 text-[12px]' : 'px-3.5 py-1.5 text-[12.5px]',
            value === o.id ? 'bg-brand-soft text-brand-text' : 'text-fg-3 hover:text-fg-2',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Avatar({ name, src, size = 28 }: { name: string; src?: string | null; size?: number }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  if (src) return <img src={src} alt="" referrerPolicy="no-referrer" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${hue} 32% 42%)` }}
    >
      {initials || '?'}
    </span>
  );
}

export function Stat({ label, value, hint, tone, icon: Icon }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'danger' | 'warning' | 'success' | 'brand'; icon?: LucideIcon }) {
  const color = tone ? { danger: 'text-danger', warning: 'text-warning', success: 'text-success', brand: 'text-brand-text' }[tone] : 'text-fg';
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-fg-3">
        {Icon && <Icon className="size-3.5" aria-hidden />}
        {label}
      </div>
      <div className={cn('mt-1 text-[26px] font-semibold tracking-tight tabular-nums', color)}>{value}</div>
      {hint && <div className="text-[12px] text-fg-3">{hint}</div>}
    </div>
  );
}

/** Round, soft icon button (the meeting-room control style). */
export function RoundButton({ icon: Icon, label, onClick, active, tone = 'default', className, disabled }: { icon: LucideIcon; label: string; onClick?: () => void; active?: boolean; tone?: 'default' | 'brand'; className?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex size-12 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50',
        active || tone === 'brand' ? 'bg-brand-soft text-brand-text hover:brightness-95' : 'bg-surface-2 text-fg-2 hover:bg-surface-3',
        className,
      )}
    >
      <Icon className="size-5" aria-hidden />
    </button>
  );
}

/** Title with one highlighted word, e.g. "Weekly product <sync>". */
export function HighlightTitle({ text, highlight, className }: { text: string; highlight?: string | null; className?: string }) {
  const i = highlight ? text.toLowerCase().indexOf(highlight.toLowerCase()) : -1;
  if (!highlight || i < 0) return <span className={className}>{text}</span>;
  return (
    <span className={className}>
      {text.slice(0, i)}
      <span className="text-brand-text">{text.slice(i, i + highlight.length)}</span>
      {text.slice(i + highlight.length)}
    </span>
  );
}

// ---------------------------------------------------------------- Modal

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px] dark:bg-black/60" />
        <Dialog.Content
          className={cn(
            'fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-[calc(100vw-24px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[24px] border border-line bg-surface shadow-pop focus:outline-none',
            wide ? 'max-w-2xl' : 'max-w-lg',
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <Dialog.Title className="text-[15px] font-semibold text-fg">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-0.5 text-[13px] text-fg-3">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{typeof title === 'string' ? title : 'Dialog'}</Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close" icon={X} />
            </Dialog.Close>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-line bg-surface-2/50 px-5 py-3 rounded-b-[24px]">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ---------------------------------------------------------------- Menu

export function Menu({ trigger, items, align = 'end' }: { trigger: ReactNode; items: ({ label: string; icon?: LucideIcon; onSelect: () => void; danger?: boolean; disabled?: boolean } | 'separator')[]; align?: 'start' | 'end' }) {
  return (
    <DM.Root>
      <DM.Trigger asChild>{trigger}</DM.Trigger>
      <DM.Portal>
        <DM.Content align={align} sideOffset={6} className="z-50 min-w-48 rounded-2xl border border-line bg-surface p-1.5 shadow-pop">
          {items.map((it, i) =>
            it === 'separator' ? (
              <DM.Separator key={i} className="my-1 h-px bg-line" />
            ) : (
              <DM.Item
                key={i}
                disabled={it.disabled}
                onSelect={it.onSelect}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 text-[13px] outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2',
                  it.danger ? 'text-danger' : 'text-fg',
                )}
              >
                {it.icon && <it.icon className="size-4 opacity-70" aria-hidden />}
                {it.label}
              </DM.Item>
            ),
          )}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

export { DM as DropdownMenu };
