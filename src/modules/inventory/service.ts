import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { assertFirebaseReady, db } from '../../config/firebase';
import type { Product, ProductInput } from './types';

function productsCollection(businessId: string) {
  assertFirebaseReady();

  const dbInstance = db;
  if (!dbInstance) {
    throw new Error('Firebase is not configured.');
  }
  if (!businessId.trim()) {
    throw new Error('Select an active business first.');
  }

  return collection(dbInstance, 'businesses', businessId, 'products');
}

function normalizeProduct(input: ProductInput): ProductInput {
  const name = input.name.trim();
  const sku = input.sku.trim();
  if (!name) {
    throw new Error('Product name is required.');
  }
  for (const [label, value] of [
    ['Quantity', input.quantity],
    ['Cost price', input.costPrice],
    ['Selling price', input.sellingPrice],
    ['Reorder level', input.reorderLevel],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${label} must be a non-negative whole number.`);
    }
  }

  return { name, sku, quantity: input.quantity, costPrice: input.costPrice, sellingPrice: input.sellingPrice, reorderLevel: input.reorderLevel };
}

function productFromData(id: string, data: Record<string, unknown>): Product {
  const { name, sku, quantity, costPrice, sellingPrice, reorderLevel } = data;
  if (
    typeof name !== 'string' ||
    typeof sku !== 'string' ||
    !Number.isSafeInteger(quantity) ||
    !Number.isSafeInteger(costPrice) ||
    !Number.isSafeInteger(sellingPrice) ||
    !Number.isSafeInteger(reorderLevel)
  ) {
    throw new Error(`Product ${id} has invalid data in Firestore.`);
  }

  return {
    id,
    name,
    sku,
    quantity: quantity as number,
    costPrice: costPrice as number,
    sellingPrice: sellingPrice as number,
    reorderLevel: reorderLevel as number,
  };
}

export async function getProducts(businessId: string): Promise<Product[]> {
  const snapshot = await getDocs(query(productsCollection(businessId), orderBy('name')));
  return snapshot.docs.map((item) => productFromData(item.id, item.data()));
}

export async function getProduct(businessId: string, productId: string): Promise<Product | null> {
  const snapshot = await getDoc(doc(productsCollection(businessId), productId));
  return snapshot.exists() ? productFromData(snapshot.id, snapshot.data()) : null;
}

export async function addProduct(businessId: string, input: ProductInput): Promise<string> {
  const result = await addDoc(productsCollection(businessId), {
    ...normalizeProduct(input),
    createdAt: serverTimestamp(),
  });
  return result.id;
}

export async function updateProduct(
  businessId: string,
  productId: string,
  input: ProductInput,
): Promise<void> {
  await updateDoc(doc(productsCollection(businessId), productId), normalizeProduct(input));
}

export async function deleteProduct(businessId: string, productId: string): Promise<void> {
  await deleteDoc(doc(productsCollection(businessId), productId));
}
