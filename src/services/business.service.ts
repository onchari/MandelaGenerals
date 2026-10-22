import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, assertFirebaseReady } from '../config/firebase';

export interface ActiveBusiness {
  id: string;
  name: string;
}

export async function getActiveBusiness(userId: string): Promise<ActiveBusiness | null> {
  assertFirebaseReady();

  const dbInstance = db;
  if (!dbInstance) {
    throw new Error('Firebase is not configured.');
  }

  const userSnapshot = await getDoc(doc(dbInstance, 'users', userId));
  const businessId = userSnapshot.data()?.activeBusinessId;
  if (typeof businessId !== 'string' || !businessId.trim()) {
    return null;
  }

  const businessSnapshot = await getDoc(doc(dbInstance, 'businesses', businessId));
  if (!businessSnapshot.exists()) {
    throw new Error('Your active business could not be found. Contact your administrator.');
  }

  const name = businessSnapshot.data().name;
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error('Your active business has invalid details. Contact your administrator.');
  }

  return { id: businessSnapshot.id, name };
}

export async function createBusiness(name: string, ownerId: string): Promise<ActiveBusiness> {
  assertFirebaseReady();

  const dbInstance = db;
  if (!dbInstance) {
    throw new Error('Firebase is not configured.');
  }

  const normalizedName = name.trim();
  if (!normalizedName) {
    throw new Error('Business name is required.');
  }

  const businessRef = doc(dbInstance, 'businesses', crypto.randomUUID());
  const batch = writeBatch(dbInstance);

  batch.set(businessRef, {
    name: normalizedName,
    ownerId,
    createdAt: serverTimestamp(),
  });
  batch.set(doc(dbInstance, 'businesses', businessRef.id, 'members', ownerId), {
    role: 'owner',
    active: true,
    joinedAt: serverTimestamp(),
  });
  batch.set(doc(dbInstance, 'users', ownerId), { activeBusinessId: businessRef.id }, { merge: true });
  await batch.commit();

  return { id: businessRef.id, name: normalizedName };
}
