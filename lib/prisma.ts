import { loadEnvConfig } from "@next/env";
import type { PrismaClient as PrismaClientType } from "@prisma/client";

loadEnvConfig(process.cwd());

const { PrismaClient } = require("@prisma/client") as typeof import("@prisma/client");

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientType | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
