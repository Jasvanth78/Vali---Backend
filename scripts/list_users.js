const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');

async function main() {
  const allUsers = await prisma.user.findMany({
    orderBy: {
      createdAt: 'asc',
    },
    select: {
      name: true,
      email: true,
      createdAt: true
    }
  });

  console.log(JSON.stringify(allUsers, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
