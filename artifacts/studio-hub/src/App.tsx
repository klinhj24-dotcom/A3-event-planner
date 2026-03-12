import { Switch, Route, Router as WouterRouter } from "wouter";
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/signup/:token" component={Signup} />
      <Route path="/" component={Dashboard} />
      <Route path="/contacts" component={Contacts} />
      <Route path="/events" component={Events} />
      <Route path="/employees" component={Employees} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  // We initialize the auth inside the components that need it using useAuth()
  // Since we are using @workspace/replit-auth-web, it likely provides its own context, 
  // but it's handled by the monorepo setup. The hook manages global state automatically.
  
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
