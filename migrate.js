const fs = require('fs');
const path = require('path');

// Manually parse .env file
try {
  const envPath = path.resolve(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split(/\r?\n/).forEach(line => {
      // ignore comments and empty lines
      if (line.trim().startsWith('#') || !line.includes('=')) return;
      const delimiterIdx = line.indexOf('=');
      const key = line.substring(0, delimiterIdx).trim();
      let val = line.substring(delimiterIdx + 1).trim();
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    });
  }
} catch (err) {
  console.warn('Could not manually parse .env:', err.message);
}

const { Client } = require('pg');

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is missing in environment variables.');
    process.exit(1);
  }

  console.log('Connecting to database...');
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected. Running migration queries...');

    // 1. Make customer_email nullable
    await client.query(`
      ALTER TABLE appointments 
      ALTER COLUMN customer_email DROP NOT NULL;
    `);
    console.log('✓ Altered customer_email to be nullable.');

    // 2. Add customer_alternative_phone column if it does not exist
    await client.query(`
      ALTER TABLE appointments 
      ADD COLUMN IF NOT EXISTS customer_alternative_phone TEXT;
    `);
    console.log('✓ Added customer_alternative_phone column (if not exists).');

    // 3. Add whatsapp_reminder_sent column if it does not exist
    await client.query(`
      ALTER TABLE appointments 
      ADD COLUMN IF NOT EXISTS whatsapp_reminder_sent BOOLEAN NOT NULL DEFAULT FALSE;
    `);
    console.log('✓ Added whatsapp_reminder_sent column (if not exists).');

    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
