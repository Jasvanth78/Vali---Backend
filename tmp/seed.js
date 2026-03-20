const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const email = 'admin@valikatti.com';
  const password = await bcrypt.hash('admin123', 10);

  const admin = await prisma.admin.upsert({
    where: { email },
    update: { password },
    create: { email, password },
  });

  console.log('Admin seeded:', admin.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
