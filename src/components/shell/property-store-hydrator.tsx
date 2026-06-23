"use client";

import { useEffect } from "react";

import { usePropertyStore, type ActiveProperty } from "@/stores/property-store";

/** Keeps the client property store in sync with the server-selected property. */
export function PropertyStoreHydrator({ property }: { property: ActiveProperty }) {
  useEffect(() => {
    usePropertyStore.getState().setProperty(property);
  }, [property]);

  return null;
}
