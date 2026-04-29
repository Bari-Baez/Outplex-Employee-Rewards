'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import Image from 'next/image';
import { ShieldCheck, X, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Lenis from 'lenis';
import { createClient } from '@/lib/supabase/client';

// ── UTILS ────────────────────────────────────────────────────────────

function getReadableAuthError(error: unknown) {
  if (error instanceof Error && /Failed to fetch/i.test(error.message))
    return 'No se pudo conectar con el servidor. Verifica tu conexión.';
  return error instanceof Error ? error.message : 'Unable to complete the login request.';
}

// ── TYPES ────────────────────────────────────────────────────────────

type Star = {
  x: number;
  y: number;
  z: number;
  r: number;
  phase: number;
  hue: number;
};

type Nebula = {
  x: number;
  y: number;
  rx: number;
  ry: number;
  angle: number;
  alpha: number;
  pulseSpeed: number;
  phase: number;
  startThreshold: number;
  hue: number;
};

function SlackIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 122 122"
      role="img"
      aria-label="Slack"
      focusable="false"
    >
      <path d="M25.3 77.3c0 7-5.7 12.7-12.7 12.7S0 84.3 0 77.3s5.7-12.7 12.7-12.7h12.7v12.7z" fill="#E01E5A" />
      <path d="M31.7 77.3c0-7 5.7-12.7 12.7-12.7s12.7 5.7 12.7 12.7V109c0 7-5.7 12.7-12.7 12.7s-12.7-5.7-12.7-12.7V77.3z" fill="#E01E5A" />
      <path d="M44.3 25.3c-7 0-12.7-5.7-12.7-12.7S37.3 0 44.3 0s12.7 5.7 12.7 12.7v12.7H44.3z" fill="#36C5F0" />
      <path d="M44.3 31.7c7 0 12.7 5.7 12.7 12.7s-5.7 12.7-12.7 12.7H13c-7 0-12.7-5.7-12.7-12.7S6 31.7 13 31.7h31.3z" fill="#36C5F0" />
      <path d="M96.7 44.3c0-7 5.7-12.7 12.7-12.7s12.7 5.7 12.7 12.7-5.7 12.7-12.7 12.7H96.7V44.3z" fill="#2EB67D" />
      <path d="M90.3 44.3c0 7-5.7 12.7-12.7 12.7s-12.7-5.7-12.7-12.7V13c0-7 5.7-12.7 12.7-12.7S90.3 6 90.3 13v31.3z" fill="#2EB67D" />
      <path d="M77.7 96.7c7 0 12.7 5.7 12.7 12.7s-5.7 12.7-12.7 12.7S65 116.4 65 109.4V96.7h12.7z" fill="#ECB22E" />
      <path d="M77.7 90.3c-7 0-12.7-5.7-12.7-12.7s5.7-12.7 12.7-12.7H109c7 0 12.7 5.7 12.7 12.7s-5.7 12.7-12.7 12.7H77.7z" fill="#ECB22E" />
    </svg>
  );
}

// ── MAIN CLIENT COMPONENT ─────────────────────────────────────────────

