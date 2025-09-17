import { auth } from "@clerk/nextjs/server";
import ReviewClient from "./review-client";

async function fetchDrafts(jobId: string, userId: string) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL || ""}/api/imports/${jobId}/drafts`,
    {
      cache: "no-store",
      headers: {},
    }
  );
  if (!res.ok) return { job: null, drafts: [] };
  return res.json();
}

export default async function ImportReviewPage({
  params,
}: {
  params: { jobId: string };
}) {
  const { userId } = await auth();
  if (!userId) return <div className="p-4 text-sm text-red-600">未登录</div>;
  const data = await fetchDrafts(params.jobId, userId);
  if (!data.job) return <div className="p-4">任务不存在</div>;
  return <ReviewClient job={data.job} initialDrafts={data.drafts} />;
}
