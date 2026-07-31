import {
  MAX_SAVED_RAFFLE_DRAFTS,
  RAFFLE_DRAFTS_STORAGE_KEY,
  createEmptyRaffleFormState,
  isMeaningfulRaffleForm,
  type RaffleFormState,
  type SavedRaffleDraft,
} from '@backend/modules/raffles/domain/runtime';

interface RaffleDraftCollection {
  drafts: SavedRaffleDraft[];
}

function getDefaultCollection(): RaffleDraftCollection {
  return { drafts: [] };
}

export function loadRaffleDrafts() {
  if (typeof window === 'undefined') {
    return getDefaultCollection();
  }

  const rawValue = window.localStorage.getItem(RAFFLE_DRAFTS_STORAGE_KEY);
  if (!rawValue) {
    return getDefaultCollection();
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<RaffleDraftCollection>;
    if (!parsed || !Array.isArray(parsed.drafts)) {
      return getDefaultCollection();
    }

    const drafts = parsed.drafts
      .filter((draft): draft is SavedRaffleDraft => {
        return Boolean(
          draft &&
            typeof draft.id === 'string' &&
            typeof draft.updatedAt === 'string' &&
            draft.data,
        );
      })
      .sort((left, right) => {
        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      })
      .slice(0, MAX_SAVED_RAFFLE_DRAFTS);

    if (drafts.length !== parsed.drafts.length) {
      saveRaffleDrafts({ drafts });
    }

    return { drafts };
  } catch {
    return getDefaultCollection();
  }
}

export function saveRaffleDrafts(collection: RaffleDraftCollection) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(RAFFLE_DRAFTS_STORAGE_KEY, JSON.stringify(collection));
}

export function createDraftTitle(formState: RaffleFormState) {
  if (formState.title.trim()) {
    return formState.title.trim();
  }

  if (formState.participants.length > 0) {
    return `Untitled raffle (${formState.participants.length} names)`;
  }

  return 'Untitled raffle draft';
}

export function upsertRaffleDraft(
  draftId: string | null,
  formState: RaffleFormState,
) {
  if (!isMeaningfulRaffleForm(formState)) {
    return {
      collection: loadRaffleDrafts(),
      savedDraft: null,
    };
  }

  const collection = loadRaffleDrafts();
  const nextDraft: SavedRaffleDraft = {
    id: draftId ?? crypto.randomUUID(),
    title: createDraftTitle(formState),
    updatedAt: new Date().toISOString(),
    data: {
      ...createEmptyRaffleFormState(),
      ...formState,
    },
  };

  const nextDrafts = collection.drafts.filter((draft) => draft.id !== nextDraft.id);
  nextDrafts.unshift(nextDraft);
  const limitedDrafts = nextDrafts.slice(0, MAX_SAVED_RAFFLE_DRAFTS);
  saveRaffleDrafts({ drafts: limitedDrafts });

  return {
    collection: { drafts: limitedDrafts },
    savedDraft: nextDraft,
  };
}

export function deleteRaffleDraft(draftId: string) {
  const collection = loadRaffleDrafts();
  const nextDrafts = collection.drafts.filter((draft) => draft.id !== draftId);
  saveRaffleDrafts({ drafts: nextDrafts });
  return { drafts: nextDrafts };
}

export function getRaffleDraftById(draftId: string | null) {
  if (!draftId) {
    return null;
  }

  const collection = loadRaffleDrafts();
  return collection.drafts.find((draft) => draft.id === draftId) ?? null;
}
