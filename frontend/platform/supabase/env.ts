function requirePublicEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required public environment variable: ${name}. Check your .env.local Supabase configuration.`,
    );
  }

  return value;
}

export function getSupabaseBrowserEnv() {
  return {
    url: requirePublicEnv(
      'NEXT_PUBLIC_SUPABASE_URL',
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    ),
    anonKey: requirePublicEnv(
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
  };
}
