import { addDoc, collection, getDocs, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { db, assertFirebaseReady } from '../config/firebase';
import type { Product } from '../types/product';

function productsCollection(businessId: string) {
  assertFirebaseReady();

  const dbInstance = db;
  if (!dbInstance) {
    throw new Error('Firebase is not configured.');
  }

  if (!businessId.trim()) {
    throw new Error('Select a business first.');
  }

  return collection(dbInstance, 'businesses', businessId, 'products');
}

export async function getProducts(businessId: string): Promise<Product[]> {
  assertFirebaseReady();

  const snapshot = await getDocs(query(productsCollection(businessId), orderBy('name')));

  return snapshot.docs.map((item) => ({
    id: item.id,
    ...item.data(),
  })) as Product[];
}

export async function addProduct(businessId: string, product: Omit<Product, 'id'>): Promise<string> {
  assertFirebaseReady();

  if (!product.name.trim()) {
    throw new Error('Product name is required.');
  }

  if (!Number.isSafeInteger(product.quantity) || product.quantity < 0) {
    throw new Error('Quantity must be a non-negative integer.');
  }

  for (const amount of [product.costPrice, product.sellingPrice]) {
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new Error('Prices must be non-negative integer minor units.');
    }
  }

  const result = await addDoc(productsCollection(businessId), {
    ...product,
    name: product.name.trim(),
    sku: product.sku.trim(),
    createdAt: serverTimestamp(),
  });

  return result.id;
}
