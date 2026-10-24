import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, assertFirebaseReady } from '../config/firebase';

export type AssignableBusinessRole = 'admin' | 'manager' | 'cashier' | 'staff';

export interface DiscoverableBusinessAccount {
  uid: string;
  email: string;
  displayName: string;
}

const assignableRoles: AssignableBusinessRole[] = ['admin', 'manager', 'cashier', 'staff'];

export function isAssignableBusinessRole(value: string): value is AssignableBusinessRole {
  return assignableRoles.some((role) => role === value);
}

function requireDatabase() {
  assertFirebaseReady();
  const userId = auth?.currentUser?.uid;
  const dbInstance = db;
  if (!userId || !dbInstance) {
    throw new Error('Sign in as the business owner to manage users.');
  }
  return { userId, dbInstance };
}

async function assertOwner(
  dbInstance: NonNullable<typeof db>,
  businessId: string,
  userId: string,
): Promise<void> {
  const membership = await getDoc(doc(dbInstance, 'businesses', businessId, 'members', userId));
  if (membership.data()?.role !== 'owner' || membership.data()?.active !== true) {
    throw new Error('Only the active business owner can manage user memberships.');
  }
}

export async function getDiscoverableBusinessAccounts(): Promise<DiscoverableBusinessAccount[]> {
  const { dbInstance } = requireDatabase();
  const snapshot = await getDocs(query(
    collection(dbInstance, 'businessUserDirectory'),
    where('discoverable', '==', true),
    limit(100),
  ));

  return snapshot.docs.map((account) => {
    const data = account.data();
    if (
      typeof data.email !== 'string' ||
      !data.email.trim() ||
      typeof data.displayName !== 'string' ||
      data.discoverable !== true
    ) {
      throw new Error(`Discoverable account ${account.id} has invalid directory data.`);
    }
    return {
      uid: account.id,
      email: data.email,
      displayName: data.displayName,
    };
  }).sort((left, right) => left.email.localeCompare(right.email));
}

export async function addExistingBusinessMember(
  businessId: string,
  memberId: string,
  role: AssignableBusinessRole,
): Promise<void> {
  const { userId, dbInstance } = requireDatabase();
  const targetId = memberId.trim();
  if (!targetId || targetId.length > 128 || targetId.includes('/')) {
    throw new Error('Choose a registered account from the email list.');
  }
  if (!isAssignableBusinessRole(role)) {
    throw new Error('Select an assignable business role.');
  }
  await assertOwner(dbInstance, businessId, userId);

  if (targetId === userId) {
    throw new Error('You already own this business.');
  }
  const [directorySnapshot, profileSnapshot] = await Promise.all([
    getDoc(doc(dbInstance, 'businessUserDirectory', targetId)),
    getDoc(doc(dbInstance, 'users', targetId)),
  ]);
  const accountData = directorySnapshot.data();
  const profileData = profileSnapshot.data();
  if (
    !directorySnapshot.exists() ||
    !profileSnapshot.exists() ||
    accountData?.discoverable !== true ||
    typeof accountData.email !== 'string' ||
    (profileData?.accountStatus ?? 'active') !== 'active' ||
    typeof profileData?.email !== 'string' ||
    !accountData.email.trim() ||
    profileData.email !== accountData.email
  ) {
    throw new Error('This account is no longer available for business membership. Ask the account holder to review their profile.');
  }

  const businessRef = doc(dbInstance, 'businesses', businessId);
  const memberRef = doc(dbInstance, 'businesses', businessId, 'members', targetId);
  const membershipIndexRef = doc(dbInstance, 'users', targetId, 'businessMemberships', businessId);
  const [businessSnapshot, memberSnapshot, indexSnapshot] = await Promise.all([
    getDoc(businessRef),
    getDoc(memberRef),
    getDoc(membershipIndexRef),
  ]);
  if (!businessSnapshot.exists()) {
    throw new Error('The selected business no longer exists.');
  }
  if (memberSnapshot.exists() || indexSnapshot.exists()) {
    throw new Error('This account already has a membership in the business.');
  }

  const business = businessSnapshot.data();
  const joinedAt = serverTimestamp();
  const membership = {
    role,
    active: true,
    joinedAt,
    branchIds: [],
    allBranches: false,
  };
  const batch = writeBatch(dbInstance);
  batch.set(memberRef, membership);
  batch.set(membershipIndexRef, {
    businessName: business.name,
    ...(typeof business.slug === 'string' ? { slug: business.slug } : {}),
    ...(business.branchWorkspaceMode === 'isolated' ? { branchWorkspaceMode: 'isolated' } : {}),
    ...membership,
  });
  await batch.commit();
}

export async function updateBusinessMemberRole(
  businessId: string,
  memberId: string,
  role: AssignableBusinessRole,
): Promise<void> {
  const { userId, dbInstance } = requireDatabase();
  if (!isAssignableBusinessRole(role)) {
    throw new Error('Select an assignable business role.');
  }
  if (!memberId.trim() || memberId === userId) {
    throw new Error('The business owner role cannot be changed here.');
  }
  await assertOwner(dbInstance, businessId, userId);

  const memberRef = doc(dbInstance, 'businesses', businessId, 'members', memberId);
  const membershipIndexRef = doc(dbInstance, 'users', memberId, 'businessMemberships', businessId);
  const [memberSnapshot, indexSnapshot] = await Promise.all([
    getDoc(memberRef),
    getDoc(membershipIndexRef),
  ]);
  if (
    !memberSnapshot.exists() ||
    !indexSnapshot.exists() ||
    memberSnapshot.data().role === 'owner' ||
    indexSnapshot.data().role === 'owner'
  ) {
    throw new Error('The account has no editable non-owner membership in this business.');
  }

  const batch = writeBatch(dbInstance);
  batch.update(memberRef, { role });
  batch.update(membershipIndexRef, { role });
  await batch.commit();
}
