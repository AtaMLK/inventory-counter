export type Product = {
  id: number;
  productCode: string;
  productName: string;
  barcode: string;
};

export type InventorySessionStatus = "in_progress" | "completed";

export type InventorySession = {
  id: number;
  name: string;
  status: InventorySessionStatus;
  startedAt: string;
  finishedAt: string | null;
};

export type InventoryCountRow = {
  productCode: string;
  productName: string;
  barcode: string;
  quantity: number;
  updatedAt: string | null;
};

export type ImportedProduct = {
  productCode: string;
  productName: string;
  barcode: string;
};

export type ImportResult = {
  products: ImportedProduct[];
  errors: string[];
};
