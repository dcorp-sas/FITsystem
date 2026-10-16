import Link from 'next/link';
import { PurchaseStatus } from './purchase-status';

export const metadata = {
  title: 'Estado de tu compra · FIT System',
  robots: { index: false },
};

export default async function PagarPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; estado?: string }>;
}) {
  const sp = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-base px-4 py-16">
      <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-8 text-center shadow-2xl">
        <PurchaseStatus externalRef={sp.ref ?? ''} estado={sp.estado ?? ''} />
        <Link href="/" className="mt-6 inline-block text-sm font-medium text-primary-light transition-colors hover:text-primary">
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
