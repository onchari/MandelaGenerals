import {
  collection,
  documentId,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, assertFirebaseReady } from '../config/firebase';

export interface BusinessBranch {
  id: string;
  name: string;
  address: string;
  status: 'active' | 'inactive';
  isPrimary: boolean;
  managerUid: string;
  createdAt: string | null;
}

export async function getAccessibleBusinessBranches(
  businessId: string,
  role: string,
  branchIds: string[] = [],
  allBranches = false,
): Promise<BusinessBranch[]> {
  assertFirebaseReady();
  const dbInstance = db;
  if (!dbInstance) throw new Error('Firebase is not configured.');
  if (!businessId.trim()) throw new Error('Select a business first.');

  const branchesCollection = collection(dbInstance, 'businesses', businessId, 'branches');
  const snapshots = role === 'owner'
    ? (await getDocs(branchesCollection)).docs
    : allBranches
      ? (await getDocs(query(branchesCollection, where('status', '==', 'active')))).docs
      : (await Promise.all(
        Array.from(new Set(branchIds)).reduce<string[][]>((groups, branchId) => {
          const current = groups[groups.length - 1];
          if (!current || current.length === 30) groups.push([branchId]);
          else current.push(branchId);
          return groups;
        }, []).map(async (group) => getDocs(query(
          branchesCollection,
          where(documentId(), 'in', group),
          where('status', '==', 'active'),
        ))),
      )).flatMap((snapshot) => snapshot.docs);

  return snapshots.flatMap((branch) => {
    const data = branch.data();
    if (data.status !== 'active') return [];
    if (
      typeof data.name !== 'string' ||
      typeof data.isPrimary !== 'boolean' ||
      (data.managerUid !== undefined && typeof data.managerUid !== 'string')
    ) {
      throw new Error(`Branch ${branch.id} has invalid data.`);
    }
    const createdAt = data.createdAt;
    return [{
      id: branch.id,
      name: data.name,
      address: typeof data.address === 'string' ? data.address : '',
      status: 'active' as const,
      isPrimary: data.isPrimary,
      managerUid: typeof data.managerUid === 'string' ? data.managerUid : '',
      createdAt: createdAt && typeof createdAt.toDate === 'function'
        ? createdAt.toDate().toISOString()
        : null,
    }];
  }).sort((left, right) =>
    Number(right.isPrimary) - Number(left.isPrimary) || left.name.localeCompare(right.name),
  );
}

function requireOwner(): { userId: string; dbInstance: NonNullable<typeof db> } {
  const userId = auth?.currentUser?.uid;
  const dbInstance = db;
  if (!userId || !dbInstance) {
    throw new Error('Sign in as the business owner to manage branches.');
  }

  return { userId, dbInstance };
}

async function assertActiveOwner(
  dbInstance: NonNullable<typeof db>,
  businessId: string,
  userId: string,
): Promise<void> {
  const membership = await getDoc(doc(dbInstance, 'businesses', businessId, 'members', userId));
  if (membership.data()?.active !== true || membership.data()?.role !== 'owner') {
    throw new Error('Only the active business owner can manage branches or branch access.');
  }
}

export async function getBusinessBranches(businessId: string): Promise<BusinessBranch[]> {
  assertFirebaseReady();
  const { userId, dbInstance } = requireOwner();
  await assertActiveOwner(dbInstance, businessId, userId);
  const snapshot = await getDocs(collection(dbInstance, 'businesses', businessId, 'branches'));

  return snapshot.docs.map((branch) => {
    const data = branch.data();
    if (
      typeof data.name !== 'string' ||
      !['active', 'inactive'].includes(data.status) ||
      typeof data.isPrimary !== 'boolean' ||
      (data.managerUid !== undefined && typeof data.managerUid !== 'string')
    ) {
      throw new Error(`Branch ${branch.id} has invalid data.`);
    }
    const createdAt = data.createdAt;
    return {
      id: branch.id,
      name: data.name,
      address: typeof data.address === 'string' ? data.address : '',
      status: data.status,
      isPrimary: data.isPrimary,
      managerUid: typeof data.managerUid === 'string' ? data.managerUid : '',
      createdAt: createdAt && typeof createdAt.toDate === 'function'
        ? createdAt.toDate().toISOString()
        : null,
    };
  }).sort((left, right) =>
    Number(right.isPrimary) - Number(left.isPrimary) || left.name.localeCompare(right.name),
  );
}

export async function initializeBusinessBranches(businessId: string): Promise<void> {
  assertFirebaseReady();
  const { userId, dbInstance } = requireOwner();
  await assertActiveOwner(dbInstance, businessId, userId);

  const businessRef = doc(dbInstance, 'businesses', businessId);
  const ownerRef = doc(dbInstance, 'businesses', businessId, 'members', userId);
  const membershipIndexRef = doc(dbInstance, 'users', userId, 'businessMemberships', businessId);
  const [businessSnapshot, ownerSnapshot, indexSnapshot, mainBranchSnapshot] = await Promise.all([
    getDoc(businessRef),
    getDoc(ownerRef),
    getDoc(membershipIndexRef),
    getDoc(doc(dbInstance, 'businesses', businessId, 'branches', 'main')),
  ]);
  if (!businessSnapshot.exists() || !ownerSnapshot.exists() || !indexSnapshot.exists()) {
    throw new Error('Business owner membership data is incomplete; branch setup cannot continue.');
  }
  if (typeof businessSnapshot.data().primaryBranchId === 'string') {
    throw new Error('Branch setup is already initialized for this business.');
  }
  if (mainBranchSnapshot.exists()) {
    throw new Error('A "main" branch record already exists. Contact support before changing it.');
  }

  const timestamp = serverTimestamp();
  const batch = writeBatch(dbInstance);
  batch.update(businessRef, { primaryBranchId: 'main' });
  batch.set(doc(dbInstance, 'businesses', businessId, 'branches', 'main'), {
    name: 'Main branch',
    status: 'active',
    createdAt: timestamp,
    isPrimary: true,
    managerUid: '',
  });
  batch.set(doc(dbInstance, 'businesses', businessId, 'branches', 'main', 'settings', 'workspace'), {
    parentBusinessId: businessId,
    branchId: 'main',
    inventoryMode: 'branch_scoped',
    createdAt: timestamp,
  });
  batch.update(ownerRef, { branchIds: ['main'], allBranches: true });
  batch.update(membershipIndexRef, { branchIds: ['main'], allBranches: true });
  await batch.commit();
}

