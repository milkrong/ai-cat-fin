// Deprecated: categorization merged into ai-extract (aiExtractTransactionsFromText)
// This file is kept as a stub to avoid breaking imports if any remain.
export async function categorizeDescription() {
  throw new Error(
    "categorizeDescription has been deprecated. Use aiExtractTransactionsFromText which now returns category & categoryScore."
  );
}

export type CategorizerProvider = "SILICONFLOW"; // legacy compatibility
