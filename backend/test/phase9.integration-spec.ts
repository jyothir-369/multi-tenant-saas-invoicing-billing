import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { performance } from 'node:perf_hooks';
import { AppModule } from '../src/app.module';

const databaseConfigured = Boolean(process.env.DATABASE_URL);
const suite = databaseConfigured ? describe : describe.skip;

/**
 * Phase 9 live validation. It intentionally requires DATABASE_URL and never
 * falls back to mocks: a skipped run must not be reported as a benchmark.
 */
suite('Phase 9 PostgreSQL integration and performance validation', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const suffix = `phase9-${Date.now()}`;
  const password = 'Phase9-password-123';

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({ where: { tenant: { name: { startsWith: suffix } } } });
    await prisma.payment.deleteMany({ where: { tenant: { name: { startsWith: suffix } } } });
    await prisma.invoice.deleteMany({ where: { tenant: { name: { startsWith: suffix } } } });
    await prisma.customer.deleteMany({ where: { tenant: { name: { startsWith: suffix } } } });
    await prisma.user.deleteMany({ where: { tenant: { name: { startsWith: suffix } } } });
    await prisma.tenant.deleteMany({ where: { name: { startsWith: suffix } } });
    await app.close();
    await prisma.$disconnect();
  });

  it('runs the authenticated tenant business flow and denies cross-tenant access', async () => {
    const owner = await request(app.getHttpServer()).post('/auth/register').send({ email: `${suffix}-owner@test.local`, password, tenantName: `${suffix}-one` }).expect(201);
    const other = await request(app.getHttpServer()).post('/auth/register').send({ email: `${suffix}-other@test.local`, password, tenantName: `${suffix}-two` }).expect(201);
    const token = owner.body.accessToken;
    const otherToken = other.body.accessToken;

    const customer = await request(app.getHttpServer()).post('/customers').set('Authorization', `Bearer ${token}`).send({ name: 'Integration Customer', email: 'customer@test.local' }).expect(201);
    const invoice = await request(app.getHttpServer()).post('/invoices').set('Authorization', `Bearer ${token}`).send({ customerId: customer.body.id, amount: 10000, dueDate: new Date(Date.now() + 86400000).toISOString() }).expect(201);
    await request(app.getHttpServer()).get(`/customers/${customer.body.id}`).set('Authorization', `Bearer ${otherToken}`).expect(404);
    await request(app.getHttpServer()).put(`/invoices/${invoice.body.id}`).set('Authorization', `Bearer ${otherToken}`).send({ amount: 1 }).expect(404);
    await request(app.getHttpServer()).delete(`/customers/${customer.body.id}`).set('Authorization', `Bearer ${otherToken}`).expect(404);
    await request(app.getHttpServer()).get('/dashboard/balance').set('Authorization', `Bearer ${token}`).expect(200);
  });

  it('benchmarks the real PostgreSQL dashboard query against the PRD target', async () => {
    const tenant = await prisma.tenant.create({ data: { name: `${suffix}-benchmark` } });
    const customer = await prisma.customer.create({ data: { tenantId: tenant.id, name: 'Benchmark', email: 'benchmark@test.local' } });
    await prisma.invoice.createMany({ data: Array.from({ length: 10000 }, (_, i) => ({ tenantId: tenant.id, customerId: customer.id, amount: 1000 + i, dueDate: new Date(Date.now() + 86400000), status: 'SENT' as const })) });
    const times: number[] = [];
    for (let i = 0; i < 5; i++) { const start = performance.now(); await prisma.$queryRaw`SELECT COALESCE(SUM(amount), 0) FROM invoices WHERE tenant_id = ${tenant.id} AND status = 'SENT'`; times.push(performance.now() - start); }
    times.sort((a, b) => a - b);
    const p95 = times[Math.ceil(times.length * 0.95) - 1];
    console.log(`Phase 9 live PostgreSQL benchmark: n=10000, p95=${p95.toFixed(2)}ms`);
    expect(p95).toBeLessThan(300);
  });
});

if (!databaseConfigured) console.warn('Phase 9 live integration/performance suite skipped: DATABASE_URL is not configured. No live benchmark is claimed.');
