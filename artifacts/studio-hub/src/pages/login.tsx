import { useAuth } from "@workspace/replit-auth-web";
import { Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import tmsSymbol from "@assets/TMS_Symbol_Gradient@4x_1773281994585.png";
import tmsCenteredLogo from "@assets/TMS_Logo_Centered_Small_White@4x_1773281994585.png";

export default function Login() {
  const { isAuthenticated, isLoading, login } = useAuth();

  if (isLoading) return null;
  
  if (isAuthenticated) {
    return <Redirect to="/" />;
  }

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center overflow-hidden bg-black">
      {/* Background decoration */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-black" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-[#7250ef] rounded-full blur-[160px] opacity-10" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-[#00b199] rounded-full blur-[140px] opacity-8" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="relative z-10 w-full max-w-sm px-6"
      >
        <div className="rounded-3xl p-10 shadow-2xl flex flex-col items-center text-center border border-white/8 bg-[#0d0d0d]/90 backdrop-blur-xl relative overflow-hidden">
          {/* Subtle corner glows */}
          <div className="absolute -top-12 -left-12 w-40 h-40 bg-[#7250ef] rounded-full blur-[80px] opacity-15 pointer-events-none" />
          <div className="absolute -bottom-12 -right-12 w-40 h-40 bg-[#00b199] rounded-full blur-[80px] opacity-10 pointer-events-none" />

          {/* TMS Gradient Symbol */}
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15, duration: 0.5, ease: "easeOut" }}
            className="mb-8"
          >
            <img
              src={tmsSymbol}
              alt="The Music Space"
              className="h-24 w-auto object-contain drop-shadow-2xl"
            />
          </motion.div>

          {/* Centered white wordmark */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="mb-3"
          >
            <img
              src={tmsCenteredLogo}
              alt="The Music Space"
              className="h-14 w-auto object-contain"
            />
          </motion.div>

          <p className="text-[#9a9590] mb-10 leading-relaxed text-sm max-w-[220px]">
            Internal portal for staff and operations
          </p>
          
          <Button 
            size="lg" 
            onClick={() => login()}
            className="w-full h-14 rounded-xl text-base font-semibold bg-[#7250ef] hover:bg-[#5420ac] text-white transition-all shadow-[0_0_24px_-4px_rgba(114,80,239,0.45)] hover:shadow-[0_0_36px_-4px_rgba(114,80,239,0.65)] group border border-[#9881ff]/25"
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
