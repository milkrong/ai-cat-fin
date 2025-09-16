import { authMiddleware } from "@clerk/nextjs";

export default authMiddleware({
  publicRoutes: ["/", "/sign-in(.*)", "/sign-up(.*)", "/api/inngest(.*)"],
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};

