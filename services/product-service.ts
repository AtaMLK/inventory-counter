import { findProductByBarcode, importProducts } from "@/database/database";
import type { ImportedProduct, Product } from "@/types/inventory";

export async function findByBarcode(barcode: string): Promise<Product | null> {
  return findProductByBarcode(barcode.trim());
}

export async function importProductMaster(
  products: ImportedProduct[],
): Promise<void> {
  await importProducts(products);
}
