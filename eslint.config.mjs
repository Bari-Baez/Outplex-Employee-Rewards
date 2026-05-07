import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated OCR assets (copied from node_modules during postinstall)
    "public/tesseract/**",
    "public/pdfjs/**",
    // Local debug scripts (not shipped)
    "check_status.js",
    "debug_b1.js",
    "reset_b1.js",
    "reset_db.js",
  ]),
]);

export default eslintConfig;
