# Inventory Counter

Offline-first mobile inventory counting app built with Expo, React Native, Expo Router, and SQLite.

## Core architecture

- `app/` — routes and screens
- `database/` — SQLite persistence, Excel parsing, and Excel export
- `services/` — application/domain operations used by the UI
- `types/` — shared inventory domain types
- `constants/` — inventory rules and supported barcode formats
- `utils/` — small domain utilities
- `components/` — reusable UI components
- `hooks/` — reusable React hooks

## Inventory lifecycle

1. Product master is imported from Excel.
2. A single inventory session is created for the current calendar month (`YYYY-MM`).
3. Barcode lookup resolves a product from the local SQLite product master.
4. Counts are stored locally against the session and product.
5. Quantity can be incremented, decremented, or explicitly set.
6. Completing the session changes it to `completed` and prevents further count writes.
7. Archive exposes completed sessions.
8. Excel export contains the complete product master, including products with no count row; uncounted products therefore remain visible with quantity `0` and an empty count timestamp.

## Data rules

- Product code is unique.
- Barcode is unique.
- A barcode cannot silently move to another product during import.
- Quantity must be a non-negative integer.
- Completed inventories are read-only.
- Inventory data is local-first and does not require an internet connection.

## Development

```bash
npm install
npm run typecheck
npm run lint
npx expo start
```

UI work is intentionally kept separate from the inventory/domain layer so the screens can be redesigned without changing the persistence rules.
