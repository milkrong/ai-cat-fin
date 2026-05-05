declare module "pdf-parse/lib/pdf-parse.js" {
  import { Buffer } from "node:buffer";
  interface PDFMetaData {
    [k: string]: unknown;
  }
  interface PDFInfo {
    [k: string]: unknown;
  }
  interface PDFParseResult {
    numpages: number;
    numrender: number;
    info: PDFInfo;
    metadata: PDFMetaData | null;
    text: string;
    version: string;
  }
  function pdf(
    data: Buffer | Uint8Array,
    options?: Record<string, unknown>
  ): Promise<PDFParseResult>;
  export default pdf;
}
