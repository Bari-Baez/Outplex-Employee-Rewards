import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const ADMIN=  '11111111-0000-0000-0000-000000000001';
const MOD_A1= '11111111-0000-0000-0000-000000000002';
const MOD_B1= '11111111-0000-0000-0000-000000000003';
const EMP1=   '11111111-0000-0000-0000-000000000004';
const EMP2=   '11111111-0000-0000-0000-000000000005';
const EMP3=   '11111111-0000-0000-0000-000000000006';

async function run() {
  // ── COMPANY ANNOUNCEMENTS ──────────────────────────────────────────
  console.log('\n=== COMPANY ANNOUNCEMENTS ===');
  const now = new Date();
  const d = (days) => new Date(now.getTime() + days*86400000).toISOString();
  const announcements = [
    { id:'gggg0001-0000-0000-0000-000000000001', title:'🏆 Torneo de Dominó — Outplex Champions Cup 2025', excerpt:'¡El torneo más esperado del año! Inscríbete y demuestra que eres el campeón de dominó de Outplex.', cover_image_url:'https://images.unsplash.com/photo-1611996575749-79a3a250f948?w=800&q=80', content:JSON.stringify([{type:'heading',text:'Outplex Champions Cup 2025'},{type:'paragraph',text:'Nos complace anunciar el primer Torneo Oficial de Dominó de Outplex. Esta es tu oportunidad de demostrar tus habilidades y ganar increíbles premios.'},{type:'paragraph',text:'📅 Fecha: 17 de Mayo, 2025\n📍 Lugar: Área de Descanso Principal, Piso 3\n⏰ Hora: 12:00 PM - 3:00 PM'},{type:'paragraph',text:'Inscríbete con tu supervisor antes del 14 de Mayo. ¡Los cupos son limitados a 16 parejas!'},{type:'heading',text:'Premios'},{type:'paragraph',text:'🥇 1er lugar: Set de Dominó Profesional + 500 puntos de recompensa\n🥈 2do lugar: Taza NYT + 250 puntos\n🥉 3er lugar: Gorra NYT + 100 puntos'}]), duration_days:15, status:'published', publish_at:d(-5), expires_at:d(10), created_by:ADMIN, updated_by:ADMIN },
    { id:'gggg0001-0000-0000-0000-000000000002', title:'🎮 Torneo de Videojuegos — NYT Gaming League', excerpt:'Outplex Gaming League: compite en FIFA y Call of Duty. ¡Premios en puntos y artículos exclusivos!', cover_image_url:'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&q=80', content:JSON.stringify([{type:'heading',text:'NYT Gaming League — Edición 2025'},{type:'paragraph',text:'¿Eres un gamer de corazón? Este torneo es para ti. Competiremos en FIFA 25 y Call of Duty: Warzone en equipos de 2.'},{type:'paragraph',text:'📅 Fecha: 24 de Mayo, 2025\n📍 Sala de Conferencias B\n⏰ Hora: 1:00 PM - 5:00 PM'},{type:'paragraph',text:'Se requiere inscripción previa. Máximo 8 equipos (16 jugadores). Las consolas serán provistas por Outplex.'},{type:'heading',text:'Formato'},{type:'paragraph',text:'Fase de grupos → Semifinales → Final. El equipo ganador recibe 300 puntos de recompensa cada uno más artículos NYT exclusivos.'}]), duration_days:15, status:'published', publish_at:d(-3), expires_at:d(12), created_by:MOD_A1, updated_by:MOD_A1 },
    { id:'gggg0001-0000-0000-0000-000000000003', title:'📢 Actualización: Nueva Política de Uniformes 2025', excerpt:'A partir del 1ro de Mayo, todos los empleados deben usar el uniforme completo. Revisa los detalles aquí.', cover_image_url:'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=800&q=80', content:JSON.stringify([{type:'heading',text:'Nueva Política de Uniformes — Efectiva Mayo 1, 2025'},{type:'paragraph',text:'El departamento de RRHH informa que a partir del 1ro de Mayo de 2025, todos los empleados en planta deben cumplir con la política de uniformes actualizada.'},{type:'heading',text:'Cambios Principales'},{type:'paragraph',text:'✅ Camisa corporativa Outplex (manga larga o corta)\n✅ Pantalón de color oscuro (negro, azul marino, gris)\n✅ Zapatos cerrados de cuero o sintético\n❌ No se permiten jeans rotos, chancletas ni ropa deportiva'},{type:'paragraph',text:'Los uniformes están disponibles en RRHH. Empleados con más de 1 año recibirán 2 camisas gratis. Nuevos empleados recibirán 1 camisa de cortesía.'},{type:'paragraph',text:'Para preguntas, contacta a RRHH en el Piso 2 o envía un ticket de soporte.'}]), duration_days:30, status:'published', publish_at:d(-7), expires_at:d(23), created_by:ADMIN, updated_by:ADMIN },
    { id:'gggg0001-0000-0000-0000-000000000004', title:'🚭 Política de No Fumar en las Instalaciones', excerpt:'Recordatorio importante: está estrictamente prohibido fumar dentro y en los alrededores inmediatos de nuestras instalaciones.', cover_image_url:'https://images.unsplash.com/photo-1530026186672-2cd00ffc50fe?w=800&q=80', content:JSON.stringify([{type:'heading',text:'Política de No Fumar — Outplex Dominican Republic'},{type:'paragraph',text:'Outplex reafirma su compromiso con un ambiente de trabajo saludable y seguro para todos sus colaboradores.'},{type:'heading',text:'Áreas Restringidas'},{type:'paragraph',text:'🚫 Interior de todas las instalaciones\n🚫 Estacionamientos\n🚫 Entrada principal y laterales\n🚫 Área de descanso techada'},{type:'heading',text:'Área Designada'},{type:'paragraph',text:'Existe un área designada para fumadores ubicada a 15 metros de la entrada lateral. El uso de esta área es únicamente durante los breaks establecidos.'},{type:'paragraph',text:'El incumplimiento de esta política puede resultar en medidas disciplinarias según el reglamento interno. Para más información, consulta con tu supervisor o RRHH.'}]), duration_days:60, status:'published', publish_at:d(-10), expires_at:d(50), created_by:ADMIN, updated_by:ADMIN },
    { id:'gggg0001-0000-0000-0000-000000000005', title:'🏖️ Día del Empleado — Actividad Playera Mayo 2025', excerpt:'¡Prepárate para el gran evento anual! Este año vamos a la playa. Fecha, logística y más detalles pronto.', cover_image_url:'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80', content:JSON.stringify([{type:'heading',text:'Día del Empleado Outplex 2025 — ¡Vamos a la Playa!'},{type:'paragraph',text:'Este año celebramos el Día del Empleado con una actividad especial en la playa. ¡Una jornada de integración, juegos y diversión para todos!'},{type:'paragraph',text:'📅 Fecha: 15 de Mayo, 2025\n🌊 Lugar: Playa Boca Chica (transporte incluido)\n⏰ Salida: 8:00 AM desde las instalaciones\n🔙 Regreso: 5:00 PM aproximadamente'},{type:'paragraph',text:'Se proveerá almuerzo, bebidas y actividades recreativas. La participación es completamente gratuita para empleados activos. Puedes llevar un acompañante (con costo adicional simbólico).'},{type:'paragraph',text:'Inscripciones abiertas hasta el 10 de Mayo con tu supervisor.'}]), duration_days:7, status:'scheduled', publish_at:d(5), expires_at:d(12), created_by:MOD_A1, updated_by:MOD_A1 },
    { id:'gggg0001-0000-0000-0000-000000000006', title:'📋 Actualización Manual de Empleados Q3 2025 [DRAFT]', excerpt:'Nueva versión del manual de empleados con actualizaciones en políticas de beneficios y procedimientos.', cover_image_url:null, content:JSON.stringify([{type:'paragraph',text:'[BORRADOR — Pendiente revisión legal antes de publicar]\n\nEste documento contiene las actualizaciones del Manual del Empleado para el tercer trimestre de 2025. Los cambios incluyen nuevas políticas de beneficios médicos y procedimientos de escalamiento.'}]), duration_days:30, status:'draft', publish_at:null, expires_at:null, created_by:ADMIN, updated_by:ADMIN },
    { id:'gggg0001-0000-0000-0000-000000000007', title:'📊 Resultados Encuesta de Satisfacción Q1 2025 [DRAFT]', excerpt:'Resumen de los resultados de la encuesta de satisfacción del primer trimestre.', cover_image_url:null, content:JSON.stringify([{type:'paragraph',text:'[BORRADOR — En proceso de análisis de datos]\n\nParticipación: 78% de empleados. Satisfacción general: 4.2/5. Pendiente validación con RRHH antes de publicar.'}]), duration_days:7, status:'draft', publish_at:null, expires_at:null, created_by:MOD_A1, updated_by:MOD_A1 },
  ];
  const {error:annErr} = await supabase.from('company_announcements').insert(announcements);
  if(annErr) console.error('❌ Announcements:', annErr.message); else console.log(`✅ ${announcements.length} company announcements`);

  // ── BROADCAST NOTIFICATIONS ───────────────────────────────────────
  console.log('\n=== BROADCAST NOTIFICATIONS ===');
  const broadcasts = [
    { title:'📦 Nuevo Stock en la Tienda NYT', message:'¡Tenemos nuevos artículos disponibles! Mesa de Dominó, Piscina Inflable y más. Revisa la tienda y usa tus puntos.', category:'stock', status:'published', sent_at:d(-2), created_by:MOD_A1 },
    { title:'⏰ OT Extra Publicado — Semana Mayo 6', message:'Hay nuevas oportunidades de overtime disponibles para la semana del 6 al 10 de Mayo. ¡Primero en llegar, primero en reclamar!', category:'availability', status:'published', sent_at:d(-1), created_by:MOD_A1 },
    { title:'🏪 Dos Nuevas Tiendas de Empleados Abiertas', message:'Bienvenidos a las nuevas tiendas de empleados: "Tienda de María" y "Cocina Criolla by Carlos". ¡Visítalas en la sección de tiendas!', category:'general', status:'published', sent_at:d(-3), created_by:ADMIN },
    { title:'⚠️ Mantenimiento del Sistema — Domingo 4:00 AM', message:'El sistema estará en mantenimiento el próximo domingo de 4:00 AM a 6:00 AM. Durante ese período la plataforma no estará disponible.', category:'general', status:'scheduled', publish_at:d(3), created_by:ADMIN },
    { title:'📊 Reporte Mensual de Puntos — Mayo 2025 [DRAFT]', message:'Resumen de distribución de puntos del mes de Mayo. Pendiente de aprobación por gerencia.', category:'general', status:'draft', created_by:MOD_B1 },
  ];
  const {error:bcErr} = await supabase.from('broadcast_notifications').insert(broadcasts);
  if(bcErr) console.error('❌ Broadcasts:', bcErr.message); else console.log(`✅ ${broadcasts.length} broadcast notifications`);

  // ── PERSONAL NOTIFICATIONS ────────────────────────────────────────
  console.log('\n=== PERSONAL NOTIFICATIONS ===');
  const notifs = [
    // Bienvenida a todos
    { user_id:EMP1,   title:'👋 Bienvenido a Outplex Rewards', message:'Tu cuenta está activa. Explora la tienda, participa en rifas y reclama tu OT. ¡Bienvenido al equipo!', type:'system' },
    { user_id:EMP2,   title:'👋 Bienvenido a Outplex Rewards', message:'Tu cuenta está activa. Explora la tienda, participa en rifas y reclama tu OT. ¡Bienvenido al equipo!', type:'system' },
    { user_id:EMP3,   title:'👋 Bienvenido a Outplex Rewards', message:'Tu cuenta está activa. Explora la tienda, participa en rifas y reclama tu OT. ¡Bienvenido al equipo!', type:'system' },
    { user_id:MOD_A1, title:'👋 Panel de Moderador Activo', message:'Tu acceso de Moderador A1 está configurado. Puedes gestionar rifas, OT, formularios y anuncios.', type:'system' },
    { user_id:MOD_B1, title:'👋 Panel de Moderador Activo', message:'Tu acceso de Moderador B1 está configurado. Puedes gestionar la tienda, órdenes y empleados.', type:'system' },
    // Ganadores de rifas
    { user_id:EMP1, title:'🏆 ¡Ganaste la Rifa — Mesa de Dominó!', message:'Felicitaciones, eres el ganador de la Rifa "Bundle Campeones: Mesa de Dominó + Set Profesional". Contacta a tu moderador para coordinar la entrega.', type:'raffle' },
    { user_id:EMP2, title:'🎁 ¡Ganaste la Rifa — Bundle NYT Starter Pack!', message:'¡Felicidades! Eres la ganadora de la Gorra NYT + Taza Acero Inoxidable. Pasa a reclamar tu premio con el equipo de moderación.', type:'raffle' },
    { user_id:EMP3, title:'🏖️ ¡Ganaste la Rifa — Bundle Playa!', message:'¡Ganaste la silla de playa y la sombrilla UV50+! Coordina la entrega con tu supervisor.', type:'raffle' },
    // Órdenes
    { user_id:EMP1, title:'✅ Orden Aprobada — Piscina Inflable', message:'Tu orden de la Piscina Inflable Familiar 3.5m fue aprobada. Puedes pasar a recogerla en el área de logística.', type:'order' },
    { user_id:EMP2, title:'✅ Orden Aprobada — Taza NYT', message:'Tu orden de la Taza NYT Acero Inoxidable fue aprobada. Pasa a recogerla en el counter de RRHH.', type:'order' },
    { user_id:EMP2, title:'❌ Orden Cancelada — Silla de Playa', message:'Tu orden de la Silla de Playa fue cancelada por falta de stock. Los puntos no fueron deducidos.', type:'order' },
    { user_id:MOD_A1, title:'🎽 Tu orden de Abrigo NYT está lista para pickup', message:'El abrigo NYT Edición Invierno que ordenaste está listo. Pasa a reclamarlo en el área de logística.', type:'order' },
    // OT
    { user_id:EMP1, title:'⏰ Nuevo OT Disponible — Semana Mayo 6', message:'Se publicaron nuevas oportunidades de overtime para Mayo 6-10. ¡Entra al calendario y reserva tu turno!', type:'ot' },
    { user_id:EMP2, title:'⏰ Nuevo OT Disponible — Semana Mayo 6', message:'Se publicaron nuevas oportunidades de overtime para Mayo 6-10. ¡Entra al calendario y reserva tu turno!', type:'ot' },
    { user_id:EMP3, title:'⏰ Nuevo OT Disponible — Semana Mayo 6', message:'Se publicaron nuevas oportunidades de overtime para Mayo 6-10. ¡Entra al calendario y reserva tu turno!', type:'ot' },
    // Nueva rifa
    { user_id:EMP1, title:'🌊 Nueva Rifa: Piscina Inflable Familiar', message:'Ya puedes participar en la rifa de la Piscina Inflable Familiar 3.5m. ¡El sorteo es el 20 de Mayo!', type:'raffle' },
    { user_id:EMP2, title:'🌊 Nueva Rifa: Piscina Inflable Familiar', message:'Ya puedes participar en la rifa de la Piscina Inflable Familiar 3.5m. ¡El sorteo es el 20 de Mayo!', type:'raffle' },
    { user_id:EMP3, title:'🌊 Nueva Rifa: Piscina Inflable Familiar', message:'Ya puedes participar en la rifa de la Piscina Inflable Familiar 3.5m. ¡El sorteo es el 20 de Mayo!', type:'raffle' },
  ];
  const {error:notifErr} = await supabase.from('notifications').insert(notifs);
  if(notifErr) console.error('❌ Notifications:', notifErr.message); else console.log(`✅ ${notifs.length} notifications`);

  // ── POINTS LEDGER ─────────────────────────────────────────────────
  console.log('\n=== POINTS LEDGER ===');
  const ledger = [
    { user_id:EMP1, points_added:500,  granted_by:ADMIN,  reason:'OT completado — Semana Abril 5', created_at:d(-23) },
    { user_id:EMP1, points_added:750,  granted_by:MOD_A1, reason:'Reconocimiento mensual: Empleado del Mes Marzo', created_at:d(-15) },
    { user_id:EMP2, points_added:400,  granted_by:ADMIN,  reason:'OT completado — Semana Abril 7', created_at:d(-21) },
    { user_id:EMP2, points_added:500,  granted_by:MOD_A1, reason:'OT completado — Semana Abril 28', created_at:d(-2) },
    { user_id:EMP3, points_added:350,  granted_by:ADMIN,  reason:'OT completado — Semana Abril 10', created_at:d(-18) },
    { user_id:EMP3, points_added:400,  granted_by:MOD_A1, reason:'Reconocimiento: Mejor puntuación de satisfacción Q1', created_at:d(-10) },
    { user_id:MOD_A1, points_added:1000, granted_by:ADMIN, reason:'Bonus por gestión de eventos Q1 2025', created_at:d(-14) },
    { user_id:MOD_B1, points_added:500,  granted_by:ADMIN, reason:'Bonus trimestral — moderación de tienda', created_at:d(-14) },
    { user_id:ADMIN, points_added:5000, granted_by:ADMIN,  reason:'Asignación inicial — cuenta administrativa', created_at:d(-30) },
    { user_id:ADMIN, points_added:5000, granted_by:ADMIN,  reason:'Recarga Q2 — presupuesto de recompensas', created_at:d(-7) },
  ];
  const {error:ledErr} = await supabase.from('points_ledger').insert(ledger);
  if(ledErr) console.error('❌ Points ledger:', ledErr.message); else console.log(`✅ ${ledger.length} ledger entries`);

  console.log('\nPart 3 (announcements/notifications/ledger) complete.');
}
run().catch(console.error);
