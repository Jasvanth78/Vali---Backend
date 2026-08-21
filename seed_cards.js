const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const cards = [
    { key: 'nalla_neram', titleTa: 'நல்ல நேரம்', titleEn: 'Nalla Neram', order: 1, screen: 'nalla_neram', imageUrl: 'https://images.unsplash.com/photo-1532012197267-da84d127e765?q=80&w=200&auto=format&fit=crop' },
    { key: 'mugurtham', titleTa: 'முகூர்த்த நாட்கள்', titleEn: 'Mugurtha Naal', order: 2, screen: 'mugurtham', imageUrl: 'https://images.unsplash.com/photo-1604928141064-207cea6f571f?q=80&w=200&auto=format&fit=crop' },
    { key: 'daily_palan', titleTa: 'தினசரி ராசி பலன்', titleEn: 'Daily Rasi Palan', order: 3, screen: 'daily_palan', imageUrl: 'https://images.unsplash.com/photo-1515942400420-2b98fed1d515?q=80&w=200&auto=format&fit=crop' },
    { key: 'panchangam', titleTa: 'பஞ்சாங்கம்', titleEn: 'Panchangam', order: 4, screen: 'panchangam', imageUrl: 'https://images.unsplash.com/photo-1506784365847-bbad939e9335?q=80&w=200&auto=format&fit=crop' },
    { key: 'weekly_palan', titleTa: 'வாராந்திர ராசி பலன்', titleEn: 'Weekly Rasi Palan', order: 5, screen: 'weekly_palan', imageUrl: 'https://images.unsplash.com/photo-1534330207526-8e81f10ece37?q=80&w=200&auto=format&fit=crop' },
    { key: 'monthly_palan', titleTa: 'மாதாந்திர ராசி பலன்', titleEn: 'Monthly Rasi Palan', order: 6, screen: 'monthly_palan', imageUrl: 'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?q=80&w=200&auto=format&fit=crop' },
    { key: 'yearly_palan', titleTa: 'ஆண்டு ராசி பலன்', titleEn: 'Yearly Rasi Palan', order: 7, screen: 'yearly_palan', imageUrl: 'https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?q=80&w=200&auto=format&fit=crop' },
    { key: 'ai_jothidar', titleTa: 'AI ஜோதிடர்', titleEn: 'AI Jothidar', order: 8, screen: 'ai_jothidar', imageUrl: 'https://images.unsplash.com/photo-1535223289827-42f1e9919769?q=80&w=200&auto=format&fit=crop' },
    { key: 'festivals', titleTa: 'பண்டிகைகள்', titleEn: 'Festivals', order: 9, screen: 'festivals', imageUrl: 'https://images.unsplash.com/photo-1605335193498-8e668c2cf769?q=80&w=200&auto=format&fit=crop' },
    { key: 'naal_kati', titleTa: 'நாட்காட்டி', titleEn: 'Naal Kati', order: 10, screen: 'naal_kati', imageUrl: 'https://images.unsplash.com/photo-1532153975070-2e9ab71f1b14?q=80&w=200&auto=format&fit=crop' },
];

async function main() {
    console.log('Seeding AppCards...');
    for (const card of cards) {
        await prisma.appCard.upsert({
            where: { key: card.key },
            update: {
                titleTa: card.titleTa,
                titleEn: card.titleEn,
                order: card.order,
                screen: card.screen,
                imageUrl: card.imageUrl,
                isEnabled: true
            },
            create: {
                key: card.key,
                titleTa: card.titleTa,
                titleEn: card.titleEn,
                order: card.order,
                screen: card.screen,
                imageUrl: card.imageUrl,
                isEnabled: true
            }
        });
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
