import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Tenant isolation: feature code must use getTenantDb() via getOrgContext().
    // The base client is only allowed in auth, onboarding, invitations and lib/db itself.
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/lib/db/**",
      "src/lib/auth/**",
      "src/lib/security/**",
      "src/lib/jobs/**",
      "src/lib/storage/**",
      "src/lib/fraud/**",
      "src/auth.ts",
      "src/app/onboarding/**",
      "src/app/(auth)/**",
      "src/features/members/actions.ts",
      "src/app/admin/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [{ name: "@/lib/db/client", message: "Use getOrgContext(orgSlug).db (tenant-scoped) instead." }] },
      ],
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" }],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "src/generated/**", "src/components/ui/**"]),
]);

export default eslintConfig;
