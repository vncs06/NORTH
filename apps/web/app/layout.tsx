import type { Metadata } from 'next';
import Link from 'next/link';
import './styles.css';

export const metadata: Metadata = {
  title: 'NORTH ERP',
  description: 'Controle operacional de materiais',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <header className="topbar">
          <Link className="brand" href="/materials">
            NORTH
          </Link>
          <nav aria-label="Navegação principal">
            <Link href="/materials">Materiais</Link>
            <Link href="/settings/users">Usuários</Link>
            <Link href="/audit">Auditoria</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
