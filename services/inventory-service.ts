import {
  completeInventorySession,
  findProductByBarcode,
  getOrCreateCurrentMonthSession,
  getProductCount,
  saveProductCount,
} from "@/database/database";

import type { InventorySession, Product } from "@/types/inventory";

export async function getCurrentInventory(): Promise<InventorySession> {
  const session = await getOrCreateCurrentMonthSession();

  return {
    ...session,
    status: session.status === "completed" ? "completed" : "in_progress",
  };
}

export async function lookupProduct(barcode: string): Promise<Product | null> {
  const normalized = barcode.trim();
  if (!normalized) return null;
  return findProductByBarcode(normalized);
}

export async function incrementProduct(
  sessionId: number,
  productId: number,
): Promise<number> {
  const current = await getProductCount(sessionId, productId);
  const next = current + 1;
  await saveProductCount(sessionId, productId, next);
  return next;
}

export async function setProductQuantity(
  sessionId: number,
  productId: number,
  quantity: number,
): Promise<number> {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new Error("Quantity must be a non-negative whole number.");
  }

  await saveProductCount(sessionId, productId, quantity);
  return quantity;
}

export async function decrementProduct(
  sessionId: number,
  productId: number,
): Promise<number> {
  const current = await getProductCount(sessionId, productId);
  const next = Math.max(0, current - 1);
  await saveProductCount(sessionId, productId, next);
  return next;
}

export async function lockInventory(sessionId: number): Promise<void> {
  await completeInventorySession(sessionId);
}
