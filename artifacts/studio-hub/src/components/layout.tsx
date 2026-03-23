import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { useAuth } from "@workspace/replit-auth-web";
import { Redirect, useLocation } from "wouter";
import { Loader2 } from "lucide-react";

interface LayoutProps {
  children: ReactNode;
  noPadding?: boolean;
}

const PAGE_NAMES: Record<string, string> = {
  "/": "Dashboard",
  "/contacts": "Contacts",
  "/events": "Events",
  "/comm-schedule": "Comm Schedule",
  "/bands": "Bands",
  "/open-mic-series": "Open Mic",
  "/employees": "Employees",
  "/payroll": "Payroll",
  "/charges": "Card Charges",
  "/reports": "Reports",
  "/settings": "Settings",
  "/my-schedule": "My Schedule",
};

export function AppLayout({ children, noPadding }: LayoutProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 animate-in fade-in duration-500">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground font-medium animate-pulse">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  const pageName =
    PAGE_NAMES[location] ??
    PAGE_NAMES[Object.keys(PAGE_NAMES).find(k => k !== "/" && location.startsWith(k)) ?? ""] ??
    "TMS Events";

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "4rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex min-h-screen w-full bg-background/50">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0 min-h-0">
          <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur-md">
            <SidebarTrigger className="-ml-1.5 text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-lg" />
            <div className="h-4 w-px bg-border/60" />
            <span className="font-display font-semibold text-sm text-foreground/80 tracking-wide">{pageName}</span>
          </header>
          {noPadding ? (
            <main className="flex-1 overflow-hidden flex flex-col">
              {children}
            </main>
          ) : (
            <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
              <div className="mx-auto max-w-6xl animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
                {children}
              </div>
            </main>
          )}
        </div>
      </div>
    </SidebarProvider>
  );
}
