import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, Users, Music2, MapPin, Calendar } from "lucide-react";
import { format } from "date-fns";
import tmsLogoWhite from "@assets/TMS_Logo_Stacked_Large_White@4x_1773281994585.png";

// ── Schemas ────────────────────────────────────────────────────────────────────
const studentsOnlySchema = z.object({
  contactName: z.string().min(1, "Your name is required"),
  contactEmail: z.string().email("Valid email is required").optional().or(z.literal("")),
});

const plusOneSchema = z.object({
  contactName: z.string().min(1, "Your name is required"),
  contactEmail: z.string().email("Valid email is required").optional().or(z.literal("")),
  guestOneName: z.string().optional(),
});

const plusTwoSchema = z.object({
  contactName: z.string().min(1, "Your name is required"),
  contactEmail: z.string().email("Valid email is required").optional().or(z.literal("")),
  guestOneName: z.string().optional(),
  guestTwoName: z.string().optional(),
});

type AnyForm = { contactName: string; contactEmail?: string; guestOneName?: string; guestTwoName?: string };

// ── Main component ─────────────────────────────────────────────────────────────
export default function GuestListForm() {
  const { token } = useParams<{ token: string }>();
  const [submitted, setSubmitted] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: [`/api/guest-list/${token}`],
    queryFn: async () => {
      const r = await fetch(`/api/guest-list/${token}`);
      if (!r.ok) throw new Error("Not found");
      return r.json() as Promise<{ entry: any; event: any }>;
    },
  });

  const policy = data?.event?.guestListPolicy ?? "students_only";
  const schema = policy === "plus_two" ? plusTwoSchema : policy === "plus_one" ? plusOneSchema : studentsOnlySchema;

  const form = useForm<AnyForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      contactName: data?.entry?.contactName ?? "",
      contactEmail: data?.entry?.contactEmail ?? "",
      guestOneName: data?.entry?.guestOneName ?? "",
      guestTwoName: data?.entry?.guestTwoName ?? "",
    },
  });

  const { mutate: submit, isPending } = useMutation({
    mutationFn: async (values: AnyForm) => {
      const r = await fetch(`/api/guest-list/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!r.ok) throw new Error("Submission failed");
      return r.json();
    },
    onSuccess: () => setSubmitted(true),
  });

  // ── Layout shell ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#111413] flex flex-col items-center justify-start py-10 px-4">
      {/* Logo */}
      <div className="mb-8">
        <img src={tmsLogoWhite} alt="The Music Space" className="h-16 object-contain" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-[#1a1d1c] border border-white/10 rounded-2xl p-6 shadow-2xl"
      >
        {isLoading && (
          <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading…
          </div>
        )}

        {isError && (
          <div className="text-center py-10 text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Link not found</p>
            <p className="text-sm">This guest list link is invalid or has expired.</p>
          </div>
        )}

        {data && !submitted && (
          <>
            {/* Event info */}
            <div className="mb-5 space-y-1">
              <h1 className="text-xl font-bold text-foreground">{data.event.title}</h1>
              {data.event.startDate && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  {format(new Date(data.event.startDate), "EEEE, MMMM d, yyyy")}
                </div>
              )}
              {data.event.location && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  {data.event.location}
                </div>
              )}
            </div>

            {/* Performer info */}
            <div className="mb-5 p-3.5 rounded-xl bg-[#7250ef]/10 border border-[#7250ef]/20 flex items-start gap-3">
              <div className="h-8 w-8 rounded-full bg-[#7250ef]/20 flex items-center justify-center shrink-0">
                <Music2 className="h-4 w-4 text-[#7250ef]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{data.entry.studentName}</p>
                {data.entry.bandName && <p className="text-xs text-muted-foreground">{data.entry.bandName}</p>}
                <p className="text-xs text-[#00b199] mt-0.5 font-medium">Performer — Free admission</p>
              </div>
            </div>

            {/* Policy description */}
            <div className="mb-5 text-sm text-muted-foreground">
              {policy === "students_only" && (
                <p>Please confirm your contact information. <span className="text-foreground font-medium">{data.entry.studentName}</span> receives complimentary admission as a performer.</p>
              )}
              {policy === "plus_one" && (
                <p>As a performer, <span className="text-foreground font-medium">{data.entry.studentName}</span> receives complimentary admission plus one free guest. Enter your guest's name below, or leave it blank to register for student only.</p>
              )}
              {policy === "plus_two" && (
                <p>As a performer, <span className="text-foreground font-medium">{data.entry.studentName}</span> receives complimentary admission plus up to two free guests. Enter guest name(s) below, or leave blank.</p>
              )}
            </div>

            {/* Already submitted banner */}
            {data.entry.submitted && (
              <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-sm text-amber-400">
                You've already submitted this form. You can update it by submitting again.
              </div>
            )}

            {/* Form */}
            <Form {...form}>
              <form onSubmit={form.handleSubmit(d => submit(d))} className="space-y-4">
                <FormField control={form.control} name="contactName" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm">Your Name (Parent / Guardian) <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input className="rounded-xl bg-background/50" placeholder="Jane Smith" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="contactEmail" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm">Email Address <span className="text-muted-foreground font-normal text-xs">optional</span></FormLabel>
                    <FormControl>
                      <Input className="rounded-xl bg-background/50" type="email" placeholder="jane@example.com" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {(policy === "plus_one" || policy === "plus_two") && (
                  <FormField control={form.control} name="guestOneName" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm">
                        <Users className="h-3.5 w-3.5 inline mr-1.5" />
                        Guest 1 Name <span className="text-muted-foreground font-normal text-xs">optional</span>
                      </FormLabel>
                      <FormControl>
                        <Input className="rounded-xl bg-background/50" placeholder="Guest's full name" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}

                {policy === "plus_two" && (
                  <FormField control={form.control} name="guestTwoName" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm">
                        <Users className="h-3.5 w-3.5 inline mr-1.5" />
                        Guest 2 Name <span className="text-muted-foreground font-normal text-xs">optional</span>
                      </FormLabel>
                      <FormControl>
                        <Input className="rounded-xl bg-background/50" placeholder="Guest's full name" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}

                <Button type="submit" disabled={isPending} className="w-full rounded-xl bg-[#7250ef] hover:bg-[#7250ef]/90 text-white">
                  {isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting…</> : "Confirm My Guest List"}
                </Button>
              </form>
            </Form>
          </>
        )}

        {submitted && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center text-center gap-4 py-8">
            <div className="h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">You're on the list!</h2>
              <p className="text-muted-foreground mt-1 text-sm">Your guest list registration has been received. We'll see you at the show!</p>
            </div>
          </motion.div>
        )}
      </motion.div>

      <p className="mt-6 text-xs text-muted-foreground/50">The Music Space</p>
    </div>
  );
}
