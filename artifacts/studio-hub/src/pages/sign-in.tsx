import { SignIn } from "@clerk/clerk-react";
import { motion } from "framer-motion";
import tmsLogoWhite from "@assets/TMS_Logo_Stacked_Large_White@4x_1773281994585.png";

export default function SignInPage() {
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
        className="relative z-10 flex flex-col items-center gap-6 px-6"
      >
        <img src={tmsLogoWhite} alt="The Music Space" className="h-14 w-auto object-contain" />
        <SignIn
          routing="path"
          path="/sign-in"
          signUpUrl="/sign-up"
          afterSignInUrl="/"
        />
        <p className="text-xs text-[#787776] font-semibold tracking-widest uppercase">
          Authorized Personnel Only
        </p>
      </motion.div>
    </div>
  );
}
