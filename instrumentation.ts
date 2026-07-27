export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.ENABLE_STARTUP_DB_CHECK !== "true") return;

    const { logStartupDatabaseCheck } = await import("@/lib/database-health");
    void logStartupDatabaseCheck().catch((error) => {
      console.error(
        "Startup database connectivity check failed",
        error instanceof Error ? error.message : error
      );
    });
  }
}
