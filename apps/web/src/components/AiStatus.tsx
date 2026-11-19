import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Cloud, Cpu, ShieldCheck } from 'lucide-react';
import {
  checkOnDeviceAvailability,
  describeAvailability,
  getAiPreference,
  type AiPreference,
  type OnDeviceAvailability,
} from '@/lib/ai/hybrid';
import { cn } from './ui';

export function useAiStatus() {
  const [pref, setPref] = useState<AiPreference>(() => getAiPreference());
  const [availability, setAvailability] = useState<OnDeviceAvailability | null>(null);

  const refresh = useCallback(async () => {
    setPref(getAiPreference());
    setAvailability(await checkOnDeviceAvailability());
  }, []);

  useEffect(() => {
    void refresh();
    const onPref = () => void refresh();
    window.addEventListener('meetos-ai-preference', onPref);
    window.addEventListener('focus', onPref);
    return () => {
      window.removeEventListener('meetos-ai-preference', onPref);
      window.removeEventListener('focus', onPref);
    };
  }, [refresh]);

  return { pref, availability, refresh };
}

/** One-line explanation of where the next extraction will run, based on real capability. */
export function describePlan(pref: AiPreference, a: OnDeviceAvailability | null): { label: string; tone: 'device' | 'cloud' | 'warning'; detail: string } {
  if (pref === 'cloud_only') return { label: 'Cloud AI', tone: 'cloud', detail: 'Transcripts are processed by Gemini in the cloud via Firebase AI Logic.' };
  if (a === 'available')
    return {
      label: pref === 'on_device_only' ? 'On-device only' : 'On-device AI ready',
      tone: 'device',
      detail: 'Transcript extraction runs on this device. Cross-meeting questions use the cloud' + (pref === 'on_device_only' ? ' — disabled by your settings.' : '.'),
    };
  if (pref === 'on_device_only') return { label: 'On-device only · unavailable', tone: 'warning', detail: `${describeAvailability(a ?? 'unsupported')}. Cloud processing is off.` };
  return { label: 'Hybrid · cloud for now', tone: 'cloud', detail: `${describeAvailability(a ?? 'unsupported')}, so extraction falls back to the cloud.` };
}

export function AiStatusPill() {
  const { pref, availability } = useAiStatus();
  const plan = describePlan(pref, availability);
  const Icon = plan.tone === 'device' ? Cpu : plan.tone === 'cloud' ? Cloud : ShieldCheck;
  return (
    <Link
      to="/app/settings?tab=ai"
      title={plan.detail}
      className="flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-2 text-[12px] shadow-card transition-colors hover:border-line-strong"
    >
      <span
        className={cn(
          'flex size-6 items-center justify-center rounded-md',
          plan.tone === 'device' ? 'bg-device-soft text-device' : plan.tone === 'cloud' ? 'bg-cloud-soft text-cloud' : 'bg-warning-soft text-warning',
        )}
      >
        <Icon className="size-3.5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-fg">{availability === null ? 'Checking AI…' : plan.label}</span>
        <span className="block text-[11px] text-fg-3">AI & privacy settings</span>
      </span>
    </Link>
  );
}
