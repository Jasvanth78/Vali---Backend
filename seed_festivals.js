const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const festivals = [
    { name: 'Gokulashtami', date: new Date(new Date().getTime() + 15 * 24 * 60 * 60 * 1000), description: 'Celebration of the birth of Lord Krishna', imageUrl: 'https://images.unsplash.com/photo-1605335193498-8e668c2cf769?q=80&w=200&auto=format&fit=crop' },
    { name: 'Diwali', date: new Date(new Date().getTime() + 75 * 24 * 60 * 60 * 1000), description: 'Festival of Lights', imageUrl: 'https://images.unsplash.com/photo-1540306155554-474c102a11b6?q=80&w=200&auto=format&fit=crop' },
    { name: 'Pongal', date: new Date(new Date().getTime() + 150 * 24 * 60 * 60 * 1000), description: 'Harvest Festival', imageUrl: 'https://images.unsplash.com/photo-1543362143-6d0046b85671?q=80&w=200&auto=format&fit=crop' },
    { name: 'Tamil New Year', date: new Date(new Date().getTime() + 240 * 24 * 60 * 60 * 1000), description: 'Puthandu', imageUrl: 'https://images.unsplash.com/photo-1518175787680-327c5bf38806?q=80&w=200&auto=format&fit=crop' },
];

async function main() {
    console.log('Seeding Festivals...');
    for (const fest of festivals) {
        const existing = await prisma.festival.findFirst({ where: { name: fest.name } });
        if (existing) {
            await prisma.festival.update({ where: { id: existing.id }, data: fest });
        } else {
            await prisma.festival.create({ data: fest });
        }
    }
    console.log('Seeding complete!');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
