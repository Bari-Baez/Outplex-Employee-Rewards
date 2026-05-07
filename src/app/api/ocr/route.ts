import { type NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@/lib/supabase/server';
import { CORE_OT_COLUMNS } from '@/lib/ot';

export const maxDuration = 30;

const STANDARD_COLUMN_ALIASES = new Set(['total', 'duration', 'hours', 'total_hrs', 'duration_hrs']);

const OCR_PROMPT = `You are an overtime (OT) schedule data extractor. Read this table image and return a JSON object.

Output format:
{
  "headers": ["spot_id","lob","date","start_time","end_time","total"],
  "rows": [
    {"spot_id":"17823","lob":"","date":"02/05/2026","start_time":"8:30 AM","end_time":"1:00 PM","total":"4.5"}
  ]
}

Rules:
- ALWAYS include AM or PM after every time. Write "8:30 AM" not "8:30". Write "1:00 PM" not "13:00".
- "spot_id": the employee/spot ID number (4-8 digits). The column may be named "ID", "Spot ID", "Employee ID", "Emp ID", or similar.
- "lob": line of business (e.g. "NYT Universal Voice", "NYT Universal Chat"). Use "" if not shown.
- "date": preserve exactly as shown (e.g. "5/6/2026", "02/05/2026").
- "start_time" and "end_time": always H:MM AM or H:MM PM. Columns may be named "Start", "End", "Hora inicio", "Hora fin", etc.
- "total": total hours as a number string (e.g. "4.5", "6"). Column may be named "Total", "Hours", "Duration", "Hrs", etc.
- For any extra columns detected in the image (e.g. supervisor, agent_name, opx_id, aws_id), include them using snake_case keys.
- If a cell is empty, use "".
- Ignore filter arrows (▼), asterisks (*), and other Excel/Sheets UI decorations.
- Do NOT include the header row in "rows".
- Return ONLY valid JSON, no explanations or markdown fences.`;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error: 'OCR service not configured. Ask your administrator to add GEMINI_API_KEY to the environment.',
        fallback: true,
      },
      { status: 503 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const imageFile = formData.get('image');
  if (!(imageFile instanceof File)) {
    return NextResponse.json({ error: 'No image file provided' }, { status: 400 });
  }

  const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  const mediaType = allowedTypes.includes(imageFile.type)
    ? (imageFile.type as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif')
    : 'image/png';

  const buffer = await imageFile.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  let text = '';
  try {
    const result = await model.generateContent([
      { text: OCR_PROMPT },
      { inlineData: { mimeType: mediaType, data: base64 } },
    ]);
    text = result.response.text().trim();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isQuotaError = /quota|429|RESOURCE_EXHAUSTED/i.test(message);
    console.error('[OCR] Gemini API error:', message);
    return NextResponse.json(
      {
        error: isQuotaError
          ? 'Daily OCR limit reached (1,500 free requests/day). Try again tomorrow or contact the administrator.'
          : 'Vision service temporarily unavailable. The browser OCR fallback will be used instead.',
        fallback: true,
      },
      { status: 503 },
    );
  }

  let structuredRows: Record<string, string>[] | null = null;
  let extraColumns: string[] = [];
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { headers?: string[]; rows?: Record<string, string>[] };
      if (Array.isArray(parsed.rows) && parsed.rows.length > 0) {
        structuredRows = parsed.rows;
        const coreSet = new Set<string>([...CORE_OT_COLUMNS, ...STANDARD_COLUMN_ALIASES]);
        extraColumns = (parsed.headers ?? Object.keys(parsed.rows[0] ?? {})).filter(
          (h) => !coreSet.has(h),
        );
      }
    }
  } catch {
    // JSON parse failed — text-based fallback runs on the client
  }

  return NextResponse.json({
    attempts: [
      {
        label: 'gemini vision',
        text,
        tsv: null,
        confidence: 95,
        rows: structuredRows,
        extraColumns,
      },
    ],
  });
}
