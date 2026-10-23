import { initializeApp, type FirebaseOptions } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

export type FirebaseEnvironment = "development" | "production";

const env = import.meta.env;
const expectedProjectIds: Record<FirebaseEnvironment, string> = {
  development: "mandelagenerals-dev",
  production: "mandelageneralshop",
};

export const firebaseEnvironment: FirebaseEnvironment =
  env.MODE === "production" ? "production" : "development";

const config: FirebaseOptions = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || undefined,
};

const requiredKeys = [
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId",
] as const;

function getMissingKeys(config: FirebaseOptions): string[] {
  return requiredKeys.filter((key) => !config[key]);
}

export const missingFirebaseKeys = getMissingKeys(config);

export const firebaseEnvironmentError = config.projectId &&
  config.projectId !== expectedProjectIds[firebaseEnvironment]
  ? `Vite is using the ${firebaseEnvironment} environment, but Firebase project "${config.projectId}" is configured. Set the matching VITE_FIREBASE_* values.`
  : "";

export const isFirebaseConfigured = missingFirebaseKeys.length === 0 && !firebaseEnvironmentError;

const app = isFirebaseConfigured
  ? initializeApp(config, `mandela-generals-${firebaseEnvironment}`)
  : null;

export const auth = app ? getAuth(app) : undefined;
export const db = app ? getFirestore(app) : undefined;

export function assertFirebaseReady(): void {
  if (firebaseEnvironmentError) {
    throw new Error(firebaseEnvironmentError);
  }
  if (!isFirebaseConfigured || !auth || !db) {
    throw new Error(
      "Firebase is not configured. Missing: " +
        missingFirebaseKeys.join(", ") +
        ". Add the matching VITE_FIREBASE_* values for this environment.",
    );
  }
}
