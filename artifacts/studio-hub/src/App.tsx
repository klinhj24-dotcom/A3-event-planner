import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { useAuth } from "@workspace/replit-auth-web";

import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Contacts from "@/pages/contacts";
import Events from "@/pages/events";
import Employees from "@/pages/employees";
import Signup from "@/pages/signup";
import TicketForm from "@/pages/ticket";
import GuestListForm from "@/pages/guest-list";
import Settings from "@/pages/settings";
import CommSchedule from "@/pages/comm-schedule";
import Payroll from "@/pages/payroll";
import Bands from "@/pages/bands";
import MySchedule from "@/pages/my-schedule";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ component: Component }: { component: () => JSX.Element }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Redirect to="/login" />;
  return <Component />;
}

function AdminRoute({ component: Component }: { component: () => JSX.Element }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Redirect to="/login" />;
  if ((user as any)?.role !== "admin") return <Redirect to="/my-schedule" />;
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/signup/:token" component={Signup} />
      <Route path="/ticket/:token" component={TicketForm} />
      <Route path="/guest-list/:token" component={GuestListForm} />
      <Route path="/my-schedule">{() => <ProtectedRoute component={MySchedule} />}</Route>
      <Route path="/settings">{() => <ProtectedRoute component={Settings} />}</Route>
      <Route path="/">{() => <AdminRoute component={Dashboard} />}</Route>
      <Route path="/contacts">{() => <AdminRoute component={Contacts} />}</Route>
      <Route path="/events">{() => <AdminRoute component={Events} />}</Route>
      <Route path="/employees">{() => <AdminRoute component={Employees} />}</Route>
      <Route path="/comm-schedule">{() => <AdminRoute component={CommSchedule} />}</Route>
      <Route path="/payroll">{() => <AdminRoute component={Payroll} />}</Route>
      <Route path="/bands">{() => <AdminRoute component={Bands} />}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
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

export default App;
