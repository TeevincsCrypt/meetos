import type { ReactNode } from 'react';
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
  MicOff,
  Moon,
  Pin,
  Quote,
  ShieldCheck,
  Sparkles,
  Sun,
  Video,
} from 'lucide-react';
import { Logo } from '@/components/brand';
import { Avatar, ButtonLink, cn, HighlightTitle } from '@/components/ui';
import { useTheme } from '@/components/AppShell';

/* ------------------------------------------------------------------ product preview */

function Chip({ children, tone = 'neutral', icon: Icon }: { children: ReactNode; tone?: 'neutral' | 'brand' | 'device' | 'warning' | 'success' | 'danger'; icon?: typeof Cpu }) {
  const t = {
    neutral: 'bg-surface-2 text-fg-2',
    brand: 'bg-brand-soft text-brand-text',
    device: 'bg-device-soft text-device',
    warning: 'bg-warning-soft text-warning',
    success: 'bg-success-soft text-success',
    danger: 'bg-danger-soft text-danger',
  }[tone];
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium whitespace-nowrap', t)}>
      {Icon && <Icon className="size-3" aria-hidden />}
      {children}
    </span>
  );
}

const PEOPLE = [
  { name: 'Daniel Okafor', role: 'Speaking now', active: true },
  { name: 'Maya Chen', role: 'Product lead' },
  { name: 'Priya Raman', role: 'Design' },
  { name: 'Leo Martins', role: 'Marketing' },
];

