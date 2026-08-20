import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Revalta loads dashboard data through explicit async functions called
      // from effects. React 19's experimental purity rules flag this stable,
      // intentional pattern even though it is safe and builds correctly.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
    },
  },
  {
    files: ["src/app/(dashboard)/dashboard/felanmalan/page.tsx"],
    rules: {
      // CSV export is an API download endpoint, not a Next.js page. A normal
      // anchor intentionally triggers a full document request so the browser
      // honors Content-Disposition instead of performing client navigation.
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