export function LandingClient({
  variant = 'home',
  initialError = null,
}: {
  variant?: 'home' | 'login';
  initialError?: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(initialError);
  const [showForm, setShowForm]         = useState(variant === 'login');
  const [spaceLocked, setSpaceLocked]   = useState(variant === 'login');
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [showSlackModal, setShowSlackModal] = useState(false);
  const [emailInput, setEmailInput]     = useState('');
  const [passwordInput, setPasswordInput] = useState('');

  // ── Canvas / animation refs ──────────────────────────────────────
  const canvasRef          = useRef<HTMLCanvasElement | null>(null);
  const starsRef           = useRef<Star[]>([]);
  const nebulasRef         = useRef<Nebula[]>([]);
  const scrollRef          = useRef({ progress: variant === 'login' ? 1 : 0, velocity: 0 });
  const mouseRef           = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const timeRef            = useRef(0);
  const dampedProgressRef  = useRef(variant === 'login' ? 1 : 0);
  const rafRef             = useRef<number | null>(null);
  const lenisRef           = useRef<Lenis | null>(null);
  // Ref-based space-lock so the scroll handler doesn't capture stale state
  const spaceLockedRef     = useRef(variant === 'login');

  // ── DOM refs for direct style updates (no React re-renders on scroll) ──
  const scrollIndicatorRef = useRef<HTMLDivElement | null>(null);
  const loginCardWrapRef   = useRef<HTMLDivElement | null>(null);

  // ── Canvas + RAF setup — runs once (variant is constant after mount) ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // alpha:false tells the compositor to skip alpha blending on this canvas layer
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    // Mac trackpads have buttery-smooth native inertia — don't fight it with Lenis
    const isMac = /Mac/i.test(navigator.platform || navigator.userAgent);
    // Lower DPR cap on Mac retina to reduce canvas pixel count by ~44 %
    const dpr = Math.min(window.devicePixelRatio || 1, isMac ? 1.5 : 2);

    let resizeTimer: ReturnType<typeof setTimeout> | null = null;

    const init = () => {
      const W = window.innerWidth;
      const H = window.innerHeight;

      canvas.width  = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width  = `${W}px`;
      canvas.style.height = `${H}px`;
      // setTransform is more reliable than ctx.scale after resize
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Fewer stars per pixel on high-DPR or Mac to keep fill-rate manageable
      const density  = isMac ? 6500 : 4500;
      const starCount = Math.floor((W * H) / density);
      starsRef.current = Array.from({ length: starCount }, () => ({
        x:     Math.random() * W,
        y:     Math.random() * H,
        z:     Math.random(),
        r:     0.4 + Math.random() * 1.6,
        phase: Math.random() * Math.PI * 2,
        hue:   Math.random() > 0.8 ? (Math.random() > 0.5 ? 210 : 45) : 0,
      }));

      // 8 nebulas instead of 15 — nearly half the radial-gradient fill cost
      nebulasRef.current = Array.from({ length: 8 }, () => {
        const side = Math.random() > 0.5 ? 1 : -1;
        return {
          x:              W / 2 + side * (W * 0.2 + Math.random() * W * 0.4),
          y:              Math.random() * H,
          rx:             500 + Math.random() * 900,
          ry:             400 + Math.random() * 700,
          angle:          Math.random() * Math.PI * 2,
          hue:            Math.random() > 0.5 ? 240 + Math.random() * 40 : 180 + Math.random() * 40,
          alpha:          0.02 + Math.random() * 0.04,
          pulseSpeed:     0.05 + Math.random() * 0.15,
          phase:          Math.random() * Math.PI * 2,
          startThreshold: Math.random() * 0.35,
        };
      });
    };

    init();

    // Debounce resize — avoids reinitialising stars on every pixel during drag
    const handleResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(init, 250);
    };
    window.addEventListener('resize', handleResize, { passive: true });

    lenisRef.current = new Lenis({
      duration:    1.6,
      easing:      (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      // On Mac, native trackpad inertia is already smooth — keep smoothWheel off
      smoothWheel: !isMac,
    });

    lenisRef.current.on('scroll', (e: { progress: number; velocity: number }) => {
      const p = e.progress;
      scrollRef.current.progress = p;
      scrollRef.current.velocity = e.velocity;

      if (p >= 0.99 && !spaceLockedRef.current) {
        spaceLockedRef.current = true;
        setSpaceLocked(true);
        lenisRef.current?.stop();
        window.scrollTo(0, document.body.scrollHeight);
      }

      // Scroll back up past threshold → release lock and resume Lenis
      if (spaceLockedRef.current && p < 0.9) {
        spaceLockedRef.current = false;
        setSpaceLocked(false);
        lenisRef.current?.start();
      }
    });

    // When Lenis is stopped, wheel/trackpad events don't reach the scroll handler.
    // Detect an upward scroll directly and restart Lenis so the user can go back up.
    const handleWheelUp = (e: WheelEvent) => {
      if (spaceLockedRef.current && e.deltaY < 0) {
        spaceLockedRef.current = false;
        setSpaceLocked(false);
        lenisRef.current?.start();
      }
    };
    window.addEventListener('wheel', handleWheelUp, { passive: true });

    const animate = (now: number) => {
      // Cap delta to 50 ms — prevents a huge jump when the tab regains focus
      const delta = Math.min(now - (timeRef.current || now), 50);
      timeRef.current = now;
      const t = now * 0.001;

      lenisRef.current?.raf(now);

      const W = window.innerWidth;
      const H = window.innerHeight;
      const { progress: actualProgress, velocity } = scrollRef.current;

      const dampFactor = velocity > 5 ? 0.04 : 0.08;
      dampedProgressRef.current += (actualProgress - dampedProgressRef.current) * dampFactor;
      const progress = dampedProgressRef.current;

      mouseRef.current.x += (mouseRef.current.tx - mouseRef.current.x) * 0.05;
      mouseRef.current.y += (mouseRef.current.ty - mouseRef.current.y) * 0.05;

      // ── Direct DOM style updates — bypasses React reconciliation entirely ──
      if (scrollIndicatorRef.current) {
        scrollIndicatorRef.current.style.opacity = `${Math.max(0, 1 - progress * 2.5)}`;
      }
      if (loginCardWrapRef.current) {
        loginCardWrapRef.current.style.opacity   = `${Math.min(1, Math.max(0, (progress - 0.8) * 5))}`;
        loginCardWrapRef.current.style.transform = `scale(${0.7 + Math.min(0.3, (progress - 0.8) * 1.5)}) translateY(${30 * (1 - progress)}px)`;
        loginCardWrapRef.current.style.filter    = `blur(${Math.max(0, (1 - progress) * 15)}px)`;
      }

      // ── Background ─────────────────────────────────────────────────
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);

      // ── Nebulas ────────────────────────────────────────────────────
      ctx.save();
      ctx.globalCompositeOperation = 'screen';

      nebulasRef.current.forEach((neb) => {
        const localProg  = Math.min(1, Math.max(0, (progress - neb.startThreshold) * 1.8));
        const localAlpha = localProg * localProg * (3 - 2 * localProg);
        // Skip invisible nebulas — avoids gradient creation + fill entirely
        if (localAlpha < 0.01) return;

        const parallaxY = progress * H * 0.3;
        const px = neb.x + Math.sin(t * 0.05 + neb.phase) * 60;
        const py = (neb.y - parallaxY + H * 5) % H + Math.cos(t * 0.04 + neb.phase) * 40;

        const pulse  = 0.9 + 0.1 * Math.sin(t * neb.pulseSpeed + neb.phase);
        const finalRx = neb.rx * (0.8 + localAlpha * 0.2) * pulse;
        const finalRy = neb.ry * (0.8 + localAlpha * 0.2) * pulse;

        const grad = ctx.createRadialGradient(px, py, 0, px, py, finalRx);
        grad.addColorStop(0,   `hsla(${neb.hue}, 70%, 30%, ${neb.alpha * localAlpha})`);
        grad.addColorStop(0.6, `hsla(${neb.hue}, 60%, 15%, ${neb.alpha * 0.3 * localAlpha})`);
        grad.addColorStop(1,   'transparent');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(px, py, finalRx, finalRy, neb.angle + t * 0.005, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.restore();

      // ── Earth ──────────────────────────────────────────────────────
      const earthFade   = Math.max(0, 1 - progress / 0.85);
      const smoothEarthA = earthFade * earthFade * (3 - 2 * earthFade);

      if (smoothEarthA > 0.001) {
        const shrink = 1 - Math.pow(progress, 1.5) * 0.85;
        const eR = H * 0.75 * shrink;
        const eX = W * 0.5;
        const eY = H * 1.0 + Math.pow(progress, 1.2) * H * 1.5;

        ctx.save();
        ctx.globalAlpha = smoothEarthA;

        const atmG = ctx.createRadialGradient(eX, eY, eR * 0.8, eX, eY, eR * 1.3);
        atmG.addColorStop(0,   'transparent');
        atmG.addColorStop(0.4, 'rgba(99, 102, 241, 0.4)');
        atmG.addColorStop(0.7, 'rgba(99, 102, 241, 0.1)');
        atmG.addColorStop(1,   'transparent');
        ctx.fillStyle = atmG;
        ctx.beginPath(); ctx.arc(eX, eY, eR * 1.3, 0, Math.PI * 2); ctx.fill();

        const bodyG = ctx.createRadialGradient(eX - eR * 0.3, eY - eR * 0.3, 0, eX, eY, eR);
        bodyG.addColorStop(0, '#312e81');
        bodyG.addColorStop(1, '#020617');
        ctx.fillStyle = bodyG;
        ctx.beginPath(); ctx.arc(eX, eY, eR, 0, Math.PI * 2); ctx.fill();

        ctx.restore();
      }

      // ── Stars ──────────────────────────────────────────────────────
      const stAlphaBase  = Math.min(1, 0.1 + progress * 2.0);
      const smoothStAlpha = stAlphaBase * stAlphaBase * (3 - 2 * stAlphaBase);

      starsRef.current.forEach((s) => {
        s.x = (s.x + delta * 0.005 * s.z + W) % W;
        s.y = (s.y + delta * 0.003 * s.z + H) % H;

        const dx = (mouseRef.current.x - W / 2) * s.z * 0.02;
        const dy = (mouseRef.current.y - H / 2) * s.z * 0.02;
        const scrollOffset = progress * H * (1 + s.z * 2.5);

        const sx = (s.x + dx + W) % W;
        const sy = (s.y - scrollOffset + dy + H * 10) % H;

        const twinkle = 0.5 + 0.5 * Math.sin(t * 3 + s.phase);
        const alpha   = smoothStAlpha * (0.1 + s.z * 0.9) * twinkle;
        // Skip nearly-invisible stars — saves arc() + fill() calls
        if (alpha < 0.02) return;

        const color        = s.hue ? `hsla(${s.hue}, 90%, 85%, ${alpha})` : `rgba(255, 255, 255, ${alpha})`;
        const velocityStretch = Math.min(15, Math.abs(velocity) * 0.1);
        const dynamicR     = s.r * (1 + Math.min(1.5, Math.abs(velocity) * 0.02));

        ctx.fillStyle = color;

        if (velocityStretch > 1.5) {
          ctx.beginPath();
          ctx.lineWidth   = dynamicR;
          ctx.lineCap     = 'round';
          ctx.strokeStyle = color;
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx, sy + velocityStretch * (velocity > 0 ? -1 : 1));
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(sx, sy, dynamicR, 0, Math.PI * 2);
          ctx.fill();
        }

        // Glow: only the ~20 % largest, brightest stars — saves many gradient creates
        if (s.r > 1.4 && alpha > 0.65) {
          const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, dynamicR * 5);
          glow.addColorStop(0, color.replace(/[^,]+(?=\))/, '0.2'));
          glow.addColorStop(1, 'transparent');
          ctx.fillStyle = glow;
          ctx.beginPath(); ctx.arc(sx, sy, dynamicR * 5, 0, Math.PI * 2); ctx.fill();
        }
      });

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    if (variant === 'login') {
      window.scrollTo(0, document.body.scrollHeight);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('wheel', handleWheelUp);
      if (resizeTimer) clearTimeout(resizeTimer);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lenisRef.current?.destroy();
    };
  }, [variant]); // variant is constant after mount — equivalent to []

  // ── Auth handlers ────────────────────────────────────────────────

  const handleSlackLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'slack_oidc',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          scopes: 'openid profile email',
        },
      });
      if (authError) throw authError;
    } catch (err) {
      setError(getReadableAuthError(err));
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const email = emailInput.toLowerCase().trim();
    const domain = email.split('@')[1];

    const allowedDomains = (process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS || 'outplex.com')
      .split(',')
      .map(d => d.trim().toLowerCase());

    if (!allowedDomains.includes(domain)) {
      setError(`Acceso restringido. Solo dominios autorizados (${allowedDomains.join(', ')}) permitidos.`);
      return;
    }
    setLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: emailInput.toLowerCase().trim(),
        password: passwordInput,
      });
      if (signInError) throw signInError;
      window.location.href = '/dashboard';
    } catch (err) {
      setError(getReadableAuthError(err));
      setLoading(false);
    }
  };

  // ── Initial style values for SSR / first paint ───────────────────
  const isLogin = variant === 'login';

  return (
    <main
      className="relative min-h-screen selection:bg-indigo-500/30 overflow-hidden"
      onMouseMove={(e) => {
        mouseRef.current.tx = e.clientX;
        mouseRef.current.ty = e.clientY;
      }}
    >
      <canvas ref={canvasRef} className="fixed inset-0 z-0 pointer-events-none" />

      <div className="relative z-10">
        <div style={{ height: '650vh' }} className="pointer-events-none" />

        {/* Scroll Progress Indicator */}
        <div
          ref={scrollIndicatorRef}
          className="fixed inset-0 pointer-events-none flex items-center justify-center z-20"
          style={{ opacity: isLogin ? 0 : 1 }}
        >
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-4"
          >
            <div className="w-[1px] h-32 bg-gradient-to-b from-transparent via-cyan-400/50 to-transparent" />
            <span className="text-[10px] font-black tracking-[0.6em] text-cyan-400/70 uppercase text-center">
              INITIATING LAUNCH SEQUENCE
              <br />
              <span className="text-[8px] tracking-[0.2em] font-normal opacity-60">SCROLL DOWN TO ENGAGE</span>
            </span>
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              className="w-1 h-1 rounded-full bg-cyan-400 shadow-[0_0_10px_#22d3ee]"
            />
            <ChevronDown size={20} className="text-cyan-400/50 animate-bounce" />
          </motion.div>
        </div>

        {/* Login Card — opacity/transform/filter driven by RAF, not React state */}
        <div
          ref={loginCardWrapRef}
          className={`fixed inset-0 flex items-center justify-center z-30 px-6 ${spaceLocked ? '' : 'pointer-events-none'}`}
          style={{
            opacity:   isLogin ? 1 : 0,
            transform: isLogin ? 'scale(1) translateY(0px)' : 'scale(0.7) translateY(30px)',
            filter:    isLogin ? 'blur(0px)' : 'blur(15px)',
          }}
        >
          <AnimatePresence mode="wait">
            {!showForm ? (
              <motion.div
                key="logo-card"
                exit={{ scale: 1.5, opacity: 0, filter: 'blur(30px)' }}
                transition={{ duration: 0.8, ease: 'easeInOut' }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => spaceLocked && setShowForm(true)}
                className="group relative cursor-pointer"
              >
                <div className="absolute inset-[-40px] border border-cyan-400/20 rounded-[40px] rotate-[15deg] animate-[spin_20s_linear_infinite] group-hover:border-cyan-400/40 transition-colors" />
                <div className="absolute inset-[-60px] border border-indigo-400/10 rounded-[50px] rotate-[-12deg] animate-[spin_35s_linear_infinite] group-hover:border-indigo-400/30 transition-colors" />

                <div className="relative w-36 h-36 bg-slate-950/80 backdrop-blur-2xl border border-indigo-500/30 rounded-3xl p-6 shadow-[0_0_50px_-10px_rgba(99,102,241,0.4)] overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/10 via-transparent to-cyan-500/10" />
                  <Image src="/outplex-logo.webp" alt="Outplex" width={100} height={100} priority className="relative z-10 w-full h-auto" />
                  <div className="absolute inset-0 bg-indigo-500/20 mix-blend-screen animate-pulse" />
                </div>

                <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-black tracking-[0.4em] text-indigo-300 drop-shadow-[0_0_8px_rgba(165,180,252,0.4)]">
                  IDENTIFY TO ENGAGE
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="login-form"
                initial={{ scale: 0.9, opacity: 0, y: 30, filter: 'blur(10px)' }}
                animate={{ scale: 1, opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], opacity: { duration: 0.4 } }}
                className="w-full max-w-[440px]"
              >
                <div className="relative group" onClick={(e) => e.stopPropagation()}>
                  <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-[32px] blur opacity-25" />
                  <div className="relative bg-slate-950/70 backdrop-blur-3xl border border-indigo-500/20 rounded-[28px] p-8 md:p-12 shadow-2xl">

                    <button
                      type="button"
                      className="absolute top-4 right-4 p-2 text-white/30 hover:text-white transition-colors"
                      onClick={() => setShowForm(false)}
                    >
                      <X size={20} />
                    </button>

                    <header className="flex items-center justify-between mb-10">
                      <div className="flex gap-1.5">
                        {[0, 1, 2].map((i) => (
                          <div key={i} className={`w-1.5 h-1.5 rounded-full ${i === 0 ? 'bg-cyan-400' : 'bg-slate-800'}`} />
                        ))}
                      </div>
                      <div className="text-indigo-300/60 tracking-[0.3em] font-black text-[9px] uppercase">Secure Node Access</div>
                    </header>

                    <div className="space-y-8">
                      <div className="text-center">
                        <h1 className="text-2xl font-black text-white tracking-tight mb-2">Welcome Back</h1>
                        <p className="text-indigo-300/50 text-xs font-medium uppercase tracking-widest">Identify yourself to engage</p>
                      </div>

                      <button
                        onClick={() => setShowSlackModal(true)}
                        className="w-full relative group overflow-hidden py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 transition-colors"
                      >
                        <div className="relative z-10 flex items-center justify-center gap-3 text-xs font-black text-white tracking-widest uppercase">
                          <SlackIcon size={18} />
                          Authorize via Slack
                        </div>
                      </button>

                      <div className="relative flex items-center justify-center">
                        <div className="w-full h-px bg-white/5" />
                        <div className="absolute px-4 bg-transparent text-[9px] font-black tracking-[0.4em] text-white/20 uppercase">o</div>
                      </div>

                      {!showEmailForm ? (
                        <button
                          type="button"
                          onClick={() => setShowEmailForm(true)}
                          disabled={loading}
                          className="w-full py-3.5 rounded-xl border border-indigo-500/20 hover:bg-indigo-500/10 hover:border-indigo-500/40 transition-all text-[10px] font-black tracking-widest text-indigo-300/70 uppercase"
                        >
                          Manual Login
                        </button>
                      ) : (
                        <form onSubmit={handleEmailLogin} className="space-y-3">
                          <input
                            type="email"
                            placeholder="usuario@outplex.com"
                            value={emailInput}
                            onChange={e => setEmailInput(e.target.value)}
                            required
                            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-indigo-500/60 transition-colors"
                          />
                          <input
                            type="password"
                            placeholder="Contraseña"
                            value={passwordInput}
                            onChange={e => setPasswordInput(e.target.value)}
                            required
                            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-indigo-500/60 transition-colors"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => { setShowEmailForm(false); setEmailInput(''); setPasswordInput(''); setError(null); }}
                              className="flex-1 py-3 rounded-xl border border-white/5 text-[10px] font-black tracking-widest text-white/30 uppercase hover:bg-white/5 transition-all"
                            >
                              Cancelar
                            </button>
                            <button
                              type="submit"
                              disabled={loading}
                              className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-[10px] font-black tracking-widest text-white uppercase transition-colors disabled:opacity-50"
                            >
                              {loading ? '...' : 'Entrar'}
                            </button>
                          </div>
                        </form>
                      )}
                    </div>

                    {error && (
                      <div className="mt-6 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-200 text-[10px] text-center uppercase tracking-widest">
                        {error}
                      </div>
                    )}

                    <footer className="mt-12 flex items-center justify-between text-[8px] font-black text-white/20 tracking-[0.3em] uppercase">
                      <div className="flex items-center gap-2">
                        <ShieldCheck size={10} className="text-indigo-500/40" />
                        Enclave Active
                      </div>
                      <span>Core v2.8.5-CX</span>
                    </footer>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── SLACK INFO MODAL ─────────────────────────────────────────── */}
      <AnimatePresence>
        {showSlackModal && (
          <motion.div
            key="slack-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-6"
            style={{ backdropFilter: 'blur(12px)', background: 'rgba(0,0,0,0.7)' }}
            onClick={() => setShowSlackModal(false)}
          >
            <motion.div
              key="slack-modal-card"
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-[400px]"
            >
              <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500/40 to-cyan-500/40 rounded-[28px] blur opacity-40" />
              <div className="relative bg-slate-950/95 backdrop-blur-3xl border border-indigo-500/25 rounded-[24px] p-8 shadow-2xl">
                <button
                  type="button"
                  onClick={() => setShowSlackModal(false)}
                  className="absolute top-4 right-4 p-2 rounded-lg text-white/30 hover:text-white hover:bg-white/5 transition-all"
                  aria-label="Cerrar"
                >
                  <X size={18} />
                </button>

                <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 mb-6 mx-auto">
                  <SlackIcon size={24} />
                </div>

                <div className="text-center space-y-3 mb-8">
                  <h2 className="text-lg font-black text-white tracking-tight">Autenticación vía Slack</h2>
                  <p className="text-indigo-300/60 text-xs leading-relaxed">
                    Esta opción requiere la <span className="text-indigo-300 font-bold">API oficial de Slack de Outplex</span> para funcionar. Actualmente está pendiente de configuración por el equipo de IT.
                  </p>
                  <p className="text-white/30 text-[10px] leading-relaxed">
                    Para solicitar acceso o reportar esto, contacta a tu supervisor o al equipo de IT de Outplex.
                  </p>
                </div>

                <div className="h-px bg-white/5 mb-6" />

                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-black tracking-[0.3em] text-white/20 uppercase">Outplex IT</span>
                  <button
                    type="button"
                    onClick={() => setShowSlackModal(false)}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-[10px] font-black tracking-widest text-white uppercase transition-colors"
                  >
                    Entendido
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx global>{`
        body {
          background: #000;
          font-family: 'Space Grotesk', sans-serif;
          margin: 0;
          padding: 0;
        }
        .lenis-smooth { height: auto; }
      `}</style>
    </main>
  );
}
