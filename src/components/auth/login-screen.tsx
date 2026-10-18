"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { LoginForm } from "@/components/auth/login-form";

type LoginUser = { name: string | null; email: string; role: string };

export function LoginScreen({
  callbackUrl,
  users,
}: {
  callbackUrl: string;
  users: LoginUser[];
}) {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    // Automatically transition to the login page after the cinematic logo intro
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 1800);

    return () => clearTimeout(timer);
  }, []);

  const handleSkip = () => {
    setShowSplash(false);
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-gradient-to-br from-[#faf8f5] via-[#f5f0e6] to-[#eee8db] text-foreground">
      {/* Background ambient lighting */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-b from-amber-200/35 via-amber-100/20 to-transparent blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 right-10 h-[450px] w-[550px] rounded-full bg-gradient-to-t from-amber-300/20 via-amber-100/10 to-transparent blur-3xl"
      />

      {/* Cinematic Fullscreen Splash Intro */}
      <AnimatePresence>
        {showSplash && (
          <motion.div
            key="splash-screen"
            initial={{ opacity: 1 }}
            exit={{
              opacity: 0,
              scale: 0.96,
              transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
            }}
            onClick={handleSkip}
            className="fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center bg-gradient-to-b from-[#181614] via-[#121110] to-[#0c0b0a] px-6 text-white"
          >
            {/* Ambient luxury halo behind the logo */}
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: [0.85, 1.15, 1], opacity: [0.2, 0.65, 0.45] }}
              transition={{ duration: 1.8, ease: "easeOut" }}
              className="pointer-events-none absolute h-[400px] w-[400px] sm:h-[550px] sm:w-[550px] rounded-full bg-[radial-gradient(circle,_rgba(212,175,98,0.38)_0%,_rgba(180,135,60,0.18)_40%,_transparent_75%)] blur-2xl"
            />

            {/* Glowing Logo Card Container */}
            <motion.div
              initial={{ scale: 1.85, opacity: 0, y: 15, filter: "blur(14px)" }}
              animate={{
                scale: 1.15,
                opacity: 1,
                y: 0,
                filter: "blur(0px)",
              }}
              transition={{
                duration: 1.25,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="relative flex flex-col items-center"
            >
              <div className="relative rounded-3xl border border-amber-300/30 bg-gradient-to-b from-white/95 to-stone-100/90 p-6 sm:p-9 shadow-[0_20px_70px_-15px_rgba(212,175,98,0.45)] backdrop-blur-xl">
                <Image
                  src="/logo-removebg-preview.png"
                  alt="Triya Group of Hospitality"
                  width={865}
                  height={288}
                  priority
                  className="h-20 w-auto sm:h-28 md:h-32 object-contain drop-shadow-sm"
                />
              </div>

              {/* Sub-label with luxury tracking */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45, duration: 0.8 }}
                className="mt-6 flex flex-col items-center gap-2 text-center"
              >
                <span className="text-xs sm:text-sm font-semibold tracking-[0.35em] text-amber-200/90 uppercase">
                  Operations &amp; Management Portal
                </span>
                <span className="text-[11px] tracking-widest text-stone-400">
                  Tap anywhere to enter
                </span>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Login Interface */}
      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 35, scale: 0.98 }}
          animate={{
            opacity: showSplash ? 0 : 1,
            y: showSplash ? 35 : 0,
            scale: showSplash ? 0.98 : 1,
          }}
          transition={{
            duration: 0.85,
            delay: showSplash ? 0 : 0.15,
            ease: [0.16, 1, 0.3, 1],
          }}
          className="grid w-full max-w-4xl overflow-hidden rounded-3xl border border-amber-900/10 bg-card/95 shadow-[0_25px_65px_-20px_rgba(180,140,80,0.18)] backdrop-blur-md md:grid-cols-[0.95fr_1.05fr]"
        >
          {/* Brand Presentation Panel */}
          <div className="relative flex flex-col justify-between overflow-hidden bg-gradient-to-br from-amber-50/70 via-stone-50/80 to-amber-100/40 p-8 sm:p-10 border-b md:border-b-0 md:border-r border-amber-900/10">
            {/* Subtle background monogram */}
            <span
              aria-hidden
              className="pointer-events-none absolute -right-6 -bottom-10 select-none font-serif text-[10rem] font-bold tracking-tighter text-amber-900/[0.04]"
            >
              T
            </span>

            {/* Top brand header */}
            <div>
              <div className="inline-block rounded-2xl bg-white/80 p-3 shadow-xs border border-amber-200/60 backdrop-blur-xs">
                <Image
                  src="/logo-removebg-preview.png"
                  alt="Triya Group of Hospitality"
                  width={865}
                  height={288}
                  priority
                  className="h-10 sm:h-12 w-auto object-contain"
                />
              </div>
            </div>

            {/* Middle value proposition */}
            <div className="my-8 space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-700/20 bg-amber-600/10 px-3 py-1 text-xs font-semibold tracking-wide text-amber-900">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-600 animate-pulse" />
                PG Operations &amp; Management
              </div>

              <h2 className="text-2xl sm:text-3xl font-semibold tracking-[-0.03em] text-foreground">
                Unified Hospitality <br />
                <span className="text-amber-800 font-serif italic font-normal">
                  Control Centre
                </span>
              </h2>

              <p className="max-w-[34ch] text-sm leading-relaxed text-muted-foreground">
                Live floor occupancy, rent collections, WhatsApp invoicing, and tenant verification synced in real time.
              </p>
            </div>

            {/* Bottom info */}
            <div className="pt-4 border-t border-amber-900/10 flex items-center justify-between text-xs text-muted-foreground">
              <span>Triya Hospitality</span>
              <span className="font-mono text-[11px] text-amber-800/80">v2.0 • Secured</span>
            </div>
          </div>

          {/* Form Panel */}
          <div className="p-8 sm:p-10 lg:p-12 flex flex-col justify-center bg-card">
            {/* Mobile-only logo display */}
            <div className="mb-6 flex justify-center md:hidden">
              <div className="rounded-2xl bg-amber-50/80 p-2.5 border border-amber-200/50">
                <Image
                  src="/logo-removebg-preview.png"
                  alt="Triya Group of Hospitality"
                  width={865}
                  height={288}
                  priority
                  className="h-10 w-auto object-contain"
                />
              </div>
            </div>

            <div className="mb-8">
              <h1 className="text-2xl sm:text-[1.75rem] font-semibold tracking-tight text-foreground">
                Sign in to your account
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Enter your credentials to access your properties.
              </p>
            </div>

            <LoginForm callbackUrl={callbackUrl} users={users} />

            <div className="mt-8 rounded-xl bg-muted/60 p-3 text-center border border-border/60">
              <p className="text-xs text-muted-foreground">
                Admin &amp; Property Staff access only. Sessions are encrypted and verified.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
