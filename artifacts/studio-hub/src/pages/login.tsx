import { useState } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import { Redirect, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, Loader2, Eye, EyeOff } from "lucide-react";
import { motion } from "framer-motion";
import tmsLogoWhite from "@assets/TMS_Logo_Stacked_Large_White@4x_1773281994585.png";

export default function Login() {
  const { isAuthenticated, isLoading, login } = useAuth();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (isLoading) return null;
  if (isAuthenticated) return <Redirect to="/" />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const result = await login(email, password);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
    } else {
      navigate("/");
    }
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center overflow-hidden bg-black">
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-black" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-[#7250ef] rounded-full blur-[160px] opacity-10" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-[#00b199] rounded-full blur-[140px] opacity-8" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md px-6"
      >
        <div className="rounded-3xl p-8 md:p-10 shadow-2xl flex flex-col items-center border border-[#3a3a3a]/50 bg-black/80 backdrop-blur-xl relative overflow-hidden">
          <div className="absolute -top-10 -left-10 w-32 h-32 bg-[#7250ef] rounded-full blur-[64px] opacity-20" />
          <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-[#00b199] rounded-full blur-[64px] opacity-20" />

          {/* Equalizer bars */}
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.15, type: "spring", bounce: 0.5 }}
            className="flex items-end justify-center gap-1.5 h-16 mb-6"
          >
            <div className="w-2.5 h-8 bg-[#7250ef] rounded-t-sm animate-[pulse_1.5s_ease-in-out_infinite]" />
            <div className="w-2.5 h-12 bg-[#00b199] rounded-t-sm animate-[pulse_1.8s_ease-in-out_infinite]" />
            <div className="w-2.5 h-16 bg-[#2e3bdb] rounded-t-sm animate-[pulse_1.2s_ease-in-out_infinite]" />
            <div className="w-2.5 h-10 bg-[#f7b617] rounded-t-sm animate-[pulse_1.6s_ease-in-out_infinite]" />
            <div className="w-2.5 h-14 bg-[#f14329] rounded-t-sm animate-[pulse_1.4s_ease-in-out_infinite]" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5, ease: "easeOut" }}
            className="mb-8"
          >
            <img
              src={tmsLogoWhite}
              alt="The Music Space"
              className="h-14 w-auto object-contain"
            />
          </motion.div>

          <form onSubmit={handleSubmit} className="w-full space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-[#cfcccc] text-sm">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@themusicspace.com"
                required
                className="bg-white/5 border-[#3a3a3a] text-white placeholder:text-[#555] focus:border-[#7250ef] h-12 rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-[#cfcccc] text-sm">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPw ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="bg-white/5 border-[#3a3a3a] text-white placeholder:text-[#555] focus:border-[#7250ef] h-12 rounded-xl pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555] hover:text-[#cfcccc]"
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-400 text-center">{error}</p>
            )}

            <Button
              type="submit"
              size="lg"
              disabled={submitting}
              className="w-full h-12 rounded-xl text-base font-semibold bg-[#7250ef] hover:bg-[#5420ac] text-white transition-all shadow-[0_0_20px_-5px_rgba(114,80,239,0.5)] hover:shadow-[0_0_30px_-5px_rgba(114,80,239,0.7)] group border border-[#9881ff]/20 mt-2"
            >
              {submitting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  Sign In
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </Button>
          </form>

          <p className="mt-8 text-xs text-[#787776] font-semibold tracking-widest uppercase">
            Authorized Personnel Only
          </p>
        </div>
      </motion.div>
    </div>
  );
}
