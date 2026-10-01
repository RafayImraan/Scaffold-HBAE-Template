import fs from "node:fs";
import path from "node:path";

/**
 * Loads the repo-root `.env` (HCS operator + topic config) for API routes.
 * Next.js only auto-loads `packages/nextjs/.env*`, so the root file that
 * `template.json` documents has to be read explicitly. Server-only: uses `fs`.
 */
export function loadRootEnv(): void {
  // Node >= 20.12 exposes process.loadEnvFile; types may lag behind the runtime.
  const loadEnvFile = (process as NodeJS.Process & { loadEnvFile?: (path: string) => void }).loadEnvFile;
  const candidates = [path.resolve(process.cwd(), "..", "..", ".env"), path.resolve(process.cwd(), ".env")];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate) || !loadEnvFile) continue;
    try {
      loadEnvFile.call(process, candidate);
    } catch {
      // Unparsable or already loaded - keep whatever is in process.env.
    }
    return;
  }
}
