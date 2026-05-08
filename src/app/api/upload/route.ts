import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { enforceSectionAvailability } from '@/lib/availability/section-guard';

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabaseAuth.from('users').select('role').eq('id', user.id).single();
    if (!profile?.role) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const serviceClient = await createServiceClient();
    const maintenance = await enforceSectionAvailability({
      serviceClient: serviceClient,
      toolKey: 'my_store',
      sectionKey: 'main',
      userRole: profile.role as string,
      bypassForAdmin: true,
    });
    if (maintenance) {
      return maintenance;
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

    // Whitelist allowed folders to prevent path traversal
    const ALLOWED_FOLDERS = new Set(['uploads', 'avatars', 'products', 'public', 'store', 'breaks']);
    const rawFolder = formData.get('folder') as string | null;
    const folder = rawFolder && ALLOWED_FOLDERS.has(rawFolder) ? rawFolder : 'uploads';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate size (10 MB max)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });
    }

    // Validate file extension — only allow safe image/document types
    const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'pdf', 'csv', 'xlsx', 'xls']);
    const fileExt = file.name.replace(/^.*\./, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!fileExt || !ALLOWED_EXTENSIONS.has(fileExt)) {
      return NextResponse.json({ error: 'File type not allowed' }, { status: 400 });
    }

    // Prepare buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Create unique filename
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}.${fileExt}`;
    const filePath = `${folder}/${fileName}`;

    // Upload using service client to bypass RLS limitations and ensure availability
    const supabase = serviceClient;
    const { data, error } = await supabase.storage
      .from('assets')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (error) {
      console.error('Upload Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('assets')
      .getPublicUrl(data.path);

    return NextResponse.json({ url: publicUrlData.publicUrl });
  } catch (error) {
    console.error('Upload Process Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
