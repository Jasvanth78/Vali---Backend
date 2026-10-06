const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Fetching all users...');
  const allUsers = await prisma.user.findMany({
    orderBy: {
      createdAt: 'asc', // Keep the oldest account
    },
  });

  const emailsSeen = new Set();
  const duplicateIds = [];
  const realUsers = [];

  for (const user of allUsers) {
    if (emailsSeen.has(user.email)) {
      duplicateIds.push(user.id);
    } else {
      emailsSeen.add(user.email);
      realUsers.push(user);
    }
  }

  console.log(`Found ${allUsers.length} total users.`);
  console.log(`Found ${realUsers.length} real unique users.`);
  console.log(`Found ${duplicateIds.length} duplicate users to delete.`);

  if (duplicateIds.length > 0) {
    console.log('Deleting duplicate users...');
    const deleteResult = await prisma.user.deleteMany({
      where: {
        id: {
          in: duplicateIds,
        },
      },
    });
    console.log(`Deleted ${deleteResult.count} duplicate users.`);
  } else {
    console.log('No duplicate users found.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
