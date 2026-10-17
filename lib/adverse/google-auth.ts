import "server-only";
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { canSignIn, isAllowedEmail } from "./access";

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      authorization: {
        params: { scope: "openid email profile", prompt: "select_account" },
      },
      checks: ["pkce", "state"],
    }),
  ],
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/admin/adverse-actions", error: "/admin/adverse-actions" },
  callbacks: {
    async signIn({ account, profile }) {
      return canSignIn(
        account?.provider,
        profile as { email?: unknown; email_verified?: unknown } | undefined,
      );
    },
    async jwt({ token, account, profile }) {
      if (account) {
        token.googleVerified = canSignIn(
          account.provider,
          profile as { email?: unknown; email_verified?: unknown } | undefined,
        );
        token.email =
          typeof profile?.email === "string"
            ? profile.email.trim().toLowerCase()
            : undefined;
      }
      return token;
    },
    async session({ session, token }) {
      // Re-check membership on every request so removing an email revokes access.
      if (token.googleVerified !== true || !isAllowedEmail(token.email))
        session.user = undefined;
      else if (session.user) session.user.email = token.email;
      return session;
    },
  },
  logger: {
    // Keep provider responses, tokens, and configuration values out of logs.
    error(code) {
      console.error("Google authentication error:", code);
    },
    warn(code) {
      console.warn("Google authentication warning:", code);
    },
    debug() {},
  },
};
