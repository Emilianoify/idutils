import type { Metadata, Viewport } from 'next'

// Tipografías servidas desde el paquete, no desde un CDN. Una coordinación
// puede estar instalada sin internet de salida (D3), y una fuente que no baja
// hace que toda la interfaz caiga a la fuente del sistema.
// Import AL ARCHIVO .css, no al paquete: el especificador pelado se resuelve
// pero Turbopack no emite el CSS, y las fuentes caen a las del sistema sin
// que falle nada. El sintoma es "se ve distinto" y no apunta a ningun lado.
import '@fontsource-variable/archivo/index.css'
// opsz y no index: index trae solo el eje de peso, y el diseño usa el tamaño
// optico. 65 KB contra 35, y contra los 118 de full, que trae ejes que no uso.
import '@fontsource-variable/fraunces/opsz.css'

import './globals.css'

export const metadata: Metadata = {
  title: 'IDUtils',
  description:
    'Coordinación de internación domiciliaria: pacientes, episodios, prestaciones y los vencimientos que hay que reclamar.',
}

export const viewport: Viewport = {
  themeColor: '#0b1610',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}): React.ReactElement {
  return (
    <html lang="es-AR">
      <body>{children}</body>
    </html>
  )
}
