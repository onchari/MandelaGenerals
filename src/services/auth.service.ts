import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type UserCredential,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db, assertFirebaseReady } from '../config/firebase';

export async function register(name: string, email: string, password: string): Promise<UserCredential> {
  assertFirebaseReady();

  const authInstance = auth;
  const dbInstance = db;

  if (!authInstance || !dbInstance) {
    throw new Error('Firebase is not configured.');
  }

  const credential = await createUserWithEmailAndPassword(authInstance, email.trim(), password);

  await updateProfile(credential.user, { displayName: name.trim() });
  await setDoc(doc(dbInstance, 'users', credential.user.uid), {
    displayName: name.trim(),
    email: credential.user.email,
    createdAt: serverTimestamp(),
  });

  return credential;
}

export async function login(email: string, password: string): Promise<UserCredential> {
  assertFirebaseReady();

  const authInstance = auth;
  const dbInstance = db;
  if (!authInstance || !dbInstance) {
    throw new Error('Firebase is not configured.');
  }

  return signInWithEmailAndPassword(authInstance, email.trim(), password);
}

export async function sendPasswordReset(email: string): Promise<void> {
  assertFirebaseReady();

  const authInstance = auth;
  if (!authInstance) {
    throw new Error('Firebase is not configured.');
  }

  await sendPasswordResetEmail(authInstance, email.trim());
}

export async function logout(): Promise<void> {
  assertFirebaseReady();

  const authInstance = auth;
  if (!authInstance) {
    throw new Error('Firebase is not configured.');
  }

  await signOut(authInstance);
}
