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
import Settings from "@/pages/settings";
import CommSchedule from "@/pages/comm-schedule";
import Payroll from "@/pages/payroll";
import MySchedule from "@/pages/my-schedule";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function AdminRoute({ component: Component }: { component: () => JSX.Element }) {
  const { user, isLoading } = useAuth();
  if (isLoading || !user) return null;
  if ((user as any)?.role !== "admin") return <Redirect to="/my-schedule" />;
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/signup/:token" component={Signup} />
      <Route path="/my-schedule" component={MySchedule} />
      <Route path="/settings" component={Settings} />
      <Route path="/">{() => <AdminRoute component={Dashboard} />}</Route>
      <Route path="/contacts">{() => <AdminRoute component={Contacts} />}</Route>
      <Route path="/events">{() => <AdminRoute component={Events} />}</Route>
      <Route path="/employees">{() => <AdminRoute component={Employees} />}</Route>
      <Route path="/comm-schedule">{() => <AdminRoute component={CommSchedule} />}</Route>
      <Route path="/payroll">{() => <AdminRoute component={Payroll} />}</Route>
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
