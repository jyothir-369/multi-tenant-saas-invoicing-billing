require("dotenv").config();

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({
  log: ["info", "warn", "error"],
});

async function main() {
  console.log("Connecting with Prisma...");

  await prisma.$connect();

  console.log("SUCCESS: Prisma connected!");

  const result = await prisma.$queryRaw`SELECT NOW() AS now`;

  console.log("Database response:", result);
}

main()
  .catch((error) => {
    console.error("FAILED:");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });