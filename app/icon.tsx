import { ImageResponse } from 'next/og';

export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

// Gemelo en PNG de public/icon.svg. Si tocas uno, toca el otro.
//
// Las medidas salen del SVG y no son a ojo: el trazo del anillo va centrado
// en un radio de 64 con grosor 34, asi que el diametro exterior es
// 64*2 + 34 = 162 y la banda mide 34. Los centros viven en x=168 y x=344,
// por lo que entre los bordes exteriores quedan (344-81) - (168+81) = 14 px.
const RING = 162;
const BAND = 34;
const GAP = 14;

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 114,
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
