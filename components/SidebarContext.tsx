"use client";

import { createContext, useContext, useEffect, useState } from "react";

const COLLAPSED_KEY = "website-crm-sidebar-collapsed";

type SidebarContextType = {
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
  toggle: () => void;
};

const SidebarContext = createContext<SidebarContextType>({
  collapsed: false,
  setCollapsed: () => {},
  toggle: () => {},
});

// Shared between AppSidebar and AppHeader so the header's toggle button can
// reserve its own layout space (no overlapping the search box) and a nav
// link click can collapse the overlay itself, instead of each component
// keeping its own disconnected copy of this state.
export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsedState] = useState(false);

  useEffect(() => {
    try {
      setCollapsedState(window.localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {
      // Private browsing / blocked storage — just stay expanded.
    }
  }, []);

  const setCollapsed = (value: boolean) => {
    setCollapsedState(value);
    try {
      window.localStorage.setItem(COLLAPSED_KEY, value ? "1" : "0");
    } catch {
      // Nothing to persist to — the in-memory toggle still works this session.
    }
  };

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed, toggle: () => setCollapsed(!collapsed) }}>
      {children}
    </SidebarContext.Provider>
  );
}

export const useSidebar = () => useContext(SidebarContext);