export async function createBusinessBranch(
  businessId: string,
  name: string,
  address = '',
): Promise<string> {
  assertFirebaseReady();
  const { userId, dbInstance } = requireOwner();
  const normalizedName = name.trim();
  const normalizedAddress = address.trim();
  if (!normalizedName || normalizedName.length > 100) {
    throw new Error('Branch name must contain 1–100 characters.');
  }
  if (normalizedAddress.length > 300) {
    throw new Error('Branch address must be 300 characters or fewer.');
  }
  await assertActiveOwner(dbInstance, businessId, userId);

  const branchRef = doc(collection(dbInstance, 'businesses', businessId, 'branches'));
  const batch = writeBatch(dbInstance);
  batch.set(branchRef, {
      name: normalizedName,
      ...(normalizedAddress ? { address: normalizedAddress } : {}),
      status: 'active',
      createdAt: serverTimestamp(),
      isPrimary: false,
      managerUid: '',
    });
  batch.set(doc(dbInstance, 'businesses', businessId, 'branches', branchRef.id, 'settings', 'workspace'), {
    parentBusinessId: businessId,
    branchId: branchRef.id,
    inventoryMode: 'branch_scoped',
    createdAt: serverTimestamp(),
  });
  await batch.commit();
  return branchRef.id;
}

export async function updateBusinessBranch(
  businessId: string,
  branchId: string,
  updates: Pick<BusinessBranch, 'name' | 'address' | 'status' | 'managerUid'>,
): Promise<void> {
  assertFirebaseReady();
  const { userId, dbInstance } = requireOwner();
  const name = updates.name.trim();
  const address = updates.address.trim();
  if (!name || name.length > 100) {
    throw new Error('Branch name must contain 1–100 characters.');
  }
  if (address.length > 300) {
    throw new Error('Branch address must be 300 characters or fewer.');
  }
  if (updates.status !== 'active' && updates.status !== 'inactive') {
    throw new Error('Branch status must be active or inactive.');
  }
  if (updates.managerUid !== '' && updates.managerUid !== userId) {
    throw new Error('Only the business owner can appoint themselves as branch manager.');
  }
  await assertActiveOwner(dbInstance, businessId, userId);
  if (updates.status === 'inactive') {
    const [businessSnapshot, branchSnapshot] = await Promise.all([
      getDoc(doc(dbInstance, 'businesses', businessId)),
      getDoc(doc(dbInstance, 'businesses', businessId, 'branches', branchId)),
    ]);
    if (businessSnapshot.data()?.primaryBranchId === branchId || branchSnapshot.data()?.isPrimary === true) {
      throw new Error('The primary branch cannot be deactivated.');
    }
  }
  await updateDoc(doc(dbInstance, 'businesses', businessId, 'branches', branchId), {
    name,
    address,
    status: updates.status,
    managerUid: updates.managerUid,
  });
}

export async function setMemberBranchAssignments(
  businessId: string,
  memberId: string,
  branchIds: string[],
  allBranches = false,
): Promise<void> {
  assertFirebaseReady();
  const { userId, dbInstance } = requireOwner();
  if (typeof allBranches !== 'boolean') {
    throw new Error('The all-branches access setting must be a boolean.');
  }
  const normalizedBranchIds = allBranches ? [] : [...new Set(branchIds)];
  if (normalizedBranchIds.some((branchId) => typeof branchId !== 'string' || !branchId.trim())) {
    throw new Error('Branch assignments must contain valid branch IDs.');
  }
  await assertActiveOwner(dbInstance, businessId, userId);

  const [memberSnapshot, branchSnapshots] = await Promise.all([
    getDoc(doc(dbInstance, 'businesses', businessId, 'members', memberId)),
    Promise.all(normalizedBranchIds.map((branchId) =>
      getDoc(doc(dbInstance, 'businesses', businessId, 'branches', branchId)),
    )),
  ]);
  if (!memberSnapshot.exists() || memberSnapshot.data().active !== true) {
    throw new Error('Branch access can only be assigned to an active business member.');
  }
  if (branchSnapshots.some((branch) =>
    !branch.exists() || branch.data()?.status !== 'active',
  )) {
    throw new Error('One or more selected branches are missing or inactive.');
  }

  const batch = writeBatch(dbInstance);
  batch.update(doc(dbInstance, 'businesses', businessId, 'members', memberId), {
    branchIds: normalizedBranchIds,
    allBranches,
  });
  batch.update(doc(dbInstance, 'users', memberId, 'businessMemberships', businessId), {
    branchIds: normalizedBranchIds,
    allBranches,
  });
  await batch.commit();
}
