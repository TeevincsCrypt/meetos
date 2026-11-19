import { cn } from './ui';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-7', className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--brand)" />
      <circle cx="10" cy="11" r="3.2" fill="#fff" />
      <circle cx="22" cy="11" r="3.2" fill="#fff" fillOpacity=".55" />
      <circle cx="16" cy="22" r="3.2" fill="#f5b544" />
      <path d="M10 11 16 22 22 11" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeOpacity=".8" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-[0.08em] text-fg">MEETOS</span>
    </span>
  );
}
