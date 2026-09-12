require('dotenv/config');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function run() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const ms = Date.now() - start;
    console.log(`Neon keep-alive: OK (${ms}ms)`);
  } catch (e) {
    console.error('Neon keep-alive: ERROR', e.message || e);
  }
}

const intervalMs = 4 * 60 * 1000; // 4 minutes
console.log(`Starting Neon keep-alive ping every ${intervalMs / 60000} minutes (database: ${process.env.DATABASE_URL ? 'set' : 'missing'})`);

run();
const timer = setInterval(run, intervalMs);

process.on('SIGINT', () => {
  console.log('Stopping Neon keep-alive...');
  clearInterval(timer);
  process.exit(0);
});
