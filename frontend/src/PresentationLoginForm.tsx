import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, LoaderCircle, ShieldCheck, UserRound } from 'lucide-react';
import { api, refreshCsrf } from './api';
import type { User } from './types';

type Entrance = { username: string; password: string; expires_in: number };

export default function PresentationLoginForm({ onLogin, onTeamLogin }: {
  onLogin: (user: User) => void; onTeamLogin: () => void;
}) {
  const [entrance, setEntrance] = useState<Entrance | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const expiresAt = useRef(0);
  const active = useRef(true);
  const submitButton = useRef<HTMLButtonElement>(null);

  async function prepare(signal?: AbortSignal): Promise<Entrance> {
    const result = await api<Entrance>('/api/presentation-login', { signal, cache: 'no-store' });
    if (!result.username || !result.password || !(result.expires_in > 0)) {
      throw new Error('입장 정보를 준비하지 못했습니다. 다시 시도해 주세요.');
    }
    if (active.current && !signal?.aborted) {
      expiresAt.current = Date.now() + result.expires_in * 1000;
      setEntrance(result);
    }
    return result;
  }

  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    // Defer one tick so StrictMode does not open two anonymous sessions.
    const timer = window.setTimeout(() => {
      void prepare(controller.signal).catch(failure => {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : '입장 준비에 실패했습니다.');
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 0);
    return () => { active.current = false; clearTimeout(timer); controller.abort(); };
  }, []);

  useEffect(() => { if (entrance && !loading) submitButton.current?.focus(); }, [entrance, loading]);

  async function retry() {
    setLoading(true); setError('');
    try { await prepare(); }
    catch (failure) { if (active.current) setError(failure instanceof Error ? failure.message : '입장 준비에 실패했습니다.'); }
    finally { if (active.current) setLoading(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || loading || !entrance) return;
    setPending(true); setError('');
    try {
      const current = expiresAt.current <= Date.now() + 5000 ? await prepare() : entrance;
      await refreshCsrf();
      const result = await api<{ user: User }>('/api/login', {
        method: 'POST', body: JSON.stringify({ username: current.username, password: current.password }),
      });
      await refreshCsrf();
      if (active.current) { setEntrance(null); onLogin(result.user); }
    } catch (failure) {
      if (active.current) {
        expiresAt.current = 0;
        setError(failure instanceof Error ? failure.message : '입장하지 못했습니다. 다시 시도해 주세요.');
      }
    } finally { if (active.current) setPending(false); }
  }

  return <>
    <h2>관제실 입장</h2>
    <p>아이디·비밀번호가 준비돼 있어요. 바로 들어가세요.</p>
    <form onSubmit={submit} autoComplete="off">
      <label htmlFor="presentation-username">아이디</label>
      <div className="input-with-icon"><UserRound size={16} /><input id="presentation-username" name="presentation-username" value={entrance?.username ?? ''} placeholder={loading ? '입장 준비 중…' : ''} readOnly autoComplete="off" /></div>
      <label htmlFor="presentation-password">비밀번호</label>
      <div className="input-with-icon"><ShieldCheck size={16} /><input id="presentation-password" name="presentation-password" type={showPassword ? 'text' : 'password'} value={entrance?.password ?? ''} readOnly autoComplete="off" /><button type="button" className="password-toggle" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
      {error && <div className="form-error" role="alert">{error}{!entrance && <button type="button" className="text-button" onClick={() => void retry()} disabled={loading}>다시 준비</button>}</div>}
      <button ref={submitButton} className="primary-button login-submit" disabled={pending || loading || !entrance} type="submit">{pending || loading ? <><LoaderCircle className="spin" size={17} />{pending ? '입장 중' : '입장 준비 중'}</> : <>관제실 들어가기<ArrowRight size={18} /></>}</button>
    </form>
    <p className="login-help">발표용 3D 설비·그래프·시뮬레이션을 직접 볼 수 있어요. 팀 기록은 수정되지 않습니다.</p>
    <button className="text-button" type="button" onClick={onTeamLogin} disabled={pending}>팀 계정으로 로그인</button>
  </>;
}
