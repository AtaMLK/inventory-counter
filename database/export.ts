import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';

import {
  getSessionCounts,
} from '@/database/database';

export async function exportInventoryToExcel(
  sessionId: number,
  sessionName: string
) {
  const rows = await getSessionCounts(sessionId);

  const exportRows = rows.map((row) => ({
    'Product Code': row.productCode,
    'Product Name': row.productName,
    Barcode: row.barcode,
    Quantity: row.quantity,
    'Count Date': new Date(
      row.updatedAt
    ).toLocaleDateString(),
    'Count Time': new Date(
      row.updatedAt
    ).toLocaleTimeString(),
  }));

  const worksheet =
    XLSX.utils.json_to_sheet(exportRows);

  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    worksheet,
    'Inventory'
  );

  const base64 = XLSX.write(workbook, {
    type: 'base64',
    bookType: 'xlsx',
  });

  const safeSessionName =
    sessionName.replace(/[^a-zA-Z0-9-_]/g, '_');

  const fileName =
    `inventory-${safeSessionName}.xlsx`;

  const fileUri =
    `${FileSystem.cacheDirectory}${fileName}`;

  await FileSystem.writeAsStringAsync(
    fileUri,
    base64,
    {
      encoding: FileSystem.EncodingType.Base64,
    }
  );

  const canShare =
    await Sharing.isAvailableAsync();

  if (!canShare) {
    throw new Error(
      'File sharing is not available on this device.'
    );
  }

  await Sharing.shareAsync(fileUri, {
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dialogTitle: `Share ${fileName}`,
    UTI:
      'com.microsoft.excel.xlsx',
  });

  return fileUri;
}