import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CartItemInstruction {
  text: string;
  toggles: string[];
}

export interface CartItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  instructions: CartItemInstruction;
}

interface CartStore {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity" | "instructions">) => void;
  removeItem: (menuItemId: string) => void;
  updateQuantity: (menuItemId: string, quantity: number) => void;
  updateInstructions: (
    menuItemId: string,
    instructions: CartItemInstruction
  ) => void;
  clearCart: () => void;
  getTotal: () => number;
  getItemCount: () => number;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (item) => {
        const MAX_QTY = 5;
        const existing = get().items.find(
          (i) => i.menuItemId === item.menuItemId
        );
        if (existing) {
          if (existing.quantity >= MAX_QTY) return;
          set({
            items: get().items.map((i) =>
              i.menuItemId === item.menuItemId
                ? { ...i, quantity: Math.min(i.quantity + 1, MAX_QTY) }
                : i
            ),
          });
        } else {
          set({
            items: [
              ...get().items,
              {
                ...item,
                quantity: 1,
                instructions: { text: "", toggles: [] },
              },
            ],
          });
        }
      },

      removeItem: (menuItemId) => {
        set({ items: get().items.filter((i) => i.menuItemId !== menuItemId) });
      },

      updateQuantity: (menuItemId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(menuItemId);
          return;
        }
        const MAX_QTY = 5;
        const capped = Math.min(quantity, MAX_QTY);
        set({
          items: get().items.map((i) =>
            i.menuItemId === menuItemId ? { ...i, quantity: capped } : i
          ),
        });
      },

      updateInstructions: (menuItemId, instructions) => {
        set({
          items: get().items.map((i) =>
            i.menuItemId === menuItemId ? { ...i, instructions } : i
          ),
        });
      },

      clearCart: () => set({ items: [] }),

      getTotal: () =>
        get().items.reduce(
          (total, item) => total + item.price * item.quantity,
          0
        ),

      getItemCount: () =>
        get().items.reduce((count, item) => count + item.quantity, 0),
    }),
    {
      name: "school-cafe-cart",
    }
  )
);
