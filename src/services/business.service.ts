import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, assertFirebaseReady } from '../config/firebase';

export interface ActiveBusiness {
  id: string;
  name: string;
  slug: string;
  role: 'owner' | 'admin' | 'manager' | 'cashier' | 'staff';
}

export interface PlatformBusiness {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
}

export interface PlatformUser {
  id: string;
  displayName: string;
  email: string;
}

const roleValues = ['owner', 'admin', 'manager', 'cashier', 'staff'] as const;
const activeBusinessStorageKey = (userId: string): string => `activeBusinessId:${userId}`;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isMemberRole(value: unknown): value is ActiveBusiness['role'] {
  return typeof value === 'string' && roleValues.some((role) => role === value);
}

function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]';
}

export async function getUserBusinesses(userId: string): Promise<ActiveBusiness[]> {
  assertFirebaseReady();

  const dbInstance = db;
  if (!dbInstance) {
    throw new Error('Firebase is not configured.');
  }

  const memberships = await getDocs(collection(dbInstance, 'users', userId, 'businessMemberships'));
  const businesses = memberships.docs.flatMap((membership) => {
    const data = membership.data();
    if (data.active !== true) return [];
    if (
      typeof data.businessName !== 'string' ||
      !data.businessName.trim() ||
      !isMemberRole(data.role)
    ) {
      throw new Error(`Business membership ${membership.id} has invalid data.`);
    }
    return [{
      id: membership.id,
      name: data.businessName,
      slug: typeof data.slug === 'string' ? data.slug : '',
      role: data.role,
    }];
  });
  if (businesses.length > 0) return businesses;

  const userSnapshot = await getDoc(doc(dbInstance, 'users', userId));
  const legacyBusinessId = userSnapshot.data()?.activeBusinessId;
  if (typeof legacyBusinessId !== 'string' || !legacyBusinessId.trim()) return [];

  const businessSnapshot = await getDoc(doc(dbInstance, 'businesses', legacyBusinessId));
  if (!businessSnapshot.exists()) return [];
  const memberSnapshot = await getDoc(doc(dbInstance, 'businesses', legacyBusinessId, 'members', userId));
  const member = memberSnapshot.data();
  const role = member?.role;
  if (
    member?.active !== true ||
    !isMemberRole(role) ||
    typeof businessSnapshot.data().name !== 'string' ||
    !businessSnapshot.data().name.trim()
  ) {
    return [];
  }

  return [{
    id: businessSnapshot.id,
    name: businessSnapshot.data().name,
    slug: typeof businessSnapshot.data().slug === 'string' ? businessSnapshot.data().slug : '',
    role,
  }];
}

export async function isPlatformAdmin(userId: string): Promise<boolean> {
  assertFirebaseReady();
  const dbInstance = db;
  if (!dbInstance) throw new Error('Firebase is not configured.');
  const adminSnapshot = await getDoc(doc(dbInstance, 'platformAdmins', userId));
  const data = adminSnapshot.data();
  return adminSnapshot.exists() && data?.enabled === true && data.role === 'platformAdmin';
}

export async function getPlatformBusinesses(): Promise<PlatformBusiness[]> {
  assertFirebaseReady();
  const dbInstance = db;
  if (!dbInstance) throw new Error('Firebase is not configured.');
  const snapshot = await getDocs(collection(dbInstance, 'businesses'));
  return snapshot.docs.map((business) => {
    const data = business.data();
    return {
      id: business.id,
      name: typeof data.name === 'string' ? data.name : 'Unnamed business',
      slug: typeof data.slug === 'string' ? data.slug : '',
      ownerId: typeof data.ownerId === 'string' ? data.ownerId : 'Unknown',
    };
  });
}

export async function getPlatformUsers(): Promise<PlatformUser[]> {
  assertFirebaseReady();
  const dbInstance = db;
  if (!dbInstance) throw new Error('Firebase is not configured.');
  const snapshot = await getDocs(collection(dbInstance, 'users'));
  return snapshot.docs.map((user) => {
    const data = user.data();
    return {
      id: user.id,
      displayName: typeof data.displayName === 'string' ? data.displayName : 'Unnamed user',
      email: typeof data.email === 'string' ? data.email : '',
    };
  });
}

export function getSelectedBusiness(
  userId: string,
  businesses: ActiveBusiness[],
): ActiveBusiness | null {
  const selectedId = localStorage.getItem(activeBusinessStorageKey(userId));
  const selected = businesses.find((business) => business.id === selectedId);
  if (selected) return selected;
  if (businesses.length !== 1) return null;

  setSelectedBusiness(userId, businesses[0].id);
  return businesses[0];
}

