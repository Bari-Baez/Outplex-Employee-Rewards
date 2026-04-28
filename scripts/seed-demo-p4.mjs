import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const ADMIN='11111111-0000-0000-0000-000000000001', MOD_A1='11111111-0000-0000-0000-000000000002', MOD_B1='11111111-0000-0000-0000-000000000003', EMP1='11111111-0000-0000-0000-000000000004', EMP2='11111111-0000-0000-0000-000000000005', EMP3='11111111-0000-0000-0000-000000000006';
const d=(days)=>new Date(Date.now()+days*86400000).toISOString();
async function run(){
  // company_announcements — UUID must be valid v4 format
  console.log('\n=== COMPANY ANNOUNCEMENTS ===');
  const announcements=[
    {title:'🏆 Torneo de Dominó — Outplex Champions Cup 2025',excerpt:'¡El torneo más esperado del año! Inscríbete y demuestra que eres el campeón de dominó de Outplex.',cover_image_url:'https://images.unsplash.com/photo-1611996575749-79a3a250f948?w=800&q=80',content:JSON.stringify([{type:'paragraph',text:'📅 Fecha: 17 de Mayo, 2025 | 📍 Área de Descanso Piso 3 | ⏰ 12:00 PM - 3:00 PM'},{type:'paragraph',text:'Inscríbete con tu supervisor antes del 14 de Mayo. Cupos limitados a 16 parejas.'},{type:'paragraph',text:'🥇 1er lugar: Set de Dominó + 500 puntos | 🥈 2do: Taza NYT + 250 pts | 🥉 3ro: Gorra + 100 pts'}]),duration_days:15,status:'published',publish_at:d(-5),expires_at:d(10),created_by:ADMIN,updated_by:ADMIN},
    {title:'🎮 Torneo de Videojuegos — NYT Gaming League',excerpt:'Outplex Gaming League: compite en FIFA y Call of Duty con premios en puntos y artículos exclusivos.',cover_image_url:'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&q=80',content:JSON.stringify([{type:'paragraph',text:'📅 Fecha: 24 de Mayo | 📍 Sala de Conferencias B | ⏰ 1:00 PM - 5:00 PM'},{type:'paragraph',text:'Equipos de 2 jugadores. FIFA 25 y Call of Duty: Warzone. Máximo 8 equipos. Inscripción previa requerida.'},{type:'paragraph',text:'Ganadores reciben 300 puntos de recompensa c/u más artículos NYT exclusivos.'}]),duration_days:15,status:'published',publish_at:d(-3),expires_at:d(12),created_by:MOD_A1,updated_by:MOD_A1},
    {title:'📢 Nueva Política de Uniformes — Mayo 2025',excerpt:'A partir del 1ro de Mayo todos los empleados deben usar el uniforme completo. Revisa los detalles.',cover_image_url:'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=800&q=80',content:JSON.stringify([{type:'paragraph',text:'Efectiva: 1 de Mayo, 2025. Todos los empleados en planta deben cumplir con la política actualizada.'},{type:'paragraph',text:'✅ Camisa corporativa Outplex | ✅ Pantalón oscuro | ✅ Zapatos cerrados\n❌ No jeans rotos | ❌ No chancletas | ❌ No ropa deportiva'},{type:'paragraph',text:'Empleados con +1 año: 2 camisas gratis. Nuevos: 1 camisa de cortesía. Consultas: RRHH Piso 2.'}]),duration_days:30,status:'published',publish_at:d(-7),expires_at:d(23),created_by:ADMIN,updated_by:ADMIN},
    {title:'🚭 Política de No Fumar en las Instalaciones',excerpt:'Recordatorio: está estrictamente prohibido fumar dentro y en los alrededores inmediatos de nuestras instalaciones.',cover_image_url:'https://images.unsplash.com/photo-1530026186672-2cd00ffc50fe?w=800&q=80',content:JSON.stringify([{type:'paragraph',text:'Outplex reafirma su compromiso con un ambiente de trabajo saludable.'},{type:'paragraph',text:'🚫 Prohibido en: Interior, estacionamientos, entradas y área techada de descanso.'},{type:'paragraph',text:'✅ Área designada: 15 metros de la entrada lateral — solo durante breaks establecidos.'},{type:'paragraph',text:'Incumplimiento: medidas disciplinarias según reglamento interno.'}]),duration_days:60,status:'published',publish_at:d(-10),expires_at:d(50),created_by:ADMIN,updated_by:ADMIN},
    {title:'🏖️ Día del Empleado — Actividad Playera Mayo 2025',excerpt:'¡Gran evento anual! Este año vamos a Boca Chica. Transporte y almuerzo incluidos.',cover_image_url:'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80',content:JSON.stringify([{type:'paragraph',text:'📅 15 de Mayo | 🌊 Playa Boca Chica | ⏰ Salida 8:00 AM — Regreso 5:00 PM'},{type:'paragraph',text:'Se provee almuerzo, bebidas y actividades recreativas. Totalmente gratuito para empleados activos.'},{type:'paragraph',text:'Puedes llevar un acompañante con costo simbólico. Inscripciones: antes del 10 de Mayo con tu supervisor.'}]),duration_days:7,status:'scheduled',publish_at:d(5),expires_at:d(12),created_by:MOD_A1,updated_by:MOD_A1},
    {title:'📋 Actualización Manual de Empleados Q3 2025 [DRAFT]',excerpt:'Nueva versión con actualizaciones en políticas de beneficios y procedimientos.',cover_image_url:null,content:JSON.stringify([{type:'paragraph',text:'[BORRADOR — Pendiente revisión legal]\nActualizaciones en políticas de beneficios médicos y procedimientos de escalamiento para Q3 2025.'}]),duration_days:30,status:'draft',publish_at:null,expires_at:null,created_by:ADMIN,updated_by:ADMIN},
    {title:'📊 Resultados Encuesta Satisfacción Q1 2025 [DRAFT]',excerpt:'Resumen de resultados del primer trimestre. Participación: 78%. Satisfacción: 4.2/5.',cover_image_url:null,content:JSON.stringify([{type:'paragraph',text:'[BORRADOR — En análisis]\nParticipación: 78% de empleados. Satisfacción general: 4.2/5. Pendiente validación con RRHH.'}]),duration_days:7,status:'draft',publish_at:null,expires_at:null,created_by:MOD_A1,updated_by:MOD_A1},
  ];
  const {error:annErr}=await supabase.from('company_announcements').insert(announcements);
  if(annErr) console.error('❌ Announcements:',annErr.message); else console.log(`✅ ${announcements.length} company announcements`);

  // ── EMPLOYEE STORES + PRODUCTS + ANNOUNCEMENTS ──
  console.log('\n=== EMPLOYEE STORES ===');
  // First get EMP1 and EMP2 real IDs (we know them)
  const stores=[
    {owner_id:EMP1,slug:'tienda-maria-accesorios',name:'Tienda de María — Accesorios & Hogar',description:'Artesanías dominicanas, accesorios de moda y artículos para el hogar hechos a mano. ¡Apoya a tus compañeros!',category:'Accesorios & Hogar',accent_color:'#ec4899',status:'active',is_open:true,approved_by:MOD_A1,first_product_published_at:d(-5)},
    {owner_id:EMP2,slug:'cocina-criolla-carlos',name:'Cocina Criolla by Carlos',description:'Comida criolla dominicana preparada con amor. Pedidos para llevar. Pastelitos, chicharrones, postres y más.',category:'Gastronomía',accent_color:'#f59e0b',status:'active',is_open:true,approved_by:MOD_A1,first_product_published_at:d(-4)},
  ];
  const {data:storeData,error:stErr}=await supabase.from('employee_stores').insert(stores).select('id,owner_id');
  if(stErr){console.error('❌ Employee stores:',stErr.message);return;}
  console.log(`✅ ${storeData.length} employee stores`);
  const s1=storeData.find(s=>s.owner_id===EMP1)?.id;
  const s2=storeData.find(s=>s.owner_id===EMP2)?.id;

  const products=[
    {store_id:s1,name:'Aretes Artesanales de Carey',description:'Hermosos aretes elaborados a mano con materiales naturales dominicanos. Disponibles en varios estilos y colores.',price_dop:500,image_url:'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=400&q=80',category:'Accesorios',stock:8,is_active:true},
    {store_id:s1,name:'Bolso de Playa Tejido',description:'Bolso grande tejido a mano, perfecto para la playa. Diseños exclusivos con colores vibrantes. Incluye bolsillo interior.',price_dop:1200,image_url:'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=400&q=80',category:'Accesorios',stock:3,is_active:true},
    {store_id:s1,name:'Set de Velas Aromáticas x3',description:'Set de 3 velas aromáticas artesanales: vainilla, coco y canela. Perfectas para relajarse después del trabajo.',price_dop:800,image_url:'https://images.unsplash.com/photo-1603006905003-be475563bc59?w=400&q=80',category:'Hogar',stock:5,is_active:true},
    {store_id:s1,name:'Colgante de Hilo Macramé [DRAFT]',description:'Colgante decorativo hecho a mano en técnica macramé. Próximamente disponible. Stock en preparación.',price_dop:650,image_url:null,category:'Hogar',stock:0,is_active:false},
    {store_id:s2,name:'Pastelitos de Yuca (Docena)',description:'Pastelitos de yuca rellenos de pollo guisado dominicano. Preparados el mismo día. Pedidos antes de las 10am.',price_dop:150,image_url:'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=400&q=80',category:'Comidas',stock:15,is_active:true},
    {store_id:s2,name:'Chicharrones de Pollo (1lb)',description:'Chicharrones de pollo crujientes estilo dominicano. Incluye tostones y salsa criolla. ¡El favorito del team!',price_dop:200,image_url:'https://images.unsplash.com/photo-1562967914-608f82629710?w=400&q=80',category:'Comidas',stock:10,is_active:true},
    {store_id:s2,name:'Dulce de Coco Tradicional',description:'Dulce de coco artesanal preparado con receta familiar dominicana. Vendido por unidad en envase decorativo.',price_dop:120,image_url:'https://images.unsplash.com/photo-1548353408-26d7a226a68a?w=400&q=80',category:'Postres',stock:20,is_active:true},
    {store_id:s2,name:'Jugo Natural de Chinola [DRAFT]',description:'Próximamente: Jugo natural de chinola (maracuyá) sin azúcar añadida. Botella de 16oz.',price_dop:80,image_url:null,category:'Bebidas',stock:0,is_active:false},
  ];
  const {error:prodErr}=await supabase.from('employee_store_products').insert(products);
  if(prodErr) console.error('❌ Emp store products:',prodErr.message); else console.log(`✅ ${products.length} employee store products`);

  // Employee store orders
  const {data:prodData}=await supabase.from('employee_store_products').select('id,name,price_dop,store_id').eq('is_active',true);
  const getP=(name)=>prodData?.find(p=>p.name.includes(name));
  const aretes=getP('Aretes'), bolso=getP('Bolso'), pastelitos=getP('Pastelitos'), chicharrones=getP('Chicharrones'), velas=getP('Velas'), dulce=getP('Dulce');
  const empOrders=[];
  if(aretes){empOrders.push({store_id:s1,seller_id:EMP1,buyer_id:EMP3,total_dop:500,status:'ready_for_pickup',contact_method:'slack',status_history:JSON.stringify([{status:'pending',at:d(-3)},{status:'ready_for_pickup',at:d(-2)}])});}
  if(bolso){empOrders.push({store_id:s1,seller_id:EMP1,buyer_id:MOD_B1,total_dop:1200,status:'pending',contact_method:'email',status_history:JSON.stringify([{status:'pending',at:d(-1)}])});}
  if(pastelitos){empOrders.push({store_id:s2,seller_id:EMP2,buyer_id:EMP1,total_dop:150,status:'ready_for_pickup',contact_method:'slack',status_history:JSON.stringify([{status:'pending',at:d(-2)},{status:'ready_for_pickup',at:d(-1)}])});}
  if(chicharrones){empOrders.push({store_id:s2,seller_id:EMP2,buyer_id:EMP3,total_dop:200,status:'pending',contact_method:'email',status_history:JSON.stringify([{status:'pending',at:d(-1)}])});}
  if(dulce){empOrders.push({store_id:s2,seller_id:EMP2,buyer_id:MOD_A1,total_dop:240,status:'cancelled',contact_method:'none',status_history:JSON.stringify([{status:'pending',at:d(-4)},{status:'cancelled',at:d(-3)}])});}
  if(empOrders.length>0){
    const {error:eoErr}=await supabase.from('employee_store_orders').insert(empOrders);
    if(eoErr) console.error('❌ Emp store orders:',eoErr.message); else console.log(`✅ ${empOrders.length} employee store orders`);
  }

  // Employee product reviews
  if(aretes&&bolso&&pastelitos){
    const epReviews=[
      {product_id:aretes.id,user_id:EMP3,rating:5,created_at:d(-2)},
      {product_id:pastelitos.id,user_id:EMP1,rating:5,created_at:d(-1)},
      {product_id:chicharrones?.id,user_id:EMP3,rating:4,created_at:d(-1)},
    ].filter(r=>r.product_id);
    const {error:epRevErr}=await supabase.from('employee_store_product_reviews').insert(epReviews);
    if(epRevErr) console.error('❌ Emp product reviews:',epRevErr.message); else console.log(`✅ ${epReviews.length} employee product reviews`);
  }

  // Employee announcements
  const empAnn=[
    {title:'✨ Nueva Colección de Aretes — Mayo 2025',excerpt:'Llegaron nuevos diseños exclusivos inspirados en la naturaleza dominicana. ¡Cantidades limitadas!',cover_image_url:'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=600&q=80',content:JSON.stringify([{type:'paragraph',text:'Esta semana tengo disponible una nueva colección de aretes artesanales inspirados en la flora y fauna dominicana.'},{type:'paragraph',text:'🌺 Diseños disponibles: Mariposa, Flor de Maho, Palma\n💰 Precio: 500 DOP la unidad o 2 por 900 DOP\n📦 Stock: 8 pares disponibles — ¡se están agotando rápido!'}]),duration_days:7,status:'published',publish_at:d(-3),expires_at:d(4),created_by:EMP1,updated_by:EMP1},
    {title:'🍗 Especial del Día — Chicharrones al Estilo Dominicano',excerpt:'Hoy tengo disponibles chicharrones de pollo extra crujientes con tostones. ¡Pide antes de las 11am!',cover_image_url:'https://images.unsplash.com/photo-1562967914-608f82629710?w=600&q=80',content:JSON.stringify([{type:'paragraph',text:'¡Buenos días equipo! Hoy preparé chicharrones de pollo estilo dominicano 🍗'},{type:'paragraph',text:'Incluye: tostones, salsa criolla y ají verde\n💰 Precio: 200 DOP la libra\n⏰ Pedidos antes de las 11:00 AM\n🔔 Entrega a la hora del almuerzo en el break room'}]),duration_days:1,status:'published',publish_at:d(-1),expires_at:d(0),created_by:EMP2,updated_by:EMP2},
    {title:'🎁 Promo 2x1 en Velas Aromáticas [DRAFT]',excerpt:'Próximamente: oferta especial en velas artesanales para celebrar la apertura de la tienda.',cover_image_url:null,content:JSON.stringify([{type:'paragraph',text:'[BORRADOR] Promo especial: 2 sets de velas por el precio de 1 (1,600 DOP). Válido solo por 48 horas. Pendiente de publicar.'}]),duration_days:3,status:'draft',publish_at:null,expires_at:null,created_by:EMP1,updated_by:EMP1},
  ];
  const {error:eaErr}=await supabase.from('employee_announcements').insert(empAnn);
  if(eaErr) console.error('❌ Employee announcements:',eaErr.message); else console.log(`✅ ${empAnn.length} employee announcements`);

  // Notifications about stores
  const storeNotifs=[
    {user_id:EMP1,title:'🏪 Tu Tienda fue Aprobada',message:'¡Felicidades! Tu tienda "Tienda de María — Accesorios & Hogar" fue aprobada. Ya puedes agregar productos y comenzar a vender.',type:'system',sender_id:MOD_A1},
    {user_id:EMP2,title:'🏪 Tu Tienda fue Aprobada',message:'¡Felicidades! Tu tienda "Cocina Criolla by Carlos" fue aprobada. Ya puedes agregar productos y recibir órdenes.',type:'system',sender_id:MOD_A1},
    {user_id:EMP3,title:'📬 Nueva orden en tu pedido',message:'Aretes Artesanales de Carey — tu pedido está listo para recoger. Contacta a María para coordinar.',type:'order',sender_id:EMP1},
    {user_id:EMP1,title:'🛒 Nueva orden recibida en tu tienda',message:'Carlos te ordenó Pastelitos de Yuca (Docena). Su orden está lista para despacho.',type:'order',sender_id:EMP2},
  ];
  const {error:snErr}=await supabase.from('notifications').insert(storeNotifs);
  if(snErr) console.error('❌ Store notifications:',snErr.message); else console.log(`✅ ${storeNotifs.length} store notifications`);

  console.log('\nPart 4 (stores/announcements) complete.');
}
run().catch(console.error);