/** An illustrative composition of MEETOS screens (fictional sample names). */
function ProductPreview() {
  return (
    <div className="rounded-[28px] border border-line bg-surface/70 p-2 shadow-pop backdrop-blur sm:p-3" aria-label="Preview of a MEETOS meeting room" role="img">
      <div className="flex items-center gap-1.5 px-3 pt-1.5 pb-3">
        <span className="size-2.5 rounded-full bg-[#ff5f57]" />
        <span className="size-2.5 rounded-full bg-[#febc2e]" />
        <span className="size-2.5 rounded-full bg-[#28c840]" />
        <span className="mx-auto hidden rounded-full bg-surface-2 px-4 py-1 text-[11px] text-fg-3 sm:block">meetos.app / meetings / weekly-launch-sync</span>
      </div>
      <div className="grid grid-cols-1 gap-3 rounded-[22px] bg-bg p-3 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-3">
          {/* meeting header */}
          <div className="rounded-[18px] border border-line bg-surface p-4">
            <div className="flex items-start justify-between">
              <Chip tone="success" icon={CheckCircle2}>Consent confirmed</Chip>
              <Chip tone="brand">4 participants</Chip>
            </div>
            <div className="mt-1 text-center">
              <div className="text-[19px] font-semibold tracking-tight text-fg">
                <HighlightTitle text="Weekly launch sync" highlight="launch" />
              </div>
              <div className="text-[11.5px] text-fg-3">Lumen beta · project</div>
            </div>
            <div className="mt-3 flex items-end justify-between">
              <div>
                <div className="text-[10.5px] text-fg-3">Meet date</div>
                <div className="text-[15px] font-medium text-fg tabular-nums">Nov 17, 2026</div>
              </div>
              <div className="text-right">
                <div className="text-[10.5px] text-fg-3">Recording time</div>
                <div className="flex items-center gap-1.5 text-[15px] font-medium text-fg tabular-nums">
                  <span className="rec-dot size-2.5 rounded-full bg-danger" />
                  <span className="font-mono">00:14:35</span>
                </div>
              </div>
            </div>
          </div>
          {/* stage */}
          <div className="rounded-[18px] border border-line bg-surface p-2">
            <div className="relative flex flex-col items-center rounded-2xl border border-brand/15 bg-gradient-to-b from-surface-2 to-surface px-4 pt-10 pb-6 text-center">
              <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-surface py-0.5 pr-2.5 pl-0.5 text-[11px] font-medium text-fg shadow-card">
                <Avatar name="Daniel Okafor" size={18} /> Daniel Okafor
              </span>
              <span className="absolute top-3 right-3 flex size-8 items-center justify-center rounded-full bg-brand-soft text-brand-text">
                <Mic className="size-3.5" />
              </span>
              <Avatar name="Daniel Okafor" size={64} />
              <p className="mt-4 max-w-md text-[14px] leading-relaxed text-fg">
                “I need more time on the landing page — I'll have it finished by next Wednesday instead.”
              </p>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {['Maya Chen', 'Priya Raman'].map((n) => (
                <div key={n} className="relative flex h-20 items-center justify-center rounded-xl bg-surface-2">
                  <Avatar name={n} size={36} />
                  <span className="absolute bottom-1.5 left-1.5 rounded-full bg-surface/90 px-2 py-px text-[10px] font-medium text-fg">{n}</span>
                  <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-surface/90 text-fg-3"><MicOff className="size-2.5" /></span>
                </div>
              ))}
              <div className="flex h-20 items-center justify-center rounded-xl bg-surface-2 text-[13px] font-semibold text-fg-2">+2</div>
            </div>
          </div>
          {/* controls */}
          <div className="flex items-center justify-center gap-2.5">
            <span className="flex size-10 items-center justify-center rounded-full bg-brand-soft text-brand-text"><Mic className="size-4" /></span>
            <span className="rounded-full bg-danger px-7 py-2.5 text-[13px] font-medium text-white shadow-[0_6px_16px_-6px_rgba(224,50,43,0.5)]">End & save</span>
            <span className="flex size-10 items-center justify-center rounded-full bg-surface-2 text-fg-2"><Video className="size-4" /></span>
          </div>
        </div>

        <div className="min-w-0 space-y-3">
          <div className="rounded-[18px] border border-line bg-surface">
            <div className="flex items-center gap-2 px-4 pt-4 pb-2.5 text-[15px] font-semibold text-fg">
              Participants <span className="rounded-full bg-brand px-1.5 py-px text-[10px] text-white dark:text-[#120d2b]">4</span>
            </div>
            <ul className="border-t border-line pb-1.5">
              {PEOPLE.map((p) => (
                <li key={p.name} className={cn('flex items-center gap-2.5 px-4 py-2', p.active && 'bg-surface-2')}>
                  <Avatar name={p.name} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-medium text-fg">{p.name}</div>
                    <div className={cn('text-[10.5px]', p.active ? 'text-brand-text' : 'text-fg-3')}>{p.role}</div>
                  </div>
                  <Pin className={cn('size-3.5', p.active ? 'text-brand' : 'text-fg-3/60')} />
                  {p.active ? <Mic className="size-3.5 text-brand" /> : <MicOff className="size-3.5 text-fg-3/60" />}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-[18px] border border-line bg-surface p-4">
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-semibold text-fg">Detected</span>
              <Chip tone="device" icon={Cpu}>On this device</Chip>
            </div>
            <div className="mt-3 space-y-2.5">
              <div className="rounded-xl border border-line p-2.5">
                <div className="flex items-center gap-1.5"><Handshake className="size-3.5 text-brand" /><span className="text-[11.5px] font-medium text-fg">Finish the landing page</span></div>
                <div className="mt-1.5 flex flex-wrap gap-1"><Chip>Daniel Okafor</Chip><Chip>Due Wed</Chip><Chip tone="warning">Deadline moved</Chip></div>
              </div>
              <div className="rounded-xl border border-line p-2.5">
                <div className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-device" /><span className="text-[11.5px] font-medium text-fg">Send onboarding mockups</span></div>
                <div className="mt-1.5 flex flex-wrap gap-1"><Chip tone="device">Reported done · confirm?</Chip></div>
              </div>
              <div className="rounded-xl border border-line p-2.5">
                <div className="flex items-center gap-1.5"><Gavel className="size-3.5 text-brand" /><span className="text-[11.5px] font-medium text-fg">Beta price is $24 per seat</span></div>
                <div className="mt-1.5 flex flex-wrap gap-1"><Chip tone="brand">Replaces $19 decision</Chip></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ sections */

const FEATURES = [
  { icon: Handshake, title: 'Commitment Graph', text: 'Every promise becomes a commitment with an owner, deadline, transcript evidence and a timeline that follows it across meetings.' },
  { icon: Gavel, title: 'Decision memory', text: 'What was decided, who agreed, which alternatives were discussed — and when a later decision replaced it.' },
  { icon: Brain, title: 'Ask your meetings', text: '“What happened to the website redesign?” Answers come only from your workspace, with citations to the exact lines.' },
  { icon: ClipboardList, title: 'Prepare for meetings', text: 'A briefing of outstanding work, overdue items, open questions and blockers — with an agenda you can edit and save.' },
  { icon: BarChart3, title: 'Execution monitor', text: 'Completion rate, overdue and repeatedly postponed work, by person and project. Real numbers, never estimates.' },
  { icon: Mic, title: 'Live capture or import', text: 'Transcribe in the browser with explicit consent and a visible recording indicator, or import .txt, .vtt and .srt files.' },
];

function SectionTitle({ eyebrow, title, highlight, children }: { eyebrow: string; title: string; highlight: string; children?: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <span className="inline-flex rounded-full bg-brand-soft px-3 py-1 text-[12px] font-medium text-brand-text">{eyebrow}</span>
      <h2 className="mt-4 text-[30px] leading-tight font-semibold tracking-[-0.02em] text-fg sm:text-[36px]">
        <HighlightTitle text={title} highlight={highlight} />
      </h2>
      {children && <p className="mt-3 text-[15px] leading-relaxed text-fg-2">{children}</p>}
    </div>
  );
}

function GraphTrack() {
  const steps = [
    { meeting: 'Beta launch planning', when: 'Mon', quote: '“I\'ll finish the landing page before Friday.”', tag: 'Created', tone: 'brand' as const },
    { meeting: 'Weekly sync', when: 'Next Mon', quote: '“…I\'ll have it finished by next Wednesday instead.”', tag: 'Deadline moved', tone: 'warning' as const },
    { meeting: 'Launch review', when: 'Thu', quote: '“The landing page is finished.”', tag: 'Says done', tone: 'device' as const },
  ];
  return (
    <div className="rounded-[24px] border border-line bg-surface p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <Avatar name="Daniel Okafor" size={40} />
          <div>
            <div className="text-[11px] font-medium tracking-wide text-fg-3 uppercase">Commitment</div>
            <div className="text-[16px] font-semibold text-fg">Finish the landing page</div>
          </div>
        </div>
        <Chip tone="warning">Deadline changed 1×</Chip>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-[repeat(3,minmax(0,1fr))_140px]">
        {steps.map((s, i) => (
          <div key={s.meeting} className="relative rounded-2xl border border-line bg-surface-2/60 p-3.5">
            <div className="flex items-center justify-between text-[11px] text-fg-3">
              <span>{i === 0 ? 'Origin' : `Follow-up ${i}`} · {s.when}</span>
              <Chip tone={s.tone}>{s.tag}</Chip>
            </div>
            <div className="mt-1.5 text-[13px] font-medium text-fg">{s.meeting}</div>
            <p className="mt-1.5 flex gap-1.5 text-[12px] leading-relaxed text-fg-2">
              <Quote className="mt-0.5 size-3 shrink-0 text-accent" aria-hidden />
              {s.quote}
            </p>
          </div>
        ))}
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-brand/40 bg-brand-soft/50 p-3 text-center">
          <CheckCircle2 className="size-5 text-brand" aria-hidden />
          <div className="mt-1 text-[12.5px] font-semibold text-brand-text">You confirm</div>
          <div className="text-[11px] text-fg-3">AI never closes tasks</div>
        </div>
      </div>
    </div>
  );
}

export function LandingPage({ setupMode }: { setupMode?: boolean }) {
  const { dark, toggle } = useTheme();
  const start = setupMode ? '/setup' : '/signup';
  return (
    <div className="min-h-screen overflow-x-hidden bg-bg">
      <header className="sticky top-0 z-30 border-b border-line/60 bg-bg/80 backdrop-blur">
        <div className="mx-auto flex h-[72px] max-w-6xl items-center gap-3 px-5">
          <div className="flex flex-1 items-center"><Logo /></div>
          <nav aria-label="Sections" className="hidden items-center gap-1 rounded-full border border-line bg-surface p-1.5 shadow-card md:flex">
            {[
              ['#product', 'Product'],
              ['#graph', 'Commitment Graph'],
              ['#hybrid', 'Hybrid AI'],
              ['#privacy', 'Privacy'],
            ].map(([href, label]) => (
              <a key={href} href={href} className="rounded-full px-3.5 py-2 text-[12.5px] font-medium text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg">
                {label}
              </a>
            ))}
          </nav>
          <div className="flex flex-1 items-center justify-end gap-2">
            <button onClick={toggle} aria-label="Toggle theme" className="flex size-10 items-center justify-center rounded-full border border-line bg-surface text-fg-2 hover:text-fg">
              {dark ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
            </button>
            {setupMode ? (
              <ButtonLink to="/setup" variant="primary">Finish setup</ButtonLink>
            ) : (
              <>
                <ButtonLink to="/signin" variant="ghost" className="hidden sm:flex">Sign in</ButtonLink>
                <ButtonLink to="/signup" variant="primary">Get started</ButtonLink>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section id="product" className="relative">
        <div className="dot-grid pointer-events-none absolute inset-x-0 top-0 h-[560px] [mask-image:linear-gradient(to_bottom,black,transparent)] opacity-60" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-5 pt-14 pb-16 sm:pt-20">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[12px] font-medium text-fg-2 shadow-card">
              <span className="flex size-5 items-center justify-center rounded-full bg-brand-soft text-brand-text"><Sparkles className="size-3" aria-hidden /></span>
              Hybrid AI · on-device first with Firebase AI Logic
            </span>
            <h1 className="mt-6 text-[38px] leading-[1.08] font-semibold tracking-[-0.03em] text-fg sm:text-[56px]">
              Meetings shouldn't end with notes. They should end with <span className="text-brand-text">work getting done.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-[16px] leading-relaxed text-fg-2">
              MEETOS turns conversations into decisions, commitments, owners and deadlines — then follows every commitment
              across later meetings until a person confirms it's done.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <ButtonLink to={start} variant="primary" size="lg">
                Start your workspace <ArrowRight className="size-4" aria-hidden />
              </ButtonLink>
              <a href="#how" className="inline-flex h-12 items-center rounded-full border border-line bg-surface px-6 text-[14.5px] font-medium text-fg transition-colors hover:border-line-strong">
                See how it works
              </a>
            </div>
            <ul className="mt-7 flex flex-wrap justify-center gap-x-6 gap-y-2 text-[12.5px] text-fg-2">
              <li className="flex items-center gap-1.5"><ShieldCheck className="size-4 text-brand" aria-hidden /> Evidence for every item</li>
              <li className="flex items-center gap-1.5"><Lock className="size-4 text-brand" aria-hidden /> Workspace-level access control</li>
              <li className="flex items-center gap-1.5"><Cpu className="size-4 text-brand" aria-hidden /> Local processing when supported</li>
            </ul>
          </div>
          <div className="mx-auto mt-14 max-w-5xl">
            <ProductPreview />
            <p className="mt-3 text-center text-[11.5px] text-fg-3">Illustrative preview with fictional sample names.</p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl px-5 py-20">
        <SectionTitle eyebrow="How it works" title="From conversation to accountability" highlight="accountability" />
        <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
          {[
            { n: '01', icon: FileText, t: 'Capture', d: 'Record live with consent, or import a transcript. Speaker names come from the transcript — never invented.' },
            { n: '02', icon: Cpu, t: 'Extract', d: 'Short transcript chunks are analysed on your device when supported, in the cloud otherwise. Every result is checked against the transcript before it is saved.' },
            { n: '03', icon: GitBranch, t: 'Follow through', d: 'Later meetings are linked to earlier commitments automatically: progress, blockers, moved deadlines and “it’s done” claims.' },
          ].map((s) => (
            <div key={s.n} className="rounded-[24px] border border-line bg-surface p-6 shadow-card">
              <div className="flex items-center justify-between">
                <span className="flex size-11 items-center justify-center rounded-full bg-brand-soft text-brand-text"><s.icon className="size-5" aria-hidden /></span>
                <span className="text-[28px] font-semibold tracking-tight text-surface-3">{s.n}</span>
              </div>
              <h3 className="mt-5 text-[17px] font-semibold text-fg">{s.t}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-fg-2">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Commitment Graph */}
      <section id="graph" className="border-y border-line bg-surface/60">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <SectionTitle eyebrow="The differentiator" title="One promise, followed across every meeting" highlight="followed">
            Most tools stop at the summary. MEETOS remembers who committed to what, connects it to later conversations, and
            waits for a person — not a model — to say it's done.
          </SectionTitle>
          <div className="mt-12"><GraphTrack /></div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <SectionTitle eyebrow="Product" title="Everything a meeting leaves behind, organised" highlight="organised" />
        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-[24px] border border-line bg-surface p-6 shadow-card">
              <span className="flex size-11 items-center justify-center rounded-full bg-brand-soft text-brand-text"><f.icon className="size-5" aria-hidden /></span>
              <h3 className="mt-4 text-[16px] font-semibold text-fg">{f.title}</h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-fg-2">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Hybrid AI + privacy */}
      <section id="hybrid" className="mx-auto max-w-6xl px-5 pb-20">
        <div className="grid grid-cols-1 gap-5 rounded-[28px] border border-line bg-surface p-6 shadow-card sm:p-10 lg:grid-cols-2">
          <div id="privacy">
            <span className="inline-flex rounded-full bg-brand-soft px-3 py-1 text-[12px] font-medium text-brand-text">Hybrid AI · Privacy</span>
            <h2 className="mt-4 text-[28px] leading-tight font-semibold tracking-[-0.02em] text-fg sm:text-[32px]">
              <HighlightTitle text="Private by design, honest about it" highlight="honest" />
            </h2>
            <p className="mt-3 text-[14.5px] leading-relaxed text-fg-2">
              Every AI result in MEETOS shows where it was produced — reported by the Firebase AI Logic SDK itself. Transcript
              extraction runs on-device whenever your browser or phone supports it, and you can turn cloud processing off entirely.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Chip tone="device" icon={Cpu}>On this device</Chip>
              <Chip tone="brand" icon={Cloud}>In the cloud</Chip>
              <Chip tone="warning" icon={Cloud}>Cloud fallback</Chip>
            </div>
          </div>
          <div className="grid gap-3">
            <div className="flex gap-4 rounded-2xl bg-surface-2 p-5">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-device-soft text-device"><Cpu className="size-5" aria-hidden /></span>
              <div>
                <div className="text-[15px] font-semibold text-fg">Processed on this device</div>
                <p className="mt-1 text-[13px] leading-relaxed text-fg-2">Chrome's built-in model on desktop; Gemini Nano on supported Android phones. Transcript chunks stay on the device for analysis.</p>
              </div>
            </div>
            <div className="flex gap-4 rounded-2xl bg-surface-2 p-5">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-cloud-soft text-cloud"><Cloud className="size-5" aria-hidden /></span>
              <div>
                <div className="text-[15px] font-semibold text-fg">Processed in the cloud</div>
                <p className="mt-1 text-[13px] leading-relaxed text-fg-2">Gemini via Firebase AI Logic, protected by App Check — for cross-meeting questions, or when on-device isn't available.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-5 pb-20">
        <div className="relative overflow-hidden rounded-[28px] bg-brand px-6 py-14 text-center sm:px-12">
          <div className="dot-grid pointer-events-none absolute inset-0 opacity-20" aria-hidden />
          <h2 className="relative text-[28px] leading-tight font-semibold tracking-[-0.02em] text-white sm:text-[36px] dark:text-[#120d2b]">
            Make your next meeting the one where things get done.
          </h2>
          <p className="relative mx-auto mt-3 max-w-xl text-[15px] text-white/80 dark:text-[#120d2b]/80">Free to start. Bring a transcript or record your next call.</p>
          <div className="relative mt-7 flex justify-center">
            <ButtonLink to={start} variant="secondary" size="lg" className="border-transparent">
              Create your workspace <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-8 text-[12.5px] text-fg-3">
          <Logo />
          <span>Open source under Apache-2.0 · Built with Firebase AI Logic hybrid inference</span>
        </div>
      </footer>
    </div>
  );
}
