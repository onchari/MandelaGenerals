import { addDoc, collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, assertFirebaseReady } from '../config/firebase';

export async function createBusiness(name: string, ownerId: string): Promise<string> {
  assertFirebaseReady();

  const dbInstance = db;
  if (!dbInstance) {
    throw new Error('Firebase is not configured.');
  }

  const normalizedName = name.trim();
  if (!normalizedName) {
    throw new Error('Business name is required.');
  }

  const businessRef = await addDoc(collection(dbInstance, 'businesses'), {
    name: normalizedName,
    ownerId,
    createdAt: serverTimestamp(),
  });

  await setDoc(doc(dbInstance, 'businesses', businessRef.id, 'members', ownerId), {
    role: 'owner',
    active: true,
    joinedAt: serverTimestamp(),
  });

  return businessRef.id;
}
