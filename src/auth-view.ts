import { AuthService, formatAuthError, type AuthUser } from './auth';
import { esc, icon, toast } from './ui';

export type AuthMode = 'login' | 'signup';

export class AuthView {
  private mode: AuthMode = 'login';
  private busy = false;
  private errorMessage = '';
  private infoMessage = '';
  private confirmationEmail = '';
  private showPassword = false;
  private emailDraft = '';
  private nameDraft = '';

  constructor(
    private root: HTMLElement,
    private authService: AuthService,
    private logoHtml: string,
    private onAuthenticated: (user: AuthUser) => void
  ) {}

  mount(initialMode: AuthMode = 'login') {
    this.mode = initialMode;
    this.errorMessage = '';
    this.infoMessage = '';
    this.confirmationEmail = '';
    this.render();
  }

  private render() {
    const isLogin = this.mode === 'login';
    this.root.innerHTML = `
      <div class="auth-shell" data-auth-page="${this.mode}">
        <div class="auth-visual" aria-hidden="true">
          <div class="hero-grain"></div>
          <div class="auth-visual-top">
            <div class="auth-brand">${this.logoHtml}</div>
            <span class="auth-cloud-badge"><span class="live-dot"></span> SUPABASE CLOUD SYNC</span>
          </div>
          <div class="auth-visual-copy">
            <span class="hero-kicker"><span class="live-dot"></span> CLOUD-POWERED RHYTHM WORKSPACE</span>
            <h2>YOUR SOUND.<br>YOUR ACCOUNT.<br><em>EVERYWHERE.</em></h2>
            <p>Sign in to synchronize your imported music, custom Orbit Studio beatmaps, recovery drafts, and high scores securely in the cloud.</p>
            <div class="auth-features">
              <div>${icon('cloud')}<span><strong>Supabase Cloud Storage</strong><small>Tracks, charts, drafts & scores linked to your account</small></span></div>
              <div>${icon('shield')}<span><strong>Strict Account Isolation</strong><small>Protected by PostgreSQL Row-Level Security (RLS)</small></span></div>
              <div>${icon('studio')}<span><strong>Zero-Conflict Studio Sync</strong><small>Atomic chart revisions and instant local audio cache</small></span></div>
            </div>
          </div>
          <div class="auth-orbit-decor">
            <div class="orbit-glow"></div>
            <div class="hero-ring ring-1"></div>
            <div class="hero-ring ring-2"></div>
            <div class="hero-ring ring-3"></div>
            <div class="orbit-core"><span>BO</span><small>CLOUD / V2</small></div>
            <div class="orbit-node node-triangle">△</div>
            <div class="orbit-node node-circle">○</div>
            <div class="orbit-node node-square">□</div>
            <div class="orbit-node node-cross">×</div>
          </div>
        </div>

        <section class="auth-panel" aria-label="${isLogin ? 'Sign in to BeatOrbit' : 'Create a BeatOrbit account'}">
          <div class="auth-card panel">
            <div class="auth-mobile-brand">${this.logoHtml}</div>
            <div class="auth-tabs" role="tablist" aria-label="Authentication mode">
              <button type="button" role="tab" aria-selected="${isLogin}" class="auth-tab ${isLogin ? 'active' : ''}" data-auth-switch="login" ${this.busy ? 'disabled' : ''}>
                Sign In
              </button>
              <button type="button" role="tab" aria-selected="${!isLogin}" class="auth-tab ${!isLogin ? 'active' : ''}" data-auth-switch="signup" ${this.busy ? 'disabled' : ''}>
                Sign Up
              </button>
            </div>

            ${this.confirmationEmail ? this.renderConfirmation() : this.renderForm(isLogin)}
          </div>
          <footer class="auth-footer">
            <span>BeatOrbit Cloud Architecture · Powered by Supabase</span>
            <span>△ &nbsp; ○ &nbsp; □ &nbsp; ×</span>
          </footer>
        </section>
      </div>
    `;

    this.bindEvents();
  }

