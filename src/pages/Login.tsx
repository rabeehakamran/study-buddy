import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import ErrorBanner from '../components/ErrorBanner';
import Mascot from '../pixel/Mascot';
import PixelScene from '../pixel/PixelScene';

export default function Login() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: name.trim() } },
      });
      if (error) setError(error.message);
      else if (!data.session) setInfo('Almost there! Check your email and click the confirmation link, then sign in.');
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    }
    setBusy(false);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <div className="flex flex-col items-center text-center">
        <Mascot mood="happy" className="mb-3 w-24" />
        <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
          Small steps.
          <br />
          <span className="text-primary">Big brain.</span>
        </h1>
      </div>
      <div className="card w-full max-w-sm p-6">
        <h2 className="text-center text-2xl font-bold text-primary">Study Buddy</h2>
        <p className="mb-5 mt-1 text-center text-sm text-muted">
          {mode === 'signin' ? 'Welcome back! Ready to study?' : 'Make your account'}
        </p>

        <form onSubmit={submit} className="flex flex-col gap-3">
          {mode === 'signup' && (
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Your name
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={30} />
              <span className="text-xs font-normal text-muted">Your friends will see this on leaderboards. Keep it kind 🎀</span>
            </label>
          )}
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Email
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Password
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === 'signup' ? 8 : 6}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />
          </label>

          <ErrorBanner message={error} />
          {info && <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm">{info}</p>}

          <button className="btn btn-primary mt-1" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-muted">
          {mode === 'signin' ? 'New here?' : 'Already have an account?'}{' '}
          <button
            className="font-semibold text-primary"
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin');
              setError(null);
              setInfo(null);
            }}
          >
            {mode === 'signin' ? 'Create an account' : 'Sign in'}
          </button>
        </p>
      </div>
      <PixelScene className="max-w-3xl" />
    </div>
  );
}
