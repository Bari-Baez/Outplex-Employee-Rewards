'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  Check,
  Clock3,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  FileSpreadsheet,
  Gift,
  ImagePlus,
  Layers,
  Lock,
  Package,
  Pencil,
  Plus,
  RefreshCcw,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  Trophy,
} from 'lucide-react';
import { ModernSelect } from '@/components/ui/Select';
import { ModernDatePicker } from '@/components/ui/DatePicker';
import { ModernTimePicker } from '@/components/ui/TimePicker';
import { CanvasRoulette } from '@/components/raffles/CanvasRoulette';
import { parseRaffleCsvFile } from '@/lib/raffles/csv';
import { useTransferState } from '@/components/uploads/useTransferState';
import { TransferProgress } from '@/components/uploads/TransferProgress';
import { deleteRaffleDraft, loadRaffleDrafts, upsertRaffleDraft } from '@/lib/raffles/drafts';
import {
  fetchRaffleFeed,
  filterRaffles,
  pruneExpiredRaffleRecords,
  RAFFLE_FEED_FILTERS,
  sortRaffles,
  type RaffleFeedFilter,
} from '@/lib/raffles/feed';
import {
  calculatePrizeCapacity,
  getPrizePlanCapacity,
  buildRaffleViewModel,
  createEmptyRaffleFormState,
  getCountdownMsRemaining,
  getCountdownPreviewMessage,
  getLatestWinner,
  isMeaningfulRaffleForm,
  getPrizeAssignment,
  getPrizeSlot,
  RAFFLE_COUNTDOWN_OPTIONS,
  type BundleItem,
  type RaffleCountdownOption,
  type RaffleFormState,
  type RafflePrizePlan,
  type RaffleRuntimeState,
  type RaffleViewModel,
  type SavedRaffleDraft,
} from '@/lib/raffles/runtime';
import type { ApiResponse, Raffle, StoreItem } from '@/types/database';

function fmtDate(value: string | null) {
  return value
    ? new Date(value).toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Not scheduled';
}

