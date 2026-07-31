import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@backend/platform/supabase/server';
import { mergeItemsWithMeta } from '@backend/modules/store/domain/catalog';
import { getCachedPublicEmployeeStores, getCachedStoreCatalog } from '@backend/modules/store/application/read-models';
import { StoreClient } from '@frontend/modules/store/ui/StoreClient';

export const metadata: Metadata = { title: 'Company Store' };

export default async function StorePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const [{ data: profile }, { data: buyerPrefs }, catalog, employeeStores] = await Promise.all([
    supabase.from('users').select('points, name, slack_id').eq('id', user.id).single(),
    supabase
      .from('user_contact_preferences')
      .select('user_id, whatsapp_number, whatsapp_opt_in')
      .eq('user_id', user.id)
      .maybeSingle(),
    getCachedStoreCatalog(),
    getCachedPublicEmployeeStores(),
  ]);

  const itemsWithMeta = mergeItemsWithMeta(catalog.items, catalog.itemSettings);

  return (
    <StoreClient
      items={itemsWithMeta}
      profile={{
        points: profile?.points ?? 0,
        name: profile?.name ?? '',
        slackId: profile?.slack_id ?? null,
      }}
      theme={catalog.theme}
      employeeStores={employeeStores}
      buyerContactPrefs={buyerPrefs ?? null}
    />
  );
}
