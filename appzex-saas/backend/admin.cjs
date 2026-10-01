
require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const db = new PrismaClient();

async function main() {
  const name = process.env.ADMIN_NAME;
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!name || !email || !password) {
    throw new Error('Admin details are missing.');
  }

  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }

  const existing = await db.user.findUnique({
    where: { email }
  });

  if (existing) {
    console.log('A user with this email already exists.');
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  await db.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      role: 'SUPER_ADMIN',
      agencyId: null,
      clientId: null
    }
  });

  console.log('Super Admin account created successfully!');
  console.log('Email:', email);
}

main()
  .catch((error) => {
    console.error('Error:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });