import { clerkMiddleware } from "@clerk/nextjs/server";
import {
  type NextFetchEvent,
  type NextRequest,
  NextResponse,
} from "next/server";
import { tenantAuthReady, usesClerkConnect } from "@/lib/tenant/config";
import { clerkSecretKey } from "@/lib/tenant/credentials";

const clerk = clerkMiddleware();
export default async function proxy(
  request: NextRequest,
  event: NextFetchEvent
) {
  // Only tenant routes use this middleware; owner login and webhooks stay independent.
  if (!tenantAuthReady()) {
    return NextResponse.next();
  }
  if (!usesClerkConnect()) {
    return clerk(request, event);
  }
  try {
    // Clerk encrypts dynamic credentials into server-only request headers using
    // CLERK_ENCRYPTION_KEY. Never pass the secret through React component props.
    const connectedClerk = clerkMiddleware({
      secretKey: await clerkSecretKey(),
    });
    return await connectedClerk(request, event);
  } catch {
    return new NextResponse(
      "Tenant sign-in is temporarily unavailable. Please try again later.",
      {
        headers: { "Cache-Control": "no-store" },
        status: 503,
      }
    );
  }
}
export const config = {
  matcher: [
    "/tenant/:path*",
    "/sign-in/:path*",
    "/sign-up/:path*",
    "/api/tenant/:path*",
  ],
};
