import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LMI Stats',
  description: 'Estatísticas e histórico de partidas de League of Legends',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100 overflow-x-hidden flex flex-col">
        {children}
      </body>
    </html>
  );
}

