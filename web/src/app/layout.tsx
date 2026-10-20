import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Header } from "@/components/Header";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "LaoCarbon",
  description: "Forestry carbon credits from Lao PDR — buy, retire and certify on-chain.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <Providers>
          <Header />
          <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
