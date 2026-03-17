import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Calendar, MapPin, CheckCircle2, Loader2, CreditCard, Ticket } from "lucide-react";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { motion } from "framer-motion";
import tmsLogoWhite from "@assets/TMS_Logo_Stacked_Large_White@4x_1773281994585.png";

const TEACHERS = [
  "Brandon Gouin",
  "Charlie Ballantine",
  "Derek Wiegmann",
  "Grey Rayadurg",
  "Griffin Quinnan",
  "Hannah Piasecki",
  "Ida Dierker",
  "Jeffrey Roden",
  "Johanna McGuire",
  "Justin Levy",
  "Kit Benz",
  "Max Phelps",
  "Nathan Hillman",
  "Nick Komosa",
  "Noah Stuehler",
  "Rachel McNear",
  "Ralph Bernabe",
  "Roxanne Wehking",
  "Sean Oliver",
  "Tsveta Dabova",
  "Victoria Bee",
  "Violet Palm",
];

const generalSchema = z.object({
  contactFirstName: z.string().min(1, "First name is required"),
  contactLastName: z.string().min(1, "Last name is required"),
  contactEmail: z.string().email("Valid email is required"),
  ticketCount: z.coerce.number().min(1, "Enter at least 1 ticket"),
});

const recitalSchema = z.object({
  studentFirstName: z.string().min(1, "Required"),
  studentLastName: z.string().min(1, "Required"),
  contactFirstName: z.string().min(1, "Required"),
  contactLastName: z.string().min(1, "Required"),
  contactEmail: z.string().email("Valid email is required"),
  instrument: z.string().min(1, "Required"),
  recitalSong: z.string().optional(),
  teacher: z.string().min(1, "Required"),
  specialConsiderations: z.string().optional(),
});

type GeneralForm = z.infer<typeof generalSchema>;
type RecitalForm = z.infer<typeof recitalSchema>;

