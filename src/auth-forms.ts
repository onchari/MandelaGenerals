import { login, register, sendPasswordReset } from './services/auth.service';
import { isFirebaseConfigured } from './config/firebase';

function showMessage(element: HTMLElement | null, message: string, isError = true): void {
  if (!element) {
    return;
  }

  element.textContent = message;
  element.style.display = 'block';
  element.style.color = isError ? '#dc3545' : '#198754';
  element.style.marginTop = '10px';
  element.style.fontSize = '14px';
}

function getInputValue(selector: string, trim = true): string {
  const element = document.querySelector(selector) as HTMLInputElement | null;
  if (!element) {
    return '';
  }

  return trim ? element.value.trim() : element.value;
}

function handlePasswordToggle(): void {
  const toggles = document.querySelectorAll('.toggle-password');
  toggles.forEach((toggle) => {
    toggle.addEventListener('click', () => {
      const target = toggle.parentElement?.querySelector('input');
      if (!target) {
        return;
      }

      const isHidden = target.type === 'password';
      target.type = isHidden ? 'text' : 'password';
      toggle.classList.toggle('fa-eye', isHidden);
      toggle.classList.toggle('fa-eye-slash', !isHidden);
    });
  });
}

function bindSignIn(): void {
  const form = document.querySelector('#signin-form');
  if (!form) {
    return;
  }

  const message = document.querySelector('#signin-message') as HTMLElement | null;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const email = getInputValue('#signin-email');
    const password = getInputValue('#signin-password', false);

    if (!email || !password) {
      showMessage(message, 'Please enter both email and password.');
      return;
    }

    if (!isFirebaseConfigured) {
      showMessage(message, 'Firebase is not configured yet. Add your VITE_FIREBASE_* values to .env.local.', true);
      return;
    }

    try {
      await login(email, password);
      window.location.href = 'index.html';
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Unable to sign in.';
      showMessage(message, messageText, true);
    }
  });
}

function bindSignUp(): void {
  const form = document.querySelector('#signup-form');
  if (!form) {
    return;
  }

  const message = document.querySelector('#signup-message') as HTMLElement | null;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const fullName = getInputValue('#signup-name');
    const email = getInputValue('#signup-email');
    const password = getInputValue('#signup-password', false);

    if (!fullName || !email || !password) {
      showMessage(message, 'Please complete all fields to create your account.');
      return;
    }

    if (!isFirebaseConfigured) {
      showMessage(message, 'Firebase is not configured yet. Add your VITE_FIREBASE_* values to .env.local.', true);
      return;
    }

    try {
      await register(fullName, email, password);
      window.location.href = 'index.html';
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Unable to create the account.';
      showMessage(message, messageText, true);
    }
  });
}

function bindPasswordReset(): void {
  const form = document.querySelector('#forgot-password-form');
  if (!form) {
    return;
  }

  const message = document.querySelector('#forgot-password-message') as HTMLElement | null;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const email = getInputValue('#forgot-password-email');
    if (!email) {
      showMessage(message, 'Please enter your email address.');
      return;
    }

    if (!isFirebaseConfigured) {
      showMessage(message, 'Firebase is not configured yet. Add your VITE_FIREBASE_* values to .env.local.');
      return;
    }

    try {
      await sendPasswordReset(email);
      showMessage(
        message,
        'If an account exists for that email, a password reset link will be sent.',
        false,
      );
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'auth/user-not-found') {
        showMessage(
          message,
          'If an account exists for that email, a password reset link will be sent.',
          false,
        );
        return;
      }

      const messageText = error instanceof Error ? error.message : 'Unable to send a password reset email.';
      showMessage(message, messageText);
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  handlePasswordToggle();
  bindSignIn();
  bindSignUp();
  bindPasswordReset();
});
