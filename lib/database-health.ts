import dns from "node:dns/promises";
import fs from "node:fs";
import path from "node:path";
import prisma from "@/lib/prisma";

export type DatabaseHealth = {
  ok: boolean;
  checkedAt: string;
  databaseUrlConfigured: boolean;
  directUrlConfigured: boolean;
  databaseUrlSource?: string;
  directUrlSource?: string;
  host?: string;
  port?: string;
  database?: string;
  directHost?: string;
  directPort?: string;
  directDatabase?: string;
  connectionMode: "direct" | "pooler" | "unknown";
  dns?: {
    ok: boolean;
    addresses?: string[];
    error?: string;
  };
  latencyMs?: number;
  error?: string;
  recommendation?: string;
};

type ParsedDatabaseUrl = {
  host: string;
  port: string;
  database?: string;
  connectionMode: "direct" | "pooler";
};

function timeoutError(label: string, timeoutMs: number) {
  return new Error(`${label} timed out after ${timeoutMs}ms`);
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(timeoutError(label, timeoutMs)), timeoutMs);
    }),
  ]);
}

function parsePostgresUrl(value: string | undefined): ParsedDatabaseUrl | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    return {
      host: url.hostname,
      port: url.port || "5432",
      database: url.pathname.replace(/^\//, "") || undefined,
      connectionMode:
        url.hostname.includes("pooler.supabase") || url.port === "6543"
          ? ("pooler" as const)
          : ("direct" as const),
    };
  } catch {
    return null;
  }
}

function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};

  const values: Record<string, string> = {};
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[match[1]] = value;
  }

  return values;
}

function getNextEnvLoadOrder() {
  const nodeEnv = process.env.NODE_ENV || "development";
  const files = [`.env.${nodeEnv}.local`];
  if (nodeEnv !== "test") files.push(".env.local");
  files.push(`.env.${nodeEnv}`, ".env");
  return files;
}

function findEnvSource(key: "DATABASE_URL" | "DIRECT_URL", runtimeValue: string | undefined) {
  const cwd = process.cwd();
  for (const file of getNextEnvLoadOrder()) {
    const values = parseEnvFile(path.join(cwd, file));
    if (values[key] === runtimeValue) return file;
  }

  return runtimeValue ? "process environment" : undefined;
}

export function getDatabaseConnectionInfo() {
  const parsed = parsePostgresUrl(process.env.DATABASE_URL);
  const directParsed = parsePostgresUrl(process.env.DIRECT_URL);

  return {
    databaseUrlConfigured: Boolean(process.env.DATABASE_URL),
    directUrlConfigured: Boolean(process.env.DIRECT_URL),
    databaseUrlSource: findEnvSource("DATABASE_URL", process.env.DATABASE_URL),
    directUrlSource: findEnvSource("DIRECT_URL", process.env.DIRECT_URL),
    host: parsed?.host,
    port: parsed?.port,
    database: parsed?.database,
    directHost: directParsed?.host,
    directPort: directParsed?.port,
    directDatabase: directParsed?.database,
    connectionMode: parsed?.connectionMode ?? ("unknown" as const),
  };
}

export async function checkDatabaseHealth(): Promise<DatabaseHealth> {
  const startedAt = Date.now();
  const info = getDatabaseConnectionInfo();
  const timeoutMs = Number(process.env.DATABASE_HEALTH_TIMEOUT_MS || 5_000);
  const health: DatabaseHealth = {
    ok: false,
    checkedAt: new Date().toISOString(),
    ...info,
  };

  const recommendation =
    info.host?.startsWith("db.") && info.host.endsWith(".supabase.co") && info.port === "5432"
      ? "Runtime is using the Supabase direct connection. Use the Supabase Transaction Pooler URL in DATABASE_URL and keep the direct URL in DIRECT_URL."
      : undefined;

  if (!info.databaseUrlConfigured) {
    return { ...health, error: "DATABASE_URL is not configured", recommendation };
  }

  if (info.host) {
    try {
      const addresses = await withTimeout(
        dns.lookup(info.host, { all: true }),
        timeoutMs,
        "Database DNS lookup"
      );
      health.dns = {
        ok: true,
        addresses: addresses.map((address) => address.address),
      };
    } catch (error) {
      health.dns = {
        ok: false,
        error: error instanceof Error ? error.message : "DNS lookup failed",
      };
    }
  }

  try {
    await withTimeout(
      prisma.$queryRaw`SELECT 1`,
      timeoutMs,
      "Database query"
    );
    return {
      ...health,
      ok: true,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ...health,
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : "Database query failed",
      recommendation,
    };
  }
}

export async function logStartupDatabaseCheck() {
  const health = await checkDatabaseHealth();
  const target = health.host ? `${health.host}:${health.port}` : "unconfigured";

  console.log(`Runtime DATABASE_URL host: ${health.host ?? "unconfigured"}`);
  console.log(`Runtime DIRECT_URL host: ${health.directHost ?? "unconfigured"}`);
  console.log(`DATABASE_URL source file: ${health.databaseUrlSource ?? "unknown"}`);
  console.log(`DIRECT_URL source file: ${health.directUrlSource ?? "unknown"}`);

  if (health.ok) {
    console.log(`Database connectivity OK (${target}, ${health.connectionMode}, ${health.latencyMs}ms)`);
    return;
  }

  console.error("Database connectivity check failed", {
    target,
    mode: health.connectionMode,
    dns: health.dns,
    error: health.error,
  });
}
