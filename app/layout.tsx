import BatmanThemeToggle from "@/components/BatmanThemeToggle";
import TopAuthBar from "@/components/TopAuthBar";
import { AuthProvider } from "@/components/AuthProvider";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Website CRM",
  description: "Website project tracking dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body
        className="bg-slate-950 text-slate-300 antialiased min-h-screen flex flex-col overflow-x-hidden"
        suppressHydrationWarning
      >
        <AuthProvider>
          <TopAuthBar />
          <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[var(--bg)]">
            <div className="absolute -top-20 left-[-5rem] h-64 w-64 rounded-full bg-[var(--accent)]/10 blur-3xl" />
            <div className="absolute top-44 right-[-5rem] h-72 w-72 rounded-full bg-[var(--button)]/10 blur-3xl" />
          </div>
          <div className="relative z-10 flex min-h-screen flex-col">
            {children}
          </div>
          <BatmanThemeToggle />
        </AuthProvider>
      </body>
    </html>
  );
}
