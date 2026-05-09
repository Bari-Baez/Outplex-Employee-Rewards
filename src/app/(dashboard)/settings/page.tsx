import { createClient, createServiceClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { User, Shield } from 'lucide-react';
import type { Metadata } from 'next';
import { GoogleConnectCard } from './GoogleConnectCard';
import { ThemeSettingsCard } from './ThemeSettingsCard';
import { NotificationSettingsCard } from './NotificationSettingsCard';
import { ContactITSupportButton } from './ContactITSupportButton';
import { LogoutButton } from './LogoutButton';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const serviceClient = await createServiceClient();
  const { data: profile } = await serviceClient
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  const { data: googleToken } = await serviceClient
    .from('google_oauth_tokens')
    .select('google_email, updated_at')
    .eq('user_id', user.id)
    .single();

  const { google } = await searchParams;

  return (
    <div className="animate-fade-in" style={{ maxWidth: 800 }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '2rem' }}>Account Settings</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <div className="card">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}><User size={18} /> Profile Details</h3>
          <div style={{ display: 'grid', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Name</label>
              <div style={{ fontWeight: 600 }}>{profile?.name || 'Not set'}</div>
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Email</label>
              <div>{profile?.email}</div>
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Employee ID</label>
              <div>{profile?.employee_id || 'Not set'}</div>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}><Shield size={18} /> Role & Department</h3>
          <div style={{ display: 'grid', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Internal Role</label>
              <div style={{ textTransform: 'capitalize', fontWeight: 600, color: 'var(--brand-primary-light)' }}>{profile?.role?.replace(/_/g, ' ')}</div>
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Department</label>
              <div>{profile?.department || 'Not set'}</div>
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Superior</label>
              <div>{profile?.supervisor || 'Not set'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Google account connection — moderator_a1 and TI (admin) only */}
      {(['moderator_a1', 'admin'].includes(profile?.role as string)) && (
        <GoogleConnectCard
          initialConnected={!!googleToken}
          initialEmail={googleToken?.google_email as string | null}
          flashParam={google ?? null}
        />
      )}

      <NotificationSettingsCard />
      <ThemeSettingsCard />


      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Profile Access</h3>
        <p className="text-muted">
          Your username and employee ID are read-only here. If something looks wrong, contact IT or
          your superior so they can update it safely.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '1rem' }}>
          <ContactITSupportButton />
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}
