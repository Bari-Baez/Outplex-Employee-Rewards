/* eslint-disable @next/next/no-img-element */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlignLeft,
  BellRing,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  FileText,
  Film,
  ImagePlus,
  Megaphone,
  Plus,
  Save,
  Search,
  Send,
  SlidersHorizontal,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import { TransferProgress } from '@frontend/shared/ui/TransferProgress';
import { ConfirmDialog } from '@frontend/shared/ui/ConfirmDialog';
import { useTransferState } from '@frontend/shared/hooks/useTransferState';
import { SectionJumpNav, type SectionJumpNavItem } from '@frontend/shared/ui/SectionJumpNav';
import { SplitWorkspace } from '@frontend/shared/ui/SplitWorkspace';
import { StickyActionBar } from '@frontend/shared/ui/StickyActionBar';
import type {
  AnnouncementBlock,
  AnnouncementDurationDays,
  AnnouncementGifBlock,
  AnnouncementPdfBlock,
  AnnouncementSliderBlock,
  AnnouncementTextBlock,
  BroadcastNotification,
  BroadcastNotificationCategory,
  CompanyAnnouncement,
} from '@shared/contracts/database';
import {
  ANNOUNCEMENT_DURATION_OPTIONS,
  BROADCAST_NOTIFICATION_LIMIT_PER_DAY,
  announcementDurationLabel,
  createAnnouncementGifBlock,
  createAnnouncementImageBlock,
  createAnnouncementPdfBlock,
  createAnnouncementSlide,
  createAnnouncementSliderBlock,
  createAnnouncementTextBlock,
  formatCommunicationDate,
  getBroadcastCategoryLabel,
  getCommunicationDateKey,
  toDateTimeLocalInputValue,
} from '@backend/modules/communications/domain/announcements';
import { AnnouncementRenderer } from '@frontend/modules/communications/ui/AnnouncementRenderer';
import { useAppAvailability } from '@frontend/modules/shell/ui/AppAvailabilityProvider';
import { readFileAsDataUrlWithProgress } from '@frontend/shared/lib/file-transfer';
import { ModernSelect } from '@frontend/shared/ui/Select';
import { ModernDatePicker } from '@frontend/shared/ui/DatePicker';
import { ModernTimePicker } from '@frontend/shared/ui/TimePicker';
import { proxifyMediaUrl } from '@frontend/shared/lib/media-proxy';
import { scrollToSectionWithHighlight } from '@frontend/shared/lib/scroll-focus';

type StudioTab = 'notifications' | 'announcements';
type BroadcastAction = 'draft' | 'scheduled' | 'published';
type NoticeTone = 'default' | 'danger' | 'success';

interface BroadcastFormState {
  title: string;
  message: string;
  category: BroadcastNotificationCategory;
  action: BroadcastAction;
  publishAt: string;
}

interface AnnouncementFormState {
  title: string;
  excerpt: string;
  coverImageUrl: string;
  content: AnnouncementBlock[];
  durationDays: AnnouncementDurationDays;
  action: BroadcastAction;
  publishAt: string;
}

function createEmptyBroadcastForm(): BroadcastFormState {
  return {
    title: '',
    message: '',
    category: 'general',
    action: 'draft',
    publishAt: '',
  };
}

function createEmptyAnnouncementForm(): AnnouncementFormState {
  return {
    title: '',
    excerpt: '',
    coverImageUrl: '',
    content: [createAnnouncementTextBlock()],
    durationDays: 7,
    action: 'draft',
    publishAt: '',
  };
}

async function extractPdfPreviewImages(file: File) {
  // Avoid CDN workers (often blocked on corporate networks). We ship the worker in `public/pdfjs` via postinstall.
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';

  const pdf = await pdfjs.getDocument({
    data: await file.arrayBuffer(),
  }).promise;
  const images: string[] = [];

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex);
    const viewport = page.getViewport({ scale: 1.35 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Unable to prepare the PDF preview canvas.');
    }

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvas, canvasContext: context, viewport }).promise;
    images.push(canvas.toDataURL('image/jpeg', 0.92));
  }

  return images;
}

async function readJsonSafely<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function scrollToCommunicationSection(id: string) {
  scrollToSectionWithHighlight(id);
}

function getAnnouncementBlockAnchorId(blockId: string) {
  return `announcement-block-${blockId}`;
}

function serializeBroadcastForm(form: BroadcastFormState) {
  return JSON.stringify(form);
}

function serializeAnnouncementForm(form: AnnouncementFormState) {
  return JSON.stringify(form);
}

function toBroadcastForm(item: BroadcastNotification): BroadcastFormState {
  return {
    title: item.title,
    message: item.message,
    category: (item.category as BroadcastNotificationCategory) ?? 'general',
    action: item.status === 'scheduled' ? 'scheduled' : item.status === 'published' ? 'published' : 'draft',
    publishAt: toDateTimeLocalInputValue(item.publish_at),
  };
}

function toAnnouncementForm(item: CompanyAnnouncement): AnnouncementFormState {
  return {
    title: item.title,
    excerpt: item.excerpt ?? '',
    coverImageUrl: item.cover_image_url ?? '',
    content: item.content.length > 0 ? item.content : [createAnnouncementTextBlock()],
    durationDays: (item.duration_days as AnnouncementDurationDays) ?? 7,
    action: item.status === 'scheduled' ? 'scheduled' : item.status === 'published' ? 'published' : 'draft',
    publishAt: toDateTimeLocalInputValue(item.publish_at),
  };
}

function isPdfBlock(block: AnnouncementBlock): block is AnnouncementPdfBlock {
  return block.type === 'pdf';
}

function isSliderBlock(block: AnnouncementBlock): block is AnnouncementSliderBlock {
  return block.type === 'slider';
}

function isTextBlock(block: AnnouncementBlock): block is AnnouncementTextBlock {
  return block.type === 'text';
}

function isGifBlock(block: AnnouncementBlock): block is AnnouncementGifBlock {
  return block.type === 'gif';
}

interface TenorResult {
  id: string;
  title: string;
  gif: string;    // full-size GIF URL
  tinygif: string; // thumbnail GIF URL
}