function GeneralTicketForm({ event, token }: { event: any; token: string }) {
  const [submitted, setSubmitted] = useState(false);
  const form = useForm<GeneralForm>({ resolver: zodResolver(generalSchema) });

  const { mutate: submit, isPending } = useMutation({
    mutationFn: async (data: GeneralForm) => {
      const res = await fetch(`/api/ticket/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Submission failed");
      return res.json();
    },
    onSuccess: () => setSubmitted(true),
  });

  if (submitted) {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center text-center gap-4 py-8">
        <div className="h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-foreground">Request Received!</h2>
          <p className="text-muted-foreground mt-1 text-sm">We'll send a confirmation to your email. Your card on file will be charged on the next open business day.</p>
        </div>
      </motion.div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(d => submit(d))} className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="contactFirstName" render={({ field }) => (
            <FormItem>
              <FormLabel>First Name <span className="text-destructive">*</span></FormLabel>
              <FormControl><Input className="rounded-xl" placeholder="Rigby" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="contactLastName" render={({ field }) => (
            <FormItem>
              <FormLabel>Last Name <span className="text-destructive">*</span></FormLabel>
              <FormControl><Input className="rounded-xl" placeholder="Levy" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>
        <FormField control={form.control} name="contactEmail" render={({ field }) => (
          <FormItem>
            <FormLabel>Email Address <span className="text-destructive">*</span></FormLabel>
            <FormControl><Input className="rounded-xl" type="email" placeholder="rigby@example.com" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="ticketCount" render={({ field }) => (
          <FormItem>
            <FormLabel>Number of Tickets <span className="text-destructive">*</span></FormLabel>
            <FormControl><Input className="rounded-xl" type="number" min="1" placeholder="2" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2.5 text-sm text-amber-700 dark:text-amber-400">
          <CreditCard className="h-4 w-4 shrink-0 mt-0.5" />
          <p>Your card on file will be charged on the next open business day.</p>
        </div>
        <Button type="submit" disabled={isPending} className="w-full rounded-xl">
          {isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting…</> : "Request Tickets"}
        </Button>
      </form>
    </Form>
  );
}

function RecitalRegistrationForm({ event, token }: { event: any; token: string }) {
  const [submitted, setSubmitted] = useState(false);
  const form = useForm<RecitalForm>({ resolver: zodResolver(recitalSchema) });

  const { mutate: submit, isPending } = useMutation({
    mutationFn: async (data: RecitalForm) => {
      const res = await fetch(`/api/ticket/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Submission failed");
      return res.json();
    },
    onSuccess: () => setSubmitted(true),
  });

  if (submitted) {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center text-center gap-4 py-8">
        <div className="h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-foreground">Registered!</h2>
          <p className="text-muted-foreground mt-1 text-sm">We'll send a confirmation to your email. The $30 recital fee will be charged to your card on file on the next open business day.</p>
        </div>
      </motion.div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(d => submit(d))} className="space-y-5">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Student Info</p>
          <div className="grid grid-cols-2 gap-3">
            <FormField control={form.control} name="studentFirstName" render={({ field }) => (
              <FormItem>
                <FormLabel>First Name <span className="text-destructive">*</span></FormLabel>
                <FormControl><Input className="rounded-xl" placeholder="Rigby" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="studentLastName" render={({ field }) => (
              <FormItem>
                <FormLabel>Last Name <span className="text-destructive">*</span></FormLabel>
                <FormControl><Input className="rounded-xl" placeholder="Levy" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>
          <FormField control={form.control} name="instrument" render={({ field }) => (
            <FormItem>
              <FormLabel>Instrument <span className="text-destructive">*</span></FormLabel>
              <FormControl><Input className="rounded-xl" placeholder="e.g. Piano, Violin, Guitar" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="recitalSong" render={({ field }) => (
            <FormItem>
              <FormLabel>Recital Song <span className="text-muted-foreground font-normal text-xs">(if known)</span></FormLabel>
              <FormControl><Input className="rounded-xl" placeholder="e.g. Für Elise" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="teacher" render={({ field }) => (
            <FormItem>
              <FormLabel>Teacher <span className="text-destructive">*</span></FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Select your teacher…" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {TEACHERS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contact / Parent Info</p>
          <div className="grid grid-cols-2 gap-3">
            <FormField control={form.control} name="contactFirstName" render={({ field }) => (
              <FormItem>
                <FormLabel>First Name <span className="text-destructive">*</span></FormLabel>
                <FormControl><Input className="rounded-xl" placeholder="Rigby" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="contactLastName" render={({ field }) => (
              <FormItem>
                <FormLabel>Last Name <span className="text-destructive">*</span></FormLabel>
                <FormControl><Input className="rounded-xl" placeholder="Levy" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>
          <FormField control={form.control} name="contactEmail" render={({ field }) => (
            <FormItem>
              <FormLabel>Contact Email <span className="text-destructive">*</span></FormLabel>
              <FormControl><Input className="rounded-xl" type="email" placeholder="jane@example.com" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="specialConsiderations" render={({ field }) => (
            <FormItem>
              <FormLabel>Special Considerations <span className="text-muted-foreground font-normal text-xs">(time restraints, etc.)</span></FormLabel>
              <FormControl><Textarea className="rounded-xl min-h-[72px]" placeholder="Let us know if you have any time restraints on this date." {...field} /></FormControl>
            </FormItem>
          )} />
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2.5 text-sm text-amber-700 dark:text-amber-400">
          <CreditCard className="h-4 w-4 shrink-0 mt-0.5" />
          <p>A nonrefundable recital fee of <strong>$30 per performer</strong> will be charged to the card on file on the next open business day.</p>
        </div>

        <Button type="submit" disabled={isPending} className="w-full rounded-xl">
          {isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting…</> : "Complete Registration"}
        </Button>
      </form>
    </Form>
  );
}

export default function TicketForm() {
  const params = useParams();
  const token = (params as any).token || "";

  const { data: event, isLoading, isError } = useQuery({
    queryKey: [`/api/ticket/${token}`],
    queryFn: async () => {
      const res = await fetch(`/api/ticket/${token}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!token,
  });

  const startDate = event?.startDate ? new Date(event.startDate) : null;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center py-8 px-4">
      {/* Logo / Brand */}
      <div className="mb-6">
        <img src={tmsLogoWhite} alt="The Music Space" className="h-16 w-auto object-contain" />
      </div>

      <div className="w-full max-w-lg">
        {isLoading && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {isError && (
          <div className="text-center py-16 text-muted-foreground">
            <Ticket className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">This ticket form isn't available.</p>
            <p className="text-sm mt-1">Check your link or contact The Music Space.</p>
          </div>
        )}

        {event && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            {/* Event header card */}
            <div className="rounded-2xl border border-border/60 bg-card overflow-hidden mb-6">
              {event.imageUrl && (
                <div className="h-40 overflow-hidden">
                  <img src={event.imageUrl} alt={event.title} className="w-full h-full object-cover" />
                </div>
              )}
              <div className="p-5 space-y-3">
                <h1 className="font-display text-2xl font-bold leading-tight">{event.title}</h1>
                {startDate && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4 text-primary/70 shrink-0" />
                    <span>{format(startDate, "EEEE, MMMM d, yyyy")}</span>
                  </div>
                )}
                {event.location && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4 text-primary/70 shrink-0" />
                    <span>{event.location}</span>
                  </div>
                )}
                {event.description && (
                  <p className="text-sm text-muted-foreground border-t border-border/40 pt-3">{event.description}</p>
                )}
              </div>
            </div>

            {/* Form card */}
            <div className="rounded-2xl border border-border/60 bg-card p-6">
              <h2 className="font-display font-semibold text-lg mb-5">
                {event.ticketFormType === "recital" ? "🌼 Recital Registration" : "🎟 Request Tickets"}
              </h2>
              {event.ticketFormType === "recital" ? (
                <RecitalRegistrationForm event={event} token={token} />
              ) : (
                <GeneralTicketForm event={event} token={token} />
              )}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
