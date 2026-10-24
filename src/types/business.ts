export interface Business {
  id: string;
  name: string;
  ownerId: string;
  primaryBranchId?: string;
  branchWorkspaceMode?: 'isolated';
  createdAt?: string | number;
}
