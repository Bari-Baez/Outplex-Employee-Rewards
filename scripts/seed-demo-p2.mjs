// ============================================================
// Outplex Demo Seed Script — Part 2: Raffles + OT + Forms
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

const IMG = 'https://images.unsplash.com/photo-';

async function run() {
  // ─── RAFFLES ──────────────────────────────────────────────────────────
  console.log('\n=== RAFFLES ===');
  const RAFF = {
    r1: 'dddd0001-0000-0000-0000-000000000001',
    r2: 'dddd0001-0000-0000-0000-000000000002',
    r3: 'dddd0001-0000-0000-0000-000000000003',
    r4: 'dddd0001-0000-0000-0000-000000000004',
    r5: 'dddd0001-0000-0000-0000-000000000005',
    r6: 'dddd0001-0000-0000-0000-000000000006',
  };
  const raffles = [
    { id: RAFF.r1, title: '🏆 Bundle Campeones: Mesa de Dominó + Set Profesional', description: 'El premio más esperado: una mesa de dominó plegable con cubierta acolchada y un set profesional de 28 fichas. ¡La combinación perfecta para las reuniones familiares dominicanas!', prize_image: `${IMG}1610890716171-6b1bb98ffd09?w=600&q=80`, draw_date: '2026-03-15T18:00:00Z', status: 'completed', winner_id: EMP1_ID, created_by: ADMIN_ID },
    { id: RAFF.r2, title: '🎁 Bundle NYT Starter Pack: Gorra + Taza', description: 'Llévate el combo perfecto del New York Times: gorra bordada oficial y taza térmica de acero inoxidable. Ideal para empezar el día con estilo.', prize_image: `${IMG}1570088922880-deb3f9379e0e?w=600&q=80`, draw_date: '2026-04-01T17:00:00Z', status: 'completed', winner_id: EMP2_ID, created_by: MOD_A1_ID },
    { id: RAFF.r3, title: '🌊 Piscina Inflable Familiar 3.5m', description: 'Perfecta para el verano dominicano. Esta piscina inflable familiar tiene 3.5 metros de diámetro y viene con bomba manual. ¡Refréscate con tu familia!', prize_image: `${IMG}1572194612947-b9f3b9eb5c29?w=600&q=80`, draw_date: '2026-05-20T17:00:00Z', status: 'live', winner_id: null, created_by: ADMIN_ID },
    { id: RAFF.r4, title: '🔥 Parrilla de Patio Portátil — BBQ Edition', description: 'La parrilla que todo dominicano sueña tener. Carbón, carne al grill y buena música. Esta parrilla portátil es ideal para reuniones en el patio o la playa.', prize_image: `${IMG}1555041469-a586c61ea9bc?w=600&q=80`, draw_date: '2026-05-28T18:00:00Z', status: 'upcoming', winner_id: null, created_by: MOD_A1_ID },
    { id: RAFF.r5, title: '❄️ Cooler NYT Edición Especial 30L [DRAFT]', description: 'Próximamente: sorteamos un cooler NYT de 30 litros. Ideal para la playa o cualquier actividad al aire libre. Mantiene el frío hasta 24 horas.', prize_image: `${IMG}1544735716-392fe2489ffa?w=600&q=80`, draw_date: '2026-06-15T17:00:00Z', status: 'upcoming', winner_id: null, created_by: ADMIN_ID },
    { id: RAFF.r6, title: '🏖️ Bundle Playa: Silla + Sombrilla (Manual)', description: 'Un combo perfecto para un día de playa: silla plegable porta-vaso y sombrilla UV50+. Ganador seleccionado manualmente por el equipo Outplex.', prize_image: `${IMG}1507525428034-b723cf961d3e?w=600&q=80`, draw_date: '2026-04-10T16:00:00Z', status: 'completed', winner_id: EMP3_ID, created_by: MOD_B1_ID },
  ];
  const { error: raffErr } = await supabase.from('raffles').insert(raffles);
  if (raffErr) console.error('❌ Raffles:', raffErr.message);
  else console.log(`✅ ${raffles.length} raffles inserted`);

  const entries = [
    // r1 completed: emp1 winner
    { raffle_id: RAFF.r1, user_id: EMP1_ID }, { raffle_id: RAFF.r1, user_id: EMP2_ID },
    { raffle_id: RAFF.r1, user_id: EMP3_ID }, { raffle_id: RAFF.r1, user_id: MOD_A1_ID },
    // r2 completed: emp2 winner
    { raffle_id: RAFF.r2, user_id: EMP1_ID }, { raffle_id: RAFF.r2, user_id: EMP2_ID },
    { raffle_id: RAFF.r2, user_id: EMP3_ID },
    // r3 live: all entered
    { raffle_id: RAFF.r3, user_id: EMP1_ID }, { raffle_id: RAFF.r3, user_id: EMP2_ID },
    { raffle_id: RAFF.r3, user_id: EMP3_ID }, { raffle_id: RAFF.r3, user_id: MOD_B1_ID },
    // r4 upcoming: some entered
    { raffle_id: RAFF.r4, user_id: EMP1_ID }, { raffle_id: RAFF.r4, user_id: EMP2_ID },
    // r6 completed: emp3 winner
    { raffle_id: RAFF.r6, user_id: EMP3_ID }, { raffle_id: RAFF.r6, user_id: EMP1_ID },
    { raffle_id: RAFF.r6, user_id: MOD_A1_ID },
  ];
  const { error: entErr } = await supabase.from('raffle_entries').insert(entries);
  if (entErr) console.error('❌ Raffle entries:', entErr.message);
  else console.log(`✅ ${entries.length} raffle entries inserted`);

  // ─── OT BATCHES + SLOTS ───────────────────────────────────────────────
  console.log('\n=== OT CALENDAR ===');
  const BATCH = {
    b1: 'eeee0001-0000-0000-0000-000000000001',
    b2: 'eeee0001-0000-0000-0000-000000000002',
    b3: 'eeee0001-0000-0000-0000-000000000003',
  };
  const batches = [
    { id: BATCH.b1, name: 'OT Semana Abril 28 — Mayo 3', status: 'published', uploaded_by: MOD_A1_ID, published_at: '2026-04-25T14:00:00Z' },
    { id: BATCH.b2, name: 'OT Extra Mayo 6 — Mayo 10', status: 'published', uploaded_by: MOD_A1_ID, published_at: '2026-05-02T14:00:00Z' },
    { id: BATCH.b3, name: 'OT Mayo Extra II — Mayo 20-25 [DRAFT]', status: 'draft', uploaded_by: MOD_B1_ID },
  ];
  const { error: batchErr } = await supabase.from('ot_batches').insert(batches);
  if (batchErr) console.error('❌ OT batches:', batchErr.message);
  else console.log(`✅ ${batches.length} OT batches inserted`);

  const slots = [
    // Batch 1 — Abril 28 - Mayo 3 (pasadas y presentes)
    { spot_id: 'OT-001', lob: 'NYT Universal Voice', date: '2026-04-28', start_time: '08:00', end_time: '12:00', duration_hrs: 4, shift_label: 'Mañana', status: 'claimed', claimed_by: EMP1_ID, claimed_at: '2026-04-26T10:00:00Z', batch_id: BATCH.b1, published_by: MOD_A1_ID },
    { spot_id: 'OT-002', lob: 'NYT Universal Voice', date: '2026-04-28', start_time: '13:00', end_time: '17:00', duration_hrs: 4, shift_label: 'Tarde', status: 'claimed', claimed_by: EMP2_ID, claimed_at: '2026-04-26T11:00:00Z', batch_id: BATCH.b1, published_by: MOD_A1_ID },
    { spot_id: 'OT-003', lob: 'NYT Universal Voice', date: '2026-04-29', start_time: '08:00', end_time: '16:00', duration_hrs: 8, shift_label: 'Full Day', status: 'available', batch_id: BATCH.b1, published_by: MOD_A1_ID },
    { spot_id: 'OT-004', lob: 'NYT Universal Voice', date: '2026-04-29', start_time: '16:00', end_time: '20:00', duration_hrs: 4, shift_label: 'Tarde-Noche', status: 'claimed', claimed_by: EMP3_ID, claimed_at: '2026-04-26T15:00:00Z', batch_id: BATCH.b1, published_by: MOD_A1_ID },
    { spot_id: 'OT-005', lob: 'NYT Universal Voice', date: '2026-04-30', start_time: '08:00', end_time: '12:00', duration_hrs: 4, shift_label: 'Mañana', status: 'available', batch_id: BATCH.b1, published_by: MOD_A1_ID },
    { spot_id: 'OT-006', lob: 'NYT Universal Voice', date: '2026-05-01', start_time: '09:00', end_time: '17:00', duration_hrs: 8, shift_label: 'Full Day', status: 'claimed', claimed_by: EMP1_ID, claimed_at: '2026-04-28T09:00:00Z', batch_id: BATCH.b1, published_by: MOD_A1_ID },
    { spot_id: 'OT-007', lob: 'NYT Universal Voice', date: '2026-05-02', start_time: '13:00', end_time: '17:00', duration_hrs: 4, shift_label: 'Tarde', status: 'available', batch_id: BATCH.b1, published_by: MOD_A1_ID },
    { spot_id: 'OT-008', lob: 'NYT Universal Voice', date: '2026-05-03', start_time: '08:00', end_time: '14:00', duration_hrs: 6, shift_label: 'Mañana Extendida', status: 'cancelled', batch_id: BATCH.b1, published_by: MOD_A1_ID },
    // Batch 2 — Mayo 6-10 (futuras, todas available)
    { spot_id: 'OT-009', lob: 'NYT Universal Voice', date: '2026-05-06', start_time: '08:00', end_time: '12:00', duration_hrs: 4, shift_label: 'Mañana', status: 'available', batch_id: BATCH.b2, published_by: MOD_A1_ID },
    { spot_id: 'OT-010', lob: 'NYT Universal Voice', date: '2026-05-06', start_time: '13:00', end_time: '17:00', duration_hrs: 4, shift_label: 'Tarde', status: 'available', batch_id: BATCH.b2, published_by: MOD_A1_ID },
    { spot_id: 'OT-011', lob: 'NYT Universal Voice', date: '2026-05-07', start_time: '08:00', end_time: '16:00', duration_hrs: 8, shift_label: 'Full Day', status: 'available', batch_id: BATCH.b2, published_by: MOD_A1_ID },
    { spot_id: 'OT-012', lob: 'NYT Universal Voice', date: '2026-05-08', start_time: '14:00', end_time: '18:00', duration_hrs: 4, shift_label: 'Tarde', status: 'available', batch_id: BATCH.b2, published_by: MOD_A1_ID },
    { spot_id: 'OT-013', lob: 'NYT Universal Voice', date: '2026-05-09', start_time: '08:00', end_time: '14:00', duration_hrs: 6, shift_label: 'Mañana Extendida', status: 'available', batch_id: BATCH.b2, published_by: MOD_A1_ID },
    { spot_id: 'OT-014', lob: 'NYT Universal Voice', date: '2026-05-10', start_time: '09:00', end_time: '17:00', duration_hrs: 8, shift_label: 'Full Day', status: 'available', batch_id: BATCH.b2, published_by: MOD_A1_ID },
    // Past slots — Abril 1-10 (before batches, historical)
    { spot_id: 'OT-H01', lob: 'NYT Universal Voice', date: '2026-04-05', start_time: '08:00', end_time: '16:00', duration_hrs: 8, shift_label: 'Full Day', status: 'claimed', claimed_by: EMP1_ID, claimed_at: '2026-04-03T10:00:00Z', published_by: ADMIN_ID },
    { spot_id: 'OT-H02', lob: 'NYT Universal Voice', date: '2026-04-07', start_time: '13:00', end_time: '17:00', duration_hrs: 4, shift_label: 'Tarde', status: 'claimed', claimed_by: EMP2_ID, claimed_at: '2026-04-04T14:00:00Z', published_by: ADMIN_ID },
    { spot_id: 'OT-H03', lob: 'NYT Universal Voice', date: '2026-04-10', start_time: '08:00', end_time: '12:00', duration_hrs: 4, shift_label: 'Mañana', status: 'claimed', claimed_by: EMP3_ID, claimed_at: '2026-04-08T09:00:00Z', published_by: ADMIN_ID },
  ];
  const { error: slotsErr } = await supabase.from('ot_slots').insert(slots);
  if (slotsErr) console.error('❌ OT slots:', slotsErr.message);
  else console.log(`✅ ${slots.length} OT slots inserted`);

  // ─── FORMS ────────────────────────────────────────────────────────────
  console.log('\n=== FORMS ===');
  const FORM = {
    f1: 'ffff0001-0000-0000-0000-000000000001',
    f2: 'ffff0001-0000-0000-0000-000000000002',
    f3: 'ffff0001-0000-0000-0000-000000000003',
    f4: 'ffff0001-0000-0000-0000-000000000004',
    f5: 'ffff0001-0000-0000-0000-000000000005',
    f6: 'ffff0001-0000-0000-0000-000000000006',
  };
  const forms = [
    {
      id: FORM.f1, title: 'Solicitud de Posición: Workforce Management',
      description: 'Aplica para unirte al equipo de Workforce Management de Outplex. Buscamos empleados proactivos con habilidades analíticas.',
      fields: JSON.stringify([
        { id: 'f1_q1', type: 'text',    label: '¿Por qué te interesa el área de Workforce?', required: true },
        { id: 'f1_q2', type: 'select',  label: 'Turno preferido', required: true, options: ['Mañana (6am-2pm)', 'Tarde (2pm-10pm)', 'Noche (10pm-6am)'] },
        { id: 'f1_q3', type: 'textarea',label: 'Describe tu experiencia con análisis de datos o reportes', required: true },
        { id: 'f1_q4', type: 'radio',   label: '¿Tienes experiencia previa en WFM?', required: true, options: ['Sí', 'No'] },
      ]),
      settings: JSON.stringify({ submitButtonLabel: 'Enviar Solicitud', successMessage: '¡Tu solicitud fue enviada! El equipo se comunicará contigo pronto.', allowMultipleSubmissions: false }),
      status: 'published', created_by: MOD_A1_ID, published_at: '2026-04-15T10:00:00Z', is_mandatory: false,
    },
    {
      id: FORM.f2, title: 'Aplicación: Proyecto Operación Nexus 2025',
      description: 'Nuevo proyecto especial de expansión. Aplica para ser parte del equipo pionero del Proyecto Nexus. Horarios especiales y beneficios adicionales.',
      fields: JSON.stringify([
        { id: 'f2_q1', type: 'text',    label: 'Nombre completo y número de empleado', required: true },
        { id: 'f2_q2', type: 'select',  label: 'Disponibilidad de horario', required: true, options: ['Full-time', 'Part-time (AM)', 'Part-time (PM)', 'Weekends only'] },
        { id: 'f2_q3', type: 'textarea',label: '¿Qué habilidades únicas aportas al proyecto?', required: true },
        { id: 'f2_q4', type: 'radio',   label: '¿Puedes trabajar en las instalaciones principales?', required: true, options: ['Sí, sin problema', 'Sí, con limitaciones', 'No puedo'] },
        { id: 'f2_q5', type: 'text',    label: 'Nombre de tu supervisor actual', required: true },
      ]),
      settings: JSON.stringify({ submitButtonLabel: 'Postularme al Proyecto', successMessage: 'Recibimos tu aplicación al Proyecto Nexus. ¡Gracias por tu interés!', allowMultipleSubmissions: false }),
      status: 'published', created_by: ADMIN_ID, published_at: '2026-04-20T09:00:00Z', is_mandatory: false,
    },
    {
      id: FORM.f3, title: '¿Cómo te sientes en Outplex? — Encuesta Q2 2025',
      description: 'Tu opinión importa. Esta encuesta anónima nos ayuda a mejorar el ambiente laboral y los beneficios del equipo Outplex.',
      fields: JSON.stringify([
        { id: 'f3_q1', type: 'radio',   label: '¿Cómo calificarías tu satisfacción general en Outplex?', required: true, options: ['Muy satisfecho/a', 'Satisfecho/a', 'Neutral', 'Insatisfecho/a', 'Muy insatisfecho/a'] },
        { id: 'f3_q2', type: 'radio',   label: '¿Te sientes valorado/a por tu equipo y supervisores?', required: true, options: ['Siempre', 'La mayoría del tiempo', 'A veces', 'Rara vez', 'Nunca'] },
        { id: 'f3_q3', type: 'textarea',label: '¿Qué es lo que más te gusta de trabajar en Outplex?', required: false },
        { id: 'f3_q4', type: 'textarea',label: '¿Qué mejorarías del ambiente laboral?', required: false },
        { id: 'f3_q5', type: 'radio',   label: '¿Recomendarías Outplex como lugar de trabajo?', required: true, options: ['Definitivamente sí', 'Probablemente sí', 'No estoy seguro/a', 'Probablemente no', 'Definitivamente no'] },
      ]),
      settings: JSON.stringify({ submitButtonLabel: 'Enviar mi Opinión', successMessage: '¡Gracias! Tu respuesta fue registrada de forma anónima. Valoramos tu opinión.', allowMultipleSubmissions: false }),
      status: 'published', created_by: MOD_A1_ID, published_at: '2026-04-10T08:00:00Z', is_mandatory: false,
    },
    {
      id: FORM.f4, title: 'Encuesta de Recomendaciones para Outplex — Q2 2025',
      description: 'Ayúdanos a mejorar los procesos internos, los beneficios de la plataforma y los programas de reconocimiento.',
      fields: JSON.stringify([
        { id: 'f4_q1', type: 'textarea',label: '¿Qué tipo de premios o recompensas te gustaría ver en la tienda?', required: true },
        { id: 'f4_q2', type: 'textarea',label: '¿Tienes sugerencias para mejorar los procesos de OT?', required: false },
        { id: 'f4_q3', type: 'radio',   label: '¿Usas regularmente la plataforma de recompensas?', required: true, options: ['Sí, a diario', 'Varias veces por semana', 'Ocasionalmente', 'Casi nunca'] },
        { id: 'f4_q4', type: 'textarea',label: '¿Qué funcionalidad nueva agregarías a la plataforma?', required: false },
      ]),
      settings: JSON.stringify({ submitButtonLabel: 'Enviar Recomendaciones', successMessage: '¡Gracias por tus sugerencias! Serán revisadas por el equipo de liderazgo.', allowMultipleSubmissions: false }),
      status: 'published', created_by: MOD_B1_ID, published_at: '2026-04-22T11:00:00Z', is_mandatory: false,
    },
    {
      id: FORM.f5, title: 'Solicitud de Cambio de Turno [DRAFT]',
      description: 'Formulario para solicitar cambio de turno temporal o permanente. Pendiente de revisión por RRHH antes de publicar.',
      fields: JSON.stringify([
        { id: 'f5_q1', type: 'text',    label: 'Turno actual', required: true },
        { id: 'f5_q2', type: 'text',    label: 'Turno solicitado', required: true },
        { id: 'f5_q3', type: 'textarea',label: 'Motivo del cambio', required: true },
      ]),
      settings: JSON.stringify({ submitButtonLabel: 'Enviar Solicitud', successMessage: 'Tu solicitud fue recibida.', allowMultipleSubmissions: false }),
      status: 'draft', created_by: MOD_A1_ID, is_mandatory: false,
    },
    {
      id: FORM.f6, title: 'Formulario de Bienvenida — Nuevos Empleados [DRAFT]',
      description: 'Cuestionario de onboarding para nuevos empleados. En proceso de revisión con RRHH.',
      fields: JSON.stringify([
        { id: 'f6_q1', type: 'text',    label: '¿Cómo te enteraste de Outplex?', required: true },
        { id: 'f6_q2', type: 'radio',   label: '¿Es esta tu primera experiencia en un call center?', required: true, options: ['Sí', 'No'] },
        { id: 'f6_q3', type: 'textarea',label: '¿Qué esperas aprender en Outplex?', required: false },
      ]),
      settings: JSON.stringify({ submitButtonLabel: 'Enviar', successMessage: '¡Bienvenido/a al equipo!', allowMultipleSubmissions: false }),
      status: 'draft', created_by: ADMIN_ID, is_mandatory: false,
    },
  ];
  const { error: formsErr } = await supabase.from('forms').insert(forms);
  if (formsErr) console.error('❌ Forms:', formsErr.message);
  else console.log(`✅ ${forms.length} forms inserted`);

  // Form responses from employees
  const responses = [
    { form_id: FORM.f1, user_id: EMP1_ID, answers: JSON.stringify({ f1_q1: 'Siempre me ha gustado el análisis de datos y la coordinación de equipos.', f1_q2: 'Mañana (6am-2pm)', f1_q3: 'Tengo 2 años de experiencia generando reportes de productividad en mi área.', f1_q4: 'No' }) },
    { form_id: FORM.f1, user_id: EMP2_ID, answers: JSON.stringify({ f1_q1: 'Me interesa crecer dentro de la empresa y el WFM es un área clave.', f1_q2: 'Tarde (2pm-10pm)', f1_q3: 'He utilizado Excel avanzado para análisis de tiempos y recursos.', f1_q4: 'Sí' }) },
    { form_id: FORM.f3, user_id: EMP1_ID, answers: JSON.stringify({ f3_q1: 'Muy satisfecho/a', f3_q2: 'La mayoría del tiempo', f3_q3: 'El ambiente de trabajo y los beneficios de la plataforma de recompensas.', f3_q4: 'Más opciones de horarios flexibles.', f3_q5: 'Definitivamente sí' }) },
    { form_id: FORM.f3, user_id: EMP3_ID, answers: JSON.stringify({ f3_q1: 'Satisfecho/a', f3_q2: 'Siempre', f3_q3: 'El equipo de trabajo y la cultura de la empresa.', f3_q4: 'Más actividades de integración.', f3_q5: 'Definitivamente sí' }) },
    { form_id: FORM.f4, user_id: EMP2_ID, answers: JSON.stringify({ f4_q1: 'Me gustaría ver más artículos dominicanos: hamacas, artesanías, paquetes de playa.', f4_q2: 'Sería útil poder ver el historial de OT cancelados.', f4_q3: 'Varias veces por semana', f4_q4: 'Notificaciones push para nuevas rifas y OT disponibles.' }) },
  ];
  const { error: respErr } = await supabase.from('form_responses').insert(responses);
  if (respErr) console.error('❌ Form responses:', respErr.message);
  else console.log(`✅ ${responses.length} form responses inserted`);

  console.log('\nPart 2 (raffles/OT/forms) complete.');
}

run().catch(console.error);