function fmtCountdown(ms: number | null) {
  if (ms === null) return null;
  const total = Math.max(Math.ceil(ms / 1000), 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0 ? `${hours}h ${minutes}m ${seconds}s` : `${minutes}m ${seconds}s`;
}

function fmtDateBanner(value: string) {
  if (!value) return 'Choose a date';
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return 'Choose a date';
  return parsed.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function fmtTimeBanner(value: string) {
  if (!value) return 'Choose a launch time';
  const parsed = new Date(`1970-01-01T${value}:00`);
  if (Number.isNaN(parsed.getTime())) return 'Choose a launch time';
  return parsed.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

interface SlotEditorDraft {
  type: 'individual' | 'bundle';
  source: 'manual' | 'store_item';
  title: string;
  quantity: number;
  imageUrl: string;
  storeItemId: string | null;
  splitAcrossWinners: boolean;
  bundleItems: BundleItem[];
}

interface ModeratorRafflesClientProps {
  storeItems: StoreItem[];
}

function getStageMessage(featured: RaffleViewModel | null, countdownLabel: string | null) {
  if (!featured?.runtime) {
    return 'Use the form to preview the next raffle before publishing it.';
  }

  switch (featured.runtime.phase) {
    case 'countdown':
      return countdownLabel
        ? `Countdown active. Everyone should see ${countdownLabel} remaining before the first spin.`
        : 'Countdown active before the first spin.';
    case 'scheduled':
      return `Scheduled for ${fmtDate(featured.runtime.scheduledFor)}.`;
    case 'ready':
      return 'The first spin is queued and should start now.';
    case 'spinning':
      return 'The wheel is spinning live right now.';
    case 'winner_reveal': {
      const latestWinner = getLatestWinner(featured.runtime);
      return latestWinner ? `${latestWinner.name} is being revealed on screen.` : 'Winner reveal in progress.';
    }
    case 'intermission':
      return 'Preparing the next spin for the next winner.';
    case 'completed':
      return `${featured.runtime.winners.length} winner(s) finalized. Assign the prizes below.`;
    default:
      return 'Live raffle state updated.';
  }
}

function getStatusCountLabel(filter: RaffleFeedFilter, total: number) {
  if (filter === 'everything') {
    return `${total} raffle${total === 1 ? '' : 's'} in the current feed.`;
  }

  return `${total} ${filter} raffle${total === 1 ? '' : 's'} in view.`;
}


export function ModeratorRafflesClient({ storeItems }: ModeratorRafflesClientProps) {
  const searchParams = useSearchParams();
  const transfer = useTransferState({ resetAfterMs: 1500 });
  const [formState, setFormState] = useState<RaffleFormState>(createEmptyRaffleFormState);
  const [bulkNames, setBulkNames] = useState('');
  const [csvStatus, setCsvStatus] = useState('');
  const [savedDrafts, setSavedDrafts] = useState<SavedRaffleDraft[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [draftPromptOpen, setDraftPromptOpen] = useState(false);
  const [draftPromptId, setDraftPromptId] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [raffles, setRaffles] = useState<RaffleViewModel[]>([]);
  const [selectedRaffleId, setSelectedRaffleId] = useState<string | null>(
    searchParams.get('raffle'),
  );
  const [previewMode, setPreviewMode] = useState<'draft' | 'raffle'>('raffle');
  const [filter, setFilter] = useState<RaffleFeedFilter>('everything');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isCleaningHistory, setIsCleaningHistory] = useState(false);
  const [countdownMenuOpen, setCountdownMenuOpen] = useState(false);
  const [modal, setModal] = useState<{ title: string; body: string } | null>(null);

  const titleRef = useRef<HTMLDivElement | null>(null);
  const prizesRef = useRef<HTMLParagraphElement | null>(null);
  const participantsRef = useRef<HTMLDivElement | null>(null);

  const scrollToRef = (ref: React.RefObject<HTMLElement | null>) => {
    if (ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };
  const [nowTick, setNowTick] = useState(Date.now());
  const [slotEditorOpen, setSlotEditorOpen] = useState(false);
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [slotDraft, setSlotDraft] = useState<SlotEditorDraft>({
    type: 'individual', source: 'manual', title: '', quantity: 1, imageUrl: '', storeItemId: null, splitAcrossWinners: false, bundleItems: [],
  });
  const [winnerSlotSelections, setWinnerSlotSelections] = useState<Record<string, string>>({});
  const [editingWinnerId, setEditingWinnerId] = useState<string | null>(null);
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [deletingRaffleId, setDeletingRaffleId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string; status: string } | null>(null);
  const [deletedRaffles, setDeletedRaffles] = useState<{ raffle: { id: string; title: string; draw_date: string | null; status: string }; deletedAt: string }[]>([]);
  const [showRecycleBin, setShowRecycleBin] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);
  const countdownMenuRef = useRef<HTMLDivElement>(null);
  const syncRef = useRef(false);

  const loadRaffles = useCallback(async () => {
    const next = await fetchRaffleFeed();
    setRaffles(next);
    setSelectedRaffleId((current) =>
      current && next.some((item) => item.raffle.id === current) ? current : (next[0]?.raffle.id ?? null),
    );
  }, []);

  const syncRaffles = useCallback(async () => {
    if (syncRef.current) return;
    syncRef.current = true;
    try {
      await fetch('/api/raffles/sync', { method: 'POST' });
      await loadRaffles();
    } finally {
      syncRef.current = false;
    }
  }, [loadRaffles]);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const drafts = loadRaffleDrafts().drafts;
        setSavedDrafts(drafts);
        if (drafts.length > 0) {
          setDraftPromptOpen(true);
          setDraftPromptId(drafts[0]?.id ?? null);
        } else {
          setDraftReady(true);
        }
        await syncRaffles();
      } catch (error) {
        setModal({
          title: 'Unable to load raffles',
          body: error instanceof Error ? error.message : 'Unexpected raffle error.',
        });
      } finally {
        setIsLoading(false);
      }
    };

    void bootstrap();
  }, [syncRaffles]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const delay = raffles.some((item) => item.raffle.status !== 'completed') ? 1000 : 5000;
    const timer = window.setInterval(() => void syncRaffles(), delay);
    return () => window.clearInterval(timer);
  }, [raffles, syncRaffles]);

  useEffect(() => {
    const syncWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        void syncRaffles();
      }
    };

    const syncOnFocus = () => {
      void syncRaffles();
    };

    document.addEventListener('visibilitychange', syncWhenVisible);
    window.addEventListener('focus', syncOnFocus);

    return () => {
      document.removeEventListener('visibilitychange', syncWhenVisible);
      window.removeEventListener('focus', syncOnFocus);
    };
  }, [syncRaffles]);

  useEffect(() => {
    if (!draftReady) return;
    const timer = window.setTimeout(() => {
      const { collection, savedDraft } = upsertRaffleDraft(activeDraftId, formState);
      setSavedDrafts(collection.drafts);
      if (savedDraft && savedDraft.id !== activeDraftId) {
        setActiveDraftId(savedDraft.id);
      }
    }, 600);

    return () => window.clearTimeout(timer);
  }, [activeDraftId, draftReady, formState]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!countdownMenuRef.current?.contains(target)) {
        setCountdownMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, []);
  
  useEffect(() => {
    if (draftPromptOpen) {
      // Find the scrollable container (main-content) or use window
      const container = document.querySelector('.main-content');
      if (container) {
        container.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }, [draftPromptOpen]);

  const filteredRaffles = useMemo(() => filterRaffles(raffles, filter), [filter, raffles]);

  useEffect(() => {
    if (previewMode === 'draft') return;
    if (filteredRaffles.length === 0) return;
    if (!selectedRaffleId || !filteredRaffles.some((item) => item.raffle.id === selectedRaffleId)) {
      setSelectedRaffleId(filteredRaffles[0]?.raffle.id ?? null);
    }
  }, [filteredRaffles, previewMode, selectedRaffleId]);

  const featured = useMemo(() => {
    if (previewMode === 'draft') {
      return null;
    }
    if (selectedRaffleId) {
      const selected = filteredRaffles.find((item) => item.raffle.id === selectedRaffleId);
      if (selected) return selected;
    }
    return filteredRaffles[0] ?? null;
  }, [filteredRaffles, previewMode, selectedRaffleId]);

  const countdownOptions =
    formState.mode === 'immediate'
      ? RAFFLE_COUNTDOWN_OPTIONS.filter((option) => option.value !== 'until_draw')
      : RAFFLE_COUNTDOWN_OPTIONS;

  const featuredCountdown = featured?.runtime
    ? fmtCountdown(getCountdownMsRemaining(featured.runtime, nowTick))
    : null;
  const wheelParticipants = featured?.runtime ? featured.visibleParticipants : formState.participants;
  const availablePrizeItems = useMemo(
    () => storeItems.filter((item) => item.stock !== 0),
    [storeItems],
  );
  const slotEditorStoreItem = useMemo(
    () => slotDraft.storeItemId ? storeItems.find((item) => item.id === slotDraft.storeItemId) ?? null : null,
    [slotDraft.storeItemId, storeItems],
  );

  // 0. Stock logic: Calculate how many units of an item are used in OTHER slots (draft inventory)
  const getItemConsumedInDraft = useCallback((itemToMatch: string | null, excludeSlotId: string | null = null) => {
    if (!itemToMatch) return 0;
    let total = 0;
    formState.prizePlans.forEach((p) => {
      // Don't count the slot we are currently editing
      if (p.id === excludeSlotId) return;

      // Check primary store item
      if (p.storeItemId === itemToMatch) {
        total += p.quantity ?? 1;
      }

      // Check inside bundles
      if (p.type === 'bundle' && p.bundleItems) {
        p.bundleItems.forEach((bi) => {
          if (bi.storeItemId === itemToMatch) {
            total += (bi.quantity ?? 1);
          }
        });
      }
    });
    return total;
  }, [formState.prizePlans]);

  const slotEditorReservedByOthers = useMemo(() => {
    return getItemConsumedInDraft(slotDraft.storeItemId, editingSlotId);
  }, [getItemConsumedInDraft, slotDraft.storeItemId, editingSlotId]);

  const slotEditorRemainingAfter = useMemo(() => {
    if (!slotEditorStoreItem) return null;
    if (slotEditorStoreItem.stock === -1) return null; // unlimited
    return Math.max(0, slotEditorStoreItem.stock - slotEditorReservedByOthers - slotDraft.quantity);
  }, [slotEditorStoreItem, slotEditorReservedByOthers, slotDraft.quantity]);

  const enterDraftPreview = () => {
    setPreviewMode('draft');
    setSelectedRaffleId(null);
  };

  const updateForm = <K extends keyof RaffleFormState>(key: K, value: RaffleFormState[K]) => {
    enterDraftPreview();
    setFormState((current) => ({ ...current, [key]: value }));
  };

  const openNewSlot = (type: 'individual' | 'bundle') => {
    setEditingSlotId(null);
    setSlotDraft({ type, source: 'manual', title: '', quantity: 1, imageUrl: '', storeItemId: null, splitAcrossWinners: false, bundleItems: [] });
    setSlotEditorOpen(true);
  };

  const openEditSlot = (slot: RafflePrizePlan) => {
    setEditingSlotId(slot.id ?? null);
    setSlotDraft({
      type: slot.type ?? 'individual',
      source: slot.source,
      title: slot.title,
      quantity: slot.quantity,
      imageUrl: slot.imageUrl ?? '',
      storeItemId: slot.storeItemId ?? null,
      splitAcrossWinners: slot.splitAcrossWinners ?? false,
      bundleItems: slot.bundleItems ?? [],
    });
    setSlotEditorOpen(true);
  };

  const saveSlot = () => {
    const title = slotDraft.title.trim();
    if (!title) { setModal({ title: 'Title required', body: 'Give this prize slot a name before saving.' }); return; }
    if (slotDraft.type === 'bundle' && slotDraft.bundleItems.length === 0) { setModal({ title: 'Add items', body: 'A bundle needs at least one item.' }); return; }

    const slot: RafflePrizePlan = {
      id: editingSlotId ?? crypto.randomUUID(),
      type: slotDraft.type,
      source: slotDraft.source,
      title,
      quantity: slotDraft.quantity,
      imageUrl: slotDraft.imageUrl.trim() || null,
      storeItemId: slotDraft.source === 'store_item' ? slotDraft.storeItemId : null,
      unitPoints: slotDraft.source === 'store_item' && slotEditorStoreItem ? slotEditorStoreItem.points_cost : null,
      stockSnapshot: slotDraft.source === 'store_item' && slotEditorStoreItem ? slotEditorStoreItem.stock : null,
      splitAcrossWinners: slotDraft.type === 'individual' ? slotDraft.splitAcrossWinners : false,
      bundleItems: slotDraft.type === 'bundle' ? slotDraft.bundleItems : null,
    };

    // 3. Draft-time stock validation (Cross-slot check)
    const stockErrors: string[] = [];
    if (slot.type === 'bundle' && slot.bundleItems) {
      slot.bundleItems.forEach((bi) => {
        if (!bi.storeItemId) return;
        const reservedByOthers = getItemConsumedInDraft(bi.storeItemId, editingSlotId);
        const item = storeItems.find((s) => s.id === bi.storeItemId);
        const effectiveStock = item && item.stock !== -1 ? item.stock - reservedByOthers : Infinity;

        if (effectiveStock < (bi.quantity ?? 1)) {
          stockErrors.push(`${item?.name ?? 'Item'} (only ${effectiveStock} left after other draft prizes)`);
        }
      });
    } else if (slot.storeItemId) {
      const reservedByOthers = getItemConsumedInDraft(slot.storeItemId, editingSlotId);
      const item = storeItems.find((s) => s.id === slot.storeItemId);
      const effectiveStock = item && item.stock !== -1 ? item.stock - reservedByOthers : Infinity;

      if (effectiveStock < (slot.quantity ?? 1)) {
        stockErrors.push(`${item?.name ?? 'Item'} (only ${effectiveStock} left after other draft prizes)`);
      }
    }

    if (stockErrors.length > 0) {
      setModal({
        title: 'Insufficient stock',
        body: `You are trying to use more stock than what is available after accounting for other prizes in this draft: ${stockErrors.join(', ')}. Please adjust the quantities.`,
      });
      return;
    }

    enterDraftPreview();
    setFormState((current) => {
      const next = editingSlotId
        ? current.prizePlans.map((p) => (p.id === editingSlotId ? slot : p))
        : [...current.prizePlans, slot];
      return { ...current, prizePlans: next };
    });
    setSlotEditorOpen(false);
  };

  const removeSlot = (slotId: string) => {
    enterDraftPreview();
    setFormState((current) => ({ ...current, prizePlans: current.prizePlans.filter((p) => p.id !== slotId) }));
  };

  const addBundleItem = () => {
    setSlotDraft((d) => ({
      ...d,
      bundleItems: [...d.bundleItems, { id: crypto.randomUUID(), name: '', quantity: 1, imageUrl: null, storeItemId: null }],
    }));
  };

  const updateBundleItem = (id: string, patch: Partial<BundleItem>) => {
    setSlotDraft((d) => ({ ...d, bundleItems: d.bundleItems.map((bi) => (bi.id === id ? { ...bi, ...patch } : bi)) }));
  };

  const removeBundleItem = (id: string) => {
    setSlotDraft((d) => ({ ...d, bundleItems: d.bundleItems.filter((bi) => bi.id !== id) }));
  };

  const assignFromSlot = async (winnerParticipantId: string, slot: RafflePrizePlan) => {
    if (!featured) return;
    const prizeTitle = slot.title;
    const storeItemId = slot.type !== 'bundle' ? (slot.storeItemId ?? null) : null;
    const imageUrl = slot.imageUrl ?? slot.bundleItems?.[0]?.imageUrl ?? null;
    const quantity = slot.quantity ?? 1;
    const unitPoints = slot.type !== 'bundle' ? (slot.unitPoints ?? null) : null;

    const response = await fetch(`/api/raffles/${featured.raffle.id}/prizes`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ winnerParticipantId, prizeTitle, prizeSlotId: slot.id, storeItemId, quantity, imageUrl, unitPoints }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(payload.error ?? 'Failed to assign prize');
  };

  const autoAssignAllPrizes = async () => {
    if (!featured?.runtime) return;
    const prizePlans = featured.runtime.prizePlans ?? [];
    if (prizePlans.length === 0) {
      setModal({ title: 'No prize slots', body: 'This raffle was launched without prize slots. Assign prizes manually below.' });
      return;
    }
    const unassigned = featured.runtime.winners.filter(
      (w) => !getPrizeAssignment(featured.runtime, w.participantId)?.prizeTitle,
    );
    if (unassigned.length === 0) return;
    setAutoAssigning(true);
    try {
      let winnerIdx = 0;
      for (const slot of prizePlans) {
        const capacity = getPrizePlanCapacity(slot);
        for (let c = 0; c < capacity && winnerIdx < unassigned.length; c++) {
          const winner = unassigned[winnerIdx++];
          await assignFromSlot(winner.participantId, slot);
        }
      }
      await loadRaffles();
    } catch (error) {
      setModal({ title: 'Auto-assign failed', body: error instanceof Error ? error.message : 'Unexpected error.' });
    } finally {
      setAutoAssigning(false);
    }
  };

  const applySlotAssignment = async (winnerParticipantId: string) => {
    const slotId = winnerSlotSelections[winnerParticipantId];
    if (!slotId || !featured?.runtime) return;
    const slot = (featured.runtime.prizePlans ?? []).find((p) => p.id === slotId);
    if (!slot) return;
    try {
      await assignFromSlot(winnerParticipantId, slot);
      setEditingWinnerId(null);
      await loadRaffles();
    } catch (error) {
      setModal({ title: 'Assignment failed', body: error instanceof Error ? error.message : 'Unexpected error.' });
    }
  };

  const canSaveDraft = draftReady && isMeaningfulRaffleForm(formState);
  const latestDraftSavedAt = savedDrafts[0]?.updatedAt ?? null;

  const saveDraftNow = () => {
    if (!canSaveDraft) {
      return;
    }

    const { collection, savedDraft } = upsertRaffleDraft(activeDraftId, formState);
    setSavedDrafts(collection.drafts);
    if (savedDraft && savedDraft.id !== activeDraftId) {
      setActiveDraftId(savedDraft.id);
    }
  };

  const openDraftManager = () => {
    if (savedDrafts.length === 0) {
      return;
    }

    setDraftPromptId(activeDraftId ?? savedDrafts[0]?.id ?? null);
    setDraftPromptOpen(true);
  };

  const addParticipant = () => {
    updateForm('participants', [
      ...formState.participants,
      { id: crypto.randomUUID(), name: '', sourceId: null },
    ]);
  };

  const updateParticipant = (id: string, name: string) => {
    updateForm(
      'participants',
      formState.participants.map((participant) =>
        participant.id === id ? { ...participant, name } : participant,
      ),
    );
  };

  const removeParticipant = (id: string) => {
    updateForm(
      'participants',
      formState.participants.filter((participant) => participant.id !== id),
    );
  };

  const importBulkNames = () => {
    const entries = bulkNames
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((name) => ({ id: crypto.randomUUID(), name, sourceId: null }));

    if (entries.length === 0) {
      setModal({ title: 'No names detected', body: 'Paste one participant name per line before importing.' });
      return;
    }

    updateForm('participants', [...formState.participants, ...entries]);
    setBulkNames('');
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      transfer.start(file.name);
      transfer.setMessage('Reading CSV...');
      const parsed = await parseRaffleCsvFile(file, { onProgress: transfer.setProgress });
      if (parsed.participants.length === 0) {
        setModal({ title: 'CSV not recognized', body: 'No valid participant names were detected in that file.' });
        transfer.fail('Failed');
        return;
      }

      updateForm('participants', [...formState.participants, ...parsed.participants]);
      setCsvStatus(
        `Imported ${parsed.participants.length} names. ${
          parsed.detectedNameColumn === null
            ? 'The name column was inferred automatically.'
            : `Detected the name column in column ${parsed.detectedNameColumn + 1}.`
        }`,
      );
      transfer.succeed('Imported');
    } catch (error) {
      setModal({ title: 'CSV import failed', body: error instanceof Error ? error.message : 'Unexpected CSV error.' });
      transfer.fail('Failed');
    } finally {
      event.target.value = '';
    }
  };

  const continueDraft = () => {
    const draft = savedDrafts.find((item) => item.id === draftPromptId);
    if (!draft) {
      setDraftPromptOpen(false);
      setDraftReady(true);
      return;
    }

    setPreviewMode('draft');
    setActiveDraftId(draft.id);
    setFormState(draft.data);
    setDraftPromptOpen(false);
    setDraftReady(true);
  };

  const removeDraft = () => {
    if (!draftPromptId) return;
    const next = deleteRaffleDraft(draftPromptId).drafts;
    setSavedDrafts(next);
    if (next.length === 0) {
      setDraftPromptOpen(false);
      setDraftReady(true);
      setDraftPromptId(null);
    } else {
      setDraftPromptId(next[0]?.id ?? null);
    }
  };

  const startFresh = () => {
    setPreviewMode('draft');
    setSelectedRaffleId(null);
    setActiveDraftId(null);
    setFormState(createEmptyRaffleFormState());
    setDraftPromptOpen(false);
    setDraftReady(true);
  };

  const launchRaffle = async () => {
    if (!formState.title.trim()) {
      setModal({ title: 'Title required', body: 'Add a raffle title before launching.' });
      scrollToRef(titleRef);
      return;
    }
    const minParticipants = formState.removeWinnerAfterSpin ? formState.spinCount : 2;
    if (formState.participants.length < minParticipants) {
      setModal({
        title: 'More participants needed',
        body: formState.removeWinnerAfterSpin
          ? `You have ${formState.spinCount} winners scheduled. With "Winners removed" enabled, you need at least ${formState.spinCount} participants to launch.`
          : `Add at least 2 participants before launching.`,
      });
      scrollToRef(participantsRef);
      return;
    }

    // 1. Prize vs Winners count validation
    const totalCapacity = calculatePrizeCapacity(formState.prizePlans);

    if (totalCapacity < formState.spinCount) {
      setModal({
        title: 'Insufficient prizes',
        body: `You have ${formState.spinCount} winners scheduled, but your prizes only cover ${totalCapacity} spots. Each winner needs a prize.`,
      });
      scrollToRef(prizesRef);
      return;
    }

    // 2. Strict client-side stock check (against current storeItems state)
    const stockErrors: string[] = [];
    const reservations = new Map<string, number>();
    let assignedWinners = 0;

    formState.prizePlans.forEach((slot) => {
      if (assignedWinners >= formState.spinCount) return;
      const capacity = getPrizePlanCapacity(slot);
      const timesUsedForThisSlot = Math.min(capacity, formState.spinCount - assignedWinners);
      assignedWinners += timesUsedForThisSlot;

      if (timesUsedForThisSlot <= 0) return;

      if (slot.type === 'bundle' && slot.bundleItems) {
        slot.bundleItems.forEach((bi) => {
          if (!bi.storeItemId) return;
          const qty = (bi.quantity ?? 1) * timesUsedForThisSlot;
          reservations.set(bi.storeItemId, (reservations.get(bi.storeItemId) ?? 0) + qty);
        });
      } else if (slot.storeItemId && slot.source === 'store_item') {
        const perWinner = slot.splitAcrossWinners ? 1 : (slot.quantity ?? 1);
        const qty = perWinner * timesUsedForThisSlot;
        reservations.set(slot.storeItemId, (reservations.get(slot.storeItemId) ?? 0) + qty);
      }
    });

    reservations.forEach((qty, id) => {
      const item = storeItems.find((s) => s.id === id);
      if (item && item.stock !== -1 && item.stock < qty) {
        stockErrors.push(`${item.name} (${item.stock} left, need ${qty})`);
      }
    });

    if (stockErrors.length > 0) {
      setModal({
        title: 'Stock error',
        body: `The following items have insufficient stock: ${stockErrors.join(', ')}. Please adjust your prizes.`,
      });
      scrollToRef(prizesRef);
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/raffles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formState),
      });
      const payload = (await response.json()) as ApiResponse<{
        raffle: Raffle;
        runtime: RaffleRuntimeState;
      }>;
      if (!response.ok || !payload.data) {
        throw new Error(payload.error ?? 'Unable to launch raffle.');
      }

      const createdViewModel = buildRaffleViewModel(payload.data.raffle, payload.data.runtime);
      setRaffles((current) => {
        const deduped = current.filter((item) => item.raffle.id !== createdViewModel.raffle.id);
        return [createdViewModel, ...deduped].sort(sortRaffles);
      });
      setPreviewMode('raffle');
      setSelectedRaffleId(createdViewModel.raffle.id);

      if (activeDraftId) {
        setSavedDrafts(deleteRaffleDraft(activeDraftId).drafts);
      }

      setActiveDraftId(null);
      setFormState(createEmptyRaffleFormState());
      setBulkNames('');
      setCsvStatus('');
      void syncRaffles();
    } catch (error) {
      setModal({ title: 'Raffle launch failed', body: error instanceof Error ? error.message : 'Unexpected raffle error.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSpinComplete = async (spinToken: string) => {
    if (!featured) return;
    await fetch(`/api/raffles/${featured.raffle.id}/spin-complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spinToken }),
    });
    await syncRaffles();
  };

  const handleSpinRecorded = async ({
    spinToken,
    blob,
  }: {
    spinToken: string;
    blob: Blob;
  }) => {
    if (!featured || blob.size === 0) return;

    const formData = new FormData();
    formData.append(
      'file',
      new File([blob], `raffle-${featured.raffle.id}-${spinToken}.webm`, {
        type: blob.type || 'video/webm',
      }),
    );
    formData.append('spinToken', spinToken);

    await fetch(`/api/raffles/${featured.raffle.id}/video`, {
      method: 'POST',
      body: formData,
    });
  };

  const loadDeletedRaffles = useCallback(async () => {
    try {
      const res = await fetch('/api/raffles/deleted');
      const payload = (await res.json()) as { data?: typeof deletedRaffles; error?: string };
      if (res.ok && payload.data) setDeletedRaffles(payload.data);
    } catch {
      // non-critical, silently ignore
    }
  }, []);

  useEffect(() => {
    void loadDeletedRaffles();
  }, [loadDeletedRaffles]);

  const handleDeleteRaffle = async (id: string, status: string) => {
    setDeletingRaffleId(id);
    try {
      const res = await fetch(`/api/raffles/${id}`, { method: 'DELETE' });
      const payload = (await res.json()) as { data?: { canRestore: boolean }; error?: string };
      if (!res.ok) throw new Error(payload.error ?? 'Failed to delete raffle');
      setConfirmDelete(null);
      await Promise.all([loadRaffles(), loadDeletedRaffles()]);
      if (status === 'upcoming' && payload.data?.canRestore) {
        setShowRecycleBin(true);
      }
    } catch (error) {
      setModal({ title: 'Delete failed', body: error instanceof Error ? error.message : 'Unexpected error.' });
    } finally {
      setDeletingRaffleId(null);
    }
  };

  const handleRestoreRaffle = async (raffleId: string) => {
    try {
      const res = await fetch(`/api/raffles/${raffleId}/restore`, { method: 'POST' });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? 'Failed to restore raffle');
      await Promise.all([loadRaffles(), loadDeletedRaffles()]);
      setShowRecycleBin(false);
    } catch (error) {
      setModal({ title: 'Restore failed', body: error instanceof Error ? error.message : 'Unexpected error.' });
    }
  };

  const handlePruneExpired = async () => {
    setIsCleaningHistory(true);
    try {
      const deletedCount = await pruneExpiredRaffleRecords();
      await loadRaffles();
      setModal({
        title: 'History cleanup complete',
        body:
          deletedCount > 0
            ? `${deletedCount} completed raffle record(s) older than 60 days were deleted.`
            : 'There were no completed raffle records older than 60 days to delete.',
      });
    } catch (error) {
      setModal({
        title: 'Unable to clean old raffles',
        body: error instanceof Error ? error.message : 'Unexpected cleanup error.',
      });
    } finally {
      setIsCleaningHistory(false);
    }
  };


  return (
    <div className="animate-fade-in raffle-layout">
      <div>
        <div style={{ marginBottom: '1rem' }}>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 800, margin: '0 0 0.5rem' }}>Live Raffle Engine</h1>
          <p className="text-muted" style={{ margin: 0 }}>
            Immediate or scheduled raffles, smart CSV imports, synced countdowns, and prize assignment after winners are locked.
          </p>
        </div>

        <div className="card raffle-composer-card" style={{ marginBottom: '1.5rem' }}>
          <div className="composer-mode-row">
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`btn ${formState.mode === 'immediate' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => {
                  enterDraftPreview();
                  setFormState((current) => ({
                    ...current,
                    mode: 'immediate',
                    countdownOption:
                      current.countdownOption === 'until_draw'
                        ? 'disabled'
                        : current.countdownOption,
                  }));
                }}
              >
                Immediate
              </button>
              <button
                type="button"
                className={`btn ${formState.mode === 'scheduled' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => updateForm('mode', 'scheduled')}
              >
                Scheduled
              </button>
            </div>
            <div className="raffle-draft-badge">
              <Sparkles size={14} />
              {previewMode === 'draft' ? 'Draft preview active' : 'Published raffle selected'}
            </div>
          </div>

          <div className="card" ref={titleRef}>
            <div className="raffle-header-row">
              <p className="raffle-label">Raffle Title</p>
            </div>
              <input
                className="input"
                value={formState.title}
                onChange={(event) => updateForm('title', event.target.value)}
                placeholder="e.g. April Engagement Raffle"
              />
          </div>

          <div className="raffle-grid">
            <div>
              <label className="field-label">Winners</label>
              <div className="spin-count-stepper">
                <button
                  type="button"
                  className="spin-count-btn"
                  onClick={() => updateForm('spinCount', Math.max(1, formState.spinCount - 1))}
                  disabled={formState.spinCount <= 1}
                >
                  −
                </button>
                <span className="spin-count-value">{formState.spinCount}</span>
                <button
                  type="button"
                  className="spin-count-btn"
                  onClick={() => updateForm('spinCount', Math.min(20, formState.spinCount + 1))}
                  disabled={formState.spinCount >= 20}
                >
                  +
                </button>
              </div>
              {(() => {
                const capacity = calculatePrizeCapacity(formState.prizePlans);
                const diff = capacity - formState.spinCount;
                return (
                  <div style={{ marginTop: '0.4rem', fontSize: '0.75rem', color: diff < 0 ? '#f87171' : 'var(--text-muted)' }}>
                    {diff === 0 ? (
                      <span className="text-brand-primary-light">✓ Perfectly matched with prizes</span>
                    ) : diff < 0 ? (
                      <span>⚠ {Math.abs(diff)} winner(s) will have no prize</span>
                    ) : (
                      <span>ⓘ {diff} prize(s) will be leftover</span>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <label className="field-label">Raffle notes / summary</label>
            <textarea
              className="input"
              rows={3}
              value={formState.description}
              onChange={(event) => updateForm('description', event.target.value)}
              placeholder="Describe the reward, the audience, or internal raffle notes."
              style={{ resize: 'vertical', minHeight: 84 }}
            />
          </div>

          {/* ── Prize designer ── */}
          <div className="prize-designer">
            <div className="prize-designer-header">
              <div>
                <p className="section-title" ref={prizesRef}>Prize slots</p>
                <p className="text-muted" style={{ fontSize: '0.8125rem', marginBottom: '1.2rem' }}>
                  Create individual prizes or bundles. Each slot is assigned to a winner after the draw.
                </p>
              </div>
            </div>

            {formState.prizePlans.length > 0 && (
              <div className="prize-slot-list">
                {formState.prizePlans.map((slot) => (
                  <div key={slot.id} className="prize-slot-card">
                    <div className="prize-slot-inner">
                      <span className={`prize-type-badge prize-type-${slot.type ?? 'individual'}`}>
                        {slot.type === 'bundle' ? '📦 Bundle' : '🎁 Individual'}
                      </span>
                      <div className="prize-slot-title">{slot.title || 'Untitled'}</div>
                      {slot.type !== 'bundle' && (
                        <span className="text-muted" style={{ fontSize: '0.78rem' }}>
                          ×{slot.quantity}
                          {slot.splitAcrossWinners ? ' · split' : ' · all to one'}
                        </span>
                      )}
                      {slot.type === 'bundle' && slot.bundleItems && slot.bundleItems.length > 0 && (
                        <div className="bundle-tag-row">
                          {slot.bundleItems.map((bi) => (
                            <span key={bi.id} className="bundle-item-tag">{bi.name} ×{bi.quantity}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      <button type="button" className="btn btn-ghost" style={{ padding: '0.3rem' }} onClick={() => openEditSlot(slot)}>
                        <Pencil size={13} />
                      </button>
                      <button type="button" className="btn btn-ghost" style={{ padding: '0.3rem', color: 'var(--status-claimed)' }} onClick={() => removeSlot(slot.id!)}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="prize-add-row">
              <button type="button" className="btn btn-ghost" onClick={() => openNewSlot('individual')}>
                <Gift size={15} /> Individual prize
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => openNewSlot('bundle')}>
                <Layers size={15} /> Bundle
              </button>
            </div>
          </div>

          {/* ── Slot editor panel ── */}
          {slotEditorOpen && (
            <div className="slot-editor-panel">
              <div className="slot-editor-header">
                <strong>{editingSlotId ? 'Edit prize slot' : slotDraft.type === 'bundle' ? 'New bundle' : 'New individual prize'}</strong>
                <button type="button" className="btn btn-ghost" style={{ padding: '0.3rem' }} onClick={() => setSlotEditorOpen(false)}>✕</button>
              </div>

              <div className="raffle-grid" style={{ marginBottom: '0.75rem' }}>
                <div>
                  <label className="field-label">Prize title</label>
                  <input className="input" value={slotDraft.title} onChange={(e) => setSlotDraft((d) => ({ ...d, title: e.target.value }))} placeholder={slotDraft.type === 'bundle' ? 'e.g. Grand prize bundle' : 'e.g. Red Chair'} />
                </div>
                {slotDraft.type !== 'bundle' && (
                  <div>
                    <label className="field-label">Quantity</label>
                    <div className="spin-count-stepper">
                      <button type="button" className="spin-count-btn" onClick={() => setSlotDraft((d) => ({ ...d, quantity: Math.max(1, d.quantity - 1) }))}>−</button>
                      <span className="spin-count-value">{slotDraft.quantity}</span>
                      <button
                        type="button"
                        className="spin-count-btn"
                        onClick={() => setSlotDraft((d) => ({ ...d, quantity: d.quantity + 1 }))}
                        disabled={slotEditorRemainingAfter !== null && slotEditorRemainingAfter <= 0}
                      >+</button>
                    </div>
                    {slotEditorRemainingAfter !== null && (
                      <div style={{ fontSize: '0.75rem', marginTop: '0.35rem', color: slotEditorRemainingAfter === 0 ? '#f87171' : 'var(--text-muted)' }}>
                        {slotEditorRemainingAfter} remaining in store after this slot
                      </div>
                    )}
                    {slotEditorStoreItem && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                        ⓘ Stock will be reserved immediately when the raffle is launched
                      </div>
                    )}
                  </div>
                )}
              </div>

              {slotDraft.type !== 'bundle' && (
                <>
                  <div className="prize-source-switcher" style={{ marginBottom: '0.75rem' }}>
                    <button type="button" className={`prize-source-chip ${slotDraft.source !== 'store_item' ? 'prize-source-chip-active' : ''}`} onClick={() => setSlotDraft((d) => ({ ...d, source: 'manual', storeItemId: null }))}>Manual</button>
                    <button type="button" className={`prize-source-chip ${slotDraft.source === 'store_item' ? 'prize-source-chip-active' : ''}`} onClick={() => setSlotDraft((d) => ({ ...d, source: 'store_item' }))}>Store stock</button>
                  </div>

                  {slotDraft.source === 'store_item' ? (
                    <div className="store-prize-grid" style={{ marginBottom: '0.75rem' }}>
                      {storeItems.map((item) => {
                        const consumed = getItemConsumedInDraft(item.id, editingSlotId);
                        const effectiveStock = item.stock === -1 ? Infinity : Math.max(0, item.stock - consumed);
                        const isExhausted = effectiveStock <= 0 && item.stock !== -1;
                        const sel = slotDraft.storeItemId === item.id;
                        const ok = !isExhausted;

                        return (
                          <button
                            key={item.id}
                            type="button"
                            className={`store-prize-card ${sel ? 'store-prize-card-active' : ''} ${isExhausted ? 'store-prize-card-exhausted' : ''}`}
                            onClick={() => ok && setSlotDraft((d) => ({ ...d, storeItemId: item.id, title: d.title || item.name, imageUrl: d.imageUrl || (item.image_url ?? '') }))}
                            disabled={!ok && !sel}
                            style={{ opacity: isExhausted && !sel ? 0.5 : 1, cursor: isExhausted && !sel ? 'not-allowed' : 'pointer' }}
                          >
                            <div className="store-prize-thumb">{item.image_url ? <img src={item.image_url} alt={item.name} /> : <Package size={18} />}</div>
                            <div className="store-prize-copy">
                              <div className="store-prize-title">{item.name}</div>
                              <div className="store-prize-meta">
                                {item.stock === -1 ? 'Unlimited' : isExhausted ? <span style={{ color: '#f87171' }}>Draft limit reached</span> : `${effectiveStock} available`} · {item.points_cost.toLocaleString()} pts
                              </div>
                            </div>
                            <div className={`store-prize-status ${ok ? 'store-prize-status-live' : 'store-prize-status-empty'}`}>
                              {sel ? <Check size={14} /> : isExhausted ? <Lock size={13} /> : 'Use'}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ marginBottom: '0.75rem' }}>
                      <label className="field-label">Image URL</label>
                      <div className="manual-prize-image-row">
                        <div className="manual-prize-preview">{slotDraft.imageUrl ? <img src={slotDraft.imageUrl} alt={slotDraft.title} /> : <ImagePlus size={20} />}</div>
                        <input className="input" value={slotDraft.imageUrl} onChange={(e) => setSlotDraft((d) => ({ ...d, imageUrl: e.target.value }))} placeholder="https://... optional" />
                      </div>
                    </div>
                  )}

                  {slotDraft.quantity > 1 && (
                    <div style={{ marginBottom: '0.75rem' }}>
                      <label className="field-label">Distribution</label>
                      <div className="prize-source-switcher">
                        <button type="button" className={`prize-source-chip ${!slotDraft.splitAcrossWinners ? 'prize-source-chip-active' : ''}`} onClick={() => setSlotDraft((d) => ({ ...d, splitAcrossWinners: false }))}>All to 1 winner</button>
                        <button type="button" className={`prize-source-chip ${slotDraft.splitAcrossWinners ? 'prize-source-chip-active' : ''}`} onClick={() => setSlotDraft((d) => ({ ...d, splitAcrossWinners: true }))}>Split — {slotDraft.quantity} winners get 1 each</button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {slotDraft.type === 'bundle' && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <label className="field-label">Bundle items</label>
                  <div style={{ display: 'grid', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    {slotDraft.bundleItems.map((bi) => {
                      const biStoreItem = bi.storeItemId ? storeItems.find((s) => s.id === bi.storeItemId) : null;
                      return (
                        <div key={bi.id} className="bundle-item-card">
                          <div className="bundle-item-row">
                            <div className="bundle-item-thumb">
                              {bi.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={bi.imageUrl} alt={bi.name} />
                              ) : (
                                <Package size={16} />
                              )}
                            </div>
                            <input className="input" value={bi.name} onChange={(e) => updateBundleItem(bi.id, { name: e.target.value })} placeholder="Item name" style={{ flex: 1 }} />
                            <div className="spin-count-stepper" style={{ minWidth: 100 }}>
                              <button type="button" className="spin-count-btn" onClick={() => updateBundleItem(bi.id, { quantity: Math.max(1, bi.quantity - 1) })}>−</button>
                              <span className="spin-count-value">{bi.quantity}</span>
                              <button
                                type="button"
                                className="spin-count-btn"
                                onClick={() => {
                                  const consumed = getItemConsumedInDraft(bi.storeItemId ?? null, editingSlotId);
                                  const dbStock = biStoreItem?.stock ?? -1;
                                  const effectiveStock = dbStock === -1 ? Infinity : dbStock - consumed;
                                  if (bi.quantity < effectiveStock) {
                                    updateBundleItem(bi.id, { quantity: bi.quantity + 1 });
                                  }
                                }}
                                disabled={Boolean(biStoreItem && biStoreItem.stock !== -1 && (bi.quantity >= (biStoreItem.stock - getItemConsumedInDraft(bi.storeItemId ?? null, editingSlotId))))}
                              >+</button>
                            </div>
                            <button type="button" className="btn btn-ghost" style={{ padding: '0.35rem', color: 'var(--status-claimed)' }} onClick={() => removeBundleItem(bi.id)}><Trash2 size={13} /></button>
                          </div>
                          <div className="bundle-item-extras">
                            <input
                              className="input"
                              value={bi.imageUrl ?? ''}
                              onChange={(e) => updateBundleItem(bi.id, { imageUrl: e.target.value || null })}
                              placeholder="Image URL (optional)"
                              style={{ fontSize: '0.8rem' }}
                            />
                            <ModernSelect
                              className="text-sm"
                              value={bi.storeItemId ?? ''}
                              onValueChange={v => {
                                const picked = v ? storeItems.find(s => s.id === v) : null;
                                updateBundleItem(bi.id, {
                                  storeItemId: picked?.id ?? null,
                                  name: picked ? (bi.name || picked.name) : bi.name,
                                  imageUrl: picked?.image_url ?? bi.imageUrl ?? null,
                                  unitPoints: picked?.points_cost ?? null,
                                });
                              }}
                              options={[
                                { label: 'Or pick from store...', value: '' },
                                ...storeItems.map(s => {
                                  const consumed = getItemConsumedInDraft(s.id, editingSlotId);
                                  const effectiveStock = s.stock === -1 ? '(∞)' : `(${Math.max(0, s.stock - consumed)} available)`;
                                  return {
                                    label: `${s.name} ${effectiveStock}`,
                                    value: s.id
                                  };
                                })
                              ]}
                            />
                          </div>
                          {biStoreItem && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                              ⓘ Linked to {biStoreItem.name} · {biStoreItem.points_cost.toLocaleString()} pts · {biStoreItem.stock === -1 ? 'Unlimited' : `${Math.max(0, biStoreItem.stock - getItemConsumedInDraft(biStoreItem.id, editingSlotId))} currently available in draft`}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <button type="button" className="btn btn-ghost" onClick={addBundleItem}><Plus size={14} /> Add item</button>
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setSlotEditorOpen(false)}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={saveSlot}>{editingSlotId ? 'Update slot' : 'Add slot'}</button>
              </div>
            </div>
          )}

          {formState.mode === 'scheduled' && (
            <div className="scheduler-banner-grid">
              <div>
                <label className="field-label">Launch day</label>
                <ModernDatePicker
                  date={formState.scheduledDate}
                  onDateChange={v => updateForm('scheduledDate', v)}
                />
              </div>
              <div>
                <label className="field-label">Launch hour</label>
                <ModernTimePicker
                  time={formState.scheduledTime}
                  onTimeChange={v => updateForm('scheduledTime', v)}
                />
              </div>
            </div>
          )}

          <div className="countdown-control-row">
            <div className="w-full">
              <label className="field-label">Countdown</label>
              <ModernSelect
                value={formState.countdownOption}
                onValueChange={v => updateForm('countdownOption', v as RaffleCountdownOption)}
                options={countdownOptions.map(opt => ({
                  label: opt.label,
                  value: opt.value
                }))}
              />
            </div>
          </div>
          <div className="countdown-control-row">
            <button
              type="button"
              className={`winner-removal-toggle ${formState.removeWinnerAfterSpin ? 'winner-removal-toggle-active' : 'winner-removal-toggle-off'}`}
              onClick={() => updateForm('removeWinnerAfterSpin', !formState.removeWinnerAfterSpin)}
            >
              <span className="winner-removal-knob">{formState.removeWinnerAfterSpin ? <Check size={14} /> : <Trash2 size={14} />}</span>
              <span>
                {formState.removeWinnerAfterSpin ? 'Winners removed after each spin' : 'Winners stay in the wheel'}
              </span>
            </button>
          </div>

          {formState.countdownOption !== 'disabled' && (
            <div className="raffle-hint">{getCountdownPreviewMessage(formState)}</div>
          )}

          <div className="raffle-grid" style={{ marginTop: '1rem' }}>
            <button
              type="button"
              className="upload-card"
              onClick={() => fileInputRef.current?.click()}
              disabled={transfer.state.phase === 'working'}
            >
              <FileSpreadsheet size={20} />
              <span>{transfer.state.phase === 'working' ? 'Importing...' : 'Import CSV'}</span>
            </button>
            <button type="button" className="upload-card" onClick={addParticipant}>
              <Plus size={20} />
              <span>Add row manually</span>
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={handleFileUpload}
          />

          {csvStatus && (
            <div style={{ marginTop: '0.75rem', fontSize: '0.8125rem', color: 'var(--brand-primary-light)' }}>
              {csvStatus}
            </div>
          )}

          {transfer.state.phase !== 'idle' && (
            <div style={{ marginTop: '0.85rem' }}>
              <TransferProgress state={transfer.state} compact />
            </div>
          )}

          <div style={{ marginTop: '1rem' }} ref={participantsRef}>
            <label className="field-label">Paste names manually</label>
            <div className="bulk-row">
              <textarea
                className="input"
                rows={4}
                value={bulkNames}
                onChange={(event) => {
                  enterDraftPreview();
                  setBulkNames(event.target.value);
                }}
                placeholder="One participant per line"
                style={{ resize: 'vertical', minHeight: 100 }}
              />
              <button type="button" className="btn btn-ghost" onClick={importBulkNames}>
                Add list
              </button>
            </div>
          </div>

          <div className="participants-box">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th className="field-label" style={{ textAlign: 'left', padding: '0.8rem 1rem' }}>Name</th>
                  <th style={{ width: 68 }} />
                </tr>
              </thead>
              <tbody>
                {formState.participants.map((participant) => (
                  <tr key={participant.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '0.65rem 1rem' }}>
                      <input value={participant.name} onChange={(event) => updateParticipant(participant.id, event.target.value)} placeholder="Employee name" style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none' }} />
                    </td>
                    <td style={{ padding: '0.65rem 1rem', textAlign: 'right' }}>
                      <button type="button" className="btn btn-ghost" style={{ padding: '0.35rem', color: 'var(--status-claimed)' }} onClick={() => removeParticipant(participant.id)}>
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
                {formState.participants.length === 0 && (
                  <tr>
                    <td colSpan={2} style={{ padding: '1.6rem', textAlign: 'center', color: 'var(--text-muted)' }}>No participants loaded yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="launch-row" style={{ marginTop: '1rem' }}>
            <div className="launch-actions">
              <div>
                <div className="text-muted" style={{ fontSize: '0.8125rem' }}>
                  Drafts auto-save while you edit. Only the latest 5 unpublished drafts are kept.
                </div>
                <div className="text-muted" style={{ fontSize: '0.8125rem', marginTop: '0.3rem' }}>
                  {latestDraftSavedAt ? `Latest draft saved ${fmtDate(latestDraftSavedAt)}.` : 'No draft saved yet.'}
                </div>
              </div>
              <div className="launch-action-buttons">
                <button type="button" className="btn btn-ghost" onClick={saveDraftNow} disabled={!canSaveDraft || isSubmitting}>
                  <Save size={15} />
                  {activeDraftId ? 'Update Draft' : 'Save Draft'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={openDraftManager} disabled={savedDrafts.length === 0}>
                  <Save size={15} />
                  {`Drafts (${savedDrafts.length})`}
                </button>
                <button type="button" className="btn btn-primary" onClick={launchRaffle} disabled={isSubmitting}>
                  <Gift size={15} />
                  {isSubmitting ? 'Saving raffle...' : formState.mode === 'scheduled' ? `Schedule Raffle (${formState.participants.length})` : `Launch Raffle (${formState.participants.length})`}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="feed-header-row" style={{ marginBottom: '1rem' }}>
            <div>
              <div style={{ fontWeight: 700 }}>Active and recent raffles</div>
              <div className="text-muted" style={{ fontSize: '0.8125rem' }}>Live, upcoming, and completed raffles. Completed records older than 60 days are removed automatically.</div>
            </div>
            <div className="feed-actions">
              <button type="button" className="btn btn-ghost" onClick={() => void syncRaffles()}>
                <RefreshCcw size={15} />
                Refresh
              </button>
                <button type="button" className="btn btn-ghost" onClick={() => void handlePruneExpired()} disabled={isCleaningHistory}>
                  <Trash2 size={15} />
                  {isCleaningHistory ? 'Cleaning...' : 'Delete old raffles'}
                </button>
            </div>
          </div>

          <div className="flex gap-4 items-center mb-4">
            <ModernSelect
              value={filter}
              onValueChange={v => {
                setShowRecycleBin(false);
                setFilter(v as RaffleFeedFilter);
              }}
              options={RAFFLE_FEED_FILTERS.map(opt => ({
                label: opt.label,
                value: opt.value
              }))}
            />
            {deletedRaffles.length > 0 && (
              <button
                type="button"
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${
                  showRecycleBin 
                  ? 'bg-red-500/10 border-red-500/30 text-red-400' 
                  : 'bg-elevated border-subtle text-muted hover:border-red-500/30 hover:text-red-400'
                }`}
                onClick={() => setShowRecycleBin(!showRecycleBin)}
              >
                <Trash2 size={13} />
                Recycle Bin ({deletedRaffles.length})
              </button>
            )}
          </div>

          {showRecycleBin ? (
            <>
              <div className="text-muted" style={{ fontSize: '0.8125rem', marginBottom: '1rem' }}>
                Deleted scheduled raffles. Restore to put them back in the feed.
              </div>
              <div className="feed-scroll-area">
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  {deletedRaffles.map((item) => (
                    <div key={item.raffle.id} className="raffle-item-card" style={{ borderColor: 'rgba(239,68,68,0.24)', display: 'block' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontWeight: 700 }}>{item.raffle.title}</div>
                          <div className="text-muted" style={{ fontSize: '0.8125rem', marginTop: '0.25rem' }}>
                            Deleted {fmtDate(item.deletedAt)}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ fontSize: '0.8rem', color: 'var(--brand-primary-light)' }}
                          onClick={() => void handleRestoreRaffle(item.raffle.id)}
                        >
                          <RotateCcw size={14} /> Restore
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="text-muted" style={{ fontSize: '0.8125rem', marginBottom: '1rem' }}>{getStatusCountLabel(filter, filteredRaffles.length)}</div>

              {isLoading ? (
                <div className="text-muted">Loading raffles...</div>
              ) : filteredRaffles.length === 0 && savedDrafts.length === 0 ? (
                <div className="text-muted">No raffles found for the selected filter.</div>
              ) : (
                <div className="feed-scroll-area">
                  <div style={{ display: 'grid', gap: '0.75rem' }}>
                    {filteredRaffles.map((item) => {
                      const latestItemWinner = getLatestWinner(item.runtime);
                      const itemCountdown = fmtCountdown(getCountdownMsRemaining(item.runtime, nowTick));
                      const canDelete = item.raffle.status === 'upcoming' || item.raffle.status === 'live';

                      return (
                        <div key={item.raffle.id} style={{ position: 'relative' }}>
                          <button
                            type="button"
                            className="raffle-item-card"
                            onClick={() => {
                              setPreviewMode('raffle');
                              setSelectedRaffleId(item.raffle.id);
                            }}
                            style={{ borderColor: featured?.raffle.id === item.raffle.id ? 'rgba(99,102,241,0.45)' : 'var(--border-subtle)', paddingRight: canDelete ? '3.2rem' : undefined }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
                              <div>
                                <div style={{ fontWeight: 700 }}>{item.raffle.title}</div>
                                <div className="text-muted" style={{ fontSize: '0.8125rem', marginTop: '0.25rem' }}>{fmtDate(item.raffle.draw_date)}</div>
                              </div>
                              <span className={`status-pill status-${item.raffle.status}`}>{item.raffle.status}</span>
                            </div>
                            {item.raffle.description && (
                              <div className="text-muted" style={{ fontSize: '0.8125rem', marginTop: '0.65rem' }}>{item.raffle.description}</div>
                            )}
                            <div className="raffle-meta-row">
                              <span>{latestItemWinner?.name ? `Latest winner: ${latestItemWinner.name}` : `${item.runtime?.participants.length ?? 0} participants`}</span>
                              {itemCountdown && item.runtime?.phase !== 'completed' ? <strong>{itemCountdown}</strong> : null}
                            </div>
                          </button>
                          {canDelete && (
                            <button
                              type="button"
                              className="raffle-delete-btn"
                              title="Delete raffle"
                              onClick={(e) => { e.stopPropagation(); setConfirmDelete({ id: item.raffle.id, title: item.raffle.title, status: item.raffle.status }); }}
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {savedDrafts.length > 0 && (filter === 'everything' || filter === 'past' || filteredRaffles.length === 0) && (
                      <>
                        {filteredRaffles.length > 0 && (
                          <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', paddingTop: '0.5rem' }}>
                            Drafts
                          </div>
                        )}
                        {savedDrafts.map((draft) => (
                          <div key={draft.id} style={{ position: 'relative' }}>
                            <button
                              type="button"
                              className="raffle-item-card"
                              onClick={() => {
                                setPreviewMode('draft');
                                setActiveDraftId(draft.id);
                                setFormState(draft.data);
                                setDraftReady(true);
                              }}
                              style={{ borderColor: previewMode === 'draft' && activeDraftId === draft.id ? 'rgba(6,182,212,0.45)' : 'rgba(6,182,212,0.16)', paddingRight: '3.2rem' }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
                                <div>
                                  <div style={{ fontWeight: 700 }}>{draft.title || 'Untitled draft'}</div>
                                  <div className="text-muted" style={{ fontSize: '0.8125rem', marginTop: '0.25rem' }}>
                                    Updated {fmtDate(draft.updatedAt)} · {draft.data.participants.length} participants
                                  </div>
                                </div>
                                <span className="status-pill status-draft">draft</span>
                              </div>
                            </button>
                            <button
                              type="button"
                              className="raffle-delete-btn"
                              title="Delete draft"
                              style={{ borderColor: 'rgba(6,182,212,0.22)', background: 'rgba(6,182,212,0.08)', color: '#22d3ee' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                const next = deleteRaffleDraft(draft.id).drafts;
                                setSavedDrafts(next);
                                if (activeDraftId === draft.id) {
                                  setActiveDraftId(null);
                                  setPreviewMode('raffle');
                                }
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="raffle-side-column">
        <div className="card raffle-stage-card">
          <div style={{ marginBottom: '1rem' }}>
            <div className="stage-title-row">
              <div>
                <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>
                  {featured?.raffle.title ?? (formState.title.trim() || 'Wheel preview')}
                </div>
                <div className="text-muted" style={{ fontSize: '0.8125rem', marginTop: '0.25rem' }}>
                  {featured
                    ? getStageMessage(featured, featuredCountdown)
                    : 'You are building a new raffle. The published feed is unselected so you can focus on this draft preview.'}
                </div>
              </div>
              {featured?.raffle.status ? (
                <span className={`status-pill status-${featured.raffle.status}`}>{featured.raffle.status}</span>
              ) : previewMode === 'draft' ? (
                <span className="status-pill status-draft">draft</span>
              ) : null}
            </div>
          </div>

          {featuredCountdown && featured?.runtime?.phase !== 'completed' && (
            <div className="countdown-banner">
              <span className="field-label" style={{ marginBottom: 0 }}>Countdown</span>
              <strong>{featuredCountdown}</strong>
            </div>
          )}

          <CanvasRoulette
            key={featured?.raffle.id ?? 'draft-preview'}
            participants={wheelParticipants}
            winnerId={featured?.runtime?.activeWinnerId ?? null}
            spinToken={featured?.runtime?.currentSpinToken ?? null}
            downloadUrl={featured?.runtime?.videoProofUrl ?? null}
            isClosed={featured?.runtime?.phase === 'completed'}
            allowDownload
            onSpinRecorded={handleSpinRecorded}
            onSpinComplete={handleSpinComplete}
          />

          {featured?.runtime ? (
            <>
              <div className="stage-stats-grid">
                <div className="stage-stat-card">
                  <CalendarClock size={18} style={{ color: 'var(--brand-primary-light)' }} />
                  <div>
                    <div className="stage-stat-label">Scheduled for</div>
                    <strong>{fmtDate(featured.runtime.scheduledFor)}</strong>
                  </div>
                </div>
                <div className="stage-stat-card">
                  <Trophy size={18} style={{ color: 'var(--brand-primary-light)' }} />
                  <div>
                    <div className="stage-stat-label">Winners</div>
                    <strong>{featured.runtime.winners.length} / {featured.runtime.spinCount}</strong>
                  </div>
                </div>
                <div className="stage-stat-card">
                  <Gift size={18} style={{ color: 'var(--brand-primary-light)' }} />
                  <div>
                    <div className="stage-stat-label">Visible names</div>
                    <strong>{featured.visibleParticipants.length}</strong>
                  </div>
                </div>
              </div>

              {featured.runtime.winners.length > 0 && (
                <div className="winner-panel">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.85rem', flexWrap: 'wrap' }}>
                    <div style={{ fontWeight: 700 }}>Winner assignment</div>
                    {featured.raffle.status === 'completed' && (featured.runtime.prizePlans ?? []).length > 0 && (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ fontSize: '0.8rem' }}
                        onClick={() => void autoAssignAllPrizes()}
                        disabled={autoAssigning}
                      >
                        <Sparkles size={14} />
                        {autoAssigning ? 'Assigning...' : 'Auto-assign prizes'}
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'grid', gap: '0.85rem' }}>
                    {featured.runtime.winners.map((winner) => {
                      const assignment = getPrizeAssignment(featured.runtime, winner.participantId);
                      const assignedSlot = assignment?.prizeSlotId
                        ? getPrizeSlot(featured.runtime, assignment.prizeSlotId)
                        : null;
                      const isEditing = editingWinnerId === winner.participantId;
                      const prizePlans = featured.runtime?.prizePlans ?? [];

                      return (
                        <div key={winner.participantId} className="winner-row-card">
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontWeight: 700 }}>{winner.name}</div>
                              <div className="text-muted" style={{ fontSize: '0.8125rem' }}>
                                Winner #{winner.spinIndex} · {fmtDate(winner.selectedAt)}
                              </div>
                            </div>
                            {assignment?.prizeTitle ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                <span className="assignment-pill">Assigned</span>
                                {featured.raffle.status === 'completed' && (
                                  <button type="button" className="btn btn-ghost" style={{ padding: '0.3rem' }} onClick={() => setEditingWinnerId(isEditing ? null : winner.participantId)}>
                                    <Pencil size={13} />
                                  </button>
                                )}
                              </div>
                            ) : null}
                          </div>

                          {assignment?.prizeTitle && !isEditing && (
                            <div className="winner-prize-summary">
                              <div className="winner-prize-summary-thumb">
                                {assignment.imageUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={assignment.imageUrl} alt={assignment.prizeTitle} />
                                ) : (
                                  <Gift size={15} />
                                )}
                              </div>
                              <div className="winner-prize-summary-copy">
                                <strong>{assignment.prizeTitle}</strong>
                                <span>
                                  {(assignment.quantity ?? 1) > 1 ? `${assignment.quantity} units` : '1 unit'}
                                  {assignment.unitPoints ? ` · ${assignment.unitPoints.toLocaleString()} pts` : ''}
                                </span>
                                {assignedSlot?.type === 'bundle' && assignedSlot.bundleItems && assignedSlot.bundleItems.length > 0 && (
                                  <span style={{ marginTop: '0.25rem', display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                    {assignedSlot.bundleItems.map((bi) => (
                                      <span key={bi.id} className="bundle-item-tag">{bi.name} ×{bi.quantity}</span>
                                    ))}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {(isEditing || !assignment?.prizeTitle) && featured.raffle.status === 'completed' && (
                            <div style={{ marginTop: '0.75rem', display: 'grid', gap: '0.5rem' }}>
                              {prizePlans.length > 0 ? (
                                <div style={{ display: 'grid', grid: 'auto / 1fr auto', gap: '0.5rem', alignItems: 'center' }}>
                                  <ModernSelect
                                    value={winnerSlotSelections[winner.participantId] ?? ''}
                                    onValueChange={v => setWinnerSlotSelections(s => ({ ...s, [winner.participantId]: v }))}
                                    options={[
                                      { label: 'Select prize slot...', value: '' },
                                      ...prizePlans.map(p => ({
                                        label: `${p.type === 'bundle' ? '📦 ' : '🎁 '}${p.title}${p.type !== 'bundle' && p.quantity > 1 ? ` ×${p.quantity}` : ''}`,
                                        value: String(p.id ?? '')
                                      }))
                                    ]}
                                  />
                                  <button
                                    type="button"
                                    className="btn btn-primary"
                                    disabled={!winnerSlotSelections[winner.participantId]}
                                    onClick={() => void applySlotAssignment(winner.participantId)}
                                  >
                                    {assignment ? 'Update' : 'Assign'}
                                  </button>
                                </div>
                              ) : (
                                <div className="text-muted" style={{ fontSize: '0.8125rem' }}>
                                  No prize slots were configured for this raffle. Prizes were assigned manually at launch.
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="draft-stage-notice">
              <div className="draft-stage-copy">
                <div className="draft-stage-title">Draft preview is active</div>
                <div className="text-muted" style={{ fontSize: '0.8125rem' }}>
                  {formState.prizePlans.length > 0
                    ? `${formState.prizePlans.length} prize slot${formState.prizePlans.length === 1 ? '' : 's'} configured: ${formState.prizePlans.map((p) => p.title || 'Untitled').join(', ')}.`
                    : 'Add prize slots on the left to define what winners will receive after the draw.'}
                </div>
              </div>
              {formState.prizePlans.length > 0 && (
                <div className="prize-slot-list" style={{ marginTop: 0 }}>
                  {formState.prizePlans.map((slot) => (
                    <div key={slot.id} className="prize-slot-card" style={{ padding: '0.55rem 0.8rem' }}>
                      <div className="prize-slot-inner">
                        <span className={`prize-type-badge prize-type-${slot.type ?? 'individual'}`}>
                          {slot.type === 'bundle' ? '📦' : '🎁'}
                        </span>
                        <div className="prize-slot-title" style={{ fontSize: '0.82rem' }}>{slot.title || 'Untitled'}</div>
                        {slot.type !== 'bundle' && (
                          <span className="text-muted" style={{ fontSize: '0.75rem' }}>×{slot.quantity}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {draftPromptOpen && (
        <div className="modal-overlay" onClick={() => { setDraftPromptOpen(false); setDraftReady(true); }}>
          <div className="modal" onClick={(event) => event.stopPropagation()} style={{ width: 'min(560px, 92vw)' }}>
            <h3 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Saved raffle drafts found</h3>
            <p className="text-muted" style={{ marginTop: 0 }}>Continue a draft, delete it, or start a fresh raffle and keep the draft for later. Only the latest 5 unpublished drafts are kept.</p>
            <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1rem' }}>
              {savedDrafts.map((draft) => (
                <button key={draft.id} type="button" className="raffle-item-card" onClick={() => setDraftPromptId(draft.id)} style={{ borderColor: draft.id === draftPromptId ? 'rgba(99,102,241,0.45)' : 'var(--border-subtle)' }}>
                  <div style={{ fontWeight: 700 }}>{draft.title}</div>
                  <div className="text-muted" style={{ fontSize: '0.8125rem', marginTop: '0.25rem' }}>Updated {fmtDate(draft.updatedAt)} • {draft.data.participants.length} participants</div>
                </button>
              ))}
            </div>
            <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-ghost" onClick={startFresh}>Start New</button>
              <button type="button" className="btn btn-ghost" onClick={removeDraft}>Delete Draft</button>
              <button type="button" className="btn btn-primary" onClick={continueDraft}>Continue Draft</button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(440px, 92vw)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.75rem' }}>
              <Trash2 size={18} style={{ color: '#f87171' }} />
              <h3 style={{ margin: 0 }}>Delete “{confirmDelete.title}”?</h3>
            </div>
            <p className="text-muted" style={{ marginTop: 0, lineHeight: 1.6 }}>
              {confirmDelete.status === 'upcoming'
                ? 'This scheduled raffle will be moved to the Recycle Bin. You can restore it later. Reserved store stock will be returned.'
                : 'This live raffle will be permanently deleted. This action cannot be undone. Reserved store stock will be returned.'}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button
                type="button"
                className="btn"
                style={{ background: 'rgba(239,68,68,0.14)', color: '#f87171', border: '1px solid rgba(239,68,68,0.32)' }}
                disabled={deletingRaffleId === confirmDelete.id}
                onClick={() => void handleDeleteRaffle(confirmDelete.id, confirmDelete.status)}
              >
                {deletingRaffleId === confirmDelete.id ? 'Deleting…' : 'Yes, delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()} style={{ width: 'min(420px, 92vw)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.75rem' }}>
              <AlertCircle size={18} style={{ color: '#f87171' }} />
              <h3 style={{ margin: 0 }}>{modal.title}</h3>
            </div>
            <p className="text-muted" style={{ marginTop: 0, lineHeight: 1.6 }}>{modal.body}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button type="button" className="btn btn-primary" onClick={() => setModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .modal-overlay { position: fixed; inset: 0; background: rgba(8, 10, 18, 0.72); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 1.25rem; }
        .modal { background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 24px; padding: 1.75rem; box-shadow: 0 25px 60px rgba(0,0,0,0.5); position: relative; max-height: 94vh; overflow-y: auto; }
        .raffle-layout { display: grid; grid-template-columns: minmax(0, 1.08fr) minmax(420px, 0.92fr); gap: 1.75rem; align-items: start; }
        .raffle-side-column { position: sticky; top: 1.5rem; }
        .raffle-stage-card { display: grid; gap: 1rem; min-height: min(88vh, 1120px); }
        .raffle-composer-card { overflow: visible; }
        .saved-drafts-card, .feed-header-row, .feed-actions, .launch-row, .stage-title-row { display: flex; justify-content: space-between; gap: 1rem; align-items: center; flex-wrap: wrap; }
        .composer-mode-row { display: flex; justify-content: space-between; gap: 1rem; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; }
        .launch-actions, .launch-action-buttons { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
        .launch-actions { width: 100%; justify-content: space-between; }
        .raffle-grid, .winner-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
        .field-label { display: block; margin-bottom: 0.5rem; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted); }
        .upload-card, .raffle-item-card { width: 100%; border: 1px dashed var(--border-subtle); border-radius: 12px; background: var(--bg-elevated); padding: 1rem; text-align: left; color: inherit; cursor: pointer; display: flex; align-items: center; gap: 0.65rem; }
        .raffle-item-card { display: block; border-style: solid; }
        .upload-card:hover, .raffle-item-card:hover { border-color: var(--border-default); }
        .raffle-draft-badge { display: inline-flex; align-items: center; gap: 0.45rem; border-radius: 999px; padding: 0.5rem 0.8rem; background: rgba(99,102,241,0.12); border: 1px solid rgba(99,102,241,0.24); color: var(--brand-primary-light); font-size: 0.75rem; font-weight: 700; letter-spacing: 0.02em; }
        .prize-designer { margin-top: 1rem; padding: 1rem; border-radius: 18px; border: 1px solid rgba(99,102,241,0.16); background: linear-gradient(145deg, rgba(99,102,241,0.08), rgba(15,23,42,0.08)); display: grid; gap: 1rem; }
        .prize-designer-header { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; flex-wrap: wrap; }
        .prize-source-switcher { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .prize-source-chip { border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); color: var(--text-secondary); padding: 0.55rem 0.8rem; border-radius: 999px; font-size: 0.8rem; font-weight: 700; }
        .prize-source-chip-active { color: var(--text-primary); border-color: rgba(99,102,241,0.32); background: rgba(99,102,241,0.16); }
        .store-prize-grid { display: grid; gap: 0.8rem; max-height: 320px; overflow-y: auto; padding-right: 0.25rem; }
        .store-prize-card { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 0.85rem; width: 100%; text-align: left; padding: 0.9rem; border-radius: 18px; border: 1px solid rgba(255,255,255,0.07); background: rgba(14,18,32,0.58); color: inherit; transition: transform 0.2s ease, border-color 0.2s ease, opacity 0.2s ease; }
        .store-prize-card:hover:not(:disabled) { transform: translateY(-1px); border-color: rgba(99,102,241,0.3); }
        .store-prize-card:disabled { opacity: 0.48; cursor: not-allowed; }
        .store-prize-card-active { border-color: rgba(16,185,129,0.38); box-shadow: 0 14px 32px rgba(16,185,129,0.08); }
        .store-prize-thumb { width: 58px; height: 58px; border-radius: 16px; overflow: hidden; background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center; color: var(--text-secondary); }
        .store-prize-thumb img { width: 100%; height: 100%; object-fit: cover; }
        .store-prize-copy { min-width: 0; }
        .store-prize-title { font-weight: 700; color: var(--text-primary); }
        .store-prize-meta { margin-top: 0.25rem; color: var(--text-secondary); font-size: 0.78rem; line-height: 1.4; }
        .store-prize-status { min-width: 38px; height: 38px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; font-size: 0.72rem; font-weight: 800; }
        .store-prize-status-live { background: rgba(16,185,129,0.14); color: #34d399; border: 1px solid rgba(16,185,129,0.28); }
        .store-prize-status-empty { background: rgba(239,68,68,0.12); color: #f87171; border: 1px solid rgba(239,68,68,0.22); }
        .manual-prize-editor { display: grid; gap: 1rem; }
        .manual-prize-image-row { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 0.9rem; align-items: center; }
        .manual-prize-preview { width: 96px; height: 96px; border-radius: 20px; border: 1px dashed rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); display: flex; align-items: center; justify-content: center; overflow: hidden; color: var(--text-secondary); }
        .manual-prize-preview img { width: 100%; height: 100%; object-fit: cover; }
        .scheduler-banner-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; margin-top: 1rem; }
        .scheduler-banner { width: 100%; border-radius: 18px; border: 1px solid rgba(255,255,255,0.08); background: linear-gradient(145deg, rgba(99,102,241,0.1), rgba(15,23,42,0.1)); padding: 1rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; color: var(--text-primary); transition: transform 0.2s ease, border-color 0.2s ease; }
        .scheduler-banner:hover { transform: translateY(-1px); border-color: rgba(99,102,241,0.28); }
        .scheduler-banner-copy { display: grid; gap: 0.2rem; text-align: left; }
        .scheduler-banner-label { font-size: 0.74rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); font-weight: 700; }
        .scheduler-native-input { position: absolute; opacity: 0; pointer-events: none; width: 0; height: 0; }
        .countdown-control-row { display: grid; grid-template-columns: minmax(260px, 0.95fr) minmax(0, 1.05fr); gap: 1rem; align-items: end; margin-top: 1rem; }
        .countdown-menu-shell { position: relative; }
        .countdown-menu-trigger { width: 100%; min-height: 52px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.04); display: inline-flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.85rem 1rem; color: var(--text-primary); font-weight: 700; }
        .countdown-menu-trigger-icon { width: 32px; height: 32px; border-radius: 12px; background: rgba(99,102,241,0.14); color: var(--brand-primary-light); display: inline-flex; align-items: center; justify-content: center; }
        .countdown-menu-popover { position: absolute; top: calc(100% + 0.7rem); left: 0; width: min(360px, 100%); max-height: 320px; overflow-y: auto; padding: 0.6rem; border-radius: 18px; border: 1px solid rgba(255,255,255,0.08); background: rgba(17,20,33,0.98); box-shadow: 0 20px 52px rgba(2,6,23,0.5); z-index: 20; display: grid; gap: 0.45rem; }
        .countdown-menu-option { width: 100%; text-align: left; padding: 0.8rem 0.9rem; border-radius: 14px; border: 1px solid transparent; background: rgba(255,255,255,0.03); color: var(--text-secondary); display: grid; gap: 0.25rem; }
        .countdown-menu-option strong { color: var(--text-primary); font-size: 0.88rem; }
        .countdown-menu-option span { font-size: 0.75rem; line-height: 1.4; }
        .countdown-menu-option-active { border-color: rgba(99,102,241,0.32); background: rgba(99,102,241,0.16); }
        .winner-removal-toggle { min-height: 52px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); display: inline-flex; align-items: center; gap: 0.85rem; padding: 0.75rem 0.95rem; color: var(--text-primary); font-weight: 700; text-align: left; }
        .winner-removal-toggle-active { border-color: rgba(16,185,129,0.3); background: rgba(16,185,129,0.1); }
        .winner-removal-toggle-off { border-color: rgba(239,68,68,0.22); background: rgba(239,68,68,0.08); }
        .winner-removal-knob { width: 32px; height: 32px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.12); flex-shrink: 0; }
        .bulk-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0.75rem; }
        .participants-box { margin-top: 1rem; border: 1px solid var(--border-subtle); border-radius: 12px; overflow: hidden; max-height: 360px; overflow-y: auto; }
        .raffle-hint, .countdown-banner { margin-top: 1rem; padding: 0.85rem 1rem; border-radius: 12px; border: 1px solid rgba(99,102,241,0.2); background: rgba(99,102,241,0.12); color: var(--text-secondary); font-size: 0.875rem; }
        .countdown-banner { margin-top: 0; display: flex; justify-content: space-between; gap: 1rem; align-items: center; }
        .filter-row { display: flex; gap: 0.65rem; margin-bottom: 0.85rem; flex-wrap: wrap; }
        .filter-chip { border: 1px solid var(--border-subtle); background: var(--bg-elevated); color: var(--text-secondary); border-radius: 999px; padding: 0.55rem 0.9rem; font-size: 0.8125rem; font-weight: 700; cursor: pointer; }
        .filter-chip-active { border-color: rgba(99,102,241,0.38); background: rgba(99,102,241,0.16); color: var(--text-primary); }
        .feed-scroll-area { max-height: min(74vh, 860px); overflow-y: auto; padding-right: 0.2rem; }
        .raffle-meta-row { display: flex; justify-content: space-between; gap: 1rem; margin-top: 0.75rem; font-size: 0.8125rem; color: var(--text-muted); align-items: center; flex-wrap: wrap; }
        .status-pill { display: inline-flex; padding: 0.3rem 0.6rem; border-radius: 999px; font-size: 0.6875rem; font-weight: 700; text-transform: uppercase; }
        .status-live { background: rgba(16,185,129,0.12); color: #34d399; }
        .status-upcoming { background: rgba(234,179,8,0.14); color: #fbbf24; }
        .status-completed { background: rgba(99,102,241,0.12); color: var(--brand-primary-light); }
        .status-draft { background: rgba(6,182,212,0.12); color: #22d3ee; }
        .stage-stats-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.75rem; }
        .stage-stat-card, .winner-row-card { padding: 0.95rem 1rem; border-radius: 16px; border: 1px solid var(--border-subtle); background: var(--bg-elevated); }
        .stage-stat-card { display: flex; align-items: center; gap: 0.75rem; }
        .stage-stat-label { font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.15rem; }
        .winner-panel { display: grid; gap: 0.85rem; max-height: 360px; overflow-y: auto; padding-right: 0.2rem; }
        .assignment-pill { display: inline-flex; align-items: center; border-radius: 999px; padding: 0.3rem 0.65rem; background: rgba(16,185,129,0.12); color: #34d399; font-size: 0.75rem; font-weight: 700; }
        .draft-stage-notice { display: grid; gap: 0.85rem; padding: 1rem; border-radius: 18px; border: 1px solid rgba(99,102,241,0.18); background: linear-gradient(145deg, rgba(99,102,241,0.08), rgba(6,182,212,0.04)); }
        .draft-stage-title { font-size: 0.95rem; font-weight: 800; color: var(--text-primary); }
        .draft-stage-prize-card { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 0.75rem; align-items: center; padding: 0.8rem; border-radius: 16px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); }
        .draft-stage-prize-thumb { width: 50px; height: 50px; border-radius: 14px; overflow: hidden; background: rgba(255,255,255,0.06); display: flex; align-items: center; justify-content: center; }
        .draft-stage-prize-thumb img { width: 100%; height: 100%; object-fit: cover; }
        .winner-prize-summary { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 0.75rem; align-items: center; margin-top: 0.8rem; padding: 0.7rem 0.8rem; border-radius: 14px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); }
        .winner-prize-summary-thumb { width: 44px; height: 44px; border-radius: 12px; overflow: hidden; background: rgba(255,255,255,0.06); display: flex; align-items: center; justify-content: center; }
        .winner-prize-summary-thumb img { width: 100%; height: 100%; object-fit: cover; }
        .winner-prize-summary-copy { display: grid; gap: 0.18rem; min-width: 0; }
        .winner-prize-summary-copy span { font-size: 0.76rem; color: var(--text-secondary); }
        .spin-count-stepper { display: inline-flex; align-items: center; border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; overflow: hidden; background: rgba(255,255,255,0.04); height: 52px; }
        .spin-count-btn { width: 44px; height: 100%; display: inline-flex; align-items: center; justify-content: center; font-size: 1.25rem; font-weight: 700; color: var(--text-secondary); background: transparent; border: none; cursor: pointer; transition: background 0.15s ease, color 0.15s ease; }
        .spin-count-btn:hover:not(:disabled) { background: rgba(99,102,241,0.14); color: var(--text-primary); }
        .spin-count-btn:disabled { opacity: 0.35; cursor: not-allowed; }
        .spin-count-value { min-width: 40px; text-align: center; font-size: 1rem; font-weight: 800; color: var(--text-primary); border-left: 1px solid rgba(255,255,255,0.07); border-right: 1px solid rgba(255,255,255,0.07); }
        .prize-slot-list { display: grid; gap: 0.5rem; margin-top: 0.25rem; }
        .prize-slot-card { border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; background: rgba(255,255,255,0.03); padding: 0.7rem 0.9rem; display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
        .prize-slot-inner { display: flex; align-items: center; gap: 0.6rem; flex: 1; min-width: 0; flex-wrap: wrap; }
        .prize-slot-title { font-weight: 700; font-size: 0.875rem; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .prize-type-badge { display: inline-flex; align-items: center; padding: 0.25rem 0.55rem; border-radius: 999px; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.03em; white-space: nowrap; }
        .prize-type-individual { background: rgba(99,102,241,0.14); color: var(--brand-primary-light); border: 1px solid rgba(99,102,241,0.22); }
        .prize-type-bundle { background: rgba(234,179,8,0.12); color: #fbbf24; border: 1px solid rgba(234,179,8,0.22); }
        .prize-add-row { display: flex; gap: 0.65rem; flex-wrap: wrap; }
        .bundle-tag-row { display: flex; gap: 0.35rem; flex-wrap: wrap; margin-top: 0.25rem; }
        .bundle-item-tag { display: inline-flex; align-items: center; padding: 0.2rem 0.5rem; border-radius: 999px; font-size: 0.72rem; font-weight: 700; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: var(--text-secondary); }
        .slot-editor-panel { margin-top: 0.5rem; padding: 1rem; border-radius: 18px; border: 1px solid rgba(99,102,241,0.22); background: rgba(99,102,241,0.06); display: grid; gap: 0.85rem; }
        .slot-editor-header { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
        .bundle-item-row { display: flex; align-items: center; gap: 0.5rem; }
        .bundle-item-card { border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; background: rgba(255,255,255,0.03); padding: 0.7rem 0.8rem; display: grid; gap: 0.5rem; }
        .bundle-item-thumb { width: 42px; height: 42px; border-radius: 10px; overflow: hidden; background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center; color: var(--text-secondary); flex-shrink: 0; }
        .bundle-item-thumb img { width: 100%; height: 100%; object-fit: cover; }
        .bundle-item-extras { display: grid; gap: 0.45rem; padding-top: 0.45rem; border-top: 1px solid rgba(255,255,255,0.06); }
        .raffle-delete-btn { position: absolute; top: 0.6rem; right: 0.6rem; width: 28px; height: 28px; border-radius: 8px; border: 1px solid rgba(239,68,68,0.22); background: rgba(239,68,68,0.08); color: #f87171; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.15s ease, border-color 0.15s ease; }
        .raffle-delete-btn:hover { background: rgba(239,68,68,0.18); border-color: rgba(239,68,68,0.38); }
        @media (max-width: 1200px) { .raffle-layout { grid-template-columns: 1fr; } .raffle-side-column { position: static; } .raffle-stage-card, .feed-scroll-area { min-height: 0; max-height: none; } }
        @media (max-width: 720px) { .raffle-grid, .bulk-row, .winner-form-grid, .stage-stats-grid, .scheduler-banner-grid, .countdown-control-row, .manual-prize-image-row { grid-template-columns: 1fr; } .launch-action-buttons { width: 100%; } .launch-action-buttons > button { flex: 1 1 100%; justify-content: center; } .prize-designer-header, .composer-mode-row { align-items: stretch; } }
      `}</style>
    </div>
  );
}
