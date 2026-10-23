import { updateProfile, type User } from 'firebase/auth';
import {
  Timestamp,
  deleteField,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { assertFirebaseReady, db } from '../config/firebase';

export interface UserProfile {
  displayName: string;
  email: string;
  phoneNumber: string;
  createdAt: Date | null;
}

function getProfileReference(userId: string) {
  assertFirebaseReady();
  if (!db) {
    throw new Error('Firebase is not configured.');
  }
  return doc(db, 'users', userId);
}

export async function getUserProfile(user: User): Promise<UserProfile> {
  const profileSnapshot = await getDoc(getProfileReference(user.uid));
  const data = profileSnapshot.data();

  if (data && data.displayName !== undefined && typeof data.displayName !== 'string') {
    throw new Error('Your saved profile has an invalid display name.');
  }
  if (data && data.phoneNumber !== undefined && typeof data.phoneNumber !== 'string') {
    throw new Error('Your saved profile has an invalid phone number.');
  }
  if (data?.createdAt !== undefined && !(data.createdAt instanceof Timestamp)) {
    throw new Error('Your saved profile has an invalid creation date.');
  }

  return {
    displayName: user.displayName?.trim() || data?.displayName?.trim() || '',
    email: user.email || '',
    phoneNumber: data?.phoneNumber || '',
    createdAt: data?.createdAt instanceof Timestamp ? data.createdAt.toDate() : null,
  };
}

export async function saveUserProfile(user: User, displayName: string, phoneNumber: string): Promise<void> {
  const normalizedName = displayName.trim();
  const normalizedPhone = phoneNumber.trim();
  if (!normalizedName || normalizedName.length > 100) {
    throw new Error('Enter a name of 1 to 100 characters.');
  }

  if (normalizedPhone.length > 32) {
    throw new Error('Phone number must be 32 characters or fewer.');
  }
  const profileReference = getProfileReference(user.uid);
  const profileSnapshot = await getDoc(profileReference);
  const previousData = profileSnapshot.data();
  const previousName = previousData?.displayName;
  const previousPhone = previousData?.phoneNumber;

  if (profileSnapshot.exists()) {
    if (typeof previousName !== 'string') {
      throw new Error('Your saved profile has an invalid display name and cannot be updated.');
    }
    if (previousPhone !== undefined && typeof previousPhone !== 'string') {
      throw new Error('Your saved profile has an invalid phone number and cannot be updated.');
    }
    await updateDoc(profileReference, {
      displayName: normalizedName,
      phoneNumber: normalizedPhone || deleteField(),
    });
  } else {
    if (!user.email) {
      throw new Error('An account email address is required to create your profile.');
    }
    await setDoc(profileReference, {
      displayName: normalizedName,
      email: user.email,
      createdAt: serverTimestamp(),
      ...(normalizedPhone ? { phoneNumber: normalizedPhone } : {}),
    });
  }

  try {
    await updateProfile(user, { displayName: normalizedName });
  } catch (error) {
    try {
      await updateDoc(profileReference, {
        displayName: typeof previousName === 'string' ? previousName : user.displayName || '',
        phoneNumber: typeof previousPhone === 'string' ? previousPhone : deleteField(),
      });
    } catch (rollbackError) {
      const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : 'Unknown rollback error.';
      const authMessage = error instanceof Error ? error.message : 'Unknown Authentication error.';
      throw new Error(
        `Firebase Authentication could not update your name (${authMessage}), and the saved profile could not be restored (${rollbackMessage}).`,
        { cause: error },
      );
    }
    throw new Error(
      error instanceof Error ? `Firebase Authentication could not update your name: ${error.message}` : 'Firebase Authentication could not update your name.',
      { cause: error },
    );
  }
}
