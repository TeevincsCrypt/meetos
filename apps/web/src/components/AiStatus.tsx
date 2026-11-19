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
      title={`${plan.label} — ${plan.detail}`}
      aria-label={`AI: ${availability === null ? 'checking' : plan.label}. Open AI & privacy settings`}
      className="flex h-10 items-center gap-2 rounded-full border border-line bg-surface pr-1.5 pl-1.5 text-[12px] transition-colors hover:border-line-strong lg:pr-3.5"
    >
      <span
        className={cn(
          'flex size-7 items-center justify-center rounded-full',
          plan.tone === 'device' ? 'bg-device-soft text-device' : plan.tone === 'cloud' ? 'bg-cloud-soft text-cloud' : 'bg-warning-soft text-warning',
        )}
      >
        <Icon className="size-3.5" aria-hidden />
      </span>
      <span className="hidden font-medium whitespace-nowrap text-fg lg:block">{availability === null ? 'Checking AI…' : plan.label}</span>
    </Link>
  );
}
