export interface Product {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  costPrice: number;
  sellingPrice: number;
  reorderLevel: number;
}

export type ProductInput = Omit<Product, 'id'>;

export type InventoryPage = 'list' | 'add' | 'edit' | 'details' | 'report';
