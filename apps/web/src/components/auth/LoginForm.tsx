'use client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button, Input } from '@mm/ui'
import { createClient } from '../../lib/supabase/client'
import { getRoleHome } from '../../lib/auth/role-home'

const schema = z.object({
  email:    z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})
type FormData = z.infer<typeof schema>

export function LoginForm() {
  const router = useRouter()
  const supabase = createClient()

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  async function onSubmit(data: FormData) {
    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    })
    if (error) {
      setError('root', { message: 'Incorrect email or password.' })
      return
    }
    const role = (authData.session?.user.app_metadata?.['role'] as string) ?? 'student'
    router.push(getRoleHome(role))
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register('email')}
      />
      <Input
        label="Password"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register('password')}
      />

      {errors.root && (
        <p role="alert" className="text-sm text-[var(--error)]">
          {errors.root.message}
        </p>
      )}

      <Button type="submit" className="w-full" loading={isSubmitting}>
        Sign in
      </Button>

      <div className="flex justify-between text-sm pt-1">
        <Link href="/signup" className="text-[var(--primary)] hover:underline">
          Create account
        </Link>
        <Link href="/forgot-password" className="text-[var(--muted)] hover:underline">
          Forgot password?
        </Link>
      </div>
    </form>
  )
}
