import { createClient, createServiceClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopNavShell } from '@/components/layout/TopNavShell';
import { GlobalDrawersShell } from '@/components/layout/GlobalDrawersShell';
import { DashboardGuard } from '@/components/layout/DashboardGuard';
import { AppAvailabilityProvider } from '@/components/layout/AppAvailabilityProvider';
import { MaintenanceBanner } from '@/components/layout/MaintenanceBanner';
import { ToolMaintenanceGate } from '@/components/layout/ToolMaintenanceGate';
import { SectionMaintenanceGate } from '@/components/layout/SectionMaintenanceGate';
import { OnboardingGuard } from '../../components/onboarding/OnboardingGuard';
import { ApprovalGuard } from '../../components/onboarding/ApprovalGuard';
import { RevokedRoleGuard } from '../../components/onboarding/RevokedRoleGuard';
import { ApprovedAccessIntro } from '../../components/onboarding/ApprovedAccessIntro';
import type { FormDefinition } from '@/lib/forms/types';
import { BackgroundShader } from '@/components/layout/BackgroundShader';
import { DashboardThemeBridge } from '@/components/theme/DashboardThemeBridge';
import { MobileNav } from '@/components/MobileNav';
import { getCachedAvailabilitySnapshot, getCachedMandatoryPublishedForms } from '@/lib/read-models/dashboard';

const DASHBOARD_PROFILE_SELECT =
  'id,slack_id,name,email,avatar_url,role,employee_id,supervisor,supervisor_id,department,points,is_approved,role_revoked_at,created_at';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Fetch user profile including role
  const { data: profile } = await supabase
    .from('users')
    .select(DASHBOARD_PROFILE_SELECT)
    .eq('id', user.id)
    .single();

  if (!profile) {
    redirect('/login');
  }

  const serviceClient = await createServiceClient();
  const mandatoryForms = await getCachedMandatoryPublishedForms();

  // Fetch user responses for mandatory forms
  const { data: userResponses } = await serviceClient
    .from('form_responses')
    .select('form_id')
    .eq('user_id', user.id)
    .in('form_id', (mandatoryForms ?? []).map((f) => f.id));

  const completedFormIds = new Set((userResponses ?? []).map((r) => r.form_id));
  const pendingForms = ((mandatoryForms ?? []) as FormDefinition[]).filter(
    (f) => !completedFormIds.has(f.id)
  );

  const { toolAvailability, sectionAvailability, maintenanceBanner } = await getCachedAvailabilitySnapshot();

  // Check for active role requests
  const { data: roleRequest } = await serviceClient
    .from('role_requests')
    .select('id,status,notes,created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: accessNotice } = await serviceClient
    .from('notifications')
    .select('title, message')
    .eq('user_id', user.id)
    .eq('type', 'system')
    .in('title', ['Platform access denied', 'Platform access approved'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const isRevoked = !!profile?.role_revoked_at;
  const isTechnician = profile?.role === 'admin';

  // Elevated roles are assigned by admins and don't go through department/supervisor onboarding.
  const isElevatedRole = ['moderator', 'moderator_a1', 'moderator_b1', 'staff'].includes(profile?.role ?? '');
  const requiresProfileCompletion =
    !isElevatedRole && (!profile?.department || !profile?.supervisor_id);

  const accessApproved = profile?.is_approved === true;
  const needsOnboarding = !isRevoked && !isTechnician && accessApproved && requiresProfileCompletion;
  // 'approved' is only "active" while the user hasn't acknowledged yet (is_approved still false).
  // Once acknowledged, is_approved becomes true and the row is deleted; this guard handles
  // stale rows from before that cleanup was in place.
  const hasActiveRequest =
    (!isRevoked && !isTechnician && !!roleRequest && ['pending', 'reviewing', 'rejected'].includes(roleRequest.status)) ||
    (!isRevoked && !isTechnician && !accessApproved && roleRequest?.status === 'approved');
  const needsApproval = !isRevoked && !isTechnician && !accessApproved;

  return (
    <div className="app-layout relative">
      <BackgroundShader />
      <DashboardThemeBridge />

      <AppAvailabilityProvider initialTools={toolAvailability} initialSections={sectionAvailability} initialBanner={maintenanceBanner}>
        {isRevoked && <RevokedRoleGuard userName={profile?.name ?? 'User'} />}
        {!isRevoked && needsApproval && <ApprovalGuard user={profile} denialNotice={accessNotice ?? null} />}
        {!isRevoked && needsOnboarding && (
          <ApprovedAccessIntro userId={user.id} userName={profile?.name ?? 'User'} />
        )}

        <div className="app-layout-row">
          <Sidebar userRole={profile?.role ?? 'employee'} />
          <div className="main-content relative z-10">
            <main className="page-content">
              {profile?.role !== 'admin' && <MaintenanceBanner />}
              <ToolMaintenanceGate userRole={profile?.role ?? 'employee'}>
                <SectionMaintenanceGate userRole={profile?.role ?? 'employee'}>
                  {children}
                </SectionMaintenanceGate>
              </ToolMaintenanceGate>
            </main>
          </div>
        </div>

        <TopNavShell user={profile} />

        <GlobalDrawersShell />

        <MobileNav userRole={profile?.role ?? 'employee'} />

        {(needsOnboarding || hasActiveRequest) && (
          <OnboardingGuard
            user={profile}
            roleRequest={roleRequest ?? null}
          />
        )}

        {pendingForms.length > 0 && !needsOnboarding && (
          <DashboardGuard
            pendingForms={pendingForms}
            userId={user.id}
            userName={profile?.name ?? 'Usuario'}
            userEmail={profile?.email ?? ''}
            userEmployeeId={profile?.employee_id ?? null}
          />
        )}
      </AppAvailabilityProvider>
    </div>
  );
}
