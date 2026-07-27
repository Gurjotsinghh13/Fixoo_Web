const { loadRuntimeEnv } = require("./load-env");

loadRuntimeEnv();

const { PrismaClient } = require("@prisma/client");

const globalForPrisma = globalThis;

function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

const prisma = globalForPrisma.__fixooPrisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__fixooPrisma = prisma;
}

module.exports = prisma;
