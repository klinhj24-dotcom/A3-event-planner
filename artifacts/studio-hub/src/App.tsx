import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClerkProvider } from "@clerk/clerk-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { useAuth } from "@workspace/replit-auth-web";

import Login from "@/pages/login";
import SignInPage from "@/pages/sign-in";
import SignUpPage from "@/pages/sign-up";
import Dashboard from "@/pages/dashboard";
import Contacts from "@/pages/contacts";
import Events from "@/pages/events";
import Employees from "@/pages/employees";
import Signup from "@/pages/signup";
import TicketForm from "@/pages/ticket";
import GuestListForm from "@/pages/guest-list";
import BandConfirm from "@/pages/band-confirm";
import Settings from "@/pages/settings";
import CommSchedule from "@/pages/comm-schedule";
import Payroll from "@/pages/payroll";
import Bands from "@/pages/bands";
import MySchedule from "@/pages/my-schedule";
import Charges from "@/pages/charges";
import Reports from "@/pages/reports";
import Manual from "@/pages/manual";
import OpenMicSignup from "@/pages/open-mic-signup";
import OpenMicSeries from "@/pages/open-mic-series";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

function ProtectedRoute({ component: Component }: { component: () => JSX.Element }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Redirect to="/sign-in" />;
  return <Component />;
}

function AdminRoute({ component: Component }: { component: () => JSX.Element }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Redirect to="/sign-in" />;
  if ((user as any)?.role !== "admin") return <Redirect to="/my-schedule" />;
  return <Component />;
}

function Router() {
  return (
    <Switch>
      {/* Auth — Clerk takes /sign-in, /sign-up; legacy /login kept during cutover.
          Each Clerk page needs both the bare path AND a /* catch-all so Clerk's
          internal navigation (verify-email-address, factor-one, etc.) doesn't
          fall through to NotFound. Wouter v3's path matching does not treat
          a single :rest* param as zero-or-more segments here. */}
      <Route path="/sign-in" component={SignInPage} />
      <Route path="/sign-in/*" component={SignInPage} />
      <Route path="/sign-up" component={SignUpPage} />
      <Route path="/sign-up/*" component={SignUpPage} />
      <Route path="/login" component={Login} />
      <Route path="/signup/:token" component={Signup} />
      <Route path="/ticket/:token" component={TicketForm} />
      <Route path="/guest-list/:token" component={GuestListForm} />
      <Route path="/band-confirm/:token" component={BandConfirm} />
      <Route path="/open-mic/:slug" component={OpenMicSignup} />
      <Route path="/open-mic" component={OpenMicSignup} />
      <Route path="/my-schedule">{() => <ProtectedRoute component={MySchedule} />}</Route>
      <Route path="/settings">{() => <ProtectedRoute component={Settings} />}</Route>
      <Route path="/">{() => <AdminRoute component={Dashboard} />}</Route>
      <Route path="/contacts">{() => <AdminRoute component={Contacts} />}</Route>
      <Route path="/events">{() => <AdminRoute component={Events} />}</Route>
      <Route path="/employees">{() => <AdminRoute component={Employees} />}</Route>
      <Route path="/comm-schedule">{() => <AdminRoute component={CommSchedule} />}</Route>
      <Route path="/payroll">{() => <AdminRoute component={Payroll} />}</Route>
      <Route path="/bands">{() => <AdminRoute component={Bands} />}</Route>
      <Route path="/charges">{() => <AdminRoute component={Charges} />}</Route>
      <Route path="/reports">{() => <AdminRoute component={Reports} />}</Route>
      <Route path="/open-mic-series">{() => <AdminRoute component={OpenMicSeries} />}</Route>
      <Route path="/manual">{() => <ProtectedRoute component={Manual} />}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function AppShell() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function App() {
  // Soft cutover: if VITE_CLERK_PUBLISHABLE_KEY isn't set yet, render the
  // app without ClerkProvider so the legacy login flow still works in
  // environments that haven't configured Clerk. Once the key is set in
  // .env / Vercel, ClerkProvider activates and /sign-in becomes the
  // primary path.
  if (!CLERK_PUBLISHABLE_KEY) {
    if (import.meta.env.DEV) {
      console.warn("[clerk] VITE_CLERK_PUBLISHABLE_KEY is not set — Clerk is disabled, only legacy /login will work.");
    }
    return <AppShell />;
  }

  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      afterSignInUrl="/"
      afterSignUpUrl="/"
      afterSignOutUrl="/sign-in"
    >
      <AppShell />
    </ClerkProvider>
  );
}

export default App;
