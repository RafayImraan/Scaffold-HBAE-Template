/**
 * Smoke test: builds must already exist (npm run next:build). Boots `next start`
 * on a spare port and asserts every core route answers 200.
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 3210;
const BASE = `http://localhost:${PORT}`;
const ROUTES = [
  "/",
  "/debug",
  "/committee/0x0000000000000000000000000000000000000001",
  "/api/health",
  "/api/hcs?limit=5",
];

const child = spawn("npm", ["run", "serve", "-w", "@sh/nextjs", "--", "--port", String(PORT)], {
  stdio: ["ignore", "pipe", "pipe"],
  shell: process.platform === "win32",
});
let output = "";
child.stdout.on("data", chunk => (output += chunk));
child.stderr.on("data", chunk => (output += chunk));

const shutdown = () => {
  if (!child.killed) child.kill();
};
process.on("exit", shutdown);

let failed = false;

try {
  let ready = false;
  for (let attempt = 0; attempt < 60 && !ready; attempt++) {
    try {
      const probe = await fetch(`${BASE}/api/health`);
      if (probe.ok) ready = true;
    } catch {
      // server not up yet
    }
    if (!ready) await sleep(1000);
  }
  if (!ready) throw new Error(`server did not come up within 60s:\n${output}`);

  for (const route of ROUTES) {
    const response = await fetch(`${BASE}${route}`);
    const status = response.status;
    if (status !== 200) {
      console.error(`FAIL ${route} -> ${status}`);
      failed = true;
    } else {
      console.log(`ok   ${route} -> 200`);
    }
  }
} catch (error) {
  console.error(`FAIL ${error.message}`);
  failed = true;
} finally {
  shutdown();
}

process.exit(failed ? 1 : 0);
