import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type CertePlusSubscription = {
  id: string;
  plan: string;
  startDate: string;
  endDate: string;
  status: string;
  walletOverdraftUsed: number;
  libraryPenaltiesUsed: number;
  libraryPenaltiesUsedByChild?: Record<string, number>;
};

export type CertePlusStatus = {
  active: boolean;
  subscription: CertePlusSubscription | null;
  benefits?: {
    walletOverdraftLimit: number;
    libraryPenaltyAllowance: number;
    libraryPenaltiesUsed: number;
    walletOverdraftUsed: number;
    libraryPenaltiesUsedByChild?: Record<string, number>;
  };
};

type RefreshOptions = {
  silent?: boolean;
};

type CertePlusStore = {
  status: CertePlusStatus | null;
  fetchedAt: number | null;
  loading: boolean;
  setStatus: (status: CertePlusStatus | null) => void;
  refresh: (options?: RefreshOptions) => Promise<CertePlusStatus | null>;
  ensureFresh: (maxAgeMs?: number) => Promise<CertePlusStatus | null>;
};

export const useCertePlusStore = create<CertePlusStore>()(
  persist(
    (set, get) => ({
      status: null,
      fetchedAt: null,
      loading: false,
      setStatus: (status) => set({ status, fetchedAt: Date.now() }),
      refresh: async (options) => {
        const silent = options?.silent === true;
        if (!silent) set({ loading: true });
        try {
          const res = await fetch("/api/certe-plus", { cache: "no-store" });
          if (!res.ok) throw new Error("Failed to fetch Certe+ status");
          const data = (await res.json()) as CertePlusStatus;
          set({ status: data, fetchedAt: Date.now() });
          return data;
        } catch {
          const fallback =
            get().status ??
            ({
              active: false,
              subscription: null,
              benefits: {
                walletOverdraftLimit: 0,
                libraryPenaltyAllowance: 0,
                libraryPenaltiesUsed: 0,
                walletOverdraftUsed: 0,
                libraryPenaltiesUsedByChild: {},
              },
            } as CertePlusStatus);
          if (!get().status) {
            set({ status: fallback, fetchedAt: Date.now() });
          }
          return fallback;
        } finally {
          if (!silent) set({ loading: false });
        }
      },
      ensureFresh: async (maxAgeMs = 30_000) => {
        const { fetchedAt, status, refresh } = get();
        const isFresh =
          fetchedAt != null && Date.now() - fetchedAt < Math.max(1_000, maxAgeMs);
        if (status && isFresh) return status;
        return refresh({ silent: true });
      },
    }),
    {
      name: "certe-plus-status",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        status: state.status,
        fetchedAt: state.fetchedAt,
      }),
    },
  ),
);
