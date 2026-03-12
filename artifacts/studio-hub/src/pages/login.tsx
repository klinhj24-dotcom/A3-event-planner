import { useAuth } from "@workspace/replit-auth-web";
import { Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import { Music, ArrowRight, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

export default function Login() {
  const { isAuthenticated, isLoading, login } = useAuth();

  if (isLoading) return null;
  
  if (isAuthenticated) {
    return <Redirect to="/" />;
  }

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center overflow-hidden bg-zinc-950">
      {/* Background Image */}
      <div className="absolute inset-0 z-0">
        <img 
          src={`${import.meta.env.BASE_URL}images/login-bg.png`} 
          alt="Studio mixing board" 
          className="w-full h-full object-cover opacity-40 mix-blend-overlay"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/80 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-zinc-950/90 via-transparent to-zinc-950/90" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md px-6"
      >
        <div className="glass-panel rounded-3xl p-8 md:p-10 shadow-2xl flex flex-col items-center text-center border border-white/10 bg-zinc-900/40">
          <motion.div 
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", bounce: 0.5 }}
            className="h-16 w-16 bg-gradient-to-tr from-primary to-blue-400 rounded-2xl flex items-center justify-center shadow-lg shadow-primary/30 mb-6"
          >
            <Music className="h-8 w-8 text-white" />
          </motion.div>
          
          <h1 className="font-display text-4xl font-bold text-white mb-3 tracking-tight">
            Studio Hub
          </h1>
          <p className="text-zinc-400 mb-8 leading-relaxed">
            Internal portal for managing events, contacts, staff, and studio operations.
          </p>
          
          <Button 
            size="lg" 
            onClick={() => login()}
            className="w-full h-14 rounded-xl text-base font-semibold bg-white text-zinc-900 hover:bg-zinc-200 transition-all shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)] hover:shadow-[0_0_60px_-15px_rgba(255,255,255,0.5)] hover:-translate-y-0.5 group"
          >
            Sign In to Continue
            <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
          </Button>
          
          <p className="mt-8 text-xs text-zinc-500 font-medium tracking-wide uppercase">
            Authorized Personnel Only
          </p>
        </div>
      </motion.div>
    </div>
  );
}
