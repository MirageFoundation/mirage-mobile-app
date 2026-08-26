import { createContext, useCallback, useContext, useRef } from "react";

import {
  SideMenu,
  type SideMenuRef,
} from "@/src/features/side-menu/side-menu";

type SideMenuContextType = {
  openSideMenu: () => void;
  closeSideMenu: () => void;
};

const SideMenuContext = createContext<SideMenuContextType>({
  openSideMenu: () => {},
  closeSideMenu: () => {},
});

export const useSideMenu = () => useContext(SideMenuContext);

export function SideMenuProvider({ children }: { children: React.ReactNode }) {
  const sideMenuRef = useRef<SideMenuRef>(null);

  const openSideMenu = useCallback(() => {
    sideMenuRef.current?.present();
  }, []);

  const closeSideMenu = useCallback(() => {
    sideMenuRef.current?.dismissImmediate();
  }, []);

  return (
    <SideMenuContext.Provider value={{ openSideMenu, closeSideMenu }}>
      {children}
      <SideMenu ref={sideMenuRef} />
    </SideMenuContext.Provider>
  );
}
