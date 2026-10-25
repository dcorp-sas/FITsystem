import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Portal de profesores | FIT System',
  description: 'Portal de acceso para profesores del gimnasio: agenda de clases, inscriptos y rutinas conectadas con FIT System.',
  robots: { index: false, follow: false, noarchive: true },
};

export default function TeacherPortalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
