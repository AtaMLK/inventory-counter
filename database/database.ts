import * as SQLite from "expo-sqlite";

export type Product = {
  id: number;
  productCode: string;
  productName: string;
  barcode: string;
};

export type InventorySession = {
  id: number;
  name: string;
  status: string;
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

let database: SQLite.SQLiteDatabase | null = null;

export async function getDatabase() {
  if (!database) {
    database = await SQLite.openDatabaseAsync("inventory.db");
  }

  return database;
}

export async function initializeDatabase() {
  const db = await getDatabase();

  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_code TEXT NOT NULL UNIQUE,
      product_name TEXT NOT NULL,
      barcode TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inventory_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT
    );

    CREATE TABLE IF NOT EXISTS counts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
      updated_at TEXT NOT NULL,
      UNIQUE(session_id, product_id),
      FOREIGN KEY (session_id) REFERENCES inventory_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
    CREATE INDEX IF NOT EXISTS idx_counts_session ON counts(session_id);
    CREATE INDEX IF NOT EXISTS idx_counts_product ON counts(product_id);

    CREATE TRIGGER IF NOT EXISTS prevent_count_insert_when_locked
    BEFORE INSERT ON counts
    WHEN NOT EXISTS (
      SELECT 1 FROM inventory_sessions
      WHERE id = NEW.session_id AND status = 'in_progress'
    )
    BEGIN
      SELECT RAISE(ABORT, 'Inventory session is locked or does not exist.');
    END;

    CREATE TRIGGER IF NOT EXISTS prevent_count_update_when_locked
    BEFORE UPDATE OF quantity, session_id, product_id ON counts
    WHEN NOT EXISTS (
      SELECT 1 FROM inventory_sessions
      WHERE id = OLD.session_id AND status = 'in_progress'
    )
    BEGIN
      SELECT RAISE(ABORT, 'Inventory session is locked.');
    END;
  `);
}

export async function getOrCreateCurrentMonthSession() {
  const db = await getDatabase();
  const now = new Date();
  const sessionName = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const existingSession = await db.getFirstAsync<InventorySession>(
    `
      SELECT id, name, status,
        started_at AS startedAt,
        finished_at AS finishedAt
      FROM inventory_sessions
      WHERE name = ?
      LIMIT 1
    `,
    sessionName,
  );

  if (existingSession) return existingSession;

  const startedAt = now.toISOString();
  const result = await db.runAsync(
    `INSERT INTO inventory_sessions (name, status, started_at) VALUES (?, ?, ?)`,
    sessionName,
    "in_progress",
    startedAt,
  );

  return {
    id: result.lastInsertRowId,
    name: sessionName,
    status: "in_progress",
    startedAt,
    finishedAt: null,
  } satisfies InventorySession;
}

export async function findProductByBarcode(barcode: string) {
  const db = await getDatabase();
  return db.getFirstAsync<Product>(
    `
      SELECT id,
        product_code AS productCode,
        product_name AS productName,
        barcode
      FROM products
      WHERE barcode = ?
      LIMIT 1
    `,
    barcode.trim(),
  );
}

export async function getProductCount(sessionId: number, productId: number) {
  const db = await getDatabase();
  const result = await db.getFirstAsync<{ quantity: number }>(
    `SELECT quantity FROM counts WHERE session_id = ? AND product_id = ? LIMIT 1`,
    sessionId,
    productId,
  );
  return result?.quantity ?? 0;
}

export async function saveProductCount(sessionId: number, productId: number, quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new Error("Quantity must be a non-negative whole number.");
  }

  const db = await getDatabase();
  const now = new Date().toISOString();

  await db.runAsync(
    `
      INSERT INTO counts (session_id, product_id, quantity, updated_at)
      SELECT ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM inventory_sessions
        WHERE id = ? AND status = 'in_progress'
      )
      ON CONFLICT(session_id, product_id)
      DO UPDATE SET quantity = excluded.quantity, updated_at = excluded.updated_at
    `,
    sessionId,
    productId,
    quantity,
    now,
    sessionId,
  );
}

export async function incrementProductCount(sessionId: number, productId: number) {
  const db = await getDatabase();
  const now = new Date().toISOString();

  await db.runAsync(
    `
      INSERT INTO counts (session_id, product_id, quantity, updated_at)
      SELECT ?, ?, 1, ?
      WHERE EXISTS (
        SELECT 1 FROM inventory_sessions
        WHERE id = ? AND status = 'in_progress'
      )
      ON CONFLICT(session_id, product_id)
      DO UPDATE SET quantity = counts.quantity + 1, updated_at = excluded.updated_at
    `,
    sessionId,
    productId,
    now,
    sessionId,
  );

  return getProductCount(sessionId, productId);
}

export async function getInventorySessions() {
  const db = await getDatabase();
  return db.getAllAsync<InventorySession>(
    `
      SELECT id, name, status,
        started_at AS startedAt,
        finished_at AS finishedAt
      FROM inventory_sessions
      ORDER BY started_at DESC
    `,
  );
}

export async function getSessionCounts(sessionId: number) {
  const db = await getDatabase();
  return db.getAllAsync<InventoryCountRow>(
    `
      SELECT
        p.product_code AS productCode,
        p.product_name AS productName,
        p.barcode AS barcode,
        COALESCE(c.quantity, 0) AS quantity,
        c.updated_at AS updatedAt
      FROM products p
      LEFT JOIN counts c
        ON c.product_id = p.id AND c.session_id = ?
      ORDER BY p.product_code ASC
    `,
    sessionId,
  );
}

export async function completeInventorySession(sessionId: number) {
  const db = await getDatabase();
  const result = await db.runAsync(
    `
      UPDATE inventory_sessions
      SET status = 'completed', finished_at = ?
      WHERE id = ? AND status = 'in_progress'
    `,
    new Date().toISOString(),
    sessionId,
  );

  if (result.changes === 0) {
    throw new Error("This inventory session is already completed or does not exist.");
  }
}

export async function getCompletedSessions() {
  const db = await getDatabase();
  return db.getAllAsync<InventorySession>(
    `
      SELECT id, name, status,
        started_at AS startedAt,
        finished_at AS finishedAt
      FROM inventory_sessions
      WHERE status = 'completed'
      ORDER BY finished_at DESC
    `,
  );
}

export async function importProducts(products: {
  productCode: string;
  productName: string;
  barcode: string;
}[]) {
  const db = await getDatabase();

  await db.withTransactionAsync(async () => {
    for (const product of products) {
      const productCode = product.productCode.trim();
      const productName = product.productName.trim();
      const barcode = product.barcode.trim();

      if (!productCode || !productName || !barcode) {
        throw new Error("Product Code, Product Name, and Barcode are required.");
      }

      const existingBarcodeOwner = await db.getFirstAsync<{ productCode: string }>(
        `
          SELECT product_code AS productCode
          FROM products
          WHERE barcode = ? AND product_code <> ?
          LIMIT 1
        `,
        barcode,
        productCode,
      );

      if (existingBarcodeOwner) {
        throw new Error(
          `Barcode ${barcode} is already assigned to product ${existingBarcodeOwner.productCode}.`,
        );
      }

      await db.runAsync(
        `
          INSERT INTO products (product_code, product_name, barcode, created_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(product_code)
          DO UPDATE SET product_name = excluded.product_name, barcode = excluded.barcode
        `,
        productCode,
        productName,
        barcode,
        new Date().toISOString(),
      );
    }
  });
}
