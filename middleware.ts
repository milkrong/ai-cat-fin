import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Define public routes (no auth required)
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/inngest(.*)", // inngest endpoint
]);

export default clerkMiddleware(async (auth, req) => {
  // Allow explicitly public routes
  if (isPublicRoute(req)) return;

  // For everything else, let Clerk enforce authentication
  await auth.protect();
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
