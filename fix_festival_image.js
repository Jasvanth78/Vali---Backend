const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Updating festival image to API hosted image...');
    await prisma.festival.update({
        where: { id: '6a812fbf26092f1b8b6c63d9' },
        data: {
            imageUrl: 'https://api.jasvanth.me/uploads/1786857675815-ejgawa.webp'
        }
    });
    console.log('Update complete!');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
