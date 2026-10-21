export interface CashTransaction {
  id: string;
  amount: number;
  direction: 'inflow' | 'outflow';
  description: string;
  createdAt?: string | number;
}
