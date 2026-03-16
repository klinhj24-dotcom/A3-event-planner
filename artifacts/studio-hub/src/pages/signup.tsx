import { useParams, useSearch } from "wouter";
import { useGetSignupPage, useSubmitSignup } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Calendar, MapPin, Music, CheckCircle2, Loader2, Info } from "lucide-react";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { motion } from "framer-motion";

const signupSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().min(1, "Phone number is required"),
  role: z.string().optional(),
  notes: z.string().optional(),
});

export default function Signup() {
  const params = useParams();
  const token = params.token || "";
  const search = useSearch();
  const [submitted, setSubmitted] = useState(false);

  const qp = new URLSearchParams(search);
  const prefillName = qp.get("name") || "";
  const prefillEmail = qp.get("email") || "";
  const prefillPhone = qp.get("phone") || "";

  const { data: event, isLoading, isError } = useGetSignupPage(token, {
    query: { retry: false }
  });

  const { mutate: submit, isPending } = useSubmitSignup({
    mutation: {
      onSuccess: () => setSubmitted(true)
    }
  });

  const form = useForm<z.infer<typeof signupSchema>>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: prefillName, email: prefillEmail, phone: prefillPhone, role: "Event Staff", notes: "" }
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !event) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4">
        <div className="h-16 w-16 bg-zinc-900 rounded-2xl flex items-center justify-center mb-6">
          <Info className="h-8 w-8 text-zinc-500" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Link Expired or Invalid</h1>
        <p className="text-zinc-400 text-center max-w-sm">This signup link is no longer active. Please contact the studio coordinator for a new link.</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen w-full flex flex-col md:justify-center bg-zinc-950 overflow-hidden">
      {/* Immersive Background */}
      <div className="absolute inset-0 z-0 h-[50vh] md:h-full">
        <img 
          src={`${import.meta.env.BASE_URL}images/signup-bg.png`} 
          alt="Concert Stage" 
          className="w-full h-full object-cover opacity-60 mix-blend-screen"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/90 to-transparent" />
      </div>

      <div className="relative z-10 w-full max-w-5xl mx-auto px-4 py-8 md:py-12 grid md:grid-cols-2 gap-8 md:gap-12 items-center">
        
        {/* Left Side: Event Details */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="text-white space-y-6 pt-12 md:pt-0"
        >
          <div className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-medium text-primary backdrop-blur-sm">
            <Music className="mr-2 h-4 w-4" /> TMS Sign-up
          </div>
          
          <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-tight">
            {event.eventTitle}
          </h1>
          
          <div className="flex flex-col space-y-3 pt-2">
            {event.startDate && (
              <div className="flex items-center text-zinc-300">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/5 mr-4">
                  <Calendar className="h-5 w-5 text-zinc-400" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">When</span>
                  <span className="text-base">{format(new Date(event.startDate), "EEEE, MMMM do, yyyy 'at' h:mm a")}</span>
                </div>
              </div>
            )}
            
            {event.location && (
              <div className="flex items-center text-zinc-300">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/5 mr-4">
                  <MapPin className="h-5 w-5 text-zinc-400" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Where</span>
                  <span className="text-base">{event.location}</span>
                </div>
              </div>
            )}
          </div>

          {event.description && (
            <div className="pt-4 border-t border-white/10">
              <p className="text-zinc-400 leading-relaxed">
                {event.description}
              </p>
            </div>
          )}
        </motion.div>

        {/* Right Side: Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <div className="glass-panel border border-white/10 bg-zinc-900/60 p-6 md:p-8 rounded-3xl shadow-2xl backdrop-blur-2xl">
            {submitted ? (
              <div className="py-12 flex flex-col items-center text-center">
                <div className="h-20 w-20 bg-emerald-500/20 rounded-full flex items-center justify-center mb-6">
                  <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                </div>
                <h2 className="text-3xl font-display font-bold text-white mb-3">You're on the list!</h2>
                <p className="text-zinc-400 text-lg">Thank you for signing up. The studio coordinator will be in touch with more details soon.</p>
              </div>
            ) : (
              <>
                <div className="mb-6">
                  <h2 className="text-2xl font-display font-bold text-white">
                    {prefillName ? `Hey, ${prefillName.split(" ")[0]}!` : "Join the Team"}
                  </h2>
                  <p className="text-zinc-400 mt-1">
                    {prefillName ? "Confirm your info below to secure your spot." : "Fill out the form below to secure your spot."}
                  </p>
                </div>
                
                <Form {...form}>
                  <form onSubmit={form.handleSubmit((data) => submit({ token, data }))} className="space-y-4">
                    <FormField control={form.control} name="name" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-zinc-300">Full Name *</FormLabel>
                        <FormControl>
                          <Input className="bg-zinc-950/50 border-white/10 text-white rounded-xl h-12 focus-visible:ring-primary/50" {...field} />
                        </FormControl>
                        <FormMessage className="text-red-400" />
                      </FormItem>
                    )}/>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField control={form.control} name="email" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-zinc-300">Email *</FormLabel>
                          <FormControl>
                            <Input type="email" className="bg-zinc-950/50 border-white/10 text-white rounded-xl h-12 focus-visible:ring-primary/50" {...field} />
                          </FormControl>
                          <FormMessage className="text-red-400" />
                        </FormItem>
                      )}/>
                      <FormField control={form.control} name="phone" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-zinc-300">Phone *</FormLabel>
                          <FormControl>
                            <Input type="tel" className="bg-zinc-950/50 border-white/10 text-white rounded-xl h-12 focus-visible:ring-primary/50" {...field} />
                          </FormControl>
                          <FormMessage className="text-red-400" />
                        </FormItem>
                      )}/>
                    </div>

                    <FormField control={form.control} name="notes" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-zinc-300">Questions or Notes</FormLabel>
                        <FormControl>
                          <Textarea className="bg-zinc-950/50 border-white/10 text-white rounded-xl resize-none min-h-[100px] focus-visible:ring-primary/50" {...field} />
                        </FormControl>
                      </FormItem>
                    )}/>

                    <div className="pt-4">
                      <Button type="submit" disabled={isPending} className="w-full h-14 rounded-xl text-base font-semibold shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-0.5 transition-all">
                        {isPending ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
                        Confirm Sign-up
                      </Button>
                    </div>
                  </form>
                </Form>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
