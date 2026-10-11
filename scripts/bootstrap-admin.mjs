// Runs on every start. If ADMIN_EMAIL and ADMIN_PASSWORD are set and no admin exists yet,
// creates the first admin so a fresh deploy can be signed into without shell access.
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
if (!email || !password) process.exit(0);

const db = new PrismaClient();
try {
  if (await db.user.findFirst({ where: { role: "ADMIN" } })) process.exit(0);
  if (password.length < 8) {
    console.error("ADMIN_PASSWORD must be at least 8 characters; skipping admin creation.");
    process.exit(0);
  }
  await db.user.create({
    data: { name: process.env.ADMIN_NAME?.trim() || "Admin", email, role: "ADMIN", passwordHash: await bcrypt.hash(password, 10) },
  });
  console.log(`Created first admin: ${email}`);
} finally {
  await db.$disconnect();
}
