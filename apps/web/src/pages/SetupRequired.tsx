import { Link } from 'react-router';
import { Settings2 } from 'lucide-react';
import { Logo } from '@/components/brand';
import { missingEnvVars } from '@/lib/config';

const isLocal = typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);

/** Shown when the build has no Firebase configuration. Nothing is faked. */
export function SetupRequiredPage() {
  return (
    <div className="flex min-h-screen flex-col items-center bg-bg px-4 py-12">
      <Link to="/">
        <Logo />
      </Link>
      <div className="mt-10 w-full max-w-xl rounded-[24px] border border-line bg-surface p-7 shadow-pop">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Settings2 className="size-5" aria-hidden />
          </span>
          <h1 className="text-[18px] font-semibold text-fg">Connect Meetos to Firebase</h1>
        </div>
        <p className="mt-3 text-[13.5px] leading-relaxed text-fg-2">
          This build was made without a Firebase configuration, so sign-in, storage and AI are disabled. These
          environment variables were empty when the site was built:
        </p>
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {missingEnvVars.map((v) => (
            <li key={v}>
              <code className="rounded-lg bg-surface-2 px-2 py-1 font-mono text-[12px] text-fg">{v}</code>
            </li>
          ))}
        </ul>

        {isLocal ? (
          <ol className="mt-5 list-decimal space-y-2 pl-5 text-[13.5px] text-fg-2">
            <li>Copy <code className="font-mono text-[12px]">apps/web/.env.example</code> to <code className="font-mono text-[12px]">apps/web/.env.local</code> and paste your Firebase web app config.</li>
            <li>Restart <code className="font-mono text-[12px]">pnpm dev</code>.</li>
            <li>No Firebase project yet? Run <code className="font-mono text-[12px]">pnpm emulators</code> and <code className="font-mono text-[12px]">pnpm dev:emulators</code> instead.</li>
          </ol>
        ) : (
          <ol className="mt-5 list-decimal space-y-2 pl-5 text-[13.5px] text-fg-2">
            <li>In your hosting dashboard (Vercel: <strong className="text-fg">Project → Settings → Environment Variables</strong>), add the variables above with the values from Firebase console → Project settings → Your apps → Web app → Config.</li>
            <li>Make sure each variable is enabled for <strong className="text-fg">Production</strong>, and that you added them to <strong className="text-fg">this</strong> project.</li>
            <li><strong className="text-fg">Redeploy</strong> (Deployments → ⋯ → Redeploy). Variables are built into the site, so a new build is required.</li>
          </ol>
        )}
        <p className="mt-5 text-[13px] text-fg-3">
          Full checklist, including Authentication, Firestore rules and Firebase AI Logic: <code className="font-mono text-[12px]">docs/SETUP.md</code>.
        </p>
      </div>
    </div>
  );
}
