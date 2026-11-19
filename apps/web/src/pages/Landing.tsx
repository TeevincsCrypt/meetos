import { Link } from 'react-router';
import {
  ArrowRight,
  BarChart3,
  Brain,
  CheckCircle2,
  ClipboardList,
  Cloud,
  Cpu,
  FileText,
  Gavel,
  GitBranch,
  Handshake,
  Lock,
  Mic,
  Quote,
  ShieldCheck,
} from 'lucide-react';
import { Logo } from '@/components/brand';
import { Badge, Button, cn } from '@/components/ui';
import { useTheme } from '@/components/AppShell';
import { Moon, Sun } from 'lucide-react';

function GraphIllustration() {
  // A faithful miniature of the Commitment Graph screen: one commitment tracked across three meetings.
  const steps = [
    { meeting: 'Beta launch planning', day: 'Mon', text: '"I\'ll finish the landing page before Friday."', tag: 'Created', tone: 'brand' as const },
    { meeting: 'Weekly sync', day: 'Next Mon', text: '"The authentication section is still incomplete… by next Wednesday instead."', tag: 'Deadline moved', tone: 'warning' as const },
    { meeting: 'Launch review', day: 'Thu', text: '"The landing page is finished, deployment is still pending."', tag: 'Done? Needs confirmation', tone: 'device' as const },
  ];
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-pop">
      <div className="flex items-center justify-between gap-3 border-b border-line pb-4">
        <div>
          <div className="text-[11px] font-medium tracking-wide text-fg-3 uppercase">Commitment</div>
          <div className="mt-0.5 text-[15px] font-semibold text-fg">Finish the landing page</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-full bg-[hsl(200_32%_42%)] text-[11px] font-semibold text-white">DO</span>
          <Badge tone="warning">Deadline changed</Badge>
        </div>
      </div>
      <ol className="relative mt-4 space-y-4 pl-6">
        <span className="absolute top-1 bottom-1 left-[7px] w-px bg-line-strong" aria-hidden />
        {steps.map((s) => (
          <li key={s.meeting} className="relative">
            <span className={cn('absolute top-1 -left-6 size-3.5 rounded-full border-2 border-surface', s.tone === 'brand' ? 'bg-brand' : s.tone === 'warning' ? 'bg-warning' : 'bg-device')} aria-hidden />
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <span className="font-medium text-fg">{s.meeting}</span>
              <span className="text-fg-3">{s.day}</span>
              <Badge tone={s.tone}>{s.tag}</Badge>
            </div>
            <p className="mt-1 flex gap-1.5 text-[12.5px] text-fg-2">
              <Quote className="mt-0.5 size-3 shrink-0 text-accent" aria-hidden />
              {s.text}
            </p>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-[12px]">
        <span className="text-fg-2">Completion needs a person to confirm — AI never closes tasks on its own.</span>
        <CheckCircle2 className="size-4 text-success" aria-hidden />
      </div>
    </div>
  );
}

const FEATURES = [
  { icon: Handshake, title: 'Commitment Graph', text: 'Every promise becomes a tracked commitment with an owner, deadline, transcript evidence and a timeline that follows it across meetings.' },
  { icon: Gavel, title: 'Decision memory', text: 'A searchable record of what was decided, who agreed, what alternatives were discussed — and when a decision was changed.' },
  { icon: Brain, title: 'Ask your meetings', text: '“What happened to the website redesign?” Answers are generated only from your workspace, with citations to the exact transcript lines.' },
  { icon: ClipboardList, title: 'Prepare for meetings', text: 'A briefing built from outstanding commitments, overdue items, open questions and blockers — with an agenda you can edit and save.' },
  { icon: BarChart3, title: 'Execution monitor', text: 'See whether meetings lead to action: completion rate, overdue and repeatedly postponed work, by person and project.' },
  { icon: Mic, title: 'Live capture or import', text: 'Transcribe in the browser with explicit consent, or paste and upload transcripts (.txt, .vtt, .srt).' },
];

export function LandingPage({ setupMode }: { setupMode?: boolean }) {
  const { dark, toggle } = useTheme();
  return (
    <div className="min-h-screen bg-bg">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo />
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" icon={dark ? Sun : Moon} aria-label="Toggle theme" onClick={toggle} />
          {setupMode ? (
            <Link to="/setup">
              <Button variant="primary">Finish setup</Button>
            </Link>
          ) : (
            <>
              <Link to="/signin">
                <Button variant="ghost">Sign in</Button>
              </Link>
              <Link to="/signup">
                <Button variant="primary">Get started</Button>
              </Link>
            </>
          )}
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pt-10 pb-20 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
        <div>
          <Badge tone="device" icon={Cpu}>Hybrid AI · on-device first with Firebase AI Logic</Badge>
          <h1 className="mt-5 text-[40px] leading-[1.08] font-semibold tracking-[-0.03em] text-fg sm:text-[52px]">
            Meetings shouldn't end with notes. They should end with <span className="text-brand-text">work getting done.</span>
          </h1>
          <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-fg-2">
            MEETOS turns conversations into decisions, commitments, owners and deadlines — then follows each commitment across later
            meetings until a person confirms it's done.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to={setupMode ? '/setup' : '/signup'}>
              <Button variant="primary" size="lg">
                Start your workspace <ArrowRight className="size-4" aria-hidden />
              </Button>
            </Link>
            <a href="#how">
              <Button variant="secondary" size="lg">How it works</Button>
            </a>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-fg-2">
            <li className="flex items-center gap-1.5"><ShieldCheck className="size-4 text-brand" aria-hidden /> Evidence for every item</li>
            <li className="flex items-center gap-1.5"><Lock className="size-4 text-brand" aria-hidden /> Workspace-level access control</li>
            <li className="flex items-center gap-1.5"><Cpu className="size-4 text-brand" aria-hidden /> Local processing when supported</li>
          </ul>
        </div>
        <GraphIllustration />
      </section>

      <section id="how" className="border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="text-[26px] font-semibold tracking-tight text-fg">From conversation to accountability</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              { n: '1', icon: FileText, t: 'Capture', d: 'Record live with consent, or import a transcript. Speaker names come from the transcript — never invented.' },
              { n: '2', icon: Cpu, t: 'Extract', d: 'Short transcript chunks are analysed on your device when supported, in the cloud otherwise. Every result is checked against the transcript before it is saved.' },
              { n: '3', icon: GitBranch, t: 'Follow through', d: 'Later meetings are linked to earlier commitments automatically: progress, blockers, moved deadlines and completion claims.' },
            ].map((s) => (
              <div key={s.n} className="rounded-xl border border-line bg-bg p-5">
                <div className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-brand-soft text-brand-text"><s.icon className="size-4" aria-hidden /></span>
                  <span className="text-[12px] font-medium text-fg-3">Step {s.n}</span>
                </div>
                <h3 className="mt-4 text-[15px] font-semibold text-fg">{s.t}</h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-fg-2">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border border-line bg-surface p-5 shadow-card">
              <f.icon className="size-5 text-brand" aria-hidden />
              <h3 className="mt-3 text-[14.5px] font-semibold text-fg">{f.title}</h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-fg-2">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 lg:grid-cols-2">
          <div>
            <h2 className="text-[26px] font-semibold tracking-tight text-fg">Private by design, honest about it</h2>
            <p className="mt-3 text-[14.5px] leading-relaxed text-fg-2">
              Every AI result in MEETOS shows where it was produced. Transcript extraction runs on-device through Firebase AI Logic
              whenever your browser or phone supports it. You can turn cloud processing off entirely.
            </p>
          </div>
          <div className="grid gap-3">
            <div className="flex gap-3 rounded-xl border border-line bg-bg p-4">
              <Cpu className="mt-0.5 size-5 text-device" aria-hidden />
              <div>
                <div className="text-[14px] font-semibold text-fg">Processed on this device</div>
                <p className="text-[13px] text-fg-2">Chrome's built-in model on desktop; Gemini Nano on supported Android phones.</p>
              </div>
            </div>
            <div className="flex gap-3 rounded-xl border border-line bg-bg p-4">
              <Cloud className="mt-0.5 size-5 text-cloud" aria-hidden />
              <div>
                <div className="text-[14px] font-semibold text-fg">Processed in the cloud</div>
                <p className="text-[13px] text-fg-2">Gemini via Firebase AI Logic, protected by App Check — used for cross-meeting reasoning or when on-device isn't available.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-8 text-[12.5px] text-fg-3">
        <Logo />
        <span>Open source under Apache-2.0 · Built with Firebase AI Logic hybrid inference</span>
      </footer>
    </div>
  );
}
