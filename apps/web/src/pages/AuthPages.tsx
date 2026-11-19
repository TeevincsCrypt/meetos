import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Logo } from '@/components/brand';
import { Button, ErrorNote, Field, Input } from '@/components/ui';
import { authErrorMessage, useAuth } from '@/state/auth';
import { useEmulators } from '@/lib/config';

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8Z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.6H2.1v2.9A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.8 14c-.2-.7-.4-1.4-.4-2s.1-1.4.4-2V7.1H2.1a11 11 0 0 0 0 9.8L5.8 14Z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1L5.8 10C6.7 7.3 9.1 5.4 12 5.4Z" />
    </svg>
  );
}

function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-4 py-10">
      <Link to="/" className="mb-8">
        <Logo />
      </Link>
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-pop">
        <h1 className="text-[19px] font-semibold tracking-tight text-fg">{title}</h1>
        <p className="mt-1 text-[13.5px] text-fg-2">{subtitle}</p>
        <div className="mt-6">{children}</div>
      </div>
      <div className="mt-5 text-[13px] text-fg-2">{footer}</div>
    </div>
  );
}

function GoogleButton() {
  const { signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button
        variant="secondary"
        size="lg"
        className="w-full justify-center"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await signInWithGoogle();
          } catch (e) {
            setError(authErrorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {!busy && <GoogleIcon />} Continue with Google
      </Button>
      {error && <ErrorNote className="mt-3">{error}</ErrorNote>}
      <div className="my-5 flex items-center gap-3 text-[12px] text-fg-3">
        <span className="h-px flex-1 bg-line" /> or with email <span className="h-px flex-1 bg-line" />
      </div>
    </>
  );
}

export function SignInPage() {
  const { signInWithEmail, resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInWithEmail(email, password);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your MEETOS workspace." footer={<>New to MEETOS? <Link to="/signup" className="font-medium text-brand-text hover:underline">Create an account</Link></>}>
      {!useEmulators && <GoogleButton />}
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <ErrorNote>{error}</ErrorNote>}
        <Button type="submit" variant="primary" size="lg" className="w-full justify-center" loading={busy}>
          Sign in
        </Button>
        <button
          type="button"
          className="w-full text-center text-[12.5px] text-fg-3 hover:text-fg-2"
          onClick={async () => {
            if (!email) return setError('Enter your email first, then click "Forgot password".');
            try {
              await resetPassword(email);
              toast.success('Password reset email sent');
            } catch (err) {
              setError(authErrorMessage(err));
            }
          }}
        >
          Forgot password?
        </button>
      </form>
    </AuthLayout>
  );
}

export function SignUpPage() {
  const { signUpWithEmail } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signUpWithEmail(name, email, password);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Create your account" subtitle="Start turning meetings into commitments." footer={<>Already have an account? <Link to="/signin" className="font-medium text-brand-text hover:underline">Sign in</Link></>}>
      {!useEmulators && <GoogleButton />}
      <form onSubmit={submit} className="space-y-4">
        <Field label="Your name" htmlFor="name">
          <Input id="name" autoComplete="name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Work email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" htmlFor="password" hint="At least 8 characters.">
          <Input id="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <ErrorNote>{error}</ErrorNote>}
        <Button type="submit" variant="primary" size="lg" className="w-full justify-center" loading={busy}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
