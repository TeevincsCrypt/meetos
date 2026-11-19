import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { getFirebase } from '@/lib/firebase';
import { ensureUserProfile, updateUserProfile, displayNameOf } from '@/data/workspaces';
import type { UserProfile } from '@meetos/shared';
import type { Actor } from '@/data/activity';

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  actor: Actor | null;
  signInWithGoogle(): Promise<void>;
  signInWithEmail(email: string, password: string): Promise<void>;
  signUpWithEmail(name: string, email: string, password: string): Promise<void>;
  resetPassword(email: string): Promise<void>;
  resendVerification(): Promise<void>;
  reloadUser(): Promise<void>;
  updateName(name: string): Promise<void>;
  signOut(): Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function authErrorMessage(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email or password is incorrect.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try signing in.';
    case 'auth/weak-password':
      return 'Use at least 8 characters for your password.';
    case 'auth/invalid-email':
      return 'That email address is not valid.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Sign-in was cancelled.';
    case 'auth/operation-not-allowed':
      return 'This sign-in method is not enabled in the Firebase console (Authentication → Sign-in method).';
    case 'auth/unauthorized-domain':
      return 'This domain is not authorised for sign-in. Add it in Firebase console → Authentication → Settings → Authorized domains.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    default:
      return e instanceof Error ? e.message : 'Something went wrong.';
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { auth } = getFirebase();
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void setPersistence(auth, browserLocalPersistence).catch(() => undefined);
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          setProfile(await ensureUserProfile(u));
        } catch (e) {
          console.error('Profile load failed', e);
          setProfile({ uid: u.uid, displayName: displayNameOf(u), email: u.email, photoURL: u.photoURL, lastWorkspaceId: null, createdAt: Date.now() });
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
  }, [auth]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      profile,
      loading,
      actor: user ? { uid: user.uid, name: profile?.displayName || displayNameOf(user) } : null,
      async signInWithGoogle() {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        await signInWithPopup(auth, provider);
      },
      async signInWithEmail(email, password) {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      },
      async signUpWithEmail(name, email, password) {
        if (password.length < 8) throw Object.assign(new Error('weak'), { code: 'auth/weak-password' });
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(cred.user, { displayName: name.trim() });
        await updateUserProfile(cred.user.uid, { displayName: name.trim() });
        setProfile(await ensureUserProfile({ ...cred.user, displayName: name.trim() }));
        // Needed to accept workspace invitations (rules require a verified email).
        void sendEmailVerification(cred.user).catch(() => undefined);
      },
      async resetPassword(email) {
        await sendPasswordResetEmail(auth, email.trim());
      },
      async resendVerification() {
        if (auth.currentUser) await sendEmailVerification(auth.currentUser);
      },
      async reloadUser() {
        if (auth.currentUser) {
          await auth.currentUser.reload();
          await auth.currentUser.getIdToken(true);
          setUser(auth.currentUser);
        }
      },
      async updateName(name) {
        if (!auth.currentUser) return;
        await updateProfile(auth.currentUser, { displayName: name.trim() });
        await updateUserProfile(auth.currentUser.uid, { displayName: name.trim() });
        setProfile((p) => (p ? { ...p, displayName: name.trim() } : p));
      },
      async signOut() {
        await fbSignOut(auth);
      },
    }),
    [auth, user, profile, loading],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}

/** For pages under the protected layout: user and actor are guaranteed. */
export function useSession() {
  const a = useAuth();
  if (!a.user || !a.actor) throw new Error('useSession requires a signed-in user');
  return { ...a, user: a.user, actor: a.actor };
}
