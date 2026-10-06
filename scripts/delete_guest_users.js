const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Fetching guest users...');
  
  // Find users where email ends with @valikatti.app or name is Guest User
  const guestUsers = await prisma.user.findMany({
    where: {
      OR: [
        { email: { endsWith: '@valikatti.app' } },
        { name: 'Guest User' }
      ]
    }
  });

  console.log(`Found ${guestUsers.length} guest users.`);

  if (guestUsers.length > 0) {
    console.log('Deleting guest users...');
    const deleteResult = await prisma.user.deleteMany({
      where: {
        OR: [
          { email: { endsWith: '@valikatti.app' } },
          { name: 'Guest User' }
        ]
      },
    });
    console.log(`Deleted ${deleteResult.count} guest users successfully.`);
  } else {
    console.log('No guest users found to delete.');
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
