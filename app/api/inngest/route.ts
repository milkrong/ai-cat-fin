import { serve } from "inngest/next";
import { inngest } from "../../../src/lib/inngest";
import { parseAndCategorize } from "../../../src/inngest/parse-and-categorize";
import { parseAndCategorizeExcel } from "@/src/inngest/parse-and-categorize-excel";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [parseAndCategorize, parseAndCategorizeExcel],
});
