import { collection, doc, getDoc, getDocs, getDocsFromServer, Timestamp, where, query } from 'firebase/firestore';
import { assertFirebaseReady, db } from '../config/firebase';
import type { ActiveBusiness } from './business.service';

export interface BusinessDashboardSummary extends ActiveBusiness {
  createdAt: string | null;
  status: string | null;
  plan: string | null;
  activeMemberCount: number;
}

export interface BusinessTeamMember {
  userId: string;
  role: string;
  active: boolean | null;
  joinedAt: string | null;
  branchIds: string[];
  allBranches: boolean;
}

export async function getBusinessTeamMembers(businessId: string): Promise<BusinessTeamMember[]> {
  assertFirebaseReady();
  const dbInstance = db;
  if (!dbInstance) throw new Error('Firebase is not configured.');
  if (!businessId.trim()) throw new Error('Select a business first.');

  const snapshot = await getDocsFromServer(collection(dbInstance, 'businesses', businessId, 'members'));
  return snapshot.docs.map((member) => {
    const data = member.data();
    if (typeof data.role !== 'string' || !data.role.trim()) {
      throw new Error(`Membership ${member.id} has an invalid role.`);
    }
    if (
      data.branchIds !== undefined &&
      (!Array.isArray(data.branchIds) || !data.branchIds.every((branchId) => typeof branchId === 'string'))
    ) {
      throw new Error(`Membership ${member.id} has invalid branch assignments.`);
    }
    if (data.allBranches !== undefined && typeof data.allBranches !== 'boolean') {
      throw new Error(`Membership ${member.id} has an invalid all-branches setting.`);
    }
    return {
      userId: member.id,
      role: data.role,
      active: typeof data.active === 'boolean' ? data.active : null,
      joinedAt: data.joinedAt instanceof Timestamp ? data.joinedAt.toDate().toISOString() : null,
      branchIds: Array.isArray(data.branchIds) ? data.branchIds : [],
      allBranches: data.allBranches === true,
    };
  }).sort((left, right) => left.userId.localeCompare(right.userId));
}

export async function getBusinessDashboardSummaries(
  memberships: ActiveBusiness[],
): Promise<BusinessDashboardSummary[]> {
  assertFirebaseReady();
  const dbInstance = db;
  if (!dbInstance) throw new Error('Firebase is not configured.');

  return Promise.all(memberships.map(async (membership) => {
    const [businessSnapshot, memberSnapshot] = await Promise.all([
      getDoc(doc(dbInstance, 'businesses', membership.id)),
      getDocs(query(
        collection(dbInstance, 'businesses', membership.id, 'members'),
        where('active', '==', true),
      )),
    ]);
    if (!businessSnapshot.exists()) {
      throw new Error(`Business ${membership.id} is missing from Firestore.`);
    }

    const data = businessSnapshot.data();
    const createdAt = data.createdAt instanceof Timestamp
      ? data.createdAt.toDate().toISOString()
      : null;
    return {
      ...membership,
      createdAt,
      status: typeof data.status === 'string' ? data.status : null,
      plan: typeof data.plan === 'string'
        ? data.plan
        : typeof data.planName === 'string'
          ? data.planName
          : null,
      activeMemberCount: memberSnapshot.size,
    };
  }));
}
