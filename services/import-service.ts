import { importProducts } from "@/database/database";
import type { ImportedProduct, ImportResult } from "@/types/inventory";

export function validateProducts(products: ImportedProduct[]): ImportResult {
  const valid: ImportedProduct[] = [];
  const errors: string[] = [];
  const productCodes = new Set<string>();
  const barcodes = new Set<string>();

  products.forEach((product, index) => {
    const row = index + 1;
    const productCode = product.productCode.trim();
    const productName = product.productName.trim();
    const barcode = product.barcode.trim();

    if (!productCode || !productName || !barcode) {
      errors.push(`Row ${row}: Product Code, Product Name, and Barcode are required.`);
      return;
    }

    if (productCodes.has(productCode)) {
      errors.push(`Row ${row}: Duplicate Product Code "${productCode}".`);
      return;
    }

    if (barcodes.has(barcode)) {
      errors.push(`Row ${row}: Duplicate Barcode "${barcode}".`);
      return;
    }

    productCodes.add(productCode);
    barcodes.add(barcode);
    valid.push({ productCode, productName, barcode });
  });

  return { products: valid, errors };
}

export async function saveProductMaster(products: ImportedProduct[]) {
  if (products.length === 0) {
    throw new Error("There are no products to import.");
  }

  await importProducts(products);
}
