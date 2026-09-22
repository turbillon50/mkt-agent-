import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

// El de iOS va A SANGRE, sin esquinas redondeadas.
//
// iOS aplica su propia mascara de squircle. Si el archivo ya viniera
// redondeado, iOS lo redondearia por segunda vez y apareceria una muesca
// oscura en las cuatro esquinas. Por eso este no lleva borderRadius y
// public/icon.svg (el de la web) si.
//
// Mismas proporciones que el de 512, escaladas por 180/512 = 0.3516:
// anillo 162 -> 57, banda 34 -> 12, hueco 14 -> 5.
const RING = 57;
const BAND = 12;
const GAP = 5;

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundImage: 'linear-gradient(135deg, #8B4DFF 0%, #C77DFF 48%, #FF6FAE 100%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: GAP }}>
          <div
            style={{
              width: RING,
              height: RING,
              borderRadius: '50%',
              border: `${BAND}px solid #0b0817`,
              boxSizing: 'border-box',
            }}
          />
          <div
            style={{
              width: RING,
              height: RING,
              borderRadius: '50%',
              border: `${BAND}px solid #0b0817`,
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>
    ),
    { ...size },
  );
}
