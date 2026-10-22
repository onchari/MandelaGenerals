import { httpsCallable } from 'firebase/functions';
import { collection, getDocs } from 'firebase/firestore';
import { db, functions, assertFirebaseReady } from '../config/firebase';

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

  if (!functions) {
    throw new Error('Firebase Functions is not configured.');
  }

  const normalizedName = name.trim();
  if (!normalizedName) {
    throw new Error('Business name is required.');
  }

  const call = httpsCallable<{ name: string }, { id: string; name: string }>(
    functions,
    'createBusiness',
  );
  const result = await call({ name: normalizedName });

  if (
    typeof result.data.id !== 'string' ||
    !result.data.id ||
    typeof result.data.name !== 'string' ||
    !result.data.name.trim()
  ) {
    throw new Error('Business creation returned invalid data.');
  }

  return { id: result.data.id, name: result.data.name, role: 'owner' };
}
