import type { ReactNode } from 'react';
import { Card, cn, HighlightTitle } from './ui';

/** Pick a word to accent in a meeting title: the most descriptive word outside parentheses. */
export function accentWord(title: string): string | null {
  const words = title.replace(/\(.*?\)/g, '').split(/\s+/).filter((w) => /^[\p{L}]{4,}$/u.test(w));
  const preferred = words.find((w) => /^(meeting|sync|planning|review|kickoff|standup|retro|launch|roadmap|demo)$/i.test(w));
  return preferred ?? words.sort((a, b) => b.length - a.length)[0] ?? null;
}

/**
 * The meeting header card: chips in the top corners, the title centred with
 * one accented word, and key facts in the bottom corners.
 */
export function MeetingHeader({
  title,
  subtitle,
  topLeft,
  topRight,
  bottomLeft,
  bottomRight,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  topLeft?: ReactNode;
  topRight?: ReactNode;
  bottomLeft?: { label: string; value: ReactNode };
  bottomRight?: { label: string; value: ReactNode };
  className?: string;
}) {
  return (
    <Card className={cn('p-5', className)}>
      <div className="flex min-h-8 flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">{topLeft}</div>
        <div className="flex flex-wrap items-center gap-2">{topRight}</div>
      </div>
      <div className="mx-auto max-w-2xl px-2 text-center">
        <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.02em] text-fg sm:text-[26px]">
          <HighlightTitle text={title} highlight={accentWord(title)} />
        </h1>
        {subtitle && <div className="mt-1 text-[13px] text-fg-2">{subtitle}</div>}
      </div>
      {(bottomLeft || bottomRight) && (
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          {bottomLeft ? (
            <div>
              <div className="text-[12px] text-fg-3">{bottomLeft.label}</div>
              <div className="mt-0.5 text-[19px] font-medium tracking-tight text-fg tabular-nums">{bottomLeft.value}</div>
            </div>
          ) : <span />}
          {bottomRight && (
            <div className="text-right">
              <div className="text-[12px] text-fg-3">{bottomRight.label}</div>
              <div className="mt-0.5 flex items-center justify-end gap-2 text-[19px] font-medium tracking-tight text-fg tabular-nums">{bottomRight.value}</div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
