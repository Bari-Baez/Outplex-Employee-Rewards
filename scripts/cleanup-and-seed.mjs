import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env vars via --env-file flag in terminal

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function cleanupAndSeed() {
  console.log('🚀 Starting cleanup and seed process...');

  try {
    // 0. Test connection
    console.log('--- Testing connection ---');
    const { data: testData, error: testError } = await supabase.from('users').select('count', { count: 'exact', head: true });
    if (testError) {
      console.error('❌ Connection test failed:', testError.message);
      return;
    }
    console.log(`✅ Connection OK. Current user count in public.users: ${testData}`);

    // 1. Get all users
    console.log('--- Deleting existing users ---');
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) throw listError;

    for (const user of users) {
      console.log(`Deleting user: ${user.email}`);
      const { error: delError } = await supabase.auth.admin.deleteUser(user.id);
      if (delError) console.error(`Failed to delete ${user.email}:`, delError.message);
    }

    // 2. Clear remaining public tables (in case some don't cascade or aren't linked)
    console.log('--- Clearing public tables ---');
    const tables = [
      'store_orders',
      'store_items',
      'raffle_entries',
      'raffles',
      'ot_slots',
      'ot_batches',
      'notifications',
      'broadcast_notifications',
      'company_announcements',
      'support_tickets',
      'points_ledger',
      'app_settings'
    ];

    for (const table of tables) {
      console.log(`Clearing table: ${table}`);
      const { error: clearError } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (clearError) {
        // Some tables might not exist or have different PKs, but neq('id', ...) is generally safe for UUIDs
        console.warn(`Note: Could not clear ${table} (might be empty or missing 'id' column):`, clearError.message);
      }
    }

    // 3. Create requested users
    console.log('--- Creating test users ---');
    const testUsers = [
      { email: 'AdminTest@Outplex.com', role: 'admin', name: 'Admin Test' },
      { email: 'ModeradorA1@Outplex.com', role: 'moderator', name: 'Moderador A1' },
      { email: 'ModeradorB1@Outplex.com', role: 'moderator', name: 'Moderador B1' },
      { email: 'Empleado001@Outplex.com', role: 'employee', name: 'Empleado 001' },
      { email: 'Empleado002@Outplex.com', role: 'employee', name: 'Empleado 002' },
      { email: 'Empleado003@Outplex.com', role: 'employee', name: 'Empleado 003' },
    ];

    const password = 'Prueba100@';

    for (const u of testUsers) {
      console.log(`Creating user: ${u.email} as ${u.role}`);
      
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: u.email,
        password: password,
        email_confirm: true,
        user_metadata: { name: u.name }
      });

      if (authError) {
        console.error(`Error creating auth user ${u.email}:`, authError.message);
        continue;
      }

      // Update the public.users table with the correct role
      // Usually, there's a trigger, but let's be explicit if needed
      const { error: profileError } = await supabase
        .from('users')
        .update({ 
          role: u.role,
          name: u.name,
          email: u.email.toLowerCase()
        })
        .eq('id', authData.user.id);

      if (profileError) {
        console.error(`Error updating profile for ${u.email}:`, profileError.message);
      }
    }

    console.log('✅ Cleanup and seed complete!');
  } catch (err) {
    console.error('💥 Fatal error:', err);
  }
}

cleanupAndSeed();
