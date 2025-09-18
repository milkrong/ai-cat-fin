declare module "pdf-parse/lib/pdf-parse.js" {
  import { Buffer } from "node:buffer";
  interface PDFMetaData {
    [k: string]: any;
  }
  interface PDFInfo {
    [k: string]: any;
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
    options?: any
  ): Promise<PDFParseResult>;
  export default pdf;
}
