import type { Metadata } from "next";
import { Inter } from "next/font/google"; // Removed unused Geist imports
import "./globals.css";

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter', // This creates the CSS variable
});

export const metadata: Metadata = {
  title: "Inspection App",
  description: "An app to manage venue inspections",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      {/* Apply the variable to the <body> or <html> */}
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
