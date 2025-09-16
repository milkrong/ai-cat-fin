import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Define public routes (no auth required)
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/inngest(.*)",
]);

export default clerkMiddleware((auth, req) => {
  if (isPublicRoute(req)) return; // allow public
  auth.protect(); // protect others
});

export const config = {
  // Run middleware on all routes except static assets & _next
  matcher: ["/(api|trpc)(.*)", "/((?!_next|.*\\..*).*)"],
};