export function ModeratorCommunicationsClient({
  currentModeratorName,
  initialBroadcasts,
  initialAnnouncements,
  isStoreLimited = false,
  initialTab = 'notifications',
}: {
  currentModeratorName: string;
  initialBroadcasts: BroadcastNotification[];
  initialAnnouncements: CompanyAnnouncement[];
  isStoreLimited?: boolean;
  initialTab?: StudioTab;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<StudioTab>(initialTab);
  const [broadcasts, setBroadcasts] = useState(initialBroadcasts);
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [broadcastForm, setBroadcastForm] = useState<BroadcastFormState>(createEmptyBroadcastForm());
  const [announcementForm, setAnnouncementForm] = useState<AnnouncementFormState>(createEmptyAnnouncementForm());
  const [editingBroadcastId, setEditingBroadcastId] = useState<string | null>(null);
  const [editingAnnouncementId, setEditingAnnouncementId] = useState<string | null>(null);
  const [busy, setBusy] = useState<'broadcast' | 'announcement' | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'broadcast' | 'announcement'; id: string } | null>(null);
  const [notice, setNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);
  const [activeBroadcastSection, setActiveBroadcastSection] = useState('broadcast-meta');
  const [activeAnnouncementSection, setActiveAnnouncementSection] = useState('announcement-meta');
  const [pdfBusyBlockId, setPdfBusyBlockId] = useState<string | null>(null);
  const [gifQuery, setGifQuery] = useState<Record<string, string>>({});
  const [gifResults, setGifResults] = useState<Record<string, TenorResult[]>>({});
  const [gifSearching, setGifSearching] = useState<Record<string, boolean>>({});
  const gifDebounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const announcementJumpCycleRef = useRef<Record<string, number>>({});
  const transfer = useTransferState({ resetAfterMs: 1500 });
  const { isSectionEnabled } = useAppAvailability();
  const emptyBroadcastSignature = useMemo(() => serializeBroadcastForm(createEmptyBroadcastForm()), []);
  const emptyAnnouncementSignature = useMemo(() => serializeAnnouncementForm(createEmptyAnnouncementForm()), []);
  const [broadcastBaselineSignature, setBroadcastBaselineSignature] = useState(emptyBroadcastSignature);
  const [announcementBaselineSignature, setAnnouncementBaselineSignature] = useState(emptyAnnouncementSignature);

  // Auto-load trending GIFs whenever a GIF block first appears
  const gifBlockIds = announcementForm.content.filter((b) => b.type === 'gif').map((b) => b.id);
  const gifBlockIdsKey = gifBlockIds.join(',');
  useEffect(() => {
    for (const blockId of gifBlockIds) {
      if (!(blockId in gifResults)) {
        setGifSearching((prev) => ({ ...prev, [blockId]: true }));
        fetch('/api/gif/search')
          .then((res) => res.json())
          .then((json: { results: TenorResult[] }) => {
            setGifResults((prev) => ({ ...prev, [blockId]: json.results }));
          })
          .catch(() => { /* silent */ })
          .finally(() => setGifSearching((prev) => ({ ...prev, [blockId]: false })));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gifBlockIdsKey]);

  const isTabPublicEnabled = (tab: StudioTab) =>
    isSectionEnabled('communications', tab, { userRole: isStoreLimited ? 'employee' : 'moderator_a1', bypassForAdmin: false });

  const goToTab = (tab: StudioTab) => {
    setActiveTab(tab);
    router.push(tab === 'notifications' ? '/moderator/communications/notifications' : '/moderator/communications/announcements');
  };

  const broadcastStats = useMemo(() => {
    const todayKey = getCommunicationDateKey(new Date());
    return {
      published: broadcasts.filter((item) => item.status === 'published').length,
      drafts: broadcasts.filter((item) => item.status === 'draft').length,
      today: broadcasts.filter((item) => item.publish_at && getCommunicationDateKey(item.publish_at) === todayKey).length,
    };
  }, [broadcasts]);

  const announcementStats = useMemo(
    () => ({
      published: announcements.filter((item) => item.status === 'published').length,
      scheduled: announcements.filter((item) => item.status === 'scheduled').length,
      drafts: announcements.filter((item) => item.status === 'draft').length,
    }),
    [announcements],
  );
  const isBroadcastDirty = useMemo(
    () => serializeBroadcastForm(broadcastForm) !== broadcastBaselineSignature,
    [broadcastBaselineSignature, broadcastForm],
  );
  const isAnnouncementDirty = useMemo(
    () => serializeAnnouncementForm(announcementForm) !== announcementBaselineSignature,
    [announcementBaselineSignature, announcementForm],
  );

  const targetBroadcastDateKey = useMemo(() => {
    if (broadcastForm.action === 'scheduled' && broadcastForm.publishAt) {
      return getCommunicationDateKey(new Date(broadcastForm.publishAt));
    }
    return getCommunicationDateKey(new Date());
  }, [broadcastForm.action, broadcastForm.publishAt]);

  const targetBroadcastCount = useMemo(() => {
    if (!isStoreLimited) return 0;
    return broadcasts.filter((item) => {
      if (!item.publish_at) return false;
      if (editingBroadcastId && item.id === editingBroadcastId) return false;
      if (!['scheduled', 'published'].includes(item.status)) return false;
      return getCommunicationDateKey(item.publish_at) === targetBroadcastDateKey;
    }).length;
  }, [broadcasts, editingBroadcastId, isStoreLimited, targetBroadcastDateKey]);

  const targetAnnouncementDateKey = useMemo(() => {
    if (announcementForm.action === 'scheduled' && announcementForm.publishAt) {
      return getCommunicationDateKey(new Date(announcementForm.publishAt));
    }
    return getCommunicationDateKey(new Date());
  }, [announcementForm.action, announcementForm.publishAt]);

  const targetAnnouncementCount = useMemo(() => {
    if (!isStoreLimited) return 0;
    return announcements.filter((item) => {
      if (!item.publish_at) return false;
      if (editingAnnouncementId && item.id === editingAnnouncementId) return false;
      if (!['scheduled', 'published'].includes(item.status)) return false;
      return getCommunicationDateKey(item.publish_at) === targetAnnouncementDateKey;
    }).length;
  }, [announcements, editingAnnouncementId, isStoreLimited, targetAnnouncementDateKey]);

  const broadcastIssues = useMemo(() => {
    const issues: Array<{ id: string; label: string; detail: string; tone: 'danger' | 'warning' }> = [];
    if (!broadcastForm.title.trim()) {
      issues.push({ id: 'broadcast-meta', label: 'Falta el título', detail: 'Agrega un título breve antes de guardar o publicar.', tone: 'danger' });
    }
    if (!broadcastForm.message.trim()) {
      issues.push({ id: 'broadcast-message', label: 'Falta el mensaje', detail: 'El cuerpo de la notificación todavía está vacío.', tone: 'warning' });
    }
    if (broadcastForm.action === 'scheduled' && !broadcastForm.publishAt) {
      issues.push({ id: 'broadcast-schedule', label: 'Programa la fecha', detail: 'El modo programado necesita fecha y hora.', tone: 'danger' });
    }
    return issues;
  }, [broadcastForm]);

  const announcementIssues = useMemo(() => {
    const issues: Array<{ id: string; label: string; detail: string; tone: 'danger' | 'warning' }> = [];
    if (!announcementForm.title.trim()) {
      issues.push({ id: 'announcement-meta', label: 'Falta el título', detail: 'Ponle nombre al anuncio para poder encontrarlo rápido.', tone: 'danger' });
    }
    if (announcementForm.action === 'scheduled' && !announcementForm.publishAt) {
      issues.push({ id: 'announcement-schedule', label: 'Falta la fecha programada', detail: 'El modo Schedule necesita fecha y hora.', tone: 'danger' });
    }
    if (announcementForm.content.length === 0) {
      issues.push({ id: 'announcement-blocks', label: 'No hay bloques de contenido', detail: 'Añade al menos un bloque antes de publicarlo.', tone: 'warning' });
    }
    return issues;
  }, [announcementForm]);

  const broadcastJumpItems = useMemo<SectionJumpNavItem[]>(() => ([
    { id: 'broadcast-meta', label: 'Título y tipo', tone: broadcastIssues.some((issue) => issue.id === 'broadcast-meta') ? 'danger' as const : 'default' as const },
    { id: 'broadcast-message', label: 'Texto', tone: broadcastIssues.some((issue) => issue.id === 'broadcast-message') ? 'warning' as const : 'default' as const },
    { id: 'broadcast-delivery', label: 'Cómo se publica' },
    { id: 'broadcast-schedule', label: 'Fecha y hora', tone: broadcastIssues.some((issue) => issue.id === 'broadcast-schedule') ? 'danger' as const : 'default' as const },
  ]), [broadcastIssues]);

  const announcementJumpItems = useMemo<SectionJumpNavItem[]>(() => ([
    { id: 'announcement-meta', label: 'Título y vigencia', tone: announcementIssues.some((issue) => issue.id === 'announcement-meta') ? 'danger' as const : 'default' as const },
    { id: 'announcement-excerpt', label: 'Resumen' },
    { id: 'announcement-cover', label: 'Portada' },
    { id: 'announcement-blocks', label: 'Contenido', badge: announcementForm.content.length, tone: announcementIssues.some((issue) => issue.id === 'announcement-blocks') ? 'warning' as const : 'default' as const },
    { id: 'announcement-schedule', label: 'Fecha y hora', tone: announcementIssues.some((issue) => issue.id === 'announcement-schedule') ? 'danger' as const : 'default' as const },
  ]), [announcementForm.content.length, announcementIssues]);

  const announcementBlockGroups = useMemo(() => {
    const groups: Record<'text' | 'image' | 'slider' | 'pdf' | 'gif', string[]> = {
      text: [],
      image: [],
      slider: [],
      pdf: [],
      gif: [],
    };

    announcementForm.content.forEach((block) => {
      if (block.type in groups) {
        groups[block.type as keyof typeof groups].push(getAnnouncementBlockAnchorId(block.id));
      }
    });

    return groups;
  }, [announcementForm.content]);

  const stickyBroadcastJumpItems = useMemo(
    () =>
      broadcastJumpItems.map((item) => ({
        ...item,
        label:
          item.id === 'broadcast-meta'
            ? 'Meta'
            : item.id === 'broadcast-message'
              ? 'Mensaje'
              : item.id === 'broadcast-delivery'
                ? 'Entrega'
                : 'Programación',
        icon:
          item.id === 'broadcast-meta'
            ? <Megaphone size={14} />
            : item.id === 'broadcast-message'
              ? <AlignLeft size={14} />
              : item.id === 'broadcast-delivery'
                ? <BellRing size={14} />
                : <CalendarDays size={14} />,
        disabled: item.id === 'broadcast-schedule' ? broadcastForm.action !== 'scheduled' : item.disabled,
      })),
    [broadcastForm.action, broadcastJumpItems],
  );

  const stickyAnnouncementJumpItems = useMemo(() => {
    const baseItems = announcementJumpItems
      .filter((item) => item.id !== 'announcement-blocks')
      .map((item) => ({
        ...item,
        label:
          item.id === 'announcement-meta'
            ? 'Meta'
            : item.id === 'announcement-excerpt'
              ? 'Extracto'
              : item.id === 'announcement-cover'
                ? 'Cover'
                : 'Programación',
        icon:
          item.id === 'announcement-meta'
            ? <Megaphone size={14} />
            : item.id === 'announcement-excerpt'
              ? <AlignLeft size={14} />
              : item.id === 'announcement-cover'
                ? <ImagePlus size={14} />
                : <CalendarDays size={14} />,
        disabled: item.id === 'announcement-schedule' ? announcementForm.action !== 'scheduled' : item.disabled,
      }));

    const blockItems: SectionJumpNavItem[] = [];
    if (announcementBlockGroups.text.length > 0) {
      blockItems.push({ id: 'announcement-block-type:text', label: 'Texto', icon: <AlignLeft size={14} />, badge: announcementBlockGroups.text.length });
    }
    if (announcementBlockGroups.image.length > 0) {
      blockItems.push({ id: 'announcement-block-type:image', label: 'Imagen', icon: <ImagePlus size={14} />, badge: announcementBlockGroups.image.length });
    }
    if (announcementBlockGroups.slider.length > 0) {
      blockItems.push({ id: 'announcement-block-type:slider', label: 'Slider', icon: <SlidersHorizontal size={14} />, badge: announcementBlockGroups.slider.length });
    }
    if (announcementBlockGroups.pdf.length > 0) {
      blockItems.push({ id: 'announcement-block-type:pdf', label: 'PDF', icon: <FileText size={14} />, badge: announcementBlockGroups.pdf.length });
    }
    if (announcementBlockGroups.gif.length > 0) {
      blockItems.push({ id: 'announcement-block-type:gif', label: 'GIF', icon: <Film size={14} />, badge: announcementBlockGroups.gif.length });
    }

    return [...baseItems.slice(0, 3), ...blockItems, ...baseItems.slice(3)];
  }, [announcementBlockGroups, announcementForm.action, announcementJumpItems]);

  const jumpToBroadcastSection = useCallback((id: string) => {
    setActiveBroadcastSection(id);
    scrollToCommunicationSection(id);
  }, []);

  const jumpToAnnouncementSection = useCallback((id: string) => {
    setActiveAnnouncementSection(id);

    if (id.startsWith('announcement-block-type:')) {
      const blockType = id.replace('announcement-block-type:', '') as keyof typeof announcementBlockGroups;
      const targets = announcementBlockGroups[blockType] ?? [];
      if (targets.length === 0) return;
      const currentIndex = announcementJumpCycleRef.current[id] ?? 0;
      const nextTarget = targets[currentIndex % targets.length];
      announcementJumpCycleRef.current[id] = (currentIndex + 1) % targets.length;
      scrollToCommunicationSection(nextTarget);
      return;
    }

    scrollToCommunicationSection(id);
  }, [announcementBlockGroups]);

  const previewAnnouncement: CompanyAnnouncement = useMemo(
    () => ({
      id: editingAnnouncementId ?? 'preview',
      title: announcementForm.title || 'Announcement preview',
      excerpt: announcementForm.excerpt || 'The short summary appears here before the employee opens the full announcement.',
      cover_image_url: announcementForm.coverImageUrl || null,
      content: announcementForm.content,
      duration_days: announcementForm.durationDays,
      status: announcementForm.action,
      publish_at:
        announcementForm.action === 'scheduled'
          ? announcementForm.publishAt
            ? new Date(announcementForm.publishAt).toISOString()
            : null
          : announcementForm.action === 'published'
            ? new Date().toISOString()
            : null,
      expires_at: null,
      created_by: null,
      updated_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      author: { id: 'preview', name: currentModeratorName, avatar_url: null, role: 'moderator' },
    }),
    [announcementForm, currentModeratorName, editingAnnouncementId],
  );

  const resetBroadcastEditor = () => {
    const emptyForm = createEmptyBroadcastForm();
    setEditingBroadcastId(null);
    setBroadcastForm(emptyForm);
    setBroadcastBaselineSignature(serializeBroadcastForm(emptyForm));
    setActiveBroadcastSection('broadcast-meta');
  };

  const resetAnnouncementEditor = () => {
    const emptyForm = createEmptyAnnouncementForm();
    setEditingAnnouncementId(null);
    setAnnouncementForm(emptyForm);
    setAnnouncementBaselineSignature(serializeAnnouncementForm(emptyForm));
    setActiveAnnouncementSection('announcement-meta');
    announcementJumpCycleRef.current = {};
  };

  const handleBroadcastTemplate = (template: 'available' | 'stock' | 'site') => {
    if (template === 'available') {
      setBroadcastForm((current) => ({
        ...current,
        title: 'Support Opportunity: Extra Capacity Required',
        message: 'We are looking for team members with extra capacity during today\'s shift. If you are available to support other areas, please coordinate with your Team Lead. We appreciate your dedication!',
        category: 'availability',
      }));
      return;
    }

    if (template === 'stock') {
      setBroadcastForm((current) => ({
        ...current,
        title: 'Inventory Update: Rewards Store Refreshed',
        message: 'The Employee Store has been updated with new stock and exclusive rewards! Visit the store dashboard now to redeem your points while supplies last. Happy shopping!',
        category: 'stock',
      }));
      return;
    }

    setBroadcastForm((current) => ({
      ...current,
      title: 'Engagement Reminder: Scheduled Site Visit',
      message: 'A collective site visit is scheduled for this Tuesday at 3:00 PM. All team members, including those working remotely, are encouraged to confirm their participation. See you there!',
      category: 'site_visit',
    }));
  };

  const upsertBroadcast = (item: BroadcastNotification) => {
    setBroadcasts((current) => {
      const existingIndex = current.findIndex((entry) => entry.id === item.id);
      if (existingIndex === -1) {
        return [item, ...current];
      }
      const next = [...current];
      next[existingIndex] = item;
      return next.sort((left, right) => right.updated_at.localeCompare(left.updated_at));
    });
  };

  const upsertAnnouncement = (item: CompanyAnnouncement) => {
    setAnnouncements((current) => {
      const existingIndex = current.findIndex((entry) => entry.id === item.id);
      if (existingIndex === -1) {
        return [item, ...current];
      }
      const next = [...current];
      next[existingIndex] = item;
      return next.sort((left, right) => right.updated_at.localeCompare(left.updated_at));
    });
  };

  const handleSaveBroadcast = async () => {
    setBusy('broadcast');
    setNotice(null);
    try {
      const endpoint = editingBroadcastId
        ? `/api/communications/broadcasts/${editingBroadcastId}`
        : '/api/communications/broadcasts';
      const method = editingBroadcastId ? 'PATCH' : 'POST';
      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: broadcastForm.title,
          message: broadcastForm.message,
          category: broadcastForm.category,
          action: broadcastForm.action,
          publishAt: broadcastForm.publishAt ? new Date(broadcastForm.publishAt).toISOString() : null,
        }),
      });
      const payload = await readJsonSafely<{ error?: string; broadcast?: BroadcastNotification }>(response);
      if (!response.ok || !payload?.broadcast) {
        throw new Error(payload?.error ?? 'Unable to save the notification.');
      }
      upsertBroadcast(payload.broadcast);
      resetBroadcastEditor();
      setNotice({
        tone: 'success',
        message:
          broadcastForm.action === 'published'
            ? 'Notification delivered to employees.'
            : broadcastForm.action === 'scheduled'
              ? 'Notification scheduled successfully.'
              : 'Draft saved.',
      });
    } catch (error) {
      setNotice({ tone: 'danger', message: error instanceof Error ? error.message : 'Unable to save the notification.' });
    } finally {
      setBusy(null);
    }
  };

  const handleDeleteBroadcast = async (broadcastId: string) => {
    try {
      const response = await fetch(`/api/communications/broadcasts/${broadcastId}`, { method: 'DELETE' });
      const payload = await readJsonSafely<{ error?: string }>(response);
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Unable to delete the notification.');
      }
      setBroadcasts((current) => current.filter((entry) => entry.id !== broadcastId));
      if (editingBroadcastId === broadcastId) {
        resetBroadcastEditor();
      }
      setNotice({ tone: 'success', message: 'Notification deleted.' });
    } catch (error) {
      setNotice({ tone: 'danger', message: error instanceof Error ? error.message : 'Unable to delete the notification.' });
    }
  };

  const updateAnnouncementBlock = (blockId: string, updater: (block: AnnouncementBlock) => AnnouncementBlock) => {
    setAnnouncementForm((current) => ({
      ...current,
      content: current.content.map((block) => (block.id === blockId ? updater(block) : block)),
    }));
  };

  const addAnnouncementBlock = (type: 'text' | 'image' | 'slider' | 'pdf' | 'gif') => {
    setAnnouncementForm((current) => ({
      ...current,
      content: [
        ...current.content,
        type === 'text'
          ? createAnnouncementTextBlock()
          : type === 'image'
            ? createAnnouncementImageBlock()
            : type === 'slider'
              ? createAnnouncementSliderBlock()
              : type === 'gif'
                ? createAnnouncementGifBlock()
                : createAnnouncementPdfBlock(),
      ],
    }));
  };

  const removeAnnouncementBlock = (blockId: string) => {
    setAnnouncementForm((current) => ({
      ...current,
      content: current.content.filter((block) => block.id !== blockId),
    }));
  };

  const moveAnnouncementBlock = (blockId: string, direction: -1 | 1) => {
    setAnnouncementForm((current) => {
      const index = current.content.findIndex((block) => block.id === blockId);
      if (index === -1) return current;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.content.length) return current;
      const nextContent = [...current.content];
      const [item] = nextContent.splice(index, 1);
      nextContent.splice(nextIndex, 0, item);
      return { ...current, content: nextContent };
    });
  };

  const handleAnnouncementCoverUpload = async (file: File) => {
    try {
      transfer.start(file.name);
      const dataUrl = await readFileAsDataUrlWithProgress(file, { onProgress: transfer.setProgress });
      setAnnouncementForm((current) => ({ ...current, coverImageUrl: dataUrl }));
      transfer.succeed('Imported');
    } catch (error) {
      setNotice({ tone: 'danger', message: error instanceof Error ? error.message : 'Unable to upload the cover image.' });
      transfer.fail('Failed');
    }
  };

  const handleBlockImageUpload = async (blockId: string, file: File) => {
    try {
      transfer.start(file.name);
      const dataUrl = await readFileAsDataUrlWithProgress(file, { onProgress: transfer.setProgress });
      updateAnnouncementBlock(blockId, (block) =>
        block.type === 'image' ? { ...block, imageUrl: dataUrl } : block,
      );
      transfer.succeed('Imported');
    } catch (error) {
      setNotice({ tone: 'danger', message: error instanceof Error ? error.message : 'Unable to upload the image.' });
      transfer.fail('Failed');
    }
  };

  const handleSliderImageUpload = async (blockId: string, slideId: string, file: File) => {
    try {
      transfer.start(file.name);
      const dataUrl = await readFileAsDataUrlWithProgress(file, { onProgress: transfer.setProgress });
      updateAnnouncementBlock(blockId, (block) => {
        if (!isSliderBlock(block)) return block;
        return {
          ...block,
          slides: block.slides.map((slide) => (slide.id === slideId ? { ...slide, imageUrl: dataUrl } : slide)),
        };
      });
      transfer.succeed('Imported');
    } catch (error) {
      setNotice({ tone: 'danger', message: error instanceof Error ? error.message : 'Unable to upload the slide image.' });
      transfer.fail('Failed');
    }
  };

  const handlePdfUpload = async (blockId: string, file: File) => {
    setPdfBusyBlockId(blockId);
    setNotice(null);
    try {
      transfer.start(file.name);
      const dataUrl = await readFileAsDataUrlWithProgress(file, { onProgress: transfer.setProgress });
      transfer.setProgress(100);
      transfer.setMessage('Rendering preview...');
      const previewImages = await extractPdfPreviewImages(file);
      updateAnnouncementBlock(blockId, (block) => {
        if (!isPdfBlock(block)) return block;
        return {
          ...block,
          fileUrl: dataUrl,
          fileName: file.name,
          previewImages,
        };
      });
      setNotice({ tone: 'success', message: `Imported ${previewImages.length} PDF page(s) for the slider preview.` });
      transfer.succeed('Imported');
    } catch (error) {
      setNotice({ tone: 'danger', message: error instanceof Error ? error.message : 'Unable to import the PDF.' });
      transfer.fail('Failed');
    } finally {
      setPdfBusyBlockId(null);
    }
  };

  const handleGifSearch = useCallback(async (blockId: string, query: string) => {
    setGifSearching((prev) => ({ ...prev, [blockId]: true }));
    try {
      const params = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : '';
      const res = await fetch(`/api/gif/search${params}`);
      if (!res.ok) throw new Error(`GIF search error ${res.status}`);
      const json = (await res.json()) as { results: TenorResult[] };
      setGifResults((prev) => ({ ...prev, [blockId]: json.results }));
    } catch {
      // silently fail
    } finally {
      setGifSearching((prev) => ({ ...prev, [blockId]: false }));
    }
  }, []);

  const handleSaveAnnouncement = async () => {
    setBusy('announcement');
    setNotice(null);
    try {
      const baseEndpoint = isStoreLimited ? '/api/communications/employee-announcements' : '/api/communications/announcements';
      const endpoint = editingAnnouncementId
        ? `${baseEndpoint}/${editingAnnouncementId}`
        : baseEndpoint;
      const method = editingAnnouncementId ? 'PATCH' : 'POST';
      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: announcementForm.title,
          excerpt: announcementForm.excerpt,
          coverImageUrl: announcementForm.coverImageUrl,
          content: announcementForm.content,
          durationDays: announcementForm.durationDays,
          action: announcementForm.action,
          publishAt: announcementForm.publishAt ? new Date(announcementForm.publishAt).toISOString() : null,
        }),
      });
      const payload = await readJsonSafely<{ error?: string; announcement?: CompanyAnnouncement }>(response);
      if (!response.ok || !payload?.announcement) {
        throw new Error(payload?.error ?? 'Unable to save the announcement.');
      }
      upsertAnnouncement(payload.announcement);
      resetAnnouncementEditor();
      setNotice({
        tone: 'success',
        message:
          announcementForm.action === 'published'
            ? 'Announcement published successfully.'
            : announcementForm.action === 'scheduled'
              ? 'Announcement scheduled successfully.'
              : 'Announcement draft saved.',
      });
    } catch (error) {
      setNotice({ tone: 'danger', message: error instanceof Error ? error.message : 'Unable to save the announcement.' });
    } finally {
      setBusy(null);
    }
  };

  const handleDeleteAnnouncement = async (announcementId: string) => {
    try {
      const baseEndpoint = isStoreLimited ? '/api/communications/employee-announcements' : '/api/communications/announcements';
      const response = await fetch(`${baseEndpoint}/${announcementId}`, { method: 'DELETE' });
      const payload = await readJsonSafely<{ error?: string }>(response);
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Unable to delete the announcement.');
      }
      setAnnouncements((current) => current.filter((entry) => entry.id !== announcementId));
      if (editingAnnouncementId === announcementId) {
        resetAnnouncementEditor();
      }
      setNotice({ tone: 'success', message: 'Announcement deleted.' });
    } catch (error) {
      setNotice({ tone: 'danger', message: error instanceof Error ? error.message : 'Unable to delete the announcement.' });
    }
  };

  return (
    <div className="communications-shell">
      <section className="communications-hero card animate-fade-in">
        <div>
          <div className="communications-kicker">{isStoreLimited ? 'Store Owner Tools' : 'Moderator tools'}</div>
          <h1 className="communications-title">Communications Studio</h1>
          <p className="communications-subtitle">
            {isStoreLimited 
              ? 'Publish employee announcements (1 per day) and store notifications (3 per day).'
              : 'Publish company notifications and manage announcement stories with cover art, sliders, PDF reading mode, drafts, and scheduled releases.'}
          </p>
        </div>
        <div className="communications-tab-row">
          <button
            type="button"
            className={`communications-tab-chip ${activeTab === 'notifications' ? 'communications-tab-chip-active' : ''} ${!isTabPublicEnabled('notifications') ? 'communications-tab-chip-maint' : ''}`}
            onClick={() => goToTab('notifications')}
            title={!isTabPublicEnabled('notifications') ? 'Esta sección está deshabilitada temporalmente por mantenimiento.' : undefined}
          >
            <BellRing size={15} />
            Notifications
            {!isTabPublicEnabled('notifications') && (
              <span className="communications-maint-pill">
                <Wrench size={13} /> MAINT
              </span>
            )}
          </button>
          <button
            type="button"
            className={`communications-tab-chip ${activeTab === 'announcements' ? 'communications-tab-chip-active' : ''} ${!isTabPublicEnabled('announcements') ? 'communications-tab-chip-maint' : ''}`}
            onClick={() => goToTab('announcements')}
            title={!isTabPublicEnabled('announcements') ? 'Esta sección está deshabilitada temporalmente por mantenimiento.' : undefined}
          >
            <Megaphone size={15} />
            Announcements
            {!isTabPublicEnabled('announcements') && (
              <span className="communications-maint-pill">
                <Wrench size={13} /> MAINT
              </span>
            )}
          </button>
        </div>
        <div className="communications-transfer">
          <TransferProgress state={transfer.state} compact />
        </div>
      </section>

      {notice ? (
        <div className={`communications-notice communications-notice-${notice.tone}`}>{notice.message}</div>
      ) : null}

      {activeTab === 'notifications' ? (
        <SplitWorkspace
          primaryLabel="Compose"
          secondaryLabel="Queue"
          panelMaxHeight="calc(100vh - 14rem)"
          className="communications-workspace"
          primaryPanelClassName="communications-workspace-panel"
          secondaryPanelClassName="communications-workspace-panel"
          primary={
            <>
          <section className="card studio-panel">
            <div className="studio-panel-header">
              <div>
                <h2>
                  {editingBroadcastId
                    ? isStoreLimited
                      ? 'Edit store notification'
                      : 'Edit company notification'
                    : isStoreLimited
                      ? 'Create store notification'
                      : 'Create company notification'}
                </h2>
                <p>
                  {isStoreLimited
                    ? 'Short broadcasts delivered to every employee. Store owners are limited to 3 per day.'
                    : 'Short broadcasts delivered to every employee and visible in the notifications hub.'}
                </p>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={resetBroadcastEditor}>
                Reset
              </button>
            </div>

            <div className="studio-stats-row">
              <div className="studio-stat-card"><strong>{broadcastStats.published}</strong><span>Published</span></div>
              <div className="studio-stat-card"><strong>{broadcastStats.drafts}</strong><span>Drafts</span></div>
              <div className="studio-stat-card"><strong>{broadcastStats.today}</strong><span>Today</span></div>
            </div>

            {broadcastIssues.length > 0 ? (
              <div className="studio-issue-list">
                {broadcastIssues.map((issue) => (
                  <button
                    key={issue.id}
                    type="button"
                    className={`studio-issue-pill studio-issue-pill-${issue.tone}`}
                    onClick={() => jumpToBroadcastSection(issue.id)}
                  >
                    <span>{issue.label}</span>
                    <small>{issue.detail}</small>
                  </button>
                ))}
              </div>
            ) : null}

            <StickyActionBar
              navigation={(
                <SectionJumpNav
                  items={stickyBroadcastJumpItems}
                  activeId={activeBroadcastSection}
                  onSelect={jumpToBroadcastSection}
                  className="studio-sticky-jump-nav"
                />
              )}
              summary={(
                <div className="studio-action-summary">
                  <strong>{editingBroadcastId ? 'Editing notification' : 'New notification'}</strong>
                  <span>{isBroadcastDirty ? 'Unsaved changes' : broadcastForm.action === 'published' ? 'Publish now' : broadcastForm.action === 'scheduled' ? 'Scheduled release' : 'Draft mode'}</span>
                </div>
              )}
              actions={(
                <>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={resetBroadcastEditor} disabled={busy === 'broadcast' || !isBroadcastDirty}>
                    Reset
                  </button>
                  <button type="button" className="btn btn-primary" onClick={() => void handleSaveBroadcast()} disabled={busy === 'broadcast'}>
                    {busy === 'broadcast' ? <Save size={15} /> : broadcastForm.action === 'published' ? <Send size={15} /> : <Save size={15} />}
                    {busy === 'broadcast'
                      ? 'Saving...'
                      : broadcastForm.action === 'published'
                        ? editingBroadcastId
                          ? 'Update and send'
                          : 'Send now'
                        : broadcastForm.action === 'scheduled'
                          ? 'Schedule notification'
                          : 'Save draft'}
                  </button>
                </>
              )}
              mobileActions={(
                <>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={resetBroadcastEditor} disabled={busy === 'broadcast' || !isBroadcastDirty}>
                    Reset
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => void handleSaveBroadcast()} disabled={busy === 'broadcast'}>
                    {busy === 'broadcast' ? '...' : broadcastForm.action === 'published' ? 'Publish' : broadcastForm.action === 'scheduled' ? 'Schedule' : 'Save'}
                  </button>
                </>
              )}
              topOffset="0.75rem"
              bottomOffset="calc(env(safe-area-inset-bottom) + 5.6rem)"
            />

            <div className="studio-template-row">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleBroadcastTemplate('available')}>Available template</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleBroadcastTemplate('stock')}>Stock template</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleBroadcastTemplate('site')}>Site visit template</button>
            </div>

            <div id="broadcast-meta" className="studio-form-grid studio-focus-target">
              <div>
                <label className="studio-label">Title</label>
                <input className="input" value={broadcastForm.title} onChange={(event) => setBroadcastForm((current) => ({ ...current, title: event.target.value }))} placeholder="Example: Store restocked" />
              </div>
              <div>
                <label className="studio-label">Category</label>
                <ModernSelect
                  value={broadcastForm.category}
                  onValueChange={v => setBroadcastForm(current => ({ ...current, category: v as BroadcastNotificationCategory }))}
                  options={[
                    { label: 'General', value: 'general' },
                    { label: 'Availability', value: 'availability' },
                    { label: 'Stock update', value: 'stock' },
                    { label: 'Site visit', value: 'site_visit' }
                  ]}
                />
              </div>
            </div>

            <div id="broadcast-message" className="studio-focus-target" style={{ marginTop: '1rem' }}>
              <label className="studio-label">Message</label>
              <textarea
                className="input studio-textarea"
                value={broadcastForm.message}
                onChange={(event) => setBroadcastForm((current) => ({ ...current, message: event.target.value }))}
                placeholder="Short company-wide update"
              />
            </div>

            <div id="broadcast-delivery" className="studio-focus-target" style={{ marginTop: '1rem' }}>
              <label className="studio-label">Delivery mode</label>
              <div className="studio-mode-row">
                {([
                  ['draft', 'Save draft'],
                  ['scheduled', 'Schedule'],
                  ['published', 'Publish now'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`studio-mode-chip ${broadcastForm.action === value ? 'studio-mode-chip-active' : ''}`}
                    onClick={() => setBroadcastForm((current) => ({ ...current, action: value }))}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {broadcastForm.action === 'scheduled' ? (
              <div id="broadcast-schedule" className="studio-focus-target" style={{ marginTop: '1rem' }}>
                <label className="studio-label">Publish date and time</label>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <ModernDatePicker
                    date={broadcastForm.publishAt.split('T')[0] || ''}
                    onDateChange={v => {
                      const time = broadcastForm.publishAt.split('T')[1] || '00:00';
                      setBroadcastForm(current => ({ ...current, publishAt: `${v}T${time}` }));
                    }}
                  />
                  <ModernTimePicker
                    time={broadcastForm.publishAt.split('T')[1] || ''}
                    onTimeChange={v => {
                      const date = broadcastForm.publishAt.split('T')[0] || new Date().toISOString().split('T')[0];
                      setBroadcastForm(current => ({ ...current, publishAt: `${date}T${v}` }));
                    }}
                  />
                </div>
              </div>
            ) : null}

            {isStoreLimited ? (
              <div className={`studio-hint ${targetBroadcastCount >= BROADCAST_NOTIFICATION_LIMIT_PER_DAY ? 'studio-hint-danger' : ''}`}>
                {targetBroadcastCount >= BROADCAST_NOTIFICATION_LIMIT_PER_DAY
                  ? `This day already has ${targetBroadcastCount} scheduled/published notifications. You have reached the daily limit.`
                  : `${targetBroadcastCount} of ${BROADCAST_NOTIFICATION_LIMIT_PER_DAY} notification slots already used for ${targetBroadcastDateKey}.`}
              </div>
            ) : null}

          </section>
            </>
          }
          secondary={
            <>
          <section className="card studio-panel">
            <div className="studio-panel-header">
              <div>
                <h2>Broadcast queue</h2>
                <p>{isStoreLimited ? 'Your recent notifications.' : 'Everything in one list so moderators can review, edit, or remove a message fast.'}</p>
              </div>
            </div>
            <div className="studio-list">
              {broadcasts.length === 0 ? (
                <div className="studio-empty">{isStoreLimited ? 'No store notifications yet.' : 'No company notifications yet.'}</div>
              ) : (
                broadcasts.map((item) => (
                  <article key={item.id} className="studio-list-card">
                    <div className="studio-list-card-top">
                      <div className={`studio-status-pill studio-status-pill-${item.status}`}>{item.status}</div>
                      <span className="studio-list-date">{formatCommunicationDate(item.publish_at ?? item.created_at)}</span>
                    </div>
                    <h3>{item.title}</h3>
                    <p>{item.message}</p>
                    <div className="studio-list-meta">
                      <span>{getBroadcastCategoryLabel(item.category)}</span>
                      <span>{item.author?.name ?? currentModeratorName}</span>
                    </div>
                    <div className="studio-inline-actions">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          const nextForm = toBroadcastForm(item);
                          setEditingBroadcastId(item.id);
                          setBroadcastForm(nextForm);
                          setBroadcastBaselineSignature(serializeBroadcastForm(nextForm));
                          setActiveBroadcastSection('broadcast-meta');
                        }}
                      >
                        Edit
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm studio-danger-btn" onClick={() => setDeleteConfirm({ type: 'broadcast', id: item.id })}>Delete</button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
            </>
          }
        />
      ) : (
        <SplitWorkspace
          primaryLabel="Build"
          secondaryLabel="Preview"
          panelMaxHeight="calc(100vh - 14rem)"
          className="communications-workspace"
          primaryPanelClassName="communications-workspace-panel"
          secondaryPanelClassName="communications-workspace-panel"
          primary={
            <>
          <section className="card studio-panel">
            <div className="studio-panel-header">
              <div>
                <h2>
                  {editingAnnouncementId
                    ? 'Edit announcement'
                    : isStoreLimited
                      ? 'Build employee announcement'
                      : 'Build company announcement'}
                </h2>
                <p>Draft it, schedule it, or publish it immediately. Expiration is automatic based on the selected duration.</p>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={resetAnnouncementEditor}>
                Reset
              </button>
            </div>

            <div className="studio-stats-row">
              <div className="studio-stat-card"><strong>{announcementStats.published}</strong><span>Published</span></div>
              <div className="studio-stat-card"><strong>{announcementStats.scheduled}</strong><span>Scheduled</span></div>
              <div className="studio-stat-card"><strong>{announcementStats.drafts}</strong><span>Drafts</span></div>
            </div>

            {/* ── Top metadata strip ── */}
            {announcementIssues.length > 0 ? (
              <div className="studio-issue-list">
                {announcementIssues.map((issue) => (
                  <button
                    key={issue.id}
                    type="button"
                    className={`studio-issue-pill studio-issue-pill-${issue.tone}`}
                    onClick={() => jumpToAnnouncementSection(issue.id)}
                  >
                    <span>{issue.label}</span>
                    <small>{issue.detail}</small>
                  </button>
                ))}
              </div>
            ) : null}

            <StickyActionBar
              navigation={(
                <SectionJumpNav
                  items={stickyAnnouncementJumpItems}
                  activeId={activeAnnouncementSection}
                  onSelect={jumpToAnnouncementSection}
                  className="studio-sticky-jump-nav"
                />
              )}
              summary={(
                <div className="studio-action-summary">
                  <strong>{editingAnnouncementId ? 'Editing announcement' : 'New announcement'}</strong>
                  <span>{isAnnouncementDirty ? 'Unsaved changes' : announcementForm.action === 'published' ? 'Publish now' : announcementForm.action === 'scheduled' ? 'Scheduled release' : 'Draft mode'}</span>
                </div>
              )}
              actions={(
                <>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={resetAnnouncementEditor} disabled={busy === 'announcement' || !isAnnouncementDirty}>
                    {editingAnnouncementId ? 'Cancel' : 'Reset'}
                  </button>
                  <button type="button" className="btn btn-primary" onClick={() => void handleSaveAnnouncement()} disabled={busy === 'announcement'}>
                    {busy === 'announcement' ? <Save size={15} /> : announcementForm.action === 'published' ? <Send size={15} /> : <Save size={15} />}
                    {busy === 'announcement'
                      ? 'Saving...'
                      : announcementForm.action === 'published'
                        ? editingAnnouncementId ? 'Update & publish' : 'Publish now'
                        : announcementForm.action === 'scheduled'
                          ? 'Schedule'
                          : 'Save draft'}
                  </button>
                </>
              )}
              mobileActions={(
                <>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={resetAnnouncementEditor} disabled={busy === 'announcement' || !isAnnouncementDirty}>
                    Reset
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => void handleSaveAnnouncement()} disabled={busy === 'announcement'}>
                    {busy === 'announcement' ? '...' : announcementForm.action === 'published' ? 'Publish' : announcementForm.action === 'scheduled' ? 'Schedule' : 'Save'}
                  </button>
                </>
              )}
              topOffset="0.75rem"
              bottomOffset="calc(env(safe-area-inset-bottom) + 5.6rem)"
            />

            <div id="announcement-meta" className="studio-meta-strip studio-focus-target">
              <div className="studio-meta-strip-row">
                <div className="studio-meta-field studio-meta-field-grow">
                  <label className="studio-label">Title</label>
                  <input className="input" value={announcementForm.title} onChange={(event) => setAnnouncementForm((current) => ({ ...current, title: event.target.value }))} placeholder="Announcement title" />
                </div>
                <div className="studio-meta-field">
                  <label className="studio-label">Visible for</label>
                  <ModernSelect
                    value={String(announcementForm.durationDays)}
                    onValueChange={v => setAnnouncementForm(current => ({ ...current, durationDays: Number(v) as AnnouncementDurationDays }))}
                    options={ANNOUNCEMENT_DURATION_OPTIONS.map(value => ({
                      label: announcementDurationLabel(value),
                      value: String(value)
                    }))}
                  />
                </div>
              </div>

              {/* Publication mode — always visible at top */}
              <div id="announcement-schedule" className="studio-pub-mode-row studio-focus-target">
                <span className="studio-pub-mode-label">Publish as:</span>
                <div className="studio-mode-row">
                  {([
                    ['draft', 'Draft'],
                    ['scheduled', 'Schedule'],
                    ['published', 'Publish now'],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={`studio-mode-chip ${announcementForm.action === value ? 'studio-mode-chip-active' : ''}`}
                      onClick={() => setAnnouncementForm((current) => ({ ...current, action: value }))}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {announcementForm.action === 'scheduled' && (
                  <div className="studio-schedule-inline">
                    <ModernDatePicker
                      date={announcementForm.publishAt.split('T')[0] || ''}
                      onDateChange={v => {
                        const time = announcementForm.publishAt.split('T')[1] || '00:00';
                        setAnnouncementForm(current => ({ ...current, publishAt: `${v}T${time}` }));
                      }}
                    />
                    <ModernTimePicker
                      time={announcementForm.publishAt.split('T')[1] || ''}
                      onTimeChange={v => {
                        const date = announcementForm.publishAt.split('T')[0] || new Date().toISOString().split('T')[0];
                        setAnnouncementForm(current => ({ ...current, publishAt: `${date}T${v}` }));
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* ── Excerpt ── */}
            <div id="announcement-excerpt" className="studio-focus-target">
              <label className="studio-label">Excerpt <span className="studio-label-hint">(shown on announcement card)</span></label>
              <textarea
                className="input studio-textarea"
                value={announcementForm.excerpt}
                onChange={(event) => setAnnouncementForm((current) => ({ ...current, excerpt: event.target.value }))}
                placeholder="Short summary shown on the card before the employee opens the full post."
              />
            </div>

            {/* ── Cover image — compact strip ── */}
            <div id="announcement-cover" className="studio-cover-strip studio-focus-target">
              <div className="studio-cover-strip-thumb">
                {announcementForm.coverImageUrl
                  ? <img src={announcementForm.coverImageUrl} alt="Cover" />
                  : <span className="studio-cover-strip-placeholder">No cover</span>}
              </div>
              <div className="studio-cover-strip-right">
                <span className="studio-label">Cover image <span className="studio-label-hint">(optional)</span></span>
                <label className="studio-cover-upload-btn">
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleAnnouncementCoverUpload(file); event.currentTarget.value = ''; }} />
                  Choose image
                </label>
                {announcementForm.coverImageUrl && (
                  <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem' }} onClick={() => setAnnouncementForm(c => ({ ...c, coverImageUrl: '' }))}>Remove</button>
                )}
              </div>
            </div>

            {isStoreLimited ? (
              <div className={`studio-hint ${targetAnnouncementCount >= 1 ? 'studio-hint-danger' : ''}`}>
                {targetAnnouncementCount >= 1
                  ? `You already have an announcement scheduled/published for ${targetAnnouncementDateKey}. You have reached the daily limit.`
                  : `${targetAnnouncementCount} of 1 announcement slots already used for ${targetAnnouncementDateKey}.`}
              </div>
            ) : null}

            {/* ---- Visual block picker ---- */}
            <div id="announcement-blocks" className="studio-focus-target">
              <label className="studio-label" style={{ marginBottom: '0.55rem' }}>Add a content block</label>
              <div className="studio-block-picker">
                {([
                  { type: 'text' as const, icon: <AlignLeft size={18} />, label: 'Text', desc: 'Heading + body paragraph' },
                  { type: 'image' as const, icon: <ImagePlus size={18} />, label: 'Image', desc: 'Single photo with caption' },
                  { type: 'slider' as const, icon: <SlidersHorizontal size={18} />, label: 'Slider', desc: 'Swipeable image gallery' },
                  { type: 'pdf' as const, icon: <FileText size={18} />, label: 'PDF', desc: 'Page-by-page viewer + download' },
                  { type: 'gif' as const, icon: <Film size={18} />, label: 'GIF', desc: 'Animated GIF via Giphy' },
                ]).map(({ type, icon, label, desc }) => (
                  <button
                    key={type}
                    type="button"
                    className="studio-block-pick-btn"
                    onClick={() => addAnnouncementBlock(type)}
                  >
                    <span className="studio-block-pick-icon">{icon}</span>
                    <span className="studio-block-pick-label">{label}</span>
                    <span className="studio-block-pick-desc">{desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="studio-block-list">
              {announcementForm.content.map((block, index) => {
                const blockMeta: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
                  text: { icon: <AlignLeft size={14} />, label: 'Text Block', color: '#a78bfa' },
                  image: { icon: <ImagePlus size={14} />, label: 'Image Block', color: '#34d399' },
                  slider: { icon: <SlidersHorizontal size={14} />, label: 'Slider Block', color: '#f59e0b' },
                  pdf: { icon: <FileText size={14} />, label: 'PDF Block', color: '#60a5fa' },
                  gif: { icon: <Film size={14} />, label: 'GIF Block', color: '#f472b6' },
                };
                const meta = blockMeta[block.type] ?? blockMeta.text;
                return (
                  <div
                    key={block.id}
                    id={getAnnouncementBlockAnchorId(block.id)}
                    className="studio-block-card studio-focus-target"
                    data-block-type={block.type}
                  >
                    <div className="studio-block-head">
                      <div className="studio-block-type-badge" style={{ '--badge-color': meta.color } as React.CSSProperties}>
                        {meta.icon}
                        <span>{meta.label}</span>
                        <span className="studio-block-index">#{index + 1}</span>
                      </div>
                      <div className="studio-block-actions">
                        <button type="button" className="studio-icon-btn" onClick={() => moveAnnouncementBlock(block.id, -1)} disabled={index === 0} title="Move up"><ChevronUp size={15} /></button>
                        <button type="button" className="studio-icon-btn" onClick={() => moveAnnouncementBlock(block.id, 1)} disabled={index === announcementForm.content.length - 1} title="Move down"><ChevronDown size={15} /></button>
                        <button type="button" className="studio-icon-btn studio-icon-btn-danger" onClick={() => removeAnnouncementBlock(block.id)} title="Remove block"><Trash2 size={15} /></button>
                      </div>
                    </div>

                    {block.type === 'text' ? (
                      <div className="studio-form-grid">
                        <div>
                          <label className="studio-label">Heading <span className="studio-label-hint">(optional)</span></label>
                          <input className="input" placeholder="Section heading…" value={block.heading ?? ''} onChange={(event) => updateAnnouncementBlock(block.id, (current) => isTextBlock(current) ? { ...current, heading: event.target.value } : current)} />
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <label className="studio-label">Body text</label>
                          <textarea className="input studio-textarea" placeholder="Write your paragraph here…" value={block.body} onChange={(event) => updateAnnouncementBlock(block.id, (current) => isTextBlock(current) ? { ...current, body: event.target.value } : current)} />
                        </div>
                      </div>
                    ) : null}

                    {block.type === 'image' ? (
                      <div className="studio-block-stack">
                        <div className="studio-form-grid">
                          <div>
                            <label className="studio-label">Heading <span className="studio-label-hint">(optional)</span></label>
                            <input className="input" placeholder="Image section heading…" value={block.heading ?? ''} onChange={(event) => updateAnnouncementBlock(block.id, (current) => current.type === 'image' ? { ...current, heading: event.target.value } : current)} />
                          </div>
                          <div>
                            <label className="studio-label">Upload image</label>
                            <div className="studio-upload-row">
                              <input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleBlockImageUpload(block.id, file); event.currentTarget.value = ''; }} />
                            </div>
                          </div>
                        </div>
                        {block.imageUrl ? <img src={block.imageUrl} alt="Announcement block preview" className="studio-media-preview" /> : null}
                        <div className="studio-form-grid">
                          <div>
                            <label className="studio-label">Caption</label>
                            <input className="input" placeholder="Short caption…" value={block.caption ?? ''} onChange={(event) => updateAnnouncementBlock(block.id, (current) => current.type === 'image' ? { ...current, caption: event.target.value } : current)} />
                          </div>
                          <div>
                            <label className="studio-label">Description <span className="studio-label-hint">(optional)</span></label>
                            <textarea className="input studio-textarea" placeholder="Extra text below the image…" value={block.body ?? ''} onChange={(event) => updateAnnouncementBlock(block.id, (current) => current.type === 'image' ? { ...current, body: event.target.value } : current)} />
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {block.type === 'slider' ? (
                      <div className="studio-block-stack">
                        <div className="studio-form-grid">
                          <div>
                            <label className="studio-label">Slider heading <span className="studio-label-hint">(optional)</span></label>
                            <input className="input" value={block.heading ?? ''} onChange={(event) => updateAnnouncementBlock(block.id, (current) => isSliderBlock(current) ? { ...current, heading: event.target.value } : current)} />
                          </div>
                          <div>
                            <label className="studio-label">Intro text <span className="studio-label-hint">(optional)</span></label>
                            <textarea className="input studio-textarea" value={block.body ?? ''} onChange={(event) => updateAnnouncementBlock(block.id, (current) => isSliderBlock(current) ? { ...current, body: event.target.value } : current)} />
                          </div>
                        </div>
                        <div className="studio-slide-list">
                          {block.slides.map((slide, slideIdx) => (
                            <div key={slide.id} className="studio-slide-card">
                              <div className="studio-slide-head">
                                <span className="studio-label" style={{ margin: 0 }}>Slide {slideIdx + 1}</span>
                                <button type="button" className="studio-icon-btn studio-icon-btn-danger" onClick={() => updateAnnouncementBlock(block.id, (current) => isSliderBlock(current) ? { ...current, slides: current.slides.filter((entry) => entry.id !== slide.id) } : current)} disabled={block.slides.length === 1} title="Remove slide"><Trash2 size={13} /></button>
                              </div>
                              <div className="studio-form-grid">
                                <div>
                                  <label className="studio-label">Slide image</label>
                                  <div className="studio-upload-row">
                                    <input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleSliderImageUpload(block.id, slide.id, file); event.currentTarget.value = ''; }} />
                                  </div>
                                </div>
                                <div>
                                  <label className="studio-label">Caption</label>
                                  <input className="input" value={slide.caption ?? ''} onChange={(event) => updateAnnouncementBlock(block.id, (current) => isSliderBlock(current) ? { ...current, slides: current.slides.map((entry) => entry.id === slide.id ? { ...entry, caption: event.target.value } : entry) } : current)} />
                                </div>
                              </div>
                              {slide.imageUrl ? <img src={proxifyMediaUrl(slide.imageUrl)} alt="Slide preview" className="studio-media-preview" /> : null}
                              <div>
                                <label className="studio-label">Slide text <span className="studio-label-hint">(optional)</span></label>
                                <textarea className="input studio-textarea" value={slide.body ?? ''} onChange={(event) => updateAnnouncementBlock(block.id, (current) => isSliderBlock(current) ? { ...current, slides: current.slides.map((entry) => entry.id === slide.id ? { ...entry, body: event.target.value } : entry) } : current)} />
                              </div>
                            </div>
                          ))}
                        </div>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => updateAnnouncementBlock(block.id, (current) => isSliderBlock(current) ? { ...current, slides: [...current.slides, createAnnouncementSlide()] } : current)}>
                          <Plus size={14} /> Add slide
                        </button>
                      </div>
                    ) : null}

                    {block.type === 'pdf' ? (
                      <div className="studio-block-stack">
                        <div className="studio-hint" style={{ fontSize: '0.82rem' }}>
                          <FileText size={14} style={{ flexShrink: 0 }} />
                          Upload a PDF — each page is automatically converted to a preview image. Employees can swipe through pages and click to zoom.
                        </div>
                        <div className="studio-form-grid">
                          <div>
                            <label className="studio-label">Heading <span className="studio-label-hint">(optional)</span></label>
                            <input className="input" placeholder="PDF section heading…" value={block.heading ?? ''} onChange={(event) => updateAnnouncementBlock(block.id, (current) => isPdfBlock(current) ? { ...current, heading: event.target.value } : current)} />
                          </div>
                          <div>
                            <label className="studio-label">Display mode</label>
                            <ModernSelect
                              value={block.displayMode}
                              onValueChange={v => updateAnnouncementBlock(block.id, (current) => isPdfBlock(current) ? { ...current, displayMode: v as AnnouncementPdfBlock['displayMode'] } : current)}
                              options={[
                                { label: 'Page slider + Download', value: 'slider' },
                                { label: 'Download link only', value: 'download_only' },
                              ]}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="studio-label">PDF file</label>
                          <div className="studio-upload-row">
                            <input type="file" accept="application/pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) void handlePdfUpload(block.id, file); event.currentTarget.value = ''; }} />
                          </div>
                        </div>
                        <div className="studio-form-grid">
                          <div>
                            <label className="studio-label">Description <span className="studio-label-hint">(optional)</span></label>
                            <textarea className="input studio-textarea" placeholder="Brief description of the document…" value={block.body ?? ''} onChange={(event) => updateAnnouncementBlock(block.id, (current) => isPdfBlock(current) ? { ...current, body: event.target.value } : current)} />
                          </div>
                          <div className="studio-pdf-summary">
                            <FileText size={18} />
                            <strong>{block.fileName || 'No PDF selected yet'}</strong>
                            <span>{pdfBusyBlockId === block.id ? 'Extracting pages…' : `${block.previewImages?.length ?? 0} page(s) ready`}</span>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {block.type === 'gif' ? (
                      <div className="studio-block-stack">
                        <div className="studio-form-grid">
                          <div>
                            <label className="studio-label">Heading <span className="studio-label-hint">(optional)</span></label>
                            <input className="input" placeholder="GIF section heading…" value={block.heading ?? ''} onChange={(event) => updateAnnouncementBlock(block.id, (current) => isGifBlock(current) ? { ...current, heading: event.target.value } : current)} />
                          </div>
                          <div>
                            <label className="studio-label">Caption <span className="studio-label-hint">(optional)</span></label>
                            <input className="input" placeholder="Short caption below the GIF…" value={block.caption ?? ''} onChange={(event) => updateAnnouncementBlock(block.id, (current) => isGifBlock(current) ? { ...current, caption: event.target.value } : current)} />
                          </div>
                        </div>

                        {/* ---- GIF Picker Panel ---- */}
                        <div className="gif-picker-panel">
                          {/* Search bar */}
                          <div className="gif-picker-bar">
                            <Search size={15} className="gif-picker-bar-icon" />
                            <input
                              className="gif-picker-input"
                              placeholder="Search GIFs… meme, sun, celebrate, welcome…"
                              value={gifQuery[block.id] ?? ''}
                              onChange={(e) => {
                                const q = e.target.value;
                                setGifQuery((prev) => ({ ...prev, [block.id]: q }));
                                clearTimeout(gifDebounceRef.current[block.id]);
                                gifDebounceRef.current[block.id] = setTimeout(() => {
                                  void handleGifSearch(block.id, q);
                                }, 380);
                              }}
                            />
                            {gifSearching[block.id] && (
                              <span className="gif-picker-spinner" />
                            )}
                            {(gifQuery[block.id] ?? '') && (
                              <button
                                type="button"
                                className="gif-picker-clear"
                                onClick={() => {
                                  setGifQuery((prev) => ({ ...prev, [block.id]: '' }));
                                  void handleGifSearch(block.id, '');
                                }}
                              >
                                <X size={13} />
                              </button>
                            )}
                          </div>

                          {/* Section label */}
                          <div className="gif-picker-section-label">
                            {(gifQuery[block.id] ?? '') ? 'Search results' : 'Trending GIFs'}
                          </div>

                          {/* GIF grid */}
                          <div className="gif-picker-grid">
                            {gifSearching[block.id] ? (
                              Array.from({ length: 8 }).map((_, i) => (
                                <div key={i} className="gif-picker-skeleton" />
                              ))
                            ) : (gifResults[block.id]?.length ?? 0) > 0 ? (
                              gifResults[block.id].map((gif) => (
                                <button
                                  key={gif.id}
                                  type="button"
                                  className={`gif-picker-thumb ${block.gifId === gif.id ? 'gif-picker-thumb-active' : ''}`}
                                  onClick={() => updateAnnouncementBlock(block.id, (current) => isGifBlock(current) ? { ...current, gifUrl: gif.gif, gifId: gif.id } : current)}
                                  title={gif.title}
                                >
                                  <img src={gif.tinygif} alt={gif.title} loading="lazy" />
                                  {block.gifId === gif.id && (
                                    <span className="gif-picker-check">✓</span>
                                  )}
                                </button>
                              ))
                            ) : (
                              <div className="gif-picker-empty">No results — try a different search</div>
                            )}
                          </div>

                          {/* Selected GIF preview */}
                          {block.gifUrl ? (
                            <div className="gif-picker-selected-bar">
                              <img src={block.gifUrl} alt="Selected GIF" className="gif-picker-selected-thumb" />
                              <div className="gif-picker-selected-info">
                                <span>GIF selected</span>
                                <button
                                  type="button"
                                  className="studio-icon-btn studio-icon-btn-danger"
                                  style={{ width: 28, height: 28 }}
                                  onClick={() => updateAnnouncementBlock(block.id, (current) => isGifBlock(current) ? { ...current, gifUrl: '', gifId: null } : current)}
                                  title="Remove GIF"
                                >
                                  <X size={13} />
                                </button>
                              </div>
                            </div>
                          ) : null}

                          {/* URL fallback */}
                          <details className="gif-picker-url-fallback">
                            <summary>Or paste a GIF URL directly</summary>
                            <div className="gif-picker-url-row">
                              <input
                                className="input"
                                placeholder="https://media.tenor.com/… or any .gif URL"
                                value={block.gifUrl ?? ''}
                                onChange={(e) => updateAnnouncementBlock(block.id, (current) => isGifBlock(current) ? { ...current, gifUrl: e.target.value, gifId: null } : current)}
                              />
                            </div>
                          </details>
                        </div>
                      </div>
                    ) : null}

                  </div>
                );
              })}
            </div>

          </section>
            </>
          }
          secondary={
            <>
          <div className="communications-preview-column">
            <section className="card studio-panel">
              <div className="studio-panel-header">
                <div>
                  <h2>Live preview</h2>
                  <p>The employee-facing announcement will use this layout.</p>
                </div>
              </div>
              <AnnouncementRenderer announcement={previewAnnouncement} showCover />
            </section>

            <section className="card studio-panel">
              <div className="studio-panel-header">
                <div>
                  <h2>Announcement library</h2>
                  <p>Open any draft, scheduled post, or live announcement to keep iterating.</p>
                </div>
              </div>
              <div className="studio-compact-list">
                {announcements.length === 0 ? (
                  <div className="studio-empty">No announcements yet.</div>
                ) : (
                  announcements.map((item) => (
                    <div key={item.id} className="studio-compact-row">
                      <div className={`studio-status-dot studio-status-dot-${item.status}`} title={item.status} />
                      <div className="studio-compact-row-body">
                        <span className="studio-compact-row-title">{item.title}</span>
                        <span className="studio-compact-row-meta">{formatCommunicationDate(item.publish_at ?? item.created_at)} · {announcementDurationLabel(item.duration_days)}</span>
                      </div>
                      <div className="studio-compact-row-actions">
                        <button
                          type="button"
                          className="studio-compact-btn"
                          onClick={() => {
                            const nextForm = toAnnouncementForm(item);
                            setEditingAnnouncementId(item.id);
                            setAnnouncementForm(nextForm);
                            setAnnouncementBaselineSignature(serializeAnnouncementForm(nextForm));
                            setActiveAnnouncementSection('announcement-meta');
                            announcementJumpCycleRef.current = {};
                          }}
                        >
                          Edit
                        </button>
                        <button type="button" className="studio-compact-btn studio-compact-btn-danger" onClick={() => setDeleteConfirm({ type: 'announcement', id: item.id })}>Delete</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
            </>
          }
        />
      )}

      <style>{`
        .communications-shell {
          display: grid;
          gap: 1.35rem;
        }

        .communications-hero {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          align-items: flex-end;
          flex-wrap: wrap;
          background:
            radial-gradient(circle at top left, rgba(124, 108, 255, 0.16), transparent 34%),
            radial-gradient(circle at bottom right, rgba(34, 211, 238, 0.12), transparent 28%),
            linear-gradient(150deg, rgba(9, 13, 26, 0.98), rgba(20, 24, 42, 0.94));
        }

        .communications-kicker {
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #c4b5fd;
          margin-bottom: 0.45rem;
        }

        .communications-title {
          margin: 0;
          font-size: clamp(2rem, 3vw, 3rem);
          line-height: 1;
          letter-spacing: -0.05em;
        }

        .communications-subtitle {
          margin: 0.8rem 0 0;
          max-width: 68ch;
          color: var(--text-secondary);
        }

        .communications-tab-row {
          display: flex;
          gap: 0.65rem;
          flex-wrap: wrap;
        }

        .communications-transfer {
          margin-top: 0.85rem;
          width: min(560px, 100%);
        }

        .communications-tab-chip {
          display: inline-flex;
          align-items: center;
          gap: 0.55rem;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
          color: var(--text-secondary);
          padding: 0.7rem 1rem;
          font-weight: 700;
          cursor: pointer;
        }

        .communications-tab-chip-maint {
          opacity: 0.75;
          border-color: rgba(245, 158, 11, 0.22);
        }

        .communications-maint-pill {
          margin-left: 0.25rem;
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.18rem 0.55rem;
          border-radius: 999px;
          font-size: 0.68rem;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          background: rgba(245, 158, 11, 0.12);
          border: 1px solid rgba(245, 158, 11, 0.22);
          color: rgba(252, 211, 77, 0.95);
        }

        .communications-tab-chip-active {
          color: var(--text-primary);
          border-color: rgba(124, 108, 255, 0.32);
          background: rgba(124, 108, 255, 0.14);
        }

        .communications-notice {
          padding: 0.9rem 1rem;
          border-radius: 16px;
          border: 1px solid var(--border-subtle);
        }

        .communications-notice-success {
          background: rgba(16, 185, 129, 0.12);
          border-color: rgba(16, 185, 129, 0.26);
          color: #86efac;
        }

        .communications-notice-danger {
          background: rgba(239, 68, 68, 0.12);
          border-color: rgba(239, 68, 68, 0.26);
          color: #fca5a5;
        }

        .communications-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.05fr) minmax(340px, 0.95fr);
          gap: 1rem;
        }

        .communications-grid-wide {
          grid-template-columns: minmax(0, 1.05fr) minmax(360px, 0.95fr);
        }

        .communications-workspace {
          gap: 1rem;
        }

        .communications-workspace-panel {
          min-height: 0;
        }

        .communications-preview-column {
          display: grid;
          gap: 1rem;
          align-content: start;
          min-height: 0;
        }

        .studio-panel {
          display: grid;
          gap: 1rem;
        }

        .studio-panel-header {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          align-items: flex-start;
          flex-wrap: wrap;
        }

        .studio-panel-header h2 {
          margin: 0;
          font-size: 1.08rem;
        }

        .studio-panel-header p {
          margin: 0.35rem 0 0;
          color: var(--text-muted);
          font-size: 0.84rem;
          line-height: 1.6;
        }

        .studio-stats-row {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.75rem;
        }

        .studio-stat-card {
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(255, 255, 255, 0.03);
          padding: 0.95rem;
          display: grid;
          gap: 0.3rem;
        }

        .studio-stat-card strong {
          font-size: 1.2rem;
          letter-spacing: -0.03em;
        }

        .studio-stat-card span {
          color: var(--text-muted);
          font-size: 0.8rem;
        }

        .studio-issue-list {
          display: grid;
          gap: 0.65rem;
        }

        .studio-issue-pill {
          display: grid;
          gap: 0.18rem;
          padding: 0.8rem 0.9rem;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
          text-align: left;
          cursor: pointer;
          transition: transform 0.18s ease, border-color 0.18s ease;
        }

        .studio-issue-pill:hover {
          transform: translateY(-1px);
          border-color: rgba(124, 108, 255, 0.32);
        }

        .studio-issue-pill span {
          color: var(--text-primary);
          font-size: 0.82rem;
          font-weight: 700;
        }

        .studio-issue-pill small {
          color: var(--text-muted);
          font-size: 0.74rem;
          line-height: 1.5;
        }

        .studio-issue-pill-danger {
          background: rgba(239, 68, 68, 0.08);
          border-color: rgba(239, 68, 68, 0.22);
        }

        .studio-issue-pill-warning {
          background: rgba(245, 158, 11, 0.08);
          border-color: rgba(245, 158, 11, 0.22);
        }

        .studio-action-summary {
          display: grid;
          gap: 0.18rem;
        }

        .studio-action-summary strong {
          color: var(--text-primary);
          font-size: 0.86rem;
        }

        .studio-action-summary span {
          color: var(--text-muted);
          font-size: 0.74rem;
        }

        .studio-sticky-jump-nav {
          padding: 0.4rem 0.45rem;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.03);
        }

        .studio-sticky-jump-nav button {
          padding: 0.5rem 0.78rem;
          font-size: 0.72rem;
        }

        .studio-focus-target {
          scroll-margin-top: 11rem;
        }

        .studio-template-row,
        .studio-mode-row,
        .studio-inline-actions,
        .studio-actions,
        .studio-block-toolbar {
          display: flex;
          gap: 0.6rem;
          flex-wrap: wrap;
        }

        .studio-form-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.85rem;
        }

        .studio-label {
          display: block;
          font-size: 0.78rem;
          color: var(--text-muted);
          margin-bottom: 0.45rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .studio-textarea {
          min-height: 128px;
          resize: vertical;
        }

        .studio-mode-chip {
          border-radius: 999px;
          border: 1px solid var(--border-subtle);
          background: rgba(255, 255, 255, 0.03);
          color: var(--text-secondary);
          padding: 0.55rem 0.85rem;
          font-weight: 700;
          cursor: pointer;
        }

        .studio-mode-chip-active {
          color: var(--text-primary);
          border-color: rgba(34, 211, 238, 0.22);
          background: rgba(34, 211, 238, 0.12);
        }

        .studio-hint {
          border-radius: 16px;
          border: 1px solid rgba(34, 211, 238, 0.16);
          background: rgba(34, 211, 238, 0.08);
          color: #a5f3fc;
          padding: 0.85rem 0.95rem;
          font-size: 0.84rem;
        }

        .studio-hint-danger {
          border-color: rgba(239, 68, 68, 0.22);
          background: rgba(239, 68, 68, 0.1);
          color: #fca5a5;
        }

        .studio-list {
          display: grid;
          gap: 0.8rem;
        }

        .studio-list-card,
        .studio-block-card {
          border-radius: 20px;
          border: 1px solid rgba(255, 255, 255, 0.07);
          background: rgba(255, 255, 255, 0.03);
          padding: 1rem;
          display: grid;
          gap: 0.75rem;
        }

        .studio-list-card-top,
        .studio-list-meta,
        .studio-block-head {
          display: flex;
          justify-content: space-between;
          gap: 0.75rem;
          align-items: center;
          flex-wrap: wrap;
        }

        .studio-list-card h3 {
          margin: 0;
        }

        .studio-list-card p {
          margin: 0;
          color: var(--text-secondary);
          line-height: 1.6;
        }

        .studio-list-meta,
        .studio-list-date {
          color: var(--text-muted);
          font-size: 0.8rem;
        }

        .studio-status-pill {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 0.34rem 0.78rem;
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          border: 1px solid transparent;
        }

        .studio-status-pill-published {
          background: rgba(16, 185, 129, 0.12);
          border-color: rgba(16, 185, 129, 0.24);
          color: #86efac;
        }

        .studio-status-pill-scheduled {
          background: rgba(59, 130, 246, 0.12);
          border-color: rgba(59, 130, 246, 0.24);
          color: #93c5fd;
        }

        .studio-status-pill-draft {
          background: rgba(124, 108, 255, 0.12);
          border-color: rgba(124, 108, 255, 0.24);
          color: #c4b5fd;
        }

        .studio-danger-btn {
          color: #fca5a5;
        }

        .studio-empty {
          color: var(--text-muted);
          text-align: center;
          padding: 1.2rem 0.75rem;
        }

        .studio-upload-row {
          border-radius: 14px;
          border: 1px dashed rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.03);
          padding: 0.8rem 0.95rem;
        }

        .studio-upload-row input {
          width: 100%;
          color: var(--text-secondary);
        }

        /* ── Compact meta strip ── */
        .studio-meta-strip {
          display: grid;
          gap: 0.65rem;
          padding: 0.85rem 1rem;
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.02);
        }

        .studio-meta-strip-row {
          display: flex;
          gap: 0.75rem;
          align-items: flex-end;
          flex-wrap: wrap;
        }

        .studio-meta-field {
          display: grid;
          gap: 0.3rem;
        }

        .studio-meta-field-grow { flex: 1; min-width: 200px; }

        .studio-pub-mode-row {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          flex-wrap: wrap;
          padding-top: 0.5rem;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
        }

        .studio-pub-mode-label {
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--text-muted);
          white-space: nowrap;
        }

        .studio-schedule-inline {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        /* ── Compact cover strip ── */
        .studio-cover-strip {
          display: flex;
          align-items: center;
          gap: 0.85rem;
          padding: 0.65rem 0.85rem;
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.02);
        }

        .studio-cover-strip-thumb {
          width: 72px;
          height: 52px;
          border-radius: 10px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.04);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .studio-cover-strip-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .studio-cover-strip-placeholder {
          font-size: 0.7rem;
          color: var(--text-muted);
          text-align: center;
        }

        .studio-cover-strip-right {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          flex-wrap: wrap;
        }

        .studio-cover-upload-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.35rem 0.85rem;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.05);
          font-size: 0.78rem;
          font-weight: 700;
          color: var(--text-secondary);
          cursor: pointer;
          transition: background 0.16s ease;
        }

        .studio-cover-upload-btn:hover {
          background: rgba(255, 255, 255, 0.09);
        }

        /* ── Sticky actions bar ── */
        .studio-sticky-actions {
          position: sticky;
          bottom: 0;
          z-index: 20;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.65rem 1rem;
          border-radius: 14px;
          border: 1px solid rgba(124, 108, 255, 0.2);
          background: rgba(12, 16, 30, 0.94);
          backdrop-filter: blur(12px);
          margin-top: 0.25rem;
        }

        .studio-sticky-actions-left {
          display: flex;
          align-items: center;
          gap: 0.65rem;
        }

        .studio-sticky-actions-right {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .studio-sticky-mode-label {
          font-size: 0.78rem;
          font-weight: 700;
          color: var(--text-muted);
        }

        /* ── Compact announcement list ── */
        .studio-compact-list {
          display: grid;
          gap: 2px;
        }

        .studio-compact-row {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.6rem 0.75rem;
          border-radius: 10px;
          transition: background 0.14s ease;
        }

        .studio-compact-row:hover {
          background: rgba(255, 255, 255, 0.03);
        }

        .studio-status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .studio-status-dot-published { background: #34d399; }
        .studio-status-dot-scheduled { background: #f59e0b; }
        .studio-status-dot-draft { background: rgba(148, 163, 184, 0.4); }

        .studio-compact-row-body {
          flex: 1;
          min-width: 0;
          display: grid;
          gap: 0.1rem;
        }

        .studio-compact-row-title {
          font-size: 0.85rem;
          font-weight: 700;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .studio-compact-row-meta {
          font-size: 0.72rem;
          color: var(--text-muted);
        }

        .studio-compact-row-actions {
          display: flex;
          gap: 0.35rem;
          flex-shrink: 0;
        }

        .studio-compact-btn {
          padding: 0.25rem 0.6rem;
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.09);
          background: rgba(255, 255, 255, 0.04);
          font-size: 0.72rem;
          font-weight: 700;
          color: var(--text-secondary);
          cursor: pointer;
          transition: background 0.14s ease;
        }

        .studio-compact-btn:hover { background: rgba(255,255,255,0.09); }
        .studio-compact-btn-danger { color: #fca5a5; }
        .studio-compact-btn-danger:hover { background: rgba(239,68,68,0.12); }

        .studio-media-preview {
          border-radius: 14px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.08);
          max-height: 220px;
          width: 100%;
          display: block;
          object-fit: cover;
        }

        .studio-block-list,
        .studio-slide-list,
        .studio-block-stack {
          display: grid;
          gap: 0.85rem;
        }

        .studio-slide-card {
          padding: 0.9rem;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(255, 255, 255, 0.025);
          display: grid;
          gap: 0.75rem;
        }

        .studio-slide-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.5rem;
        }

        .studio-inline-actions-end {
          justify-content: flex-end;
          align-items: end;
        }

        .studio-pdf-summary {
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
          padding: 0.9rem;
          display: grid;
          gap: 0.35rem;
          align-content: start;
        }

        .studio-pdf-summary strong { font-size: 0.92rem; }
        .studio-pdf-summary span { color: var(--text-muted); font-size: 0.8rem; }

        /* ---- Visual block picker ---- */
        .studio-block-picker {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .studio-block-pick-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.55rem;
          padding: 0.55rem 1rem 0.55rem 0.65rem;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.09);
          background: rgba(255, 255, 255, 0.04);
          cursor: pointer;
          transition: background 0.18s ease, border-color 0.18s ease, transform 0.16s ease;
          white-space: nowrap;
        }

        .studio-block-pick-btn:hover {
          background: rgba(124, 108, 255, 0.14);
          border-color: rgba(124, 108, 255, 0.32);
          transform: translateY(-1px);
        }

        .studio-block-pick-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          border-radius: 8px;
          background: rgba(124, 108, 255, 0.18);
          border: 1px solid rgba(124, 108, 255, 0.22);
          color: #c4b5fd;
          flex-shrink: 0;
        }

        .studio-block-pick-label {
          font-size: 0.82rem;
          font-weight: 800;
          color: var(--text-primary);
        }

        .studio-block-pick-desc {
          font-size: 0.72rem;
          color: var(--text-muted);
        }

        /* ---- Block type badge & icon actions ---- */
        .studio-block-type-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.35rem 0.75rem 0.35rem 0.55rem;
          border-radius: 999px;
          border: 1px solid color-mix(in srgb, var(--badge-color, #a78bfa) 30%, transparent);
          background: color-mix(in srgb, var(--badge-color, #a78bfa) 14%, transparent);
          color: var(--badge-color, #a78bfa);
          font-size: 0.78rem;
          font-weight: 800;
        }

        .studio-block-index {
          font-weight: 400;
          opacity: 0.6;
          font-size: 0.72rem;
        }

        .studio-block-actions {
          display: flex;
          gap: 0.35rem;
          align-items: center;
        }

        .studio-icon-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.04);
          color: var(--text-secondary);
          cursor: pointer;
          transition: background 0.18s ease, color 0.18s ease;
        }

        .studio-icon-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.1);
          color: white;
        }

        .studio-icon-btn:disabled {
          opacity: 0.3;
          cursor: default;
        }

        .studio-icon-btn-danger:hover:not(:disabled) {
          background: rgba(239, 68, 68, 0.14);
          color: #fca5a5;
          border-color: rgba(239, 68, 68, 0.22);
        }

        .studio-label-hint {
          font-weight: 400;
          opacity: 0.55;
          text-transform: none;
          letter-spacing: 0;
        }

        /* ---- GIF Picker Panel ---- */
        .gif-picker-panel {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 18px;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.02);
        }

        .gif-picker-bar {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.6rem 0.8rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(255, 255, 255, 0.03);
        }

        .gif-picker-bar-icon {
          color: var(--text-muted);
          flex-shrink: 0;
        }

        .gif-picker-input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          font-size: 0.88rem;
          color: var(--text-primary);
          font-family: inherit;
        }

        .gif-picker-input::placeholder {
          color: var(--text-muted);
        }

        .gif-picker-spinner {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          border: 2px solid rgba(124, 108, 255, 0.3);
          border-top-color: #a78bfa;
          animation: gif-spin 0.7s linear infinite;
          flex-shrink: 0;
        }

        @keyframes gif-spin {
          to { transform: rotate(360deg); }
        }

        .gif-picker-clear {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          border: none;
          background: rgba(255, 255, 255, 0.1);
          color: var(--text-muted);
          cursor: pointer;
          flex-shrink: 0;
          transition: background 0.15s ease;
        }

        .gif-picker-clear:hover {
          background: rgba(239, 68, 68, 0.2);
          color: #fca5a5;
        }

        .gif-picker-section-label {
          padding: 0.35rem 0.8rem 0;
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--text-muted);
        }

        .gif-picker-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 3px;
          padding: 0 0.5rem 0.5rem;
          max-height: 260px;
          overflow-y: auto;
        }

        .gif-picker-grid::-webkit-scrollbar { width: 4px; }
        .gif-picker-grid::-webkit-scrollbar-track { background: transparent; }
        .gif-picker-grid::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }

        .gif-picker-thumb {
          position: relative;
          border-radius: 8px;
          overflow: hidden;
          border: 2px solid transparent;
          padding: 0;
          cursor: pointer;
          background: rgba(255, 255, 255, 0.04);
          transition: border-color 0.15s ease, transform 0.15s ease;
          aspect-ratio: 4/3;
        }

        .gif-picker-thumb img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .gif-picker-thumb:hover {
          transform: scale(1.03);
          border-color: rgba(167, 139, 250, 0.5);
          z-index: 1;
        }

        .gif-picker-thumb-active {
          border-color: #a78bfa;
          box-shadow: 0 0 0 1px rgba(167, 139, 250, 0.4);
        }

        .gif-picker-check {
          position: absolute;
          top: 3px;
          right: 4px;
          background: #a78bfa;
          color: white;
          font-size: 0.65rem;
          font-weight: 900;
          border-radius: 50%;
          width: 16px;
          height: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          line-height: 1;
        }

        .gif-picker-skeleton {
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.06);
          aspect-ratio: 4/3;
          animation: gif-pulse 1.2s ease-in-out infinite;
        }

        @keyframes gif-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }

        .gif-picker-empty {
          grid-column: 1 / -1;
          padding: 1.5rem;
          text-align: center;
          color: var(--text-muted);
          font-size: 0.82rem;
        }

        .gif-picker-selected-bar {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.5rem 0.8rem;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(167, 139, 250, 0.06);
        }

        .gif-picker-selected-thumb {
          width: 56px;
          height: 42px;
          object-fit: cover;
          border-radius: 6px;
          flex-shrink: 0;
        }

        .gif-picker-selected-info {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex: 1;
          font-size: 0.8rem;
          color: #c4b5fd;
          font-weight: 600;
        }

        .gif-picker-url-fallback {
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          padding: 0.5rem 0.8rem;
        }

        .gif-picker-url-fallback summary {
          font-size: 0.75rem;
          color: var(--text-muted);
          cursor: pointer;
          user-select: none;
          list-style: none;
          display: flex;
          align-items: center;
          gap: 0.35rem;
        }

        .gif-picker-url-fallback summary::-webkit-details-marker { display: none; }

        .gif-picker-url-fallback summary::before {
          content: '▸';
          font-size: 0.7rem;
          transition: transform 0.18s;
        }

        .gif-picker-url-fallback[open] summary::before {
          transform: rotate(90deg);
        }

        .gif-picker-url-row {
          margin-top: 0.5rem;
        }

        @media (max-width: 1100px) {
          .communications-grid,
          .communications-grid-wide {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 720px) {
          .studio-focus-target {
            scroll-margin-top: 5rem;
          }
          .studio-form-grid,
          .studio-stats-row {
            grid-template-columns: 1fr;
          }
          .gif-picker-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }
      `}</style>

      {deleteConfirm && (
        <ConfirmDialog
          title={deleteConfirm.type === 'broadcast' ? 'Delete notification' : 'Delete announcement'}
          body={
            deleteConfirm.type === 'broadcast'
              ? (isStoreLimited ? 'Delete this store notification?' : 'Delete this company notification?')
              : (isStoreLimited ? 'Delete this employee announcement?' : 'Delete this company announcement?')
          }
          confirmLabel="Delete"
          tone="danger"
          onConfirm={async () => {
            const { type, id } = deleteConfirm;
            setDeleteConfirm(null);
            if (type === 'broadcast') await handleDeleteBroadcast(id);
            else await handleDeleteAnnouncement(id);
          }}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}
