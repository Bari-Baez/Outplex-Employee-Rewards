
const { createClient } = require('@supabase/supabase-js');

// These would normally be in .env.local
const supabaseUrl = 'https://pdebyqbtmnqpvepvrmiw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkZWJ5cWJ0bW5xcHZlcHZybWl3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjEyNjA2OCwiZXhwIjoyMDkxNzAyMDY4fQ.OD4WtqCa3Ty6qw0Ny7PSQVVZyBaMIFnfroWHtH1xL0U';

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const EMAIL = 'TestEMpleado002@outplex.com';
const PASSWORD = 'Prueba100@';
const NAME = 'Test Empleado 002';
const ROLE = 'employee';

async function createUser() {
  console.log(`Creating user: ${EMAIL}...`);

  // 1. Create Auth User
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { name: NAME }
  });

  if (authError) {
    if (authError.message.includes('already registered')) {
      console.log('User already exists in Auth. Proceeding to update public.users...');
      // Get existing user id
      const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers();
      if (listError) {
        console.error('Error listing users:', listError.message);
        return;
      }
      const user = existingUsers.users.find(u => u.email.toLowerCase() === EMAIL.toLowerCase());
      if (!user) {
        console.error('User not found in list despite "already registered" error.');
        return;
      }
      await updateProfile(user.id);
    } else {
      console.error('Error creating auth user:', authError.message);
    }
    return;
  }

  console.log('Auth user created successfully:', authData.user.id);
  await updateProfile(authData.user.id);
}

async function updateProfile(userId) {
  console.log(`Updating profile for ${userId}...`);

  // Update public.users table
  // We use upsert in case the trigger already created it, but we want to ensure fields are set.
  const { data, error } = await supabase
    .from('users')
    .update({
      name: NAME,
      role: ROLE,
      is_approved: true,
      points: 500 // Giving some starting points
    })
    .eq('id', userId);

  if (error) {
    console.error('Error updating public.users:', error.message);
  } else {
    console.log('Profile updated successfully to role "employee" and approved.');
  }
}

createUser().catch(err => console.error('Unhandled error:', err));
