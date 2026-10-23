import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type UserCredential,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db, assertFirebaseReady, firebaseEnvironment } from '../config/firebase';

export async function register(name: string, email: string, password: string): Promise<UserCredential> {
  assertFirebaseReady();

  if (firebaseEnvironment === 'development') {
    throw new Error('Development accounts are provisioned by a project administrator. Ask for an approved tester account.');
  }

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

  const credential = await signInWithEmailAndPassword(authInstance, email.trim(), password);

  if (firebaseEnvironment === 'development') {
    try {
      const tester = await getDoc(doc(dbInstance, 'devTesters', credential.user.uid));
      if (!tester.exists() || tester.data().enabled !== true) {
        await signOut(authInstance);
        throw new Error('This account is not approved for the development environment.');
      }
    } catch (error) {
      if (authInstance.currentUser) {
        await signOut(authInstance);
      }
      throw error;
    }
  }

  return credential;
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
