import { ImageResponse } from 'next/og';

export const alt = 'FIT System: software de gestión para gimnasios';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', padding: '66px 76px', color: '#f8fafc',
        background: 'linear-gradient(135deg, #08111f 0%, #142c59 58%, #0b1120 100%)',
        fontFamily: 'Arial, sans-serif',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ display: 'flex', width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center', background: '#2563eb', fontSize: 42, fontWeight: 900 }}>F</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: 1 }}>FIT SYSTEM</span>
            <span style={{ color: '#93c5fd', fontSize: 17 }}>GESTIÓN INTEGRAL PARA GIMNASIOS</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 940 }}>
          <div style={{ fontSize: 62, lineHeight: 1.08, fontWeight: 800 }}>Tu gimnasio, todo en un solo sistema.</div>
          <div style={{ fontSize: 27, color: '#cbd5e1' }}>Socios · Cuotas · Caja · Clases · Rutinas · App móvil</div>
        </div>
        <div style={{ display: 'flex', gap: 14 }}>
          {['Operación local', 'App para socios', 'Portal de profesores'].map((item) => (
            <div key={item} style={{ display: 'flex', border: '1px solid #47618a', borderRadius: 14, padding: '12px 18px', fontSize: 18, color: '#dbeafe', background: 'rgba(15, 23, 42, 0.5)' }}>{item}</div>
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
