import { onAuthStateChanged } from 'firebase/auth';
import { auth, isFirebaseConfigured } from './config/firebase';

const appState = {
  tenantName: 'Mandela Generals',
  businessName: 'Retail operations',
};

function renderStatus(): void {
  const marker = document.getElementById('tenant-status');
  if (!marker) {
    return;
  }

  marker.innerHTML = `
    <div class="tenant-status-card">
      <strong>Multi-tenant app</strong>
      <span>${appState.tenantName}</span>
      <small>${isFirebaseConfigured ? 'Firebase ready' : 'Set Firebase env vars to enable cloud auth and data'}</small>
    </div>
  `;
}

function mountStatus(): void {
  const existing = document.getElementById('tenant-status');
  if (existing) {
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.id = 'tenant-status';
  wrapper.style.position = 'fixed';
  wrapper.style.right = '24px';
  wrapper.style.bottom = '24px';
  wrapper.style.zIndex = '9999';
  wrapper.style.maxWidth = '320px';
  wrapper.style.fontFamily = 'Arial, sans-serif';
  wrapper.style.background = '#0a1728';
  wrapper.style.color = '#fff';
  wrapper.style.borderRadius = '12px';
  wrapper.style.padding = '12px 14px';
  wrapper.style.boxShadow = '0 16px 40px rgba(10, 23, 40, 0.28)';
  wrapper.style.border = '1px solid rgba(255,255,255,0.08)';
  document.body.appendChild(wrapper);

  renderStatus();
}

function updateUserState(): void {
  if (!isFirebaseConfigured || !auth) {
    renderStatus();
    return;
  }

  onAuthStateChanged(auth, (user) => {
    if (!user) {
      renderStatus();
      return;
    }

    const marker = document.getElementById('tenant-status');
    if (!marker) {
      return;
    }

    marker.innerHTML = `
      <div class="tenant-status-card">
        <strong>Signed in</strong>
        <span>${user.displayName ?? 'Business user'}</span>
        <small>${appState.businessName}</small>
      </div>
    `;
  });
}

document.addEventListener('DOMContentLoaded', () => {
  mountStatus();
  renderStatus();
  updateUserState();
});
