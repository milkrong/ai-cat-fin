import { serve } from "inngest/next";
import { inngest } from "@/src/lib/inngest";
import { parseAndCategorize } from "@/src/workflows/parse-and-categorize";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [parseAndCategorize],
});

