import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// 1. Atualizamos a interface para exigir o ID real e a quantidade
export interface CartItem {
  id: number | string; // Aceita o ID numérico da Nuvemshop
  name: string;
  price: number;
  image: string;
  size: string;
  quantity: number;
}

interface CartStore {
  items: CartItem[];
  isCartOpen: boolean;
  isMenuOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  openMenu: () => void;
  closeMenu: () => void;
  addItem: (item: CartItem) => void; // 2. Agora o addItem exige o item completo
  removeItem: (id: number | string) => void;
  clearCart: () => void;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set) => ({
      items: [],
      isCartOpen: false,
      isMenuOpen: false,
      
      openCart: () => set({ isCartOpen: true }),
      closeCart: () => set({ isCartOpen: false }),
      openMenu: () => set({ isMenuOpen: true }),
      closeMenu: () => set({ isMenuOpen: false }),
      
      addItem: (newItem) =>
        set((state) => {
          // Verifica se já existe um item com o mesmo ID E mesmo tamanho no carrinho
          const existingItem = state.items.find(
            (item) => item.id === newItem.id && item.size === newItem.size
          );

          if (existingItem) {
            // Se existir, apenas soma a quantidade
            return {
              items: state.items.map((item) =>
                item.id === newItem.id && item.size === newItem.size
                  ? { ...item, quantity: item.quantity + newItem.quantity }
                  : item
              ),
            };
          }
          
          // Se não existir, adiciona o novo item à lista
          return { items: [...state.items, newItem] };
        }),
        
      removeItem: (id) =>
        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
        })),
        
      clearCart: () => set({ items: [] }),
    }),
    {
      name: 'samba-vest-cart', // Nome que fica salvo no LocalStorage do navegador
    }
  )
);