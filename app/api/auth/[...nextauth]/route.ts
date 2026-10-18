import NextAuth from "next-auth";
import { authOptions } from "@/lib/adverse/google-auth";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
