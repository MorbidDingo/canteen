import { create } from "zustand";
import { persist } from "zustand/middleware";
import { toast } from "sonner";

export interface CartItemInstruction {
  text: string;
  toggles: string[];
}

export interface CartItem {
  menuItemId: string;
  name: string;
  price: number;
  discountedPrice?: number;
  category?: string;
  canteenId: string;
  canteenName: string;
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
  getCanteenId: () => string | null;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (item) => {
        const MAX_QTY = 5;
        const currentItems = get().items;

        // Enforce single-canteen per order
        if (currentItems.length > 0 && currentItems[0].canteenId !== item.canteenId) {
          toast.error(
            `Your cart has items from ${currentItems[0].canteenName}. Clear your cart first to order from ${item.canteenName}.`
          );
          return;
        }

        const existing = currentItems.find(
          (i) => i.menuItemId === item.menuItemId
        );
        if (existing) {
          if (existing.quantity >= MAX_QTY) return;
          set({
            items: currentItems.map((i) =>
              i.menuItemId === item.menuItemId
                ? { ...i, quantity: Math.min(i.quantity + 1, MAX_QTY) }
                : i
            ),
          });
        } else {
          set({
            items: [
              ...currentItems,
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
          (total, item) => total + (item.discountedPrice ?? item.price) * item.quantity,
          0
        ),

      getItemCount: () =>
        get().items.reduce((count, item) => count + item.quantity, 0),

      getCanteenId: () => {
        const items = get().items;
        return items.length > 0 ? items[0].canteenId : null;
      },
    }),
    {
      name: "school-cafe-cart",
    }
  )
);
