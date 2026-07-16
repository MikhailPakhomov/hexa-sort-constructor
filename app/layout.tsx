import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hexa Sort — конструктор уровней",
  description: "Редактор и экспорт конфигураций уровней Hexa Sort",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
