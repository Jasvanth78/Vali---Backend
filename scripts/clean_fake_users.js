const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');

async function main() {
  const allUsers = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true
    }
  });

  const usersToDelete = [];
  const deletionReasons = [];

  for (const user of allUsers) {
    let isFake = false;
    let reason = '';

    const name = (user.name || '').trim();
    const nameLower = name.toLowerCase();

    // Condition 1: Guest Users
    if (name === 'Guest User' || (user.email && user.email.endsWith('@valikatti.app'))) {
      isFake = true;
      reason = 'Guest User / Auto-generated Email';
    } 
    // Condition 2: Very short names (less than 3 characters)
    else if (name.length < 3) {
      isFake = true;
      reason = 'Name is too short (< 3 characters)';
    } 
    // Condition 3: Repeated same characters (e.g., "aaaaa", "bbbb", "sss")
    else if (/^([a-z])\1+$/.test(nameLower)) {
      isFake = true;
      reason = 'Name contains only repeated characters';
    }
    // Condition 4: Completely random gibberish or numbers only (optional, but let's stick to user request)
    else if (/^\d+$/.test(name)) {
      isFake = true;
      reason = 'Name is only numbers';
    }

    if (isFake) {
      usersToDelete.push(user.id);
      deletionReasons.push(`Deleted: ${name} (${user.email}) - Reason: ${reason}`);
    }
  }

  console.log(`Found ${usersToDelete.length} fake/guest users to delete out of ${allUsers.length} total users.`);
  console.log('\n--- Details ---');
  deletionReasons.forEach(msg => console.log(msg));

  if (usersToDelete.length > 0) {
    console.log('\nDeleting...');
    const result = await prisma.user.deleteMany({
      where: {
        id: { in: usersToDelete }
      }
    });
    console.log(`Successfully deleted ${result.count} users from the database.`);
  } else {
    console.log('\nNo users to delete.');
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