export function setSelectedBusiness(userId: string, businessId: string): void {
  localStorage.setItem(activeBusinessStorageKey(userId), businessId);
}

export function suggestBusinessSlug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
}

export async function isBusinessSlugAvailable(slug: string): Promise<boolean> {
  assertFirebaseReady();

  const dbInstance = db;
  if (!dbInstance) throw new Error('Firebase is not configured.');
  const normalizedSlug = slug.trim().toLowerCase();
  if (!slugPattern.test(normalizedSlug) || normalizedSlug.length > 48) {
    return false;
  }

  const snapshot = await getDoc(doc(dbInstance, 'businessSlugs', normalizedSlug));
  return !snapshot.exists();
}

export function getBusinessUrl(slug: string): string {
  const basePath = import.meta.env.BASE_URL;
  const hostname = window.location.hostname.toLowerCase();

  if (isLocalHost(hostname)) {
    return `${window.location.protocol}//${slug}.localhost${window.location.port ? `:${window.location.port}` : ''}${basePath}`;
  }

  if (hostname.endsWith('.github.io')) {
    return `${window.location.origin}${basePath}b/${encodeURIComponent(slug)}/`;
  }

  return `${window.location.protocol}//${slug}.${hostname}${basePath}`;
}

export function getBusinessPageUrl(slug: string, pageName: string): string {
  const basePath = import.meta.env.BASE_URL;
  const hostname = window.location.hostname.toLowerCase();
  if (slug && isLocalHost(hostname)) {
    return `${getBusinessUrl(slug)}${pageName}`;
  }

  const url = new URL(pageName, window.location.origin + basePath);
  if (slug) url.searchParams.set('tenant', slug);
  return `${url.pathname}${url.search}`;
}

export function getBusinessUrlSuggestions(slug: string): { local: string; githubPages: string } {
  const basePath = import.meta.env.BASE_URL;
  const port = window.location.port || '5173';
  return {
    local: `http://${slug}.localhost:${port}${basePath}`,
    githubPages: `https://onchari.github.io${basePath}b/${encodeURIComponent(slug)}/`,
  };
}

export function getTenantSlugFromLocation(): string | null {
  const hostname = window.location.hostname.toLowerCase();
  if (hostname.endsWith('.localhost')) {
    return hostname.slice(0, -'.localhost'.length);
  }

  const tenantQuery = new URLSearchParams(window.location.search).get('tenant');
  if (tenantQuery) return tenantQuery;

  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
  const pathMatch = window.location.pathname.match(
    new RegExp(`^${basePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/b/([^/]+)/?$`),
  );
  return pathMatch ? decodeURIComponent(pathMatch[1]) : null;
}

export async function createBusiness(name: string, requestedSlug: string): Promise<ActiveBusiness> {
  assertFirebaseReady();

  const authInstance = auth;
  const dbInstance = db;
  if (!authInstance?.currentUser || !dbInstance) {
    throw new Error('Sign in before creating a business.');
  }

  const normalizedName = name.trim();
  if (!normalizedName) {
    throw new Error('Business name is required.');
  }
  if (normalizedName.length > 100) {
    throw new Error('Business name must be 100 characters or fewer.');
  }
  const slug = requestedSlug.trim().toLowerCase();
  if (!slugPattern.test(slug) || slug.length > 48) {
    throw new Error('Use 1–48 lowercase letters, numbers, and single hyphens for the business address.');
  }
  if (!(await isBusinessSlugAvailable(slug))) {
    throw new Error('That business address is unavailable. Choose another.');
  }

  const ownerId = authInstance.currentUser.uid;
  const businessRef = doc(collection(dbInstance, 'businesses'));
  const batch = writeBatch(dbInstance);
  const timestamp = serverTimestamp();

  batch.set(businessRef, {
    name: normalizedName,
    slug,
    ownerId,
    createdAt: timestamp,
  });
  batch.set(doc(dbInstance, 'businessSlugs', slug), {
    businessId: businessRef.id,
    createdAt: timestamp,
  });
  batch.set(doc(dbInstance, 'businesses', businessRef.id, 'members', ownerId), {
    role: 'owner',
    active: true,
    joinedAt: timestamp,
  });
  batch.set(doc(dbInstance, 'users', ownerId, 'businessMemberships', businessRef.id), {
    businessName: normalizedName,
    slug,
    role: 'owner',
    active: true,
    joinedAt: timestamp,
  });
  await batch.commit();

  return { id: businessRef.id, name: normalizedName, slug, role: 'owner' };
}
