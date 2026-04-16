import { create } from "zustand";

export type AgentPanelState = {
  /** Whether the agent panel is open */
  isOpen: boolean;
  /** Current conversation ID */
  conversationId: string | null;
  /** Product context (when working within a product) */
  anchoredProductId: string | null;
  /** Selected model */
  modelId: string;
  /** Toggle panel visibility */
  toggle: () => void;
  open: () => void;
  close: () => void;
  /** Set the current conversation */
  setConversationId: (id: string | null) => void;
  /** Anchor to a product context */
  anchorProduct: (productId: string | null) => void;
  /** Change model */
  setModelId: (modelId: string) => void;
  /** Start a new chat */
  newChat: () => void;
};

export const useAgentStore = create<AgentPanelState>((set) => ({
  isOpen: false,
  conversationId: null,
  anchoredProductId: null,
  modelId: "claude-sonnet-4-20250514",

  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),

  setConversationId: (id) => set({ conversationId: id }),
  anchorProduct: (productId) => set({ anchoredProductId: productId }),
  setModelId: (modelId) => set({ modelId }),

  newChat: () =>
    set({
      conversationId: crypto.randomUUID(),
      anchoredProductId: null,
    }),
}));
