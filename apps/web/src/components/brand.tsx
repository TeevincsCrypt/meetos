import { cn } from './ui';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8', className)} aria-hidden>
      <rect width="32" height="32" rx="10" fill="var(--brand)" />
      <circle cx="10" cy="11.5" r="3" fill="#fff" />
      <circle cx="22" cy="11.5" r="3" fill="#fff" fillOpacity=".6" />
      <circle cx="16" cy="21.5" r="3" fill="#ffd27a" />
      <path d="M10 11.5 16 21.5 22 11.5" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeOpacity=".85" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark />
      <span className="text-[17px] font-semibold tracking-[0.04em] text-fg">MEETOS</span>
    </span>
  );
}
