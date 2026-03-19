import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

type EndpointCheck = {
  id: string;
  path: string;
  method?: Method;
  expectedStatusIn?: number[];
  body?: unknown;
  headers?: Record<string, string>;
};

type ActorCheckSet = {
  name: string;
  cookieHeader: string;
  allowed: EndpointCheck[];
  denied: EndpointCheck[];
};

type MatrixConfig = {
  baseUrl: string;
  timeoutMs?: number;
  actors: ActorCheckSet[];
};

type CheckResult = {
  actor: string;
  checkId: string;
  phase: "allowed" | "denied";
  path: string;
  method: Method;
  status: number;
  pass: boolean;
  classification: "ok" | "availability_issue" | "security_breach";
  detail: string;
};

function normalizeMethod(method?: string): Method {
  const m = (method || "GET").toUpperCase();
  if (m === "POST" || m === "PATCH" || m === "PUT" || m === "DELETE") {
    return m;
  }
  return "GET";
}

async function runOne(
  baseUrl: string,
  timeoutMs: number,
  actor: ActorCheckSet,
  check: EndpointCheck,
  phase: "allowed" | "denied",
): Promise<CheckResult> {
  const method = normalizeMethod(check.method);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `${baseUrl.replace(/\/$/, "")}${check.path.startsWith("/") ? check.path : `/${check.path}`}`;
    const response = await fetch(url, {
      method,
      signal: controller.signal,
      redirect: "manual",
      headers: {
        cookie: actor.cookieHeader,
        "content-type": "application/json",
        ...(check.headers || {}),
      },
      body: check.body !== undefined ? JSON.stringify(check.body) : undefined,
    });

    const status = response.status;
    const location = response.headers.get("location") || "";
    const isLoginRedirect =
      (status === 302 || status === 303 || status === 307 || status === 308) &&
      /\/login(?:$|\?|#)/i.test(location);

    if (phase === "allowed") {
      const expected = check.expectedStatusIn || [200, 201, 202];
      const pass = expected.includes(status);
      return {
        actor: actor.name,
        checkId: check.id,
        phase,
        path: check.path,
        method,
        status,
        pass,
        classification: pass ? "ok" : "availability_issue",
        detail: pass
          ? `Allowed endpoint returned expected status ${status}`
          : `Expected one of [${expected.join(", ")}], got ${status}`,
      };
    }

    const deniedPass = status === 401 || status === 403 || status === 404 || isLoginRedirect;
    return {
      actor: actor.name,
      checkId: check.id,
      phase,
      path: check.path,
      method,
      status,
      pass: deniedPass,
      classification: deniedPass ? "ok" : "security_breach",
      detail: deniedPass
        ? isLoginRedirect
          ? `Denied endpoint correctly redirected to login with status ${status}`
          : `Denied endpoint correctly blocked with status ${status}`
        : `Denied endpoint unexpectedly reachable with status ${status}`,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      actor: actor.name,
      checkId: check.id,
      phase,
      path: check.path,
      method,
      status: 0,
      pass: false,
      classification: phase === "allowed" ? "availability_issue" : "security_breach",
      detail: `Request error: ${detail}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const configPathArg = process.argv[2] || "scripts/security/matrix.sample.json";
  const configPath = resolve(configPathArg);
  const outputPath = resolve("scripts/security/latest-report.json");

  const raw = readFileSync(configPath, "utf8");
  const config = JSON.parse(raw) as MatrixConfig;

  const timeoutMs = Math.max(2000, Number(config.timeoutMs || 12000));
  const results: CheckResult[] = [];

  for (const actor of config.actors) {
    for (const check of actor.allowed) {
      results.push(await runOne(config.baseUrl, timeoutMs, actor, check, "allowed"));
    }
    for (const check of actor.denied) {
      results.push(await runOne(config.baseUrl, timeoutMs, actor, check, "denied"));
    }
  }

  const securityBreaches = results.filter((r) => r.classification === "security_breach");
  const availabilityIssues = results.filter((r) => r.classification === "availability_issue");
  const passed = results.filter((r) => r.pass).length;

  const report = {
    generatedAt: new Date().toISOString(),
    configPath,
    totals: {
      checks: results.length,
      passed,
      failed: results.length - passed,
      securityBreaches: securityBreaches.length,
      availabilityIssues: availabilityIssues.length,
    },
    securityBreaches,
    availabilityIssues,
    results,
  };

  writeFileSync(outputPath, JSON.stringify(report, null, 2));

  console.log(`Checks: ${report.totals.checks}`);
  console.log(`Passed: ${report.totals.passed}`);
  console.log(`Failed: ${report.totals.failed}`);
  console.log(`Security breaches: ${report.totals.securityBreaches}`);
  console.log(`Availability issues: ${report.totals.availabilityIssues}`);
  console.log(`Report written to: ${outputPath}`);

  if (report.totals.securityBreaches > 0 || report.totals.availabilityIssues > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Access matrix run failed:", error);
  process.exit(1);
});
