import { useState, useEffect } from "react";
import tmsLogo from "@assets/TMS_Symbol_Gradient@4x_1773281994585.png";

const INSTRUMENT_OPTIONS = [
  "Acoustic Guitar",
  "Ukulele",
  "Keyboard",
  "Mic Only — Vocals over a track",
  "Mic Only — Spoken Word / A Cappella",
  "Hand drum — I'll bring my own",
  "Other",
];

interface OpenMicInfo {
  dateLabel: string;
  location: string;
  time: string;
  monthKey: string;
}

export default function OpenMicSignup() {
  const [info, setInfo] = useState<OpenMicInfo | null>(null);
  const [form, setForm] = useState({ name: "", email: "", instrument: "", artistWebsite: "", musicLink: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    fetch("/api/open-mic/info")
      .then(r => r.json())
      .then(setInfo)
      .catch(() => {});
  }, []);

  function validate() {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Name is required";
    if (!form.email.trim()) e.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Enter a valid email";
    if (!form.instrument) e.instrument = "Please select your instrument";
    return e;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setStatus("submitting");
    try {
      const r = await fetch("/api/open-mic/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await r.json();
      if (!r.ok) { setErrorMsg(data.error ?? "Something went wrong"); setStatus("error"); return; }
      setStatus("success");
    } catch {
      setErrorMsg("Something went wrong — please try again.");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center space-y-6">
          <div className="flex justify-center">
            <img src={tmsLogo} alt="The Music Space" className="h-16 w-16 object-contain" />
          </div>
          <div className="rounded-2xl bg-[#1a1a1a] border border-white/10 p-8 space-y-4">
            <div className="text-5xl">🎶</div>
            <h2 className="text-2xl font-bold text-white">You're on the list!</h2>
            {info && (
              <p className="text-[#a0a0a0] text-sm leading-relaxed">
                We've got you down for the Open Mic at <span className="text-white">{info.location}</span> on{" "}
                <span className="text-white">{info.dateLabel}</span> at {info.time}.
              </p>
            )}
            <p className="text-[#a0a0a0] text-sm">
              Check your email for a confirmation. See you there — show up early for a better spot!
            </p>
          </div>
          <p className="text-xs text-[#555]">
            <a href="https://themusicspace.com" className="hover:text-[#a0a0a0] transition-colors">← Back to The Music Space</a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-8">

        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <img src={tmsLogo} alt="The Music Space" className="h-14 w-14 object-contain" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white uppercase">
              Open Mic Signup
            </h1>
            {info ? (
              <p className="mt-2 text-[#a0a0a0] text-sm">
                {info.location} &nbsp;·&nbsp; {info.dateLabel} &nbsp;·&nbsp; {info.time}
              </p>
            ) : (
              <p className="mt-2 text-[#555] text-sm animate-pulse">Loading event details…</p>
            )}
          </div>
        </div>

        {/* Form card */}
        <form onSubmit={handleSubmit} className="rounded-2xl bg-[#1a1a1a] border border-white/10 p-6 space-y-5">

          {/* Name */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#888]">
              Name or Artist Name <span className="text-[#7250ef]">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Your name or stage name"
              className={`w-full rounded-xl bg-[#111] border px-4 py-3 text-sm text-white placeholder-[#444] outline-none focus:ring-2 focus:ring-[#7250ef]/50 transition-all ${errors.name ? "border-red-500/60" : "border-white/10 focus:border-[#7250ef]/50"}`}
            />
            {errors.name && <p className="text-xs text-red-400">{errors.name}</p>}
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#888]">
              Email <span className="text-[#7250ef]">*</span>
            </label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="you@example.com"
              className={`w-full rounded-xl bg-[#111] border px-4 py-3 text-sm text-white placeholder-[#444] outline-none focus:ring-2 focus:ring-[#7250ef]/50 transition-all ${errors.email ? "border-red-500/60" : "border-white/10 focus:border-[#7250ef]/50"}`}
            />
            {errors.email && <p className="text-xs text-red-400">{errors.email}</p>}
          </div>

          {/* Instrument */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#888]">
              Instrument <span className="text-[#7250ef]">*</span>
            </label>
            <select
              value={form.instrument}
              onChange={e => setForm(f => ({ ...f, instrument: e.target.value }))}
              className={`w-full rounded-xl bg-[#111] border px-4 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-[#7250ef]/50 transition-all appearance-none ${errors.instrument ? "border-red-500/60" : "border-white/10 focus:border-[#7250ef]/50"} ${!form.instrument ? "text-[#444]" : ""}`}
            >
              <option value="" disabled>Select your instrument</option>
              {INSTRUMENT_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            {errors.instrument && <p className="text-xs text-red-400">{errors.instrument}</p>}
          </div>

          {/* Artist Website */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#888]">
              Artist Website <span className="text-[#555] normal-case font-normal">(optional)</span>
            </label>
            <input
              type="url"
              value={form.artistWebsite}
              onChange={e => setForm(f => ({ ...f, artistWebsite: e.target.value }))}
              placeholder="https://"
              className="w-full rounded-xl bg-[#111] border border-white/10 focus:border-[#7250ef]/50 px-4 py-3 text-sm text-white placeholder-[#444] outline-none focus:ring-2 focus:ring-[#7250ef]/50 transition-all"
            />
          </div>

          {/* Music Link */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#888]">
              Where can we hear your music? <span className="text-[#555] normal-case font-normal">(optional)</span>
            </label>
            <input
              type="url"
              value={form.musicLink}
              onChange={e => setForm(f => ({ ...f, musicLink: e.target.value }))}
              placeholder="Spotify, SoundCloud, YouTube, etc."
              className="w-full rounded-xl bg-[#111] border border-white/10 focus:border-[#7250ef]/50 px-4 py-3 text-sm text-white placeholder-[#444] outline-none focus:ring-2 focus:ring-[#7250ef]/50 transition-all"
            />
          </div>

          {/* Note about signup */}
          <p className="text-[11px] text-[#555] leading-relaxed">
            Signup is for headcount only — performance order is based on arrival time.
          </p>

          {status === "error" && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={status === "submitting"}
            className="w-full rounded-xl bg-[#7250ef] hover:bg-[#5f3dd4] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3.5 text-sm transition-colors"
          >
            {status === "submitting" ? "Signing up…" : "Sign Me Up"}
          </button>
        </form>

        <p className="text-center text-xs text-[#444]">
          <a href="https://themusicspace.com" className="hover:text-[#888] transition-colors">
            themusicspace.com
          </a>
        </p>

      </div>
    </div>
  );
}
