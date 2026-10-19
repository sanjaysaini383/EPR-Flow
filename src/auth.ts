import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { hash, verify } from "@node-rs/argon2";
import { prisma } from "@/lib/db/client";
import "@/lib/env";
import { loginSchema } from "@/lib/validation/auth";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

export const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

// Verified against when the email is unknown so response time doesn't reveal which emails exist.
const dummyHash = hash("timing-equaliser-not-a-real-password");

export const { handlers, auth, signIn, signOut } = NextAuth({
  // The adapter persists Google users/accounts; sessions are JWT (required for Credentials).
  adapter: PrismaAdapter(prisma as never),
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60, updateAge: 24 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  trustHost: true,
  logger: {
    // A wrong password is a normal outcome (shown to the user), not a server error.
    error(error) {
      if (error.name === "CredentialsSignin") return;
      console.error(error);
    },
  },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;
        const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
        if (!user?.passwordHash) {
          await verify(await dummyHash, parsed.data.password).catch(() => false);
          return null;
        }
        const ok = await verify(user.passwordHash, parsed.data.password);
        return ok ? { id: user.id, email: user.email, name: user.name, image: user.image } : null;
      },
    }),
    ...(googleEnabled
      ? [
          Google({
            // Google verifies email ownership, so linking to an existing email/password user is safe.
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
