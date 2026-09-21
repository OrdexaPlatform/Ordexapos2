import { create } from 'zustand';
import { Shift, OpenShiftPayload, CloseShiftPayload, CashDrawerMovementPayload } from '../types';
import { shiftService } from '../lib/shiftService';

interface ShiftState {
  activeShift: Shift | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  // Modal controls
  isOpeningModalOpen: boolean;
  isClosingModalOpen: boolean;
  isCashMovementModalOpen: boolean;

  // Actions
  setOpeningModalOpen: (open: boolean) => void;
  setClosingModalOpen: (open: boolean) => void;
  setCashMovementModalOpen: (open: boolean) => void;

  loadActiveShift: (clientId?: string) => Promise<void>;
  openShift: (payload: OpenShiftPayload) => Promise<void>;
  closeShift: (payload: CloseShiftPayload) => Promise<any>;
  recordCashMovement: (payload: CashDrawerMovementPayload) => Promise<{ success: boolean; movement_id: string; is_offline?: boolean }>;
  resetShiftState: () => void;
}

export const useShiftStore = create<ShiftState>((set, get) => ({
  activeShift: null,
  isLoading: false,
  isInitialized: false,
  error: null,

  isOpeningModalOpen: false,
  isClosingModalOpen: false,
  isCashMovementModalOpen: false,

  setOpeningModalOpen: (open) => set({ isOpeningModalOpen: open }),
  setClosingModalOpen: (open) => set({ isClosingModalOpen: open }),
  setCashMovementModalOpen: (open) => set({ isCashMovementModalOpen: open }),

  loadActiveShift: async (clientId?: string) => {
    set({ isLoading: true, error: null });
    try {
      const shift = await shiftService.getActiveShift(clientId);
      set({ activeShift: shift, isInitialized: true, isLoading: false });
    } catch (err: any) {
      console.error('Failed to load active shift in store:', err);
      set({ error: err.message, isInitialized: true, isLoading: false });
    }
  },

  openShift: async (payload: OpenShiftPayload) => {
    set({ isLoading: true, error: null });
    try {
      await shiftService.openShift(payload);
      // Reload active shift
      await get().loadActiveShift(payload.client_id);
      set({ isOpeningModalOpen: false, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      throw err;
    }
  },

  closeShift: async (payload: CloseShiftPayload) => {
    set({ isLoading: true, error: null });
    try {
      const result = await shiftService.closeShift(payload);
      set({ activeShift: null, isClosingModalOpen: false, isLoading: false });
      return result;
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      throw err;
    }
  },

  recordCashMovement: async (payload: CashDrawerMovementPayload) => {
    set({ isLoading: true, error: null });
    try {
      const result = await shiftService.recordCashDrawerMovement(payload);
      // Refresh active shift summary
      await get().loadActiveShift(payload.client_id);
      set({ isCashMovementModalOpen: false, isLoading: false });
      return result;
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      throw err;
    }
  },

  resetShiftState: () => {
    set({
      activeShift: null,
      isLoading: false,
      isInitialized: false,
      error: null,
      isOpeningModalOpen: false,
      isClosingModalOpen: false,
      isCashMovementModalOpen: false,
    });
  },
}));
