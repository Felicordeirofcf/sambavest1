import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartItem {
  id: number | string;
  name: string;
  price: number;
  image: string;
  size: string;
  quantity: number;
}

interface CartStore {
  items: CartItem[];
  isOpen: boolean; // Corrigido para "isOpen" para bater com o Minicart.tsx
  isMenuOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  openMenu: () => void;
  closeMenu: () => void;
  addItem: (item: CartItem) => void;
  removeItem: (id: number | string) => void;
  clearCart: () => void;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set) => ({
      items: [],
      isOpen: false, // Corrigido para "isOpen"
      isMenuOpen: false,
      
      openCart: () => set({ isOpen: true }), // Corrigido para "isOpen"
      closeCart: () => set({ isOpen: false }), // Corrigido para "isOpen"
      openMenu: () => set({ isMenuOpen: true }),
      closeMenu: () => set({ isMenuOpen: false }),
      
      addItem: (newItem) =>
        set((state) => {
          const existingItem = state.items.find(
            (item) => item.id === newItem.id && item.size === newItem.size
          );

          if (existingItem) {
            return {
              items: state.items.map((item) =>
                item.id === newItem.id && item.size === newItem.size
                  ? { ...item, quantity: item.quantity + newItem.quantity }
                  : item
              ),
            };
          }
          
          return { items: [...state.items, newItem] };
        }),
        
      removeItem: (id) =>
        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
        })),
        
      clearCart: () => set({ items: [] }),
    }),
    {
      name: 'samba-vest-cart',
    }
  )
);