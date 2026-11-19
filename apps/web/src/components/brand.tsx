import { cn } from './ui';

/**
 * Official MEETOS logo (supplied artwork, cut out to transparent PNG/WebP in
 * public/brand). Two lockups follow the app theme: the dark variant has a
 * light "Meet" so it stays legible on dark surfaces.
 */
export function LogoMark({ className }: { className?: string }) {
  return <img src="/brand/meetos-mark-sm.webp" alt="Meetos" width={160} height={117} className={cn('h-8 w-auto select-none', className)} draggable={false} />;
}

export function Logo({ className, size = 'md' }: { className?: string; size?: 'md' | 'lg' }) {
  const h = size === 'lg' ? 'h-10' : 'h-8';
  return (
    <span className={cn('inline-flex items-center', className)}>
      <img src="/brand/meetos-logo-sm.webp" alt="Meetos" width={560} height={137} className={cn(h, 'w-auto select-none dark:hidden')} draggable={false} />
      <img src="/brand/meetos-logo-dark-sm.webp" alt="Meetos" width={560} height={137} className={cn(h, 'hidden w-auto select-none dark:block')} draggable={false} />
    </span>
  );
}
