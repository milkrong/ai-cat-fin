declare module "pdf-parse" {
  interface PDFParseOptions {
    pagerender?: (pageData: unknown) => Promise<string>;
    max?: number;
  }
  interface PDFParseResult {
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    version: string;
    text: string;
  }
  function pdf(data: Buffer | Uint8Array, options?: PDFParseOptions): Promise<PDFParseResult>;
  export default pdf;
}
