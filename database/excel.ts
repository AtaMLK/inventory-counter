import * as DocumentPicker from 'expo-document-picker';
import * as XLSX from 'xlsx';

export type ImportedProduct = {
  productCode: string;
  productName: string;
  barcode: string;
};

export type ImportResult = {
  products: ImportedProduct[];
  errors: string[];
};

export async function pickExcelFile() {
  const result = await DocumentPicker.getDocumentAsync({
    type: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ],
    copyToCacheDirectory: true,
  });

  if (result.canceled) {
    return null;
  }

  return result.assets[0];
}

export async function parseExcelFile(
  uri: string
): Promise<ImportResult> {
  const response = await fetch(uri);
  const arrayBuffer = await response.arrayBuffer();

  const workbook = XLSX.read(arrayBuffer, {
    type: 'array',
  });

  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    return {
      products: [],
      errors: ['The Excel file contains no worksheets.'],
    };
  }

  const worksheet =
    workbook.Sheets[firstSheetName];

  const rows = XLSX.utils.sheet_to_json<
    Record<string, unknown>
  >(worksheet, {
    defval: '',
  });

  const products: ImportedProduct[] = [];
  const errors: string[] = [];

  const productCodes = new Set<string>();
  const barcodes = new Set<string>();

  rows.forEach((row, index) => {
    const rowNumber = index + 2;

    const productCode = String(
      row['Product Code'] ?? ''
    ).trim();

    const productName = String(
      row['Product Name'] ?? ''
    ).trim();

    const barcode = String(
      row['Barcode'] ?? ''
    ).trim();

    if (!productCode) {
      errors.push(
        `Row ${rowNumber}: Product Code is missing.`
      );
      return;
    }

    if (!productName) {
      errors.push(
        `Row ${rowNumber}: Product Name is missing.`
      );
      return;
    }

    if (!barcode) {
      errors.push(
        `Row ${rowNumber}: Barcode is missing.`
      );
      return;
    }

    if (productCodes.has(productCode)) {
      errors.push(
        `Row ${rowNumber}: Duplicate Product Code "${productCode}".`
      );
      return;
    }

    if (barcodes.has(barcode)) {
      errors.push(
        `Row ${rowNumber}: Duplicate Barcode "${barcode}".`
      );
      return;
    }

    productCodes.add(productCode);
    barcodes.add(barcode);

    products.push({
      productCode,
      productName,
      barcode,
    });
  });

  return {
    products,
    errors,
  };
}