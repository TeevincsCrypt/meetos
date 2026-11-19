import { Link } from 'react-router';
import { Settings2 } from 'lucide-react';
import { Logo } from '@/components/brand';
import { missingConfigKeys } from '@/lib/config';

/** Shown when the build has no Firebase configuration. Nothing is faked. */
export function SetupRequiredPage() {
  return (
    <div className="flex min-h-screen flex-col items-center bg-bg px-4 py-12">
      <Link to="/">
        <Logo />
      </Link>
      <div className="mt-10 w-full max-w-xl rounded-2xl border border-line bg-surface p-7 shadow-pop">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Settings2 className="size-5" aria-hidden />
          </span>
          <h1 className="text-[18px] font-semibold text-fg">Connect MEETOS to Firebase</h1>
        </div>
        <p className="mt-3 text-[13.5px] leading-relaxed text-fg-2">
          This build doesn't have a Firebase configuration yet, so sign-in, storage and AI are disabled. Missing:{' '}
          <code className="rounded bg-surface-2 px-1 font-mono text-[12px]">{missingConfigKeys.join(', ')}</code>
        </p>
        <ol className="mt-5 list-decimal space-y-2 pl-5 text-[13.5px] text-fg-2">
          <li>Create a Firebase project and add a <strong className="text-fg">Web app</strong> (Project settings → Your apps).</li>
          <li>Copy <code className="font-mono text-[12px]">apps/web/.env.example</code> to <code className="font-mono text-[12px]">apps/web/.env.local</code> and paste the config values.</li>
          <li>Enable Authentication (Google + Email/Password), Cloud Firestore and <strong className="text-fg">Firebase AI Logic</strong>.</li>
          <li>Restart <code className="font-mono text-[12px]">pnpm dev</code>.</li>
        </ol>
        <p className="mt-5 text-[13px] text-fg-3">
          The full checklist, including App Check and security rules deployment, is in <code className="font-mono text-[12px]">docs/SETUP.md</code>.
          To try the app locally without a Firebase project, run <code className="font-mono text-[12px]">pnpm emulators</code> and{' '}
          <code className="font-mono text-[12px]">pnpm dev:emulators</code>.
        </p>
      </div>
    </div>
  );
}
