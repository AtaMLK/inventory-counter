import { recognizeText, type Text } from "@infinitered/react-native-mlkit-text-recognition";

export type OcrProductCandidate = {
  value: string;
  source: "text" | "line";
};

export async function recognizeImageText(imageUri: string): Promise<Text> {
  return recognizeText(imageUri);
}

/**
 * Creates useful search candidates from OCR output without trying to guess
 * which product the user meant. Exact matching is handled by the database/UI.
 */
export function buildOcrCandidates(result: Text): OcrProductCandidate[] {
  const values: OcrProductCandidate[] = [];

  const add = (value: string, source: OcrProductCandidate["source"]) => {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (normalized.length < 2 || normalized.length > 80) return;
    if (!values.some((item) => item.value.toLowerCase() === normalized.toLowerCase())) {
      values.push({ value: normalized, source });
    }
  };

  add(result.text, "text");

  for (const block of result.blocks ?? []) {
    add(block.text, "line");
    for (const line of block.lines ?? []) {
      add(line.text, "line");
    }
  }

  return values.slice(0, 30);
}

/**
 * Extract barcode-like numeric strings and product-code-like tokens from OCR.
 * These are only search hints; they are never treated as a confirmed match.
 */
export function extractOcrTokens(text: string): string[] {
  const tokens = text
    .toUpperCase()
    .replace(/[|]/g, "I")
    .split(/[^A-Z0-9-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && token.length <= 32);

  return [...new Set(tokens)].slice(0, 40);
}
