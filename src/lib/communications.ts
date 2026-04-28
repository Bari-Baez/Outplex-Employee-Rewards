import type {
  AnnouncementBlock,
  AnnouncementDurationDays,
  AnnouncementImageBlock,
  AnnouncementPdfBlock,
  AnnouncementSlide,
  AnnouncementSliderBlock,
  AnnouncementTextBlock,
  AnnouncementPdfDisplayMode,
  BroadcastNotificationCategory,
} from '@/types/database';

export const COMMUNICATIONS_TIME_ZONE = 'America/Santo_Domingo';
export const ANNOUNCEMENT_DURATION_OPTIONS = [1, 3, 5, 7, 15, 30, 60] as const satisfies readonly AnnouncementDurationDays[];
export const BROADCAST_NOTIFICATION_LIMIT_PER_DAY = 3;

export function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createAnnouncementTextBlock(): AnnouncementTextBlock {
  return {
    id: createId('text'),
    type: 'text',
    heading: '',
    body: '',
  };
}

export function createAnnouncementImageBlock(): AnnouncementImageBlock {
  return {
    id: createId('image'),
    type: 'image',
    heading: '',
    imageUrl: '',
    caption: '',
    body: '',
  };
}

export function createAnnouncementSlide(): AnnouncementSlide {
  return {
    id: createId('slide'),
    imageUrl: '',
    caption: '',
    body: '',
  };
}

export function createAnnouncementSliderBlock(): AnnouncementSliderBlock {
  return {
    id: createId('slider'),
    type: 'slider',
    heading: '',
    body: '',
    slides: [createAnnouncementSlide()],
  };
}

export function createAnnouncementPdfBlock(): AnnouncementPdfBlock {
  return {
    id: createId('pdf'),
    type: 'pdf',
    heading: '',
    body: '',
    fileUrl: '',
    fileName: '',
    displayMode: 'document',
    previewImages: [],
  };
}

export function announcementDurationLabel(value: AnnouncementDurationDays | number) {
  return `${value} day${value === 1 ? '' : 's'}`;
}

export function getBroadcastCategoryLabel(value: BroadcastNotificationCategory | string) {
  switch (value) {
    case 'availability':
      return 'Availability';
    case 'stock':
      return 'Stock update';
    case 'site_visit':
      return 'Site visit';
    default:
      return 'General';
  }
}

export function formatCommunicationDate(iso: string | null | undefined, options?: Intl.DateTimeFormatOptions) {
  if (!iso) return 'Pending';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Pending';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: COMMUNICATIONS_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...options,
  }).format(date);
}

export function getCommunicationDateKey(iso: string | Date) {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: COMMUNICATIONS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function toDateTimeLocalInputValue(iso: string | null | undefined) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : [];
}

function normalizeSlides(value: unknown) {
  if (!Array.isArray(value)) return [] as AnnouncementSlide[];
  const slides: AnnouncementSlide[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const candidate = entry as Record<string, unknown>;
    const imageUrl = normalizeString(candidate.imageUrl).trim();
    if (!imageUrl) continue;
    slides.push({
      id: normalizeString(candidate.id).trim() || createId('slide'),
      imageUrl,
      caption: normalizeString(candidate.caption).trim() || '',
      body: normalizeString(candidate.body).trim() || '',
    });
  }

  return slides;
}

export function normalizeAnnouncementBlocks(value: unknown): AnnouncementBlock[] {
  if (!Array.isArray(value)) return [];
  const blocks: AnnouncementBlock[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const candidate = entry as Record<string, unknown>;
    const id = normalizeString(candidate.id).trim() || createId('block');
    const heading = normalizeString(candidate.heading).trim();
    const body = normalizeString(candidate.body).trim();

    if (candidate.type === 'text') {
      if (!body) continue;
      blocks.push({
        id,
        type: 'text',
        heading,
        body,
      });
      continue;
    }

    if (candidate.type === 'image') {
      const imageUrl = normalizeString(candidate.imageUrl).trim();
      if (!imageUrl) continue;
      blocks.push({
        id,
        type: 'image',
        heading,
        imageUrl,
        caption: normalizeString(candidate.caption).trim(),
        body,
      });
      continue;
    }

    if (candidate.type === 'slider') {
      const slides = normalizeSlides(candidate.slides);
      if (slides.length === 0) continue;
      blocks.push({
        id,
        type: 'slider',
        heading,
        body,
        slides,
      });
      continue;
    }

    if (candidate.type === 'pdf') {
      const fileUrl = normalizeString(candidate.fileUrl).trim();
      if (!fileUrl) continue;
      const displayMode = normalizeString(candidate.displayMode).trim() as AnnouncementPdfDisplayMode;
      blocks.push({
        id,
        type: 'pdf',
        heading,
        body,
        fileUrl,
        fileName: normalizeString(candidate.fileName).trim(),
        displayMode: displayMode === 'slider' || displayMode === 'both' ? displayMode : 'document',
        previewImages: normalizeStringArray(candidate.previewImages),
      });
    }
  }

  return blocks;
}

export function countAnnouncementAssets(blocks: AnnouncementBlock[]) {
  return blocks.reduce(
    (acc, block) => {
      if (block.type === 'image') {
        acc.images += 1;
      }
      if (block.type === 'slider') {
        acc.slides += block.slides.length;
      }
      if (block.type === 'pdf') {
        acc.pdfs += 1;
        acc.slides += block.previewImages?.length ?? 0;
      }
      return acc;
    },
    { images: 0, slides: 0, pdfs: 0 },
  );
}
