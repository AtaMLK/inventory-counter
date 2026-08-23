export const INVENTORY_STATUS = {
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
} as const;

export const INVENTORY_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export const SUPPORTED_BARCODE_TYPES = [
  "ean13",
  "ean8",
  "code128",
  "code39",
  "upc_a",
  "upc_e",
] as const;

export const EXCEL_COLUMNS = [
  "Product Code",
  "Product Name",
  "Barcode",
  "Quantity",
  "Count Date",
  "Count Time",
  "Counted",
] as const;
