import "server-only";
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { canSignIn, isAllowedEmail } from "./access";

export const authOptions: NextAuthOptions = {
  callbacks: {
    jwt({ token, account, profile }) {
      if (account) {
        token.googleVerified = canSignIn(
          account.provider,
          profile as { email?: unknown; email_verified?: unknown } | undefined
        );
        token.email =
          typeof profile?.email === "string"
            ? profile.email.trim().toLowerCase()
            : undefined;
      }
      return token;
    },
    session({ session, token }) {
      // Re-check membership on every request so removing an email revokes access.
      if (token.googleVerified !== true || !isAllowedEmail(token.email)) {
        session.user = undefined;
      } else if (session.user) {
        session.user.email = token.email;
      }
      return session;
    },
    signIn({ account, profile }) {
      return canSignIn(
        account?.provider,
        profile as { email?: unknown; email_verified?: unknown } | undefined
      );
    },
  },
  logger: {
    debug() {
      /* Debug output is intentionally disabled to avoid exposing provider tokens. */
    },
    // Keep provider responses, tokens, and configuration values out of logs.
    error(code) {
      console.error("Google authentication error:", code);
    },
    warn(code) {
      console.warn("Google authentication warning:", code);
    },
  },
  pages: { error: "/admin/adverse-actions", signIn: "/admin/adverse-actions" },
  providers: [
    GoogleProvider({
      authorization: {
        params: { prompt: "select_account", scope: "openid email profile" },
      },
      checks: ["pkce", "state"],
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: { maxAge: 8 * 60 * 60, strategy: "jwt" },
};
