// Usage: npm run create-admin -- "Your Name" you@example.com "a-strong-password"
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

async function main() {
  const [name, email, password] = process.argv.slice(2);
  if (!name || !email || !password || password.length < 8) {
    console.error('Usage: npm run create-admin -- "Name" email "password (8+ chars)"');
    process.exit(1);
  }
  const db = new PrismaClient();
  const passwordHash = await bcrypt.hash(password, 10);
  await db.user.upsert({
    where: { email: email.toLowerCase() },
    create: { name, email: email.toLowerCase(), passwordHash, role: "ADMIN" },
    update: { name, passwordHash, role: "ADMIN" },
  });
  console.log(`Admin ready: ${email}`);
  await db.$disconnect();
}

main();
