'use client';

import Link from 'next/link';
import {useTranslations} from 'next-intl';
import {useParams, useRouter} from 'next/navigation';
import {FormEvent, useMemo, useState} from 'react';
import {createClient} from '@/lib/supabase/client';

type Mode = 'sign-in' | 'sign-up' | 'forgot-password' | 'update-password';

export function AuthForm({mode}: {mode: Mode}) {
  const t = useTranslations('auth');
  const {locale} = useParams<{locale: string}>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError('');
    setMessage('');
    setSaving(true);
    const values = new FormData(form);
    const email = String(values.get('email') ?? '').trim();
    const password = String(values.get('password') ?? '');
    const username = String(values.get('username') ?? '').trim();

    try {
      if (mode === 'sign-in') {
        const {error: authError} = await supabase.auth.signInWithPassword({email, password});
        if (authError) throw authError;
        router.replace(`/${locale}/account`);
      } else if (mode === 'sign-up') {
        const {data, error: authError} = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {username, full_name: username},
            emailRedirectTo: `${window.location.origin}/${locale}/auth/callback?next=/${locale}/account`
          }
        });
        if (authError) throw authError;
        if (data.session) {
          router.replace(`/${locale}/account`);
        } else {
          setMessage(t('checkEmail'));
          form.reset();
        }
      } else if (mode === 'forgot-password') {
        const {error: authError} = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/${locale}/auth/callback?next=/${locale}/update-password`
        });
        if (authError) throw authError;
        setMessage(t('resetSent'));
        form.reset();
      } else {
        const {error: authError} = await supabase.auth.updateUser({password});
        if (authError) throw authError;
        setMessage(t('passwordUpdated'));
        window.setTimeout(() => router.replace(`/${locale}/account`), 1000);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('genericError'));
    } finally {
      setSaving(false);
    }
  }

  const title = t(`${mode}.title`);
  return <section className="section"><form className="form-card" onSubmit={submit}>
    <h1>{title}</h1>
    {mode === 'sign-up' && <label className="field"><span>{t('username')}</span><input name="username" autoComplete="username" minLength={2} maxLength={60} required/></label>}
    {mode !== 'update-password' && <label className="field"><span>{t('email')}</span><input name="email" type="email" autoComplete="email" required/></label>}
    {(mode === 'sign-in' || mode === 'sign-up' || mode === 'update-password') && <label className="field"><span>{mode === 'update-password' ? t('newPassword') : t('password')}</span><input name="password" type="password" autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} minLength={8} required/></label>}
    {error && <p className="error" role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    <button className="button" disabled={saving}>{saving ? t('working') : t(`${mode}.submit`)}</button>
    {mode === 'sign-in' && <><p><Link href={`/${locale}/forgot-password`}>{t('forgotLink')}</Link></p><p>{t('newCustomer')} <Link href={`/${locale}/sign-up`}>{t('createLink')}</Link></p></>}
    {mode !== 'sign-in' && mode !== 'update-password' && <p><Link href={`/${locale}/sign-in`}>{t('backToSignIn')}</Link></p>}
  </form></section>;
}
