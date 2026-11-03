"use client";
import React, { useEffect, useState } from "react";

// Dark mode itself lives entirely in app/globals.css (the `.bat-mode`
// block) — this component's only job is toggling that class on <html>
// and persisting the choice. See globals.css for why a straight
// `[class*="bg-..."]` + !important sweep got replaced with a more
// targeted re-theme.
export default function BatmanThemeToggle() {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const storedTheme = localStorage.getItem("bat-theme");
    const dark = storedTheme === "dark";
    document.documentElement.classList.toggle("bat-mode", dark);
    if (storedTheme !== "dark" && storedTheme !== "light") {
      localStorage.setItem("bat-theme", "light");
    }
    setIsDark(dark);
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    document.documentElement.classList.toggle("bat-mode", next);
    localStorage.setItem("bat-theme", next ? "dark" : "light");
    setIsDark(next);
  };

  if (!mounted) return null;

  return (
    <button
      onClick={toggleTheme}
      className={`fixed bottom-8 right-8 z-[9999] p-4 rounded-full shadow-2xl transition-all duration-500 hover:scale-110 flex items-center justify-center ${
        isDark
          ? "bg-[#2C74B3] text-[#0A2647] shadow-[0_0_30px_rgba(44,116,179,0.5)] border-2 border-[#2C74B3]"
          : "bg-black text-[#2C74B3] shadow-xl border border-gray-800"
      }`}
      title={isDark ? "Deactivate Bat-Mode" : "Activate Bat-Mode"}
    >
      <svg
        className={`w-8 h-8 transition-transform duration-700 ${isDark ? "scale-95 drop-shadow-[0_0_8px_rgba(44,116,179,0.8)]" : ""}`}
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path d="M12.004,22 C12.004,22 17.653,17.432 19.349,14.613 C21.045,11.794 23.332,10.297 23.332,10.297 C23.332,10.297 21.365,10.609 19.646,9.811 C17.927,9.013 17.581,7.202 17.581,7.202 C17.581,7.202 16.591,8.336 15.111,8.441 C13.631,8.546 12.984,7.202 12.984,7.202 L12.637,4 L11.369,4 L11.022,7.202 C11.022,7.202 10.375,8.546 8.895,8.441 C7.415,8.336 6.425,7.202 6.425,7.202 C6.425,7.202 6.079,9.013 4.36,9.811 C2.641,10.609 0.674,10.297 0.674,10.297 C0.674,10.297 2.961,11.794 4.657,14.613 C6.353,17.432 12.004,22 12.004,22 Z" />
      </svg>
    </button>
  );
}
