'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { login } from '@/lib/api/auth'
import { ApiError } from '@/lib/api/client'
import { loginSchema } from '@/lib/schemas/login'

interface Failure {
  message: string
  details: readonly string[]
}

const FIELD_CLASSES =
  'border-0 border-b-[1.5px] border-panel-line bg-transparent px-0.5 py-[9px] text-[15px] text-ink transition-colors placeholder:text-[#9AAA9E] hover:border-[#B9C6B7] focus:border-action focus:shadow-[0_1.5px_0_0_var(--color-action)] focus:outline-none'

const LABEL_CLASSES =
  'text-[11.5px] font-medium uppercase tracking-[0.11em] text-ink-muted'

export function LoginForm(): React.ReactElement {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setFailure(null)

    const formData = new FormData(event.currentTarget)
    const parsed = loginSchema.safeParse({
      email: formData.get('email'),
      password: formData.get('password'),
    })

    if (!parsed.success) {
      // Validación del navegador: evita un viaje al servidor por un correo mal
      // escrito. La que manda sigue siendo la de la API.
      setFailure({
        message: 'Revisá los datos',
        details: parsed.error.issues.map((issue) => issue.message),
      })
      return
    }

    setSubmitting(true)

    try {
      await login(parsed.data)
      router.push('/dashboard')
    } catch (error) {
      // Los mensajes del backend ya están escritos para el operador y dicen qué
      // hacer. Se muestran tal cual: reescribirlos acá sería tener dos textos
      // para el mismo problema, y un día van a decir cosas distintas.
      setFailure(
        error instanceof ApiError
          ? { message: error.message, details: error.details }
          : { message: 'No se pudo iniciar sesión. Volvé a intentar', details: [] },
      )
      setSubmitting(false)
    }
  }

  return (
    <form className="flex flex-col gap-[19px]" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-[7px]">
        <label htmlFor="email" className={LABEL_CLASSES}>
          Correo
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          placeholder="nombre@tucoordinacion.com"
          className={FIELD_CLASSES}
        />
      </div>

      <div className="flex flex-col gap-[7px]">
        <label htmlFor="password" className={LABEL_CLASSES}>
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••••••"
          className={FIELD_CLASSES}
        />
      </div>

      {/* `aria-live`: un lector de pantalla tiene que enterarse del error sin
          que la persona vaya a buscarlo. */}
      <div aria-live="polite">
        {failure !== null && (
          <div className="flex gap-3 border-l-2 border-expired bg-[#E9E2DC] px-3 py-2.5 text-[13px] text-ink">
            <div>
              <p className="m-0 font-medium">{failure.message}</p>
              {failure.details.length > 0 && (
                <ul className="m-0 mt-1 list-none p-0 text-ink-muted">
                  {failure.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="mt-1.5 cursor-pointer border-0 bg-action px-[18px] py-[13px] text-[14.5px] font-semibold tracking-[0.01em] text-field transition-colors hover:bg-action-bright active:translate-y-px disabled:cursor-progress disabled:opacity-70"
      >
        {submitting ? 'Entrando…' : 'Iniciar sesión'}
      </button>
    </form>
  )
}
