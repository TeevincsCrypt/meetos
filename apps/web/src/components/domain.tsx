import { AlertTriangle, CheckCircle2, CircleDashed, CircleDot, Cloud, CloudCog, Cpu, Ban, Quote, Sparkles, PenLine } from 'lucide-react';
import { isOverdue, type Commitment, type CommitmentStatus, type DecisionStatus, type Evidence, type InferenceSourceLabel, type Priority } from '@meetos/shared';
import { Link } from 'react-router';
import { Badge, cn } from './ui';
import { fmtDue } from '@/lib/format';

/**
 * Shows where an AI result was actually produced. Values come only from the
 * SDK's reported inferenceSource (see lib/ai/hybrid.ts).
 */
export function InferenceBadge({ source, detail, className }: { source: InferenceSourceLabel | null | undefined; detail?: string; className?: string }) {
  if (!source) return null;
  if (source === 'on_device')
    return (
      <Badge tone="device" icon={Cpu} title={detail ?? 'Processed by the on-device model via Firebase AI Logic hybrid inference'} className={className}>
        On this device
      </Badge>
    );
  if (source === 'cloud_fallback')
    return (
      <Badge tone="warning" icon={CloudCog} title={detail ?? 'The on-device attempt failed and the request was retried in the cloud'} className={className}>
        Cloud fallback
      </Badge>
    );
  return (
    <Badge tone="cloud" icon={Cloud} title={detail ?? 'Processed by a Gemini model in the cloud via Firebase AI Logic'} className={className}>
      In the cloud
    </Badge>
  );
}

export function OriginBadge({ origin, source }: { origin: 'ai' | 'manual'; source: InferenceSourceLabel | null }) {
  if (origin === 'manual') return <Badge icon={PenLine}>Manual</Badge>;
  return (
    <span className="inline-flex items-center gap-1">
      <Badge tone="brand" icon={Sparkles} title="Extracted by MEETOS AI from the transcript">AI</Badge>
      <InferenceBadge source={source} />
    </span>
  );
}

const STATUS: Record<CommitmentStatus, { label: string; tone: 'neutral' | 'info' | 'success' | 'danger' | 'warning'; icon: typeof CircleDot }> = {
  open: { label: 'Open', tone: 'neutral', icon: CircleDashed },
  in_progress: { label: 'In progress', tone: 'info', icon: CircleDot },
  completed: { label: 'Completed', tone: 'success', icon: CheckCircle2 },
  blocked: { label: 'Blocked', tone: 'warning', icon: AlertTriangle },
  cancelled: { label: 'Cancelled', tone: 'neutral', icon: Ban },
};

export function StatusBadge({ status }: { status: CommitmentStatus }) {
  const s = STATUS[status];
  return <Badge tone={s.tone} icon={s.icon}>{s.label}</Badge>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority === 'medium') return null;
  return <Badge tone={priority === 'high' ? 'danger' : 'neutral'}>{priority === 'high' ? 'High priority' : 'Low priority'}</Badge>;
}

export function DueLabel({ c, className }: { c: Pick<Commitment, 'deadline' | 'status'>; className?: string }) {
  const overdue = isOverdue(c);
  const done = c.status === 'completed' || c.status === 'cancelled';
  return (
    <span className={cn('text-[12.5px] tabular-nums whitespace-nowrap', overdue ? 'font-medium text-danger' : done ? 'text-fg-3' : c.deadline ? 'text-fg-2' : 'text-fg-3', className)}>
      {overdue && <AlertTriangle className="mr-1 inline size-3.5 -translate-y-px" aria-hidden />}
      {fmtDue(c.deadline)}
    </span>
  );
}

const DSTATUS: Record<DecisionStatus, { label: string; tone: 'success' | 'warning' | 'neutral' | 'danger' }> = {
  active: { label: 'Active', tone: 'success' },
  needs_confirmation: { label: 'Needs confirmation', tone: 'warning' },
  superseded: { label: 'Superseded', tone: 'neutral' },
  reversed: { label: 'Reversed', tone: 'danger' },
};

export function DecisionStatusBadge({ status }: { status: DecisionStatus }) {
  const s = DSTATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function EvidenceQuote({ evidence, showMeeting = true, className }: { evidence: Pick<Evidence, 'quote' | 'speaker' | 'meetingId' | 'meetingTitle'>; showMeeting?: boolean; className?: string }) {
  return (
    <figure className={cn('rounded-lg border-l-2 border-accent bg-surface-2/70 px-3 py-2', className)}>
      <blockquote className="flex gap-2 text-[13px] leading-relaxed text-fg-2">
        <Quote className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
        <span>
          {evidence.speaker && <span className="font-medium text-fg">{evidence.speaker}: </span>}
          {evidence.quote}
        </span>
      </blockquote>
      {showMeeting && evidence.meetingTitle && (
        <figcaption className="mt-1 pl-5.5 text-[11.5px] text-fg-3">
          from{' '}
          <Link to={`/app/meetings/${evidence.meetingId}`} className="font-medium text-brand-text hover:underline">
            {evidence.meetingTitle}
          </Link>
        </figcaption>
      )}
    </figure>
  );
}

export function SampleBadge() {
  return <Badge tone="accent" title="Fictional sample data for demos">Sample data</Badge>;
}
