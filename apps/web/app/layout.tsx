import type { Metadata } from 'next';
import Link from 'next/link';
import './styles.css';

export const metadata: Metadata = {
  title: 'NORTH ERP',
  description: 'Operação, catálogo e orçamento explicável',
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
            <Link href="/customers">Clientes</Link>
            <Link href="/catalog">Catálogo</Link>
            <Link href="/technical-sheets">Fichas</Link>
            <Link href="/pricing">Preços</Link>
            <Link href="/quotes">Orçamentos</Link>
            <Link href="/settings/users">Usuários</Link>
            <Link href="/audit">Auditoria</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
