"use client";

import { create } from "zustand";

export type ActiveProperty = {
  id: string;
  name: string;
  slug: string;
  hasBlocks: boolean;
};

type PropertyState = {
  property: ActiveProperty | null;
  setProperty: (property: ActiveProperty | null) => void;
};

// Mirror of the server-selected property for client components (Floor Manager,
// global search, etc.). Hydrated from the server value via PropertyStoreHydrator.
export const usePropertyStore = create<PropertyState>((set) => ({
  property: null,
  setProperty: (property) => set({ property }),
}));
