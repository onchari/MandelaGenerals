import { initializeApp, type FirebaseOptions } from "firebase/app";
import { getAuth, signOut } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

export type FirebaseEnvironment = "development" | "production";

const env = import.meta.env;
const environmentStorageKey = "mandela-generals.firebase-environment";
const expectedProjectIds: Record<FirebaseEnvironment, string> = {
  development: "mandelagenerals-dev",
  production: "mandelageneralshop",
};

function readConfig(values: FirebaseOptions): FirebaseOptions {
  return {
    ...values,
    measurementId: values.measurementId || undefined,
  };
}

const developmentConfig = readConfig(
  env.MODE === "development"
    ? {
        apiKey: env.VITE_FIREBASE_API_KEY,
        authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId: env.VITE_FIREBASE_APP_ID,
        measurementId: env.VITE_FIREBASE_MEASUREMENT_ID,
      }
    : {
        apiKey: env.VITE_FIREBASE_DEV_API_KEY,
        authDomain: env.VITE_FIREBASE_DEV_AUTH_DOMAIN,
        projectId: env.VITE_FIREBASE_DEV_PROJECT_ID,
        storageBucket: env.VITE_FIREBASE_DEV_STORAGE_BUCKET,
        messagingSenderId: env.VITE_FIREBASE_DEV_MESSAGING_SENDER_ID,
        appId: env.VITE_FIREBASE_DEV_APP_ID,
        measurementId: env.VITE_FIREBASE_DEV_MEASUREMENT_ID,
      },
);
const productionConfig = readConfig(
  env.MODE === "production"
    ? {
        apiKey: env.VITE_FIREBASE_API_KEY,
        authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId: env.VITE_FIREBASE_APP_ID,
        measurementId: env.VITE_FIREBASE_MEASUREMENT_ID,
      }
    : {
        apiKey: env.VITE_FIREBASE_PRODUCTION_API_KEY,
        authDomain: env.VITE_FIREBASE_PRODUCTION_AUTH_DOMAIN,
        projectId: env.VITE_FIREBASE_PRODUCTION_PROJECT_ID,
        storageBucket: env.VITE_FIREBASE_PRODUCTION_STORAGE_BUCKET,
        messagingSenderId: env.VITE_FIREBASE_PRODUCTION_MESSAGING_SENDER_ID,
        appId: env.VITE_FIREBASE_PRODUCTION_APP_ID,
        measurementId: env.VITE_FIREBASE_PRODUCTION_MEASUREMENT_ID,
      },
);

const configs: Record<FirebaseEnvironment, FirebaseOptions> = {
  development: developmentConfig,
  production: productionConfig,
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

function isEnvironmentConfigured(environment: FirebaseEnvironment): boolean {
  const config = configs[environment];
  return getMissingKeys(config).length === 0 &&
    config.projectId === expectedProjectIds[environment];
}

function getInitialEnvironment(): FirebaseEnvironment {
  if (env.MODE !== "production") {
    return "development";
  }
  const storedEnvironment = window.localStorage.getItem(environmentStorageKey);
  return storedEnvironment === "development" || storedEnvironment === "production"
    ? storedEnvironment
    : "production";
}

export const firebaseEnvironment = getInitialEnvironment();
const selectedConfig = configs[firebaseEnvironment];
export const missingFirebaseKeys = getMissingKeys(selectedConfig);

export const firebaseEnvironmentError = selectedConfig.projectId &&
  selectedConfig.projectId !== expectedProjectIds[firebaseEnvironment]
  ? `Vite is using the ${firebaseEnvironment} environment, but Firebase project "${selectedConfig.projectId}" is configured. Set the matching VITE_FIREBASE_* values.`
  : "";

export const isFirebaseConfigured = missingFirebaseKeys.length === 0 && !firebaseEnvironmentError;
export const canSwitchFirebaseEnvironment =
  env.MODE === "production" &&
  isEnvironmentConfigured("development") &&
  isEnvironmentConfigured("production");

const app = isFirebaseConfigured
  ? initializeApp(selectedConfig, `mandela-generals-${firebaseEnvironment}`)
  : null;

export const auth = app ? getAuth(app) : undefined;
export const db = app ? getFirestore(app) : undefined;

export async function switchFirebaseEnvironment(): Promise<void> {
  if (!canSwitchFirebaseEnvironment) {
    throw new Error("Both Firebase environments must be configured before switching.");
  }

  const nextEnvironment: FirebaseEnvironment =
    firebaseEnvironment === "production" ? "development" : "production";

  if (auth?.currentUser) {
    await signOut(auth);
  }

  window.localStorage.setItem(environmentStorageKey, nextEnvironment);
  window.location.reload();
}

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
