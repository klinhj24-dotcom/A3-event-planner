import { useAuth } from "@workspace/replit-auth-web";
import { Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

export default function Login() {
  const { isAuthenticated, isLoading, login } = useAuth();

  if (isLoading) return null;
  
  if (isAuthenticated) {
    return <Redirect to="/" />;
  }

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center overflow-hidden bg-black">
      {/* Background Image / Pattern */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-black" />
        <div className="absolute inset-0 opacity-[0.05] dot-grid pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-transparent to-black/90" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md px-6"
      >
        <div className="rounded-3xl p-8 md:p-10 shadow-2xl flex flex-col items-center text-center border border-[#3a3a3a]/50 bg-black/80 backdrop-blur-xl relative overflow-hidden">
          {/* Subtle Glows */}
          <div className="absolute -top-10 -left-10 w-32 h-32 bg-[#7250ef] rounded-full blur-[64px] opacity-20" />
          <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-[#00b199] rounded-full blur-[64px] opacity-20" />

          {/* Audio Bars Motif */}
          <motion.div 
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", bounce: 0.5 }}
            className="flex items-end justify-center gap-1.5 h-16 mb-8"
          >
            <div className="w-2.5 h-8 bg-[#7250ef] rounded-t-sm animate-[pulse_1.5s_ease-in-out_infinite]" />
            <div className="w-2.5 h-12 bg-[#00b199] rounded-t-sm animate-[pulse_1.8s_ease-in-out_infinite]" />
            <div className="w-2.5 h-16 bg-[#2e3bdb] rounded-t-sm animate-[pulse_1.2s_ease-in-out_infinite]" />
            <div className="w-2.5 h-10 bg-[#f7b617] rounded-t-sm animate-[pulse_1.6s_ease-in-out_infinite]" />
            <div className="w-2.5 h-14 bg-[#f14329] rounded-t-sm animate-[pulse_1.4s_ease-in-out_infinite]" />
          </motion.div>
          
          <h1 className="font-display text-4xl font-bold text-white mb-3 tracking-tight">
            Studio Hub
          </h1>
          <p className="text-[#cfcccc] mb-10 leading-relaxed max-w-xs">
            Internal portal for managing events, contacts, staff, and studio operations.
          </p>
          
          <Button 
            size="lg" 
            onClick={() => login()}
            className="w-full h-14 rounded-xl text-base font-semibold bg-[#7250ef] hover:bg-[#5420ac] text-white transition-all shadow-[0_0_20px_-5px_rgba(114,80,239,0.5)] hover:shadow-[0_0_30px_-5px_rgba(114,80,239,0.7)] group border border-[#9881ff]/20"
          >
            Sign In to Continue
            <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
          </Button>
          
          <p className="mt-8 text-xs text-[#787776] font-semibold tracking-widest uppercase">
            Authorized Personnel Only
          </p>
        </div>
      </motion.div>
    </div>
  );
}
