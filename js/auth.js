// scopy — Supabase 이메일 인증 회원가입/로그인
// 이 프로젝트는 정적 SPA라 별도 서버 없이 브라우저에서 Supabase Auth를 직접 호출한다.
(function () {
  const SUPABASE_URL = 'https://vwbeqyurgvoknznoamqe.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3YmVxeXVyZ3Zva256bm9hbXFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwMDg3MTEsImV4cCI6MjA5OTU4NDcxMX0.KKjtSd0eiq11pqMviGsghcvXZfz784NA3TCRqFLV0_o';

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  let currentUser = null;
  const listeners = [];

  function notify() {
    listeners.forEach((fn) => {
      try { fn(currentUser); } catch (e) { console.error(e); }
    });
  }

  async function init() {
    const { data } = await sb.auth.getSession();
    currentUser = data.session ? data.session.user : null;
    notify();
    sb.auth.onAuthStateChange((_event, session) => {
      currentUser = session ? session.user : null;
      notify();
    });
  }

  function onChange(fn) {
    listeners.push(fn);
    fn(currentUser);
  }

  function getUser() {
    return currentUser;
  }

  async function signUp(email, password) {
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    });
    if (error) return { error };
    // identities가 빈 배열이면 이미 가입(및 인증)된 이메일
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return { error: { message: '이미 가입된 이메일입니다. 로그인해주세요.' } };
    }
    return { data };
  }

  async function signIn(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return { error };
    return { data };
  }

  async function signOut() {
    return sb.auth.signOut();
  }

  async function resendVerification(email) {
    return sb.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    });
  }

  window.Auth = { init, onChange, getUser, signUp, signIn, signOut, resendVerification };
})();
