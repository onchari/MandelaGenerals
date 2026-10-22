import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, assertFirebaseReady } from '../config/firebase';

export interface ActiveBusiness {
  id: string;
  name: string;
  role: 'owner' | 'admin' | 'manager' | 'cashier' | 'staff';
}

const roleValues = ['owner', 'admin', 'manager', 'cashier', 'staff'] as const;
const activeBusinessStorageKey = (userId: string): string => `activeBusinessId:${userId}`;

function isMemberRole(value: unknown): value is ActiveBusiness['role'] {
  return typeof value === 'string' && roleValues.some((role) => role === value);
}

export async function getUserBusinesses(userId: string): Promise<ActiveBusiness[]> {
  assertFirebaseReady();

  const dbInstance = db;
  if (!dbInstance) {
    throw new Error('Firebase is not configured.');
  }

  const memberships = await getDocs(collection(dbInstance, 'users', userId, 'businessMemberships'));
  return memberships.docs.flatMap((membership) => {
    const data = membership.data();
    if (data.active !== true) return [];
    if (
      typeof data.businessName !== 'string' ||
      !data.businessName.trim() ||
      !isMemberRole(data.role)
    ) {
      throw new Error(`Business membership ${membership.id} has invalid data.`);
    }
    return [{ id: membership.id, name: data.businessName, role: data.role }];
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

export async function createBusiness(name: string): Promise<ActiveBusiness> {
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

  const ownerId = authInstance.currentUser.uid;
  const businessRef = doc(collection(dbInstance, 'businesses'));
  const batch = writeBatch(dbInstance);
  const timestamp = serverTimestamp();

  batch.set(businessRef, {
    name: normalizedName,
    ownerId,
    createdAt: timestamp,
  });
  batch.set(doc(dbInstance, 'businesses', businessRef.id, 'members', ownerId), {
    role: 'owner',
    active: true,
    joinedAt: timestamp,
  });
  batch.set(doc(dbInstance, 'users', ownerId, 'businessMemberships', businessRef.id), {
    businessName: normalizedName,
    role: 'owner',
    active: true,
    joinedAt: timestamp,
  });
  await batch.commit();

  return { id: businessRef.id, name: normalizedName, role: 'owner' };
}
