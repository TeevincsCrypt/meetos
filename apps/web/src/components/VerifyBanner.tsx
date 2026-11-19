import { useState } from 'react';
import { toast } from 'sonner';
import { MailCheck } from 'lucide-react';
import { useSession } from '@/state/auth';
import { Button } from './ui';

/** Password accounts need a verified email to accept workspace invites. */
export function VerifyBanner() {
  const { user, resendVerification, reloadUser } = useSession();
  const [busy, setBusy] = useState(false);
  const isPassword = user.providerData.some((p) => p.providerId === 'password');
  if (!isPassword || user.emailVerified || user.isAnonymous) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line bg-accent-soft px-4 py-2 text-[13px] text-fg-2 sm:px-6">
      <MailCheck className="size-4 text-accent" aria-hidden />
      <span className="flex-1">Verify your email ({user.email}) so teammates can invite you to their workspaces.</span>
      <Button
        size="sm"
        variant="ghost"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await resendVerification();
            toast.success('Verification email sent');
          } catch {
            toast.error('Could not send the email. Try again later.');
          } finally {
            setBusy(false);
          }
        }}
      >
        Resend email
      </Button>
      <Button size="sm" variant="secondary" onClick={() => void reloadUser()}>
        I've verified
      </Button>
    </div>
  );
}
