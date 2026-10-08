// Proves dev sign-in cannot exist in a production build. Run after `pnpm build`.
//   1. No dev sign-in code in the build output.
//   2. A production server returns 404 for the route.
//   3. A production server with DEV_SIGN_IN set refuses to start.
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const MARKERS = ["creo-dev-sign-in-route", "devSignInAction", "Sign in as a test user"];
const DUMMY_DB = "postgres://creo_app:creo_app@localhost:5432/creo_prod_guard_check";
let failures = 0;

function fail(message) {
  failures++;
  console.error(`FAIL ${message}`);
}
function pass(message) {
  console.log(`ok   ${message}`);
}

// 1. Build output
if (!existsSync(".next/BUILD_ID")) {
  console.error("No production build found. Run `pnpm build` first.");
  process.exit(1);
}
function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}
const searched = [".next/server", ".next/static", ".next/standalone/.next"].filter(existsSync);
let hits = 0;
for (const dir of searched) {
  for (const file of files(dir)) {
    if (!/\.(js|json|html|rsc|txt|map|body|meta)$/.test(file)) continue;
    const text = readFileSync(file, "utf8");
    for (const marker of MARKERS) {
      if (text.includes(marker)) {
        hits++;
        fail(`build output contains "${marker}": ${file}`);
      }
    }
  }
}
if (hits === 0) pass(`no dev sign-in code in ${searched.join(", ")}`);
if (existsSync(".next/server/app/dev")) fail("build contains .next/server/app/dev");
else pass("no /dev routes in the build");

// Helpers for running `next start`
function startServer(port, extraEnv) {
  const env = { ...process.env, NODE_ENV: "production", DATABASE_URL: DUMMY_DB, ...extraEnv };
  for (const [key, value] of Object.entries(extraEnv)) if (value === undefined) delete env[key];
  // The standalone server is what Cloud Run runs. It does not read .env.local,
  // so the environment here is exactly what each check sets.
  env.PORT = String(port);
  env.HOSTNAME = "127.0.0.1";
  const child = spawn("node", [".next/standalone/server.js"], { env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));
  const exited = new Promise((resolve) => child.on("exit", (code) => resolve(code)));
  return { child, exited, output: () => output };
}
async function waitForHttp(url, ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      return await fetch(url, { redirect: "manual" });
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  return null;
}

// 2. Route is 404 on a production server
{
  const server = startServer(3201, { DEV_SIGN_IN: undefined });
  try {
    const get = await waitForHttp("http://127.0.0.1:3201/dev/sign-in", 30_000);
    if (!get) fail(`production server did not start:\n${server.output()}`);
    else if (get.status !== 404) fail(`GET /dev/sign-in returned ${get.status}, expected 404`);
    else pass("GET /dev/sign-in is 404 in production");

    const post = await fetch("http://127.0.0.1:3201/dev/sign-in", {
      method: "POST", redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" }, body: "persona=admin",
    }).catch(() => null);
    if (post && post.status !== 404) fail(`POST /dev/sign-in returned ${post.status}, expected 404`);
    else if (post) pass("POST /dev/sign-in is 404 in production");
    if (post && post.headers.get("set-cookie")) fail("POST /dev/sign-in set a cookie");
  } finally {
    server.child.kill();
  }
}

// 3. DEV_SIGN_IN in production stops the server from starting
{
  const server = startServer(3202, { DEV_SIGN_IN: "true" });
  const code = await Promise.race([server.exited, new Promise((r) => setTimeout(() => r("timeout"), 20_000))]);
  const response = code === "timeout" ? await waitForHttp("http://127.0.0.1:3202/sign-in", 1_000) : null;
  if (code === "timeout") fail(`server with DEV_SIGN_IN=true kept running (GET /sign-in: ${response?.status ?? "no response"})`);
  else if (code === 0) fail("server with DEV_SIGN_IN=true exited with code 0");
  else if (!/DEV_SIGN_IN must not be set in production/.test(server.output())) fail(`server with DEV_SIGN_IN=true exited without naming the problem:\n${server.output()}`);
  else pass(`server with DEV_SIGN_IN=true refused to start (exit code ${code})`);
  server.child.kill();
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nDev sign-in is absent from the production build.");
// Open keep-alive sockets from fetch would otherwise hold the process open.
process.exit(0);
