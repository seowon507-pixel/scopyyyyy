// scopy — 로그인 게이트: 인증 전에는 사이트 전체를 가리고, 로그인/이메일 인증
// 완료 후에만(Supabase 세션이 생긴 후에만) 콘텐츠를 보여준다.
(function () {
  const overlay = document.getElementById('authModalOverlay');
  const title = document.getElementById('authModalTitle');
  const tabSignin = document.getElementById('authTabSignin');
  const tabSignup = document.getElementById('authTabSignup');
  const form = document.getElementById('authForm');
  const emailInput = document.getElementById('authEmail');
  const passwordInput = document.getElementById('authPassword');
  const message = document.getElementById('authMessage');
  const submitBtn = document.getElementById('authSubmitBtn');
  const resendBtn = document.getElementById('authResendBtn');
  const authChip = document.getElementById('authChip');

  let mode = 'signin';
  let lastEmail = '';

  function setMessage(text, isError) {
    if (!text) {
      message.hidden = true;
      message.textContent = '';
      return;
    }
    message.hidden = false;
    message.textContent = text;
    message.classList.toggle('is-error', !!isError);
  }

  function setMode(next) {
    mode = next;
    tabSignin.classList.toggle('is-active', mode === 'signin');
    tabSignup.classList.toggle('is-active', mode === 'signup');
    title.textContent = mode === 'signin' ? '로그인' : '회원가입';
    submitBtn.textContent = mode === 'signin' ? '로그인' : '가입하고 인증 메일 받기';
    passwordInput.autocomplete = mode === 'signin' ? 'current-password' : 'new-password';
    setMessage('');
    resendBtn.hidden = true;
  }

  function setLocked(locked) {
    document.body.classList.toggle('is-locked', locked);
    overlay.hidden = !locked;
    if (locked) setMode('signin');
  }

  tabSignin.addEventListener('click', () => setMode('signin'));
  tabSignup.addEventListener('click', () => setMode('signup'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) return;
    lastEmail = email;
    submitBtn.disabled = true;
    resendBtn.hidden = true;
    setMessage(mode === 'signin' ? '로그인 중…' : '가입 처리 중…');

    const result = mode === 'signin'
      ? await window.Auth.signIn(email, password)
      : await window.Auth.signUp(email, password);

    submitBtn.disabled = false;

    if (result.error) {
      const msg = result.error.message || '';
      if (/email not confirmed/i.test(msg)) {
        setMessage('이메일 인증이 아직 완료되지 않았습니다. 메일함을 확인하거나 인증 메일을 다시 받으세요.', true);
        resendBtn.hidden = false;
      } else if (/invalid login credentials/i.test(msg)) {
        setMessage('이메일 또는 비밀번호가 올바르지 않습니다.', true);
      } else {
        setMessage(msg || '오류가 발생했습니다. 다시 시도해주세요.', true);
      }
      return;
    }

    if (mode === 'signup') {
      setMessage(`${email} 주소로 인증 메일을 보냈습니다. 메일함에서 링크를 눌러 인증을 완료해주세요.`);
      return;
    }
    // 로그인 성공 시 Auth.onChange가 세션을 감지해 자동으로 게이트를 해제한다.
  });

  resendBtn.addEventListener('click', async () => {
    if (!lastEmail) return;
    resendBtn.disabled = true;
    setMessage('인증 메일을 다시 보내는 중…');
    const { error } = await window.Auth.resendVerification(lastEmail);
    resendBtn.disabled = false;
    if (error) {
      setMessage(error.message || '인증 메일 재발송에 실패했습니다.', true);
      return;
    }
    setMessage('인증 메일을 다시 보냈습니다. 메일함을 확인해주세요.');
  });

  function renderAuthChip(user) {
    if (!user) {
      authChip.replaceChildren();
      return;
    }
    const info = document.createElement('div');
    info.className = 'auth-chip-user';
    const label = document.createElement('div');
    label.className = 'auth-chip-email';
    label.textContent = user.email;
    const signOutBtn = document.createElement('button');
    signOutBtn.type = 'button';
    signOutBtn.className = 'btn auth-chip-action';
    signOutBtn.textContent = '로그아웃';
    signOutBtn.addEventListener('click', async () => {
      signOutBtn.disabled = true;
      await window.Auth.signOut();
    });
    info.append(label, signOutBtn);
    authChip.replaceChildren(info);
  }

  window.Auth.onChange((user) => {
    setLocked(!user);
    renderAuthChip(user);
  });
  window.Auth.init();
})();
