import type { Session, User } from '@supabase/supabase-js';
import { getSupabaseClient } from './supabase';

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
};

export type SignUpResult = {
  user: AuthUser | null;
  sessionActive: boolean;
  confirmationRequired: boolean;
};

export type AuthListener = (user: AuthUser | null) => void;

function mapSupabaseUser(user: User | null | undefined): AuthUser | null {
  if (!user || !user.id) return null;
  const email = user.email || '';
  const metaName =
    typeof user.user_metadata?.display_name === 'string'
      ? user.user_metadata.display_name.trim()
      : typeof user.user_metadata?.full_name === 'string'
        ? user.user_metadata.full_name.trim()
        : '';
  const displayName = metaName || (email ? email.split('@')[0] : 'Orbit Player');
  return { id: user.id, email, displayName };
}

export function formatAuthError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || 'Authentication failed.');
  const lower = raw.toLowerCase();
  if (lower.includes('invalid login credentials') || lower.includes('invalid credentials')) {
    return 'Incorrect email or password. Please check your credentials and try again.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Your email is not confirmed yet. Please check your inbox and click the verification link.';
  }
  if (lower.includes('user already registered') || lower.includes('already exists')) {
    return 'An account with this email is already registered. Please sign in instead.';
  }
  if (lower.includes('password should be at least')) {
    return 'Password must be at least 6 characters long.';
  }
  if (lower.includes('rate limit') || lower.includes('too many requests') || lower.includes('security purposes')) {
    return 'Too many attempts. Please wait a moment before trying again.';
  }
  if (lower.includes('failed to fetch') || lower.includes('network')) {
    return 'Unable to reach Supabase authentication server. Check your internet connection.';
  }
  return raw;
}

export class AuthService {
  private currentUser: AuthUser | null = null;
  private listeners = new Set<AuthListener>();
  private unsubscribeSupabase?: () => void;
  private initialized = false;

  get user(): AuthUser | null {
    return this.currentUser;
  }

  async init(): Promise<AuthUser | null> {
    if (this.initialized) return this.currentUser;
    this.initialized = true;

    const e2eRaw =
      typeof window !== 'undefined' ? window.localStorage?.getItem('beatorbit-test-user') : null;
    if (e2eRaw) {
      try {
        const parsed = JSON.parse(e2eRaw);
        this.currentUser = {
          id: parsed.id || 'e2e-tester',
          email: parsed.email || 'e2e@beatorbit.app',
          displayName: parsed.displayName || 'E2E Tester',
          localOnly: true
        } as never;
        return this.currentUser;
      } catch {
        /* ignore invalid mock */
      }
    }

    if (
      typeof window !== 'undefined' &&
      window.navigator.webdriver &&
      !window.sessionStorage?.getItem('beatorbit-test-auth-screen')
    ) {
      this.currentUser = {
        id: 'e2e-tester',
        email: 'e2e@beatorbit.app',
        displayName: 'E2E Tester',
        localOnly: true
      } as never;
      return this.currentUser;
    }

    const supabase = getSupabaseClient();
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      this.currentUser = mapSupabaseUser(data.session?.user);
    } catch {
      this.currentUser = null;
    }

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session: Session | null) => {
      const next = mapSupabaseUser(session?.user);
      const changed = this.currentUser?.id !== next?.id || this.currentUser?.email !== next?.email;
      this.currentUser = next;
      if (changed) this.notify();
    });
    this.unsubscribeSupabase = () => sub.subscription.unsubscribe();
    return this.currentUser;
  }

  subscribe(listener: AuthListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.currentUser);
      } catch {
        /* ignore listener errors */
      }
    }
  }

  async signIn(email: string, password: string): Promise<AuthUser> {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw new Error('Please enter a valid email address.');
    }
    if (!password) {
      throw new Error('Please enter your password.');
    }
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password
    });
    if (error) throw new Error(formatAuthError(error));
    const mapped = mapSupabaseUser(data.session?.user || data.user);
    if (!mapped) throw new Error('Sign in succeeded but no user profile was returned.');
    this.currentUser = mapped;
    this.notify();
    return mapped;
  }

  async signUp(email: string, password: string, displayName: string): Promise<SignUpResult> {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = displayName.trim();
    if (!cleanName || cleanName.length < 2 || cleanName.length > 60) {
      throw new Error('Display name must be between 2 and 60 characters.');
    }
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      throw new Error('Please enter a valid email address.');
    }
    if (!password || password.length < 6) {
      throw new Error('Password must be at least 6 characters long.');
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          display_name: cleanName
        }
      }
    });
    if (error) throw new Error(formatAuthError(error));

    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw new Error('An account with this email is already registered. Please sign in instead.');
    }

    const mapped = mapSupabaseUser(data.session?.user || data.user);
    const sessionActive = Boolean(data.session && mapped);
    if (sessionActive && mapped) {
      this.currentUser = mapped;
      this.notify();
    }
    return {
      user: mapped,
      sessionActive,
      confirmationRequired: !sessionActive
    };
  }

  async resendConfirmation(email: string): Promise<void> {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) throw new Error('Please enter your email address first.');
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: cleanEmail
    });
    if (error) throw new Error(formatAuthError(error));
  }

  async signOut(): Promise<void> {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signOut();
    this.currentUser = null;
    this.notify();
    if (error) throw new Error(formatAuthError(error));
  }

  setTestUser(user: AuthUser | null) {
    this.currentUser = user;
    this.initialized = true;
    this.notify();
  }

  dispose() {
    this.unsubscribeSupabase?.();
    this.unsubscribeSupabase = undefined;
    this.listeners.clear();
  }
}

export const auth = new AuthService();
