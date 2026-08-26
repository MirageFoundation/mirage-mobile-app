import { useEffect } from "react";
import type { LayoutChangeEvent } from "react-native";
import { create } from "zustand";

export const TOP_TOAST_SPACING = 8;

type TopToastLayoutItem = {
 height: number;
 visible: boolean;
 order: number | null;
};

interface ToastLayoutState {
 items: Record<string, TopToastLayoutItem>;
 nextOrder: number;
 showItem: (id: string) => void;
 hideItem: (id: string) => void;
 setItemHeight: (id: string, height: number) => void;
}

const getSortedVisibleItems = (items: Record<string, TopToastLayoutItem>) =>
 Object.entries(items)
  .filter(([, item]) => item.visible && item.order !== null)
  .sort(([, a], [, b]) => (a.order ?? 0) - (b.order ?? 0));

const getOffsetForItem = (
 items: Record<string, TopToastLayoutItem>,
 id: string,
) => {
 let offset = 0;

 for (const [itemId, item] of getSortedVisibleItems(items)) {
  if (itemId === id) {
   break;
  }

  offset += item.height + TOP_TOAST_SPACING;
 }

 return offset;
};

export const useToastLayoutStore = create<ToastLayoutState>((set) => ({
 items: {},
 nextOrder: 0,
 showItem: (id) =>
  set((state) => {
   const current = state.items[id];

   if (current?.visible) {
    return state;
   }

   return {
    items: {
     ...state.items,
     [id]: {
      height: current?.height ?? 0,
      visible: true,
      order: state.nextOrder,
     },
    },
    nextOrder: state.nextOrder + 1,
   };
  }),
 hideItem: (id) =>
  set((state) => {
   const current = state.items[id];

   if (!current) {
    return state;
   }

   return {
    items: {
     ...state.items,
     [id]: {
      ...current,
      visible: false,
      order: null,
     },
    },
   };
  }),
 setItemHeight: (id, height) =>
  set((state) => {
   const measuredHeight = Math.ceil(height);
   const current = state.items[id];

   if (measuredHeight <= 0) {
    return state;
   }

   if (current?.height === measuredHeight) {
    return state;
   }

   return {
    items: {
     ...state.items,
     [id]: {
      height: measuredHeight,
      visible: current?.visible ?? false,
      order: current?.order ?? null,
     },
    },
   };
  }),
}));

export const useTopToastOffset = (id: string) =>
 useToastLayoutStore((state) => getOffsetForItem(state.items, id));

export const useTopToastStack = (id: string, visible: boolean) => {
 const offset = useTopToastOffset(id);
 const showItem = useToastLayoutStore((state) => state.showItem);
 const hideItem = useToastLayoutStore((state) => state.hideItem);
 const setItemHeight = useToastLayoutStore((state) => state.setItemHeight);

 useEffect(() => {
  if (visible) {
   showItem(id);
  } else {
   hideItem(id);
  }

  return () => {
   hideItem(id);
  };
 }, [hideItem, id, showItem, visible]);

 const onLayout = (event: LayoutChangeEvent) => {
  setItemHeight(id, event.nativeEvent.layout.height);
 };

 return {
  offset,
  onLayout,
 };
};
