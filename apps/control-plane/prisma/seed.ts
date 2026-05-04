import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.local';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';
  const orgName = process.env.SEED_ORG_NAME ?? 'Internal Platform Team';
  const serviceName = process.env.SEED_SERVICE_NAME ?? 'Sample Backend';
  const serviceSlug = process.env.SEED_SERVICE_SLUG ?? 'sample';
  const serviceBaseUrl = process.env.SEED_SERVICE_BASE_URL ?? 'http://sample-backend:6060';

  const passwordHash = await argon2.hash(adminPassword);

  const user = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { displayName: 'Platform Admin', passwordHash },
    create: {
      email: adminEmail,
      displayName: 'Platform Admin',
      passwordHash,
      userType: 'internal',
      status: 'active',
      identities: {
        create: {
          provider: 'local',
          providerSubject: adminEmail,
          emailVerified: true,
        },
      },
    },
  });

  const organization = await prisma.organization.upsert({
    where: { id: 'seed-internal-org' },
    update: { name: orgName },
    create: {
      id: 'seed-internal-org',
      name: orgName,
      organizationType: 'internal',
      status: 'active',
    },
  });

  await prisma.membership.upsert({
    where: {
      userId_organizationId_role: {
        userId: user.id,
        organizationId: organization.id,
        role: 'platform_admin',
      },
    },
    update: { status: 'active' },
    create: {
      userId: user.id,
      organizationId: organization.id,
      role: 'platform_admin',
      status: 'active',
    },
  });

  const service = await prisma.backendService.upsert({
    where: { slug: serviceSlug },
    update: {
      name: serviceName,
      baseUrl: serviceBaseUrl,
      allowedRoutes: [{ method: 'GET', path: '/*' }],
      status: 'active',
      createdByUserId: user.id,
    },
    create: {
      organizationId: organization.id,
      name: serviceName,
      slug: serviceSlug,
      baseUrl: serviceBaseUrl,
      allowedRoutes: [{ method: 'GET', path: '/*' }],
      status: 'active',
      createdByUserId: user.id,
    },
  });

  await prisma.rateLimitPolicy.upsert({
    where: {
      targetType_targetId: {
        targetType: 'backend_service',
        targetId: service.id,
      },
    },
    update: {
      requestsPerInterval: 1000,
      intervalSeconds: 60,
      burstSize: 100,
    },
    create: {
      targetType: 'backend_service',
      targetId: service.id,
      backendServiceId: service.id,
      requestsPerInterval: 1000,
      intervalSeconds: 60,
      burstSize: 100,
    },
  });

  console.log(`Seeded admin ${adminEmail}, organization ${organization.name}, service ${serviceSlug}`);
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
