export type AccountStatus = 'active' | 'suspended';

export type InvitationStatus = 'not_invited' | 'pending' | 'accepted' | 'revoked' | 'expired';

export type EmailVerificationStatus = 'not_required' | 'pending' | 'verified';

export const defaultUserAccessMetadata = {
  accountStatus: 'active',
  invitationStatus: 'not_invited',
  emailVerificationStatus: 'not_required',
  invitedAt: null,
  invitedBy: null,
  invitationExpiresAt: null,
} as const satisfies {
  accountStatus: AccountStatus;
  invitationStatus: InvitationStatus;
  emailVerificationStatus: EmailVerificationStatus;
  invitedAt: null;
  invitedBy: null;
  invitationExpiresAt: null;
};
