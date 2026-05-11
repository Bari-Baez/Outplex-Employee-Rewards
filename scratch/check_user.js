
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://pdebyqbtmnqpvepvrmiw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkZWJ5cWJ0bW5xcHZlcHZybWl3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjEyNjA2OCwiZXhwIjoyMDkxNzAyMDY4fQ.OD4WtqCa3Ty6qw0Ny7PSQVVZyBaMIFnfroWHtH1xL0U';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkUser() {
  const EMAIL = 'TestEMpleado002@outplex.com';
  console.log(`Checking user: ${EMAIL}...`);

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', EMAIL);

  if (error) {
    console.error('Error fetching user:', error.message);
    return;
  }

  if (data && data.length > 0) {
    console.log('User found in database:');
    console.log(JSON.stringify(data[0], null, 2));
  } else {
    console.log('User not found in database.');
  }
}

checkUser().catch(err => console.error(err));
