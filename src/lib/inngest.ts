import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "smart-ledger",
  eventKey: process.env.INNGEST_EVENT_KEY,
});
