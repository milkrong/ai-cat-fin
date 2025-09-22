import { serve } from "inngest/next";
import { inngest } from "../../../src/lib/inngest";
import { parseAndCategorize } from "../../../src/inngest/parse-and-categorize";
import { parseAndCategorizeExcel } from "@/src/inngest/parse-and-categorize-excel";
import { cleanupStaleImportJobs } from "@/src/inngest/cleanup-stale-import-jobs";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    parseAndCategorize,
    parseAndCategorizeExcel,
    cleanupStaleImportJobs,
  ],
});
