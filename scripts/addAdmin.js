const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const addAdmin = async () => {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log('Usage: node addAdmin.js <email> <password>');
    process.exit(1);
  }

  const email = args[0];
  const password = args[1];

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const newAdmin = await prisma.admin.create({
      data: {
        email: email,
        password: hashedPassword,
      },
    });

    console.log(`Successfully added admin: ${newAdmin.email}`);
  } catch (error) {
    if (error.code === 'P2002') {
      console.log('Error: An admin with this email already exists.');
    } else {
      console.error('Error adding admin:', error);
    }
  } finally {
    await prisma.$disconnect();
  }
};

addAdmin();
