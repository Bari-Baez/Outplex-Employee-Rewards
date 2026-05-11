
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://pdebyqbtmnqpvepvrmiw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkZWJ5cWJ0bW5xcHZlcHZybWl3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjEyNjA2OCwiZXhwIjoyMDkxNzAyMDY4fQ.OD4WtqCa3Ty6qw0Ny7PSQVVZyBaMIFnfroWHtH1xL0U';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAuthUser() {
  const EMAIL = 'TestEMpleado002@outplex.com';
  console.log(`Checking Auth user: ${EMAIL}...`);

  const { data, error } = await supabase.auth.admin.listUsers();

  if (error) {
    console.error('Error fetching users:', error.message);
    return;
  }

  const user = data.users.find(u => u.email.toLowerCase() === EMAIL.toLowerCase());

  if (user) {
    console.log('User found in Auth:');
    console.log(JSON.stringify(user, null, 2));
    
    console.log('Checking public.users by ID...');
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id);
      
    if (profileError) {
       console.error('Error fetching profile:', profileError.message);
    } else if (profile && profile.length > 0) {
       console.log('Profile found:');
       console.log(JSON.stringify(profile[0], null, 2));
    } else {
       console.log('Profile NOT found in public.users');
    }
  } else {
    console.log('User not found in Auth.');
  }
}

checkAuthUser().catch(err => console.error(err));
