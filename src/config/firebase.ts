import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

const env = import.meta.env;

const required = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

const config = {
  ...required,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || undefined,
};

export const missingFirebaseKeys = Object.entries(required)
  .filter(([, value]) => !value)
  .map(([key]) => key);

export const isFirebaseConfigured = missingFirebaseKeys.length === 0;

const app = isFirebaseConfigured ? initializeApp(config) : null;

export const auth = app ? getAuth(app) : undefined;
export const db = app ? getFirestore(app) : undefined;
export const functions = app ? getFunctions(app, 'us-central1') : undefined;

export function assertFirebaseReady(): void {
  if (!isFirebaseConfigured || !auth || !db) {
    throw new Error(
      "Firebase is not configured. Missing: " +
        missingFirebaseKeys.join(", ") +
        ". Add VITE_FIREBASE_* values to .env.development or .env.production.",
    );
  }
}