  private renderConfirmation(): string {
    return `
      <div class="auth-header">
        <span class="eyebrow">VERIFY YOUR EMAIL</span>
        <h1>Check your inbox<span class="title-dot">.</span></h1>
        <p>We sent a confirmation link to <strong>${esc(this.confirmationEmail)}</strong>. Click the link in your email to activate your account, then sign in below.</p>
      </div>
      ${this.errorMessage ? `<div class="auth-alert error" role="alert">${icon('info')}<span>${esc(this.errorMessage)}</span></div>` : ''}
      ${this.infoMessage ? `<div class="auth-alert info" role="status">${icon('check')}<span>${esc(this.infoMessage)}</span></div>` : ''}
      <div class="auth-actions-stack">
        <button type="button" class="button primary auth-submit" id="auth-back-login" ${this.busy ? 'disabled' : ''}>
          ${icon('arrow')} Go to Sign In
        </button>
        <button type="button" class="button ghost auth-submit" id="auth-resend" ${this.busy ? 'disabled' : ''}>
          ${this.busy ? 'Sending…' : 'Resend verification email'}
        </button>
      </div>
    `;
  }

  private renderForm(isLogin: boolean): string {
    return `
      <div class="auth-header">
        <span class="eyebrow">${isLogin ? 'WELCOME BACK' : 'NEW ACCOUNT'}</span>
        <h1>${isLogin ? 'Sign in to BeatOrbit' : 'Create your account'}<span class="title-dot">.</span></h1>
        <p>${isLogin ? 'Enter your account credentials to load your personal music library and charts.' : 'Register a new account to store your tracks, beatmaps, and scores in the cloud.'}</p>
      </div>

      ${this.errorMessage ? `<div class="auth-alert error" role="alert">${icon('info')}<span>${esc(this.errorMessage)}</span></div>` : ''}
      ${this.infoMessage ? `<div class="auth-alert info" role="status">${icon('check')}<span>${esc(this.infoMessage)}</span></div>` : ''}

      <form id="auth-form" class="auth-form" novalidate>
        ${
          !isLogin
            ? `<label>DISPLAY NAME
                <div class="auth-input-wrap">
                  ${icon('user')}
                  <input id="auth-name" name="displayName" type="text" maxlength="60" autocomplete="name" placeholder="Your stage name" value="${esc(this.nameDraft)}" required ${this.busy ? 'disabled' : ''}>
                </div>
              </label>`
            : ''
        }
        <label>EMAIL ADDRESS
          <div class="auth-input-wrap">
            ${icon('mail')}
            <input id="auth-email" name="email" type="email" maxlength="160" autocomplete="email" placeholder="you@example.com" value="${esc(this.emailDraft)}" required ${this.busy ? 'disabled' : ''}>
          </div>
        </label>
        <label>PASSWORD
          <div class="auth-input-wrap">
            ${icon('lock')}
            <input id="auth-password" name="password" type="${this.showPassword ? 'text' : 'password'}" maxlength="128" autocomplete="${isLogin ? 'current-password' : 'new-password'}" placeholder="${isLogin ? 'Enter your password' : 'At least 6 characters'}" required ${this.busy ? 'disabled' : ''}>
            <button type="button" class="auth-eye" id="auth-toggle-password" aria-label="${this.showPassword ? 'Hide password' : 'Show password'}" ${this.busy ? 'disabled' : ''}>
              ${this.showPassword ? 'HIDE' : 'SHOW'}
            </button>
          </div>
        </label>
        ${
          !isLogin
            ? `<label>CONFIRM PASSWORD
                <div class="auth-input-wrap">
                  ${icon('lock')}
                  <input id="auth-confirm-password" name="confirmPassword" type="${this.showPassword ? 'text' : 'password'}" maxlength="128" autocomplete="new-password" placeholder="Repeat your password" required ${this.busy ? 'disabled' : ''}>
                </div>
              </label>`
            : ''
        }

        <button type="submit" class="button primary auth-submit" id="auth-submit" ${this.busy ? 'disabled' : ''}>
          ${this.busy ? '<span class="spinner auth-spinner"></span><span>Processing…</span>' : `<span>${isLogin ? 'Sign In to Workspace' : 'Create Account'}</span>${icon('arrow')}`}
        </button>
      </form>

      <div class="auth-switch-prompt">
        <span>${isLogin ? "Don't have a BeatOrbit account yet?" : 'Already have a BeatOrbit account?'}</span>
        <button type="button" class="auth-link" data-auth-switch="${isLogin ? 'signup' : 'login'}" ${this.busy ? 'disabled' : ''}>
          ${isLogin ? 'Create an account' : 'Sign in instead'}
        </button>
      </div>
    `;
  }

