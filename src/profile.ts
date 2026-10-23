import { onAuthStateChanged, reload, type User } from 'firebase/auth';
import { auth, firebaseEnvironmentError, isFirebaseConfigured } from './config/firebase';
import { sendPasswordReset, sendVerificationEmail } from './services/auth.service';
import { getUserBusinesses } from './services/business.service';
import {
  getUserProfile,
  saveUserProfile,
  type UserProfile,
} from './services/profile.service';

function requireElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`The profile page is missing ${selector}.`);
  }
  return element;
}

const form = requireElement<HTMLFormElement>('#profile-form');
const nameInput = requireElement<HTMLInputElement>('#profile-display-name');
const emailInput = requireElement<HTMLInputElement>('#profile-email');
const phoneInput = requireElement<HTMLInputElement>('#profile-phone');
const nameHeading = requireElement<HTMLElement>('#profile-name-heading');
const menuName = document.querySelector<HTMLElement>('#profile-menu-name');
const createdAtLabel = requireElement<HTMLElement>('#profile-created-at');
const notice = requireElement<HTMLElement>('#profile-message');
const saveButton = requireElement<HTMLButtonElement>('#profile-save');
const cancelButton = requireElement<HTMLButtonElement>('#profile-cancel');
const securitySection = requireElement<HTMLElement>('#profile-security');
const verificationStatus = requireElement<HTMLElement>('#profile-verification-status');
const sendVerificationButton = requireElement<HTMLButtonElement>('#profile-verification-send');
const refreshVerificationButton = requireElement<HTMLButtonElement>('#profile-verification-refresh');
const passwordResetButton = requireElement<HTMLButtonElement>('#profile-password-reset');
const businessesSection = requireElement<HTMLElement>('#profile-businesses');
const businessList = requireElement<HTMLUListElement>('#profile-business-list');
let currentUser: User | null = null;
let savedProfile: UserProfile | null = null;

function showNotice(message: string, isError = false): void {
  notice.textContent = message;
  notice.hidden = false;
  notice.classList.toggle('text-danger', isError);
  notice.classList.toggle('text-success', !isError);
}

function displayProfile(profile: UserProfile, user: User): void {
  savedProfile = profile;
  nameInput.value = profile.displayName;
  emailInput.value = profile.email;
  phoneInput.value = profile.phoneNumber;
  nameHeading.textContent = profile.displayName || 'Your profile';
  if (menuName) menuName.textContent = profile.displayName || 'Account';
  createdAtLabel.textContent = profile.createdAt
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(profile.createdAt)
    : 'Not available';
  verificationStatus.textContent = user.emailVerified ? 'Verified' : 'Not verified';
  verificationStatus.classList.toggle('text-success', user.emailVerified);
  verificationStatus.classList.toggle('text-danger', !user.emailVerified);
  sendVerificationButton.hidden = user.emailVerified;
  form.hidden = false;
  securitySection.hidden = false;
}

async function loadBusinesses(user: User): Promise<void> {
  try {
    const businesses = await getUserBusinesses(user.uid);
    businessList.replaceChildren();
    if (businesses.length === 0) {
      const emptyItem = document.createElement('li');
      emptyItem.className = 'list-group-item text-muted';
      emptyItem.textContent = 'You do not belong to any businesses yet.';
      businessList.append(emptyItem);
    } else {
      for (const business of businesses) {
        const item = document.createElement('li');
        item.className = 'list-group-item d-flex justify-content-between align-items-center';
        const businessName = document.createElement('span');
        businessName.textContent = business.name;
        const role = document.createElement('span');
        role.className = 'badge bg-secondary';
        role.textContent = business.role;
        item.append(businessName, role);
        businessList.append(item);
      }
    }
    businessesSection.hidden = false;
  } catch (error) {
    showNotice(error instanceof Error ? `Unable to load business memberships: ${error.message}` : 'Unable to load business memberships.', true);
  }
}

async function loadProfile(user: User): Promise<void> {
  currentUser = user;
  form.hidden = true;
  securitySection.hidden = true;
  businessesSection.hidden = true;
  showNotice('Loading your profile...');
  try {
    const profile = await getUserProfile(user);
    displayProfile(profile, user);
    notice.hidden = true;
    await loadBusinesses(user);
  } catch (error) {
    showNotice(error instanceof Error ? error.message : 'Unable to load your profile.', true);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!currentUser) {
    showNotice('Sign in to update your profile.', true);
    return;
  }

  saveButton.disabled = true;
  showNotice('Saving your profile...');
  try {
    await saveUserProfile(currentUser, nameInput.value, phoneInput.value);
    await currentUser.reload();
    displayProfile(await getUserProfile(currentUser), currentUser);
    showNotice('Your profile has been updated.');
  } catch (error) {
    showNotice(error instanceof Error ? error.message : 'Unable to save your profile.', true);
  } finally {
    saveButton.disabled = false;
  }
});

cancelButton.addEventListener('click', () => {
  if (savedProfile && currentUser) {
    displayProfile(savedProfile, currentUser);
    notice.hidden = true;
  }
});

sendVerificationButton.addEventListener('click', async () => {
  if (!currentUser) return;
  sendVerificationButton.disabled = true;
  try {
    await sendVerificationEmail(currentUser);
    showNotice('Verification email sent. Check your inbox and follow the link.');
  } catch (error) {
    showNotice(error instanceof Error ? error.message : 'Unable to send the verification email.', true);
  } finally {
    sendVerificationButton.disabled = false;
  }
});

refreshVerificationButton.addEventListener('click', async () => {
  if (!currentUser) return;
  refreshVerificationButton.disabled = true;
  try {
    await reload(currentUser);
    verificationStatus.textContent = currentUser.emailVerified ? 'Verified' : 'Not verified';
    verificationStatus.classList.toggle('text-success', currentUser.emailVerified);
    verificationStatus.classList.toggle('text-danger', !currentUser.emailVerified);
    sendVerificationButton.hidden = currentUser.emailVerified;
    showNotice(currentUser.emailVerified ? 'Your email is verified.' : 'Your email is not verified yet.', !currentUser.emailVerified);
  } catch (error) {
    showNotice(error instanceof Error ? error.message : 'Unable to refresh verification status.', true);
  } finally {
    refreshVerificationButton.disabled = false;
  }
});

passwordResetButton.addEventListener('click', async () => {
  if (!currentUser?.email) {
    showNotice('There is no email address on this account to send a password reset to.', true);
    return;
  }
  passwordResetButton.disabled = true;
  try {
    await sendPasswordReset(currentUser.email);
    showNotice('Password reset email sent. Check your inbox for the reset link.');
  } catch (error) {
    showNotice(error instanceof Error ? error.message : 'Unable to send the password reset email.', true);
  } finally {
    passwordResetButton.disabled = false;
  }
});

if (!isFirebaseConfigured || !auth) {
  showNotice(firebaseEnvironmentError || 'Firebase is not configured for this environment.', true);
} else {
  onAuthStateChanged(
    auth,
    (user) => {
      if (!user) {
        const signInUrl = new URL(`${import.meta.env.BASE_URL}signin.html`, window.location.origin);
        signInUrl.searchParams.set('returnTo', 'profile');
        window.location.replace(signInUrl.href);
        return;
      }
      void loadProfile(user);
    },
    (error) => showNotice(`Unable to verify your sign-in: ${error.message}`, true),
  );
}
