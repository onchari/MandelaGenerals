import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

initializeApp();
setGlobalOptions({ maxInstances: 10, region: 'us-central1' });

const db = getFirestore();

export const createBusiness = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in before creating a business.');
  }

  const name = typeof request.data?.name === 'string' ? request.data.name.trim() : '';
  if (!name) {
    throw new HttpsError('invalid-argument', 'Business name is required.');
  }
  if (name.length > 100) {
    throw new HttpsError('invalid-argument', 'Business name must be 100 characters or fewer.');
  }

  const businessRef = db.collection('businesses').doc();
  const memberRef = businessRef.collection('members').doc(uid);
  const membershipRef = db.collection('users').doc(uid)
    .collection('businessMemberships').doc(businessRef.id);
  const now = FieldValue.serverTimestamp();
  const batch = db.batch();

  batch.set(businessRef, {
    name,
    ownerId: uid,
    createdAt: now,
  });
  batch.set(memberRef, {
    role: 'owner',
    active: true,
    joinedAt: now,
  });
  batch.set(membershipRef, {
    businessName: name,
    role: 'owner',
    active: true,
    joinedAt: now,
  });
  await batch.commit();
  return { id: businessRef.id, name };
});
