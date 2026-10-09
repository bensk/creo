// k6 load test: the homeroom-start burst (CLAUDE.md, Performance budgets).
// Everyone opens the app within a minute of 7:55 a.m.: ~450 students and ~50
// staff, then keeps clicking for a few minutes.
//
//   pnpm load:sessions --out data/load-sessions.json
//   docker run --rm -i --network host -v "$PWD:/w" -w /w grafana/k6 run \
//     -e BASE_URL=http://localhost:8080 -e SESSIONS=/w/data/load-sessions.json tests/load/homeroom-burst.js
//
// Env: BASE_URL (required), SESSIONS (required; an absolute path, since k6 resolves relative
// paths against this script), PEAK (default 500), HOLD (default 2m).
import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";

const BASE = __ENV.BASE_URL;
const PEAK = Number(__ENV.PEAK || 500);
const sessions = new SharedArray("sessions", () => JSON.parse(open(__ENV.SESSIONS)));

export const options = {
  scenarios: {
    homeroom_start: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "45s", target: PEAK }, // the burst
        { duration: __ENV.HOLD || "2m", target: PEAK },
        { duration: "15s", target: 0 },
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{kind:page}": ["p(95)<500"],
    "http_req_duration{kind:health}": ["p(95)<200"],
    checks: ["rate>0.99"],
  },
};

const STAFF_PAGES = ["/", "/students", "/attendance", "/behavior"];

export default function homeroomBurst() {
  const s = sessions[(__VU - 1) % sessions.length];
  const params = (kind) => ({
    cookies: { [s.cookie]: s.token },
    redirects: 0,
    tags: { kind },
  });

  const path = s.surface === "student" ? "/student" : STAFF_PAGES[Math.floor(Math.random() * STAFF_PAGES.length)];
  const page = http.get(`${BASE}${path}`, params("page"));
  check(page, { "signed in page renders": (r) => r.status === 200 });

  const health = http.get(`${BASE}/api/health`, params("health"));
  check(health, { "health ok": (r) => r.status === 200 });

  sleep(2 + Math.random() * 3); // people read before clicking again
}
