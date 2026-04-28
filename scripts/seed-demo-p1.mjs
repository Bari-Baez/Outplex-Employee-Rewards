// ============================================================
// Outplex Demo Seed Script — Part 1: Users + Points
// ============================================================
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const ADMIN_ID   = '11111111-0000-0000-0000-000000000001';
const MOD_A1_ID  = '11111111-0000-0000-0000-000000000002';
const MOD_B1_ID  = '11111111-0000-0000-0000-000000000003';
const EMP1_ID    = '11111111-0000-0000-0000-000000000004';
const EMP2_ID    = '11111111-0000-0000-0000-000000000005';
const EMP3_ID    = '11111111-0000-0000-0000-000000000006';

async function ok(label, promise) {
  const { error } = await promise;
  if (error) console.error(`❌ ${label}:`, error.message);
  else console.log(`✅ ${label}`);
}

async function run() {
  console.log('\n=== PHASE 1: Update user points ===');
  const points = [
    [ADMIN_ID,  10000],
    [MOD_A1_ID, 3500],
    [MOD_B1_ID, 1000],
    [EMP1_ID,   1250],
    [EMP2_ID,   1250],
    [EMP3_ID,   1250],
  ];
  for (const [id, pts] of points) {
    await ok(`Points ${id.slice(-4)}=${pts}`,
      supabase.from('users').update({ points: pts }).eq('id', id));
  }

  console.log('\n=== PHASE 2: Create TestsinRol users ===');
  const testUsers = [
    { email: 'TestsinRol001@outplex.com', name: 'Test Sin Rol 001' },
    { email: 'TestsinRol002@outplex.com', name: 'Test Sin Rol 002' },
    { email: 'TestsinRol003@outplex.com', name: 'Test Sin Rol 003' },
    { email: 'TestsinRol004@outplex.com', name: 'Test Sin Rol 004' },
  ];
  for (const u of testUsers) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: u.email, password: 'Prueba100@', email_confirm: true,
      user_metadata: { name: u.name }
    });
    if (error) { console.error(`❌ Auth create ${u.email}:`, error.message); continue; }
    console.log(`✅ Auth user created: ${u.email}`);
    // Update public.users profile (trigger should create it, but set points)
    await ok(`Points 450 → ${u.email}`,
      supabase.from('users').update({ points: 450, name: u.name, is_approved: false })
        .eq('id', data.user.id));
  }

  console.log('\n=== PHASE 3: NYT Store Items ===');
  const ITEM_IDS = {
    gorra:    'bbbb0001-0000-0000-0000-000000000001',
    taza:     'bbbb0001-0000-0000-0000-000000000002',
    abrigo:   'bbbb0001-0000-0000-0000-000000000003',
    silla:    'bbbb0001-0000-0000-0000-000000000004',
    parrilla: 'bbbb0001-0000-0000-0000-000000000005',
    domino_set: 'bbbb0001-0000-0000-0000-000000000006',
    mesa_dom: 'bbbb0001-0000-0000-0000-000000000007',
    piscina:  'bbbb0001-0000-0000-0000-000000000008',
    cooler:   'bbbb0001-0000-0000-0000-000000000009',
    sombrilla:'bbbb0001-0000-0000-0000-000000000010', // draft/inactive
  };
  const IMG = 'https://images.unsplash.com/photo-';
  const items = [
    { id: ITEM_IDS.gorra,    name: 'Gorra NYT — Logo Bordado', description: 'Gorra oficial New York Times con logo bordado en relieve. Ajustable, talla única. Material 100% algodón premium.', points_cost: 80,   image_url: `${IMG}1588850561407-ed78c282e89b?w=500&q=80`, stock: 15, is_active: true },
    { id: ITEM_IDS.taza,     name: 'Taza NYT — Acero Inoxidable 16oz', description: 'Taza térmica de acero inoxidable con logo NYT. Mantiene bebidas calientes hasta 12 horas y frías hasta 24.', points_cost: 120,  image_url: `${IMG}1570088922880-deb3f9379e0e?w=500&q=80`, stock: 10, is_active: true },
    { id: ITEM_IDS.abrigo,   name: 'Abrigo NYT — Edición Invierno', description: 'Abrigo oficial NYT con logo. Material de alta calidad resistente al viento. Tallas: S, M, L, XL. Edición limitada.', points_cost: 400,  image_url: `${IMG}1591047139829-d91aecb6caea?w=500&q=80`, stock: 8,  is_active: true },
    { id: ITEM_IDS.silla,    name: 'Silla de Playa Plegable', description: 'Silla de playa plegable resistente con porta-vaso integrado y bolsillo lateral. Ideal para actividades al aire libre.', points_cost: 350,  image_url: `${IMG}1507525428034-b723cf961d3e?w=500&q=80`, stock: 5,  is_active: true },
    { id: ITEM_IDS.parrilla, name: 'Parrilla de Patio Portátil', description: 'Parrilla de carbón portátil para patio o terraza. Capacidad para 6 personas. Incluye rejilla y pinzas. Fácil limpieza.', points_cost: 900,  image_url: `${IMG}1555041469-a586c61ea9bc?w=500&q=80`, stock: 3,  is_active: true },
    { id: ITEM_IDS.domino_set,'name': 'Set de Dominó Profesional', description: '28 piezas de resina de alta densidad con puntos de colores. Incluye estuche de madera y manual de juego.', points_cost: 250,  image_url: `${IMG}1611996575749-79a3a250f948?w=500&q=80`, stock: 6,  is_active: true },
    { id: ITEM_IDS.mesa_dom, name: 'Mesa de Dominó con Cubierta Acolchada', description: 'Mesa plegable de dominó con superficie acolchada de felpa. 4 portavasos integrados. Armado en minutos. Ideal para reuniones.', points_cost: 1200, image_url: `${IMG}1610890716171-6b1bb98ffd09?w=500&q=80`, stock: 2,  is_active: true },
    { id: ITEM_IDS.piscina,  name: 'Piscina Inflable Familiar 3.5m', description: 'Piscina inflable redonda 3.5m diámetro × 76cm altura. Capacidad 4,000L. Incluye bomba manual y kit de reparación.', points_cost: 600,  image_url: `${IMG}1572194612947-b9f3b9eb5c29?w=500&q=80`, stock: 4,  is_active: true },
    { id: ITEM_IDS.cooler,   name: 'Cooler NYT Edición Especial 30L', description: 'Nevera portátil NYT de 30 litros. Mantiene el frío hasta 24 horas. Ruedas telescópicas. Edición especial con logo.', points_cost: 500,  image_url: `${IMG}1544735716-392fe2489ffa?w=500&q=80`, stock: 5,  is_active: true },
    { id: ITEM_IDS.sombrilla, name: 'Sombrilla de Playa NYT — UV50+', description: '[PRÓXIMAMENTE] Sombrilla NYT con protección UV50+. Mango telescópico de aluminio. Diámetro 2.2m.', points_cost: 450,  image_url: `${IMG}1507525428034-b723cf961d3e?w=500&q=80`, stock: 0,  is_active: false },
  ];
  const { error: itemsErr } = await supabase.from('store_items').insert(items);
  if (itemsErr) console.error('❌ Store items:', itemsErr.message);
  else console.log(`✅ ${items.length} store items inserted`);

  console.log('\n=== PHASE 4: Store Orders ===');
  const orders = [
    { id: 'cccc0001-0000-0000-0000-000000000001', item_id: ITEM_IDS.gorra,    user_id: EMP1_ID,   points_spent: 80,   status: 'completed' },
    { id: 'cccc0001-0000-0000-0000-000000000002', item_id: ITEM_IDS.taza,     user_id: EMP2_ID,   points_spent: 120,  status: 'approved' },
    { id: 'cccc0001-0000-0000-0000-000000000003', item_id: ITEM_IDS.domino_set,user_id: EMP3_ID,  points_spent: 250,  status: 'pending' },
    { id: 'cccc0001-0000-0000-0000-000000000004', item_id: ITEM_IDS.piscina,  user_id: EMP1_ID,   points_spent: 600,  status: 'approved' },
    { id: 'cccc0001-0000-0000-0000-000000000005', item_id: ITEM_IDS.cooler,   user_id: MOD_B1_ID, points_spent: 500,  status: 'pending' },
    { id: 'cccc0001-0000-0000-0000-000000000006', item_id: ITEM_IDS.silla,    user_id: EMP2_ID,   points_spent: 350,  status: 'cancelled' },
    { id: 'cccc0001-0000-0000-0000-000000000007', item_id: ITEM_IDS.abrigo,   user_id: MOD_A1_ID, points_spent: 400,  status: 'ready_for_pickup' },
  ];
  const { error: ordersErr } = await supabase.from('store_orders').insert(orders);
  if (ordersErr) console.error('❌ Store orders:', ordersErr.message);
  else console.log(`✅ ${orders.length} store orders inserted`);

  console.log('\n=== PHASE 5: Store Reviews ===');
  const reviews = [
    { item_id: ITEM_IDS.gorra,    user_id: EMP2_ID, rating: 5, comment: '¡Me encantó! Calidad excelente y el logo se ve muy profesional.' },
    { item_id: ITEM_IDS.taza,     user_id: EMP3_ID, rating: 4, comment: 'Muy buena taza, mantiene el café caliente por horas.' },
    { item_id: ITEM_IDS.domino_set,user_id: EMP1_ID,rating: 5, comment: 'Las fichas son de primera calidad. El estuche de madera es un toque especial.' },
    { item_id: ITEM_IDS.piscina,  user_id: EMP3_ID, rating: 4, comment: 'Perfecta para los fines de semana. La bomba es sencilla de usar.' },
    { item_id: ITEM_IDS.cooler,   user_id: MOD_A1_ID,rating:5, comment: 'Excelente cooler, lo llevé a la playa y duró todo el día frío.' },
  ];
  const { error: revErr } = await supabase.from('store_reviews').insert(reviews);
  if (revErr) console.error('❌ Store reviews:', revErr.message);
  else console.log(`✅ ${reviews.length} store reviews inserted`);

  console.log('\nPhase 1 (users/points/store) complete.');
}

run().catch(console.error);
