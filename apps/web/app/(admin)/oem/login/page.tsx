'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api/client';
import { t } from '@/lib/i18n';

export default function OEMLoginPage() {
  const d = t();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.oem.login(email, password);
      router.push('/oem/dashboard');
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : d.errors.generic);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="card space-y-4">
      <h1 className="text-xl font-bold">{d.oem.loginTitle}</h1>
      <label className="block space-y-1">
        <span className="text-sm font-medium">{d.oem.email}</span>
        <input
          className="input"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">{d.oem.password}</span>
        <input
          className="input"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {error && (
        <p role="alert" className="text-danger-600 text-sm">
          {error}
        </p>
      )}
      <button className="btn-primary w-full" disabled={busy} type="submit">
        {d.oem.signIn}
      </button>
    </form>
  );
}
