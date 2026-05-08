import { type NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 30;

const METRICS_PROMPT = `You are reading a call-center performance / bonus metrics table image.
Extract every agent row and return a JSON object.

Output format:
{
  "rows": [
    {"name": "Silegal Ramirez", "opx_id": "4548", "attendance": "80.63", "total_bonus": "15.00"}
  ]
}

Rules:
- "name": agent's full name. The column header is usually "Agent Name".
- "opx_id": the numeric ID in the first or second column (labeled "OPX ID", "Emp ID", etc.). Use "" if not visible.
- "attendance": attendance percentage as a plain number WITHOUT the % sign (e.g. "80.63", "100.00"). The column header contains "Attend" or "Attendance".
- "total_bonus": the TOTAL bonus amount for that agent as a plain number WITHOUT the $ sign. This is the LAST bonus column, typically labeled "Total Bonus Voice", "Total Bonus", or the rightmost money column. If the value is "$15.00" write "15.00". If empty or zero, write "0".
- Skip any "Grand Total" row and any header rows.
- Skip rows where the agent name is empty.
- Return ONLY valid JSON, no markdown fences or explanations.`;

export interface MetricsOcrRow {
  name: string;
  opx_id: string;
  attendance: string;
  total_bonus: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OCR service not configured.', fallback: true }, { status: 503 });
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
      { text: METRICS_PROMPT },
      { inlineData: { mimeType: mediaType, data: base64 } },
    ]);
    text = result.response.text().trim();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isQuota = /quota|429|RESOURCE_EXHAUSTED/i.test(message);
    console.error('[OCR/metrics] Gemini error:', message);
    return NextResponse.json(
      {
        error: isQuota
          ? 'Daily OCR limit reached. Try again tomorrow.'
          : 'Vision service temporarily unavailable.',
        fallback: true,
      },
      { status: 503 },
    );
  }

  let rows: MetricsOcrRow[] = [];
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { rows?: MetricsOcrRow[] };
      if (Array.isArray(parsed.rows)) {
        rows = parsed.rows.filter((r) => r.name && r.name.trim().length > 1);
      }
    }
  } catch {
    // JSON parse failed — caller will fall back to Tesseract
  }

  return NextResponse.json({ rows, rawText: text });
}
