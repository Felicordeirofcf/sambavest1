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
  isOpen: boolean;
  isMenuOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  openMenu: () => void;
  closeMenu: () => void;
  addItem: (item: CartItem) => void;
  removeItem: (id: number | string, size?: string) => void; // Aceita size opcional para remoção precisa
  clearCart: () => void;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set) => ({
      items: [],
      isOpen: false,
      isMenuOpen: false,
      
      openCart: () => set({ isOpen: true }),
      closeCart: () => set({ isOpen: false }),
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
        
      removeItem: (id, size) =>
        set((state) => ({
          items: state.items.filter((item) => {
            // Se passar o tamanho, remove exatamente aquele ID + Tamanho. Se não, remove pelo ID.
            if (size) {
              return !(item.id === id && item.size === size);
            }
            return item.id !== id;
          }),
        })),
        
      clearCart: () => set({ items: [] }),
    }),
    {
      name: 'samba-vest-cart',
    }
  )
);