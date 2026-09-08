'use client'

import { useEffect, useState } from 'react'

/**
 * Si React ya tomó control de la página, o si todavía es HTML del servidor.
 *
 * Entre que el navegador pinta el HTML y que el bundle hidrata hay una ventana
 * —corta en localhost, larga en un celular por wifi— en la que los formularios
 * YA SE PUEDEN ENVIAR pero `onSubmit` todavía no existe. Ahí el navegador hace
 * el envío nativo, que es un comportamiento distinto del que el componente
 * describe.
 *
 * El `useEffect` corre solo en el cliente y solo después de hidratar, así que
 * `false` en el servidor y en el primer render, `true` de ahí en adelante. Es
 * la forma de que un botón pueda decir "todavía no" en vez de dejar que la
 * ventana se note.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  return hydrated
}