  private bindEvents() {
    this.root.querySelectorAll<HTMLButtonElement>('[data-auth-switch]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.busy) return;
        const targetMode = btn.dataset.authSwitch as AuthMode;
        if (targetMode && targetMode !== this.mode) {
          this.captureDrafts();
          this.mode = targetMode;
          this.errorMessage = '';
          this.infoMessage = '';
          this.confirmationEmail = '';
          this.render();
        }
      });
    });

    const togglePwd = this.root.querySelector<HTMLButtonElement>('#auth-toggle-password');
    togglePwd?.addEventListener('click', () => {
      this.captureDrafts();
      const pwdVal = this.root.querySelector<HTMLInputElement>('#auth-password')?.value || '';
      const confirmVal =
        this.root.querySelector<HTMLInputElement>('#auth-confirm-password')?.value || '';
      this.showPassword = !this.showPassword;
      this.render();
      const pwdInput = this.root.querySelector<HTMLInputElement>('#auth-password');
      const confirmInput = this.root.querySelector<HTMLInputElement>('#auth-confirm-password');
      if (pwdInput) pwdInput.value = pwdVal;
      if (confirmInput) confirmInput.value = confirmVal;
    });

    const backLogin = this.root.querySelector<HTMLButtonElement>('#auth-back-login');
    backLogin?.addEventListener('click', () => {
      this.emailDraft = this.confirmationEmail || this.emailDraft;
      this.confirmationEmail = '';
      this.mode = 'login';
      this.errorMessage = '';
      this.infoMessage = 'Please sign in with your verified email and password.';
      this.render();
    });

    const resendBtn = this.root.querySelector<HTMLButtonElement>('#auth-resend');
    resendBtn?.addEventListener('click', () => {
      void this.handleResend();
    });

    const form = this.root.querySelector<HTMLFormElement>('#auth-form');
    form?.addEventListener('submit', e => {
      e.preventDefault();
      void this.handleSubmit();
    });
  }

  private captureDrafts() {
    const emailEl = this.root.querySelector<HTMLInputElement>('#auth-email');
    const nameEl = this.root.querySelector<HTMLInputElement>('#auth-name');
    if (emailEl) this.emailDraft = emailEl.value;
    if (nameEl) this.nameDraft = nameEl.value;
  }

  private async handleResend() {
    if (this.busy || !this.confirmationEmail) return;
    this.busy = true;
    this.errorMessage = '';
    this.infoMessage = '';
    this.render();
    try {
      await this.authService.resendConfirmation(this.confirmationEmail);
      this.infoMessage = 'Verification email has been resent. Please check your inbox and spam folder.';
    } catch (e) {
      this.errorMessage = formatAuthError(e);
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private async handleSubmit() {
    if (this.busy) return;
    this.captureDrafts();
    const email = this.emailDraft.trim();
    const name = this.nameDraft.trim();
    const password = this.root.querySelector<HTMLInputElement>('#auth-password')?.value || '';
    const confirmPassword =
      this.root.querySelector<HTMLInputElement>('#auth-confirm-password')?.value || '';

    this.errorMessage = '';
    this.infoMessage = '';

    if (this.mode === 'signup') {
      if (!name || name.length < 2) {
        this.errorMessage = 'Please enter a display name (at least 2 characters).';
        this.render();
        return;
      }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        this.errorMessage = 'Please enter a valid email address.';
        this.render();
        return;
      }
      if (password.length < 6) {
        this.errorMessage = 'Password must be at least 6 characters long.';
        this.render();
        return;
      }
      if (password !== confirmPassword) {
        this.errorMessage = 'Passwords do not match. Please verify your password confirmation.';
        this.render();
        return;
      }
    } else {
      if (!email || !email.includes('@')) {
        this.errorMessage = 'Please enter your registered email address.';
        this.render();
        return;
      }
      if (!password) {
        this.errorMessage = 'Please enter your password.';
        this.render();
        return;
      }
    }

    this.busy = true;
    this.render();

    try {
      if (this.mode === 'login') {
        const user = await this.authService.signIn(email, password);
        toast(`Welcome back, ${user.displayName}.`);
        this.onAuthenticated(user);
      } else {
        const outcome = await this.authService.signUp(email, password, name);
        if (outcome.sessionActive && outcome.user) {
          toast(`Account created! Welcome to BeatOrbit, ${outcome.user.displayName}.`);
          this.onAuthenticated(outcome.user);
        } else {
          this.confirmationEmail = email;
          this.busy = false;
          this.render();
        }
      }
    } catch (e) {
      this.errorMessage = formatAuthError(e);
      this.busy = false;
      this.render();
    }
  }
}
