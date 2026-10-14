import React, { createContext, useContext, useState, useEffect } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface ProductItem {
  id: string;
  title: string;
  category: "machines" | "printers" | "software" | "supplies";
  image: string;
  originalPrice: string;
  salePrice: string;
  discount: string;
  shortDesc: string;
  description: string;
  features?: string[];
  packageIncludes?: string[];
  specs?: { label: string; value: string }[];
  inStock?: boolean;
  rating?: number;
  reviewsCount?: number;
}

export interface CartItem {
  product: ProductItem;
  quantity: number;
}

interface CartContextType {
  cartItems: CartItem[];
  cartCount: number;
  cartSubtotal: number;
  cartGst: number;
  cartTotal: number;
  addToCart: (product: ProductItem, quantity?: number) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_STORAGE_KEY = "ezbill_prodevopz_cart_v1";

// Helper to parse price string like "Rs. 3,999" or "₹3,999" to number 3999
export function parsePriceToNumber(priceStr: string): number {
  if (!priceStr) return 0;
  const cleaned = priceStr.replace(/[^0-9.]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load cart on startup
  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS === "web" && typeof window !== "undefined" && window.localStorage) {
          const saved = window.localStorage.getItem(CART_STORAGE_KEY);
          if (saved) {
            setCartItems(JSON.parse(saved));
          }
        } else {
          const saved = await AsyncStorage.getItem(CART_STORAGE_KEY);
          if (saved) {
            setCartItems(JSON.parse(saved));
          }
        }
      } catch (e) {
        // Fallback gracefully
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // Save cart on changes
  useEffect(() => {
    if (!loaded) return;
    (async () => {
      try {
        const serialized = JSON.stringify(cartItems);
        if (Platform.OS === "web" && typeof window !== "undefined" && window.localStorage) {
          window.localStorage.setItem(CART_STORAGE_KEY, serialized);
        } else {
          await AsyncStorage.setItem(CART_STORAGE_KEY, serialized);
        }
      } catch (e) {}
    })();
  }, [cartItems, loaded]);

  const addToCart = (product: ProductItem, quantity: number = 1) => {
    setCartItems((prev) => {
      const existingIndex = prev.findIndex((item) => item.product.id === product.id);
      if (existingIndex > -1) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + quantity,
        };
        return updated;
      } else {
        return [...prev, { product, quantity }];
      }
    });
    setIsCartOpen(true);
  };

  const removeFromCart = (productId: string) => {
    setCartItems((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setCartItems((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, quantity } : item
      )
    );
  };

  const clearCart = () => {
    setCartItems([]);
  };

  const cartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);

  const cartSubtotal = cartItems.reduce((acc, item) => {
    const price = parsePriceToNumber(item.product.salePrice);
    return acc + price * item.quantity;
  }, 0);

  // Prices are inclusive of GST, so calculate 18% GST portion for display
  const cartGst = Math.round((cartSubtotal * 18) / 118);
  const cartTotal = cartSubtotal; // Already inclusive

  return (
    <CartContext.Provider
      value={{
        cartItems,
        cartCount,
        cartSubtotal,
        cartGst,
        cartTotal,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        isCartOpen,
        setIsCartOpen,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
