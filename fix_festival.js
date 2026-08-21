const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Updating festival...');
    await prisma.festival.update({
        where: { id: '6a812fbf26092f1b8b6c63d9' },
        data: {
            imageUrl: 'https://images.unsplash.com/photo-1605335193498-8e668c2cf769?q=80&w=200&auto=format&fit=crop',
            description: '' // Clear it completely so it triggers the fallback quote
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
