import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { closePool, execute, initDatabase, queryOne } from '../server/db.ts';

async function main() {
  const [, , emailArg, passwordArg, nameArg = 'Regional Plant Pathologist', roleArg = 'expert'] = process.argv;

  if (!emailArg || !passwordArg) {
    console.log('Usage: npx tsx scripts/create_expert.ts <email> <password> [name] [expert|admin]');
    process.exit(1);
  }

  await initDatabase();

  const email = emailArg.trim().toLowerCase();
  const role = roleArg === 'admin' ? 'admin' : 'expert';
  const hash = bcrypt.hashSync(passwordArg, 10);

  const existing = await queryOne<{ id: number }>('SELECT id FROM users WHERE email = $1', [email]);
  if (existing) {
    await execute('UPDATE users SET password_hash = $1, name = $2, role = $3 WHERE id = $4', [
      hash,
      nameArg,
      role,
      existing.id,
    ]);
    console.log(`Updated ${role} account for ${email}.`);
  } else {
    await execute('INSERT INTO users (name, email, password_hash, role, region) VALUES ($1, $2, $3, $4, $5)', [
      nameArg,
      email,
      hash,
      role,
      'Agricultural Extension Node',
    ]);
    console.log(`Created new ${role} account for ${email}.`);
  }
}

main()
  .catch((err) => {
    console.error('Failed to provision expert/admin account:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
