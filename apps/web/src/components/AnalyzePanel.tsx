import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { CheckCircle2, Cloud, Cpu, Download, Loader2, RefreshCw, Sparkles, XCircle } from 'lucide-react';
import type { Meeting } from '@meetos/shared';
import { useSession } from '@/state/auth';
import { useWs } from '@/state/workspace';
import { analyzeMeeting, type AnalysisOutcome, type AnalysisProgress } from '@/lib/ai/pipeline';
import { prepareOnDeviceModel } from '@/lib/ai/hybrid';
import { useAiStatus, describePlan } from './AiStatus';
import { Button, Card, cn, ErrorNote, Notice } from './ui';
import { InferenceBadge } from './domain';

export function AnalyzePanel({ meeting, transcript, autoFocus }: { meeting: Meeting; transcript: string; autoFocus?: boolean }) {
  const { wid, commitments, decisions } = useWs();
  const { actor } = useSession();
  const { pref, availability, refresh } = useAiStatus();
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [outcome, setOutcome] = useState<AnalysisOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [download, setDownload] = useState<number | null>(null);
  const plan = describePlan(pref, availability);
  const reanalysis = meeting.status === 'analyzed' || !!meeting.analysis;

  async function run() {
    setRunning(true);
    setError(null);
    setOutcome(null);
    try {
      const result = await analyzeMeeting({ wid, actor, meeting, transcript, commitments, decisions, onProgress: setProgress, preference: pref });
      setOutcome(result);
      toast.success(`Found ${result.created.commitments} commitments and ${result.created.decisions} decisions`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed.');
    } finally {
      setRunning(false);
    }
  }

  async function prepare() {
    setDownload(0);
    try {
      await prepareOnDeviceModel((f) => setDownload(f));
      await refresh();
      toast.success('On-device model is ready');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not prepare the on-device model');
    } finally {
      setDownload(null);
    }
  }

  const chunks = progress?.chunks ?? [];
  const done = chunks.filter((c) => c.state === 'done').length;

  return (
    <Card className={cn('overflow-hidden', autoFocus && 'ring-2 ring-brand/40')}>
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-text">
          <Sparkles className="size-4.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[14.5px] font-semibold text-fg">{reanalysis ? 'Re-analyse this meeting' : 'Analyse this meeting'}</h3>
          <p className="mt-1 text-[13px] text-fg-2">
            Extracts the summary, decisions, commitments with owners and deadlines, open questions and blockers — and links this meeting to earlier commitments it mentions.
            {reanalysis && ' Unedited AI items from the previous run are replaced; anything you edited is kept.'}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">
            <span className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium', plan.tone === 'device' ? 'bg-device-soft text-device' : plan.tone === 'cloud' ? 'bg-cloud-soft text-cloud' : 'bg-warning-soft text-warning')}>
              {plan.tone === 'device' ? <Cpu className="size-3.5" aria-hidden /> : <Cloud className="size-3.5" aria-hidden />}
              {plan.label}
            </span>
            <span className="text-fg-3">{plan.detail}</span>
            <Link to="/app/settings?tab=ai" className="font-medium text-brand-text hover:underline">Change</Link>
          </div>
          {(availability === 'downloadable' || availability === 'downloading') && pref !== 'cloud_only' && (
            <Notice tone="device" icon={Download} className="mt-3">
              Your browser can run the model on this device after a one-time download.{' '}
              <button className="font-medium text-device underline" onClick={() => void prepare()} disabled={download !== null}>
                {download !== null ? `Downloading… ${Math.round(download * 100)}%` : 'Download on-device model'}
              </button>
            </Notice>
          )}
        </div>
        <Button variant="primary" icon={reanalysis ? RefreshCw : Sparkles} loading={running} onClick={() => void run()} disabled={!transcript.trim() || plan.tone === 'warning'}>
          {running ? 'Analysing' : reanalysis ? 'Re-analyse' : 'Analyse'}
        </Button>
      </div>

      {progress && (
        <div className="border-t border-line bg-surface-2/40 px-5 py-4">
          <div className="flex items-center justify-between text-[12.5px]">
            <span className="font-medium text-fg">{progress.message}</span>
            <span className="text-fg-3 tabular-nums">{done}/{chunks.length} parts</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${chunks.length ? (done / chunks.length) * 100 : 0}%` }} />
          </div>
          <ol className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {chunks.map((c) => (
              <li key={c.index} className="flex items-center gap-2 text-[12.5px]">
                {c.state === 'done' ? (
                  <CheckCircle2 className="size-3.5 text-success" aria-hidden />
                ) : c.state === 'failed' ? (
                  <XCircle className="size-3.5 text-danger" aria-hidden />
                ) : c.state === 'running' ? (
                  <Loader2 className="size-3.5 animate-spin text-brand" aria-hidden />
                ) : (
                  <span className="size-3.5 rounded-full border border-line-strong" aria-hidden />
                )}
                <span className="text-fg-2">Part {c.index + 1}</span>
                <span className="text-fg-3">{c.chars.toLocaleString()} chars</span>
                <InferenceBadge source={c.source} detail={c.detail} />
                {c.state === 'failed' && <span className="truncate text-danger" title={c.detail}>{c.detail}</span>}
              </li>
            ))}
          </ol>
        </div>
      )}

      {outcome && (
        <div className="border-t border-line px-5 py-4 text-[13px] text-fg-2">
          <strong className="text-fg">Done.</strong> {outcome.created.commitments} new commitments, {outcome.created.decisions} decisions, {outcome.created.questions} open questions
          {outcome.created.linked > 0 && <>, and <strong className="text-fg">{outcome.created.linked} updates to earlier commitments</strong></>}.
          {outcome.run.discardedUngrounded > 0 && (
            <span className="text-fg-3"> {outcome.run.discardedUngrounded} item{outcome.run.discardedUngrounded === 1 ? ' was' : 's were'} discarded because the evidence wasn't found in the transcript.</span>
          )}
        </div>
      )}
      {error && (
        <div className="border-t border-line p-4">
          <ErrorNote>
            {error}{' '}
            <button className="ml-1 font-medium underline" onClick={() => void run()}>Retry</button>
          </ErrorNote>
        </div>
      )}
    </Card>
  );
}
