import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Open Loop Extraction Results",
  description: "Static benchmark results viewer for openloop-bench.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link className="site-title" href="/">
            openloop-bench
          </Link>
          <nav aria-label="Report pages">
            <Link href="/">Results</Link>
            <Link href="/corpus">Corpus</Link>
            <Link href="/failures">Failures</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
