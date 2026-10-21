export interface Product {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  costPrice: number;
  sellingPrice: number;
  reorderLevel: number;
  createdAt?: string | number;
}
