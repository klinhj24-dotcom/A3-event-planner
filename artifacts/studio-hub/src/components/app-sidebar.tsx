import { 
  LayoutDashboard, 
  Users, 
  Calendar, 
  UserSquare2, 
  LogOut,
  Settings,
  Radio,
  Shield,
  DollarSign,
  CalendarDays,
  Music2,
  CreditCard,
  BarChart2,
  BookOpen,
} from "lucide-react";
import { useGetDashboardStats } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@workspace/replit-auth-web";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { GoogleConnectBanner } from "@/components/google-connect-banner";
import tmsSymbol from "@assets/TMS_Symbol_Gradient@4x_1773281994585.png";

const adminNavItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Contacts", url: "/contacts", icon: Users },
  { title: "Events", url: "/events", icon: Calendar },
  { title: "Comm Schedule", url: "/comm-schedule", icon: Radio },
  { title: "Bands", url: "/bands", icon: Music2 },
  { title: "Employees", url: "/employees", icon: UserSquare2 },
  { title: "Payroll", url: "/payroll", icon: DollarSign },
  { title: "Card Charges", url: "/charges", icon: CreditCard },
  { title: "Reports", url: "/reports", icon: BarChart2 },
  { title: "Settings", url: "/settings", icon: Settings },
  { title: "Manual", url: "/manual", icon: BookOpen },
];

const employeeNavItems = [
  { title: "My Schedule", url: "/my-schedule", icon: CalendarDays },
  { title: "Settings", url: "/settings", icon: Settings },
  { title: "Manual", url: "/manual", icon: BookOpen },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const isAdmin = (user as any)?.role === "admin";
  const navItems = isAdmin ? adminNavItems : employeeNavItems;
  const { data: stats } = useGetDashboardStats({ query: { enabled: isAdmin } });
  const pendingCharges = (stats as any)?.pendingCharges ?? 0;

  return (
    <Sidebar className="border-r border-border/20">
      <SidebarHeader className="p-4 pt-6 pb-2">
        <div className="flex items-center gap-3 px-2 py-1">
          <img
            src={tmsSymbol}
            alt="The Music Space"
            className="h-9 w-9 object-contain"
          />
          <span className="font-display text-lg font-bold tracking-tight text-sidebar-foreground">
            TMS Events
          </span>
        </div>
      </SidebarHeader>
      
      <SidebarContent className="px-2 mt-4">
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs font-semibold uppercase tracking-wider mb-2">
            Overview
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {navItems.map((item) => {
                const isActive = location === item.url || (item.url !== "/" && location.startsWith(item.url));
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton 
                      asChild 
                      isActive={isActive}
                      className={`
                        rounded-lg h-11 px-3 transition-all duration-200 relative
                        ${isActive 
                          ? "bg-sidebar-accent text-primary font-medium" 
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                        }
                      `}
                    >
                      <Link href={item.url} className="flex items-center gap-3 w-full">
                        {isActive && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full" />
                        )}
                        <item.icon className={`h-5 w-5 shrink-0 ${isActive ? "text-primary" : ""}`} />
                        <span className="flex-1">{item.title}</span>
                        {item.url === "/charges" && pendingCharges > 0 && (
                          <span className="shrink-0 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/25 text-[10px] font-bold px-1.5 py-0.5 min-w-[20px] text-center">
                            {pendingCharges}
                          </span>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 pb-6 space-y-3">
        {isAdmin && <GoogleConnectBanner />}
        <div className="flex items-center gap-3 rounded-xl bg-sidebar-accent/50 p-3 border border-border/10">
          <Avatar className="h-9 w-9 border border-border/20">
            <AvatarImage src={user?.profileImageUrl} alt={user?.username} />
            <AvatarFallback className="bg-primary/20 text-primary font-medium">
              {user?.firstName?.charAt(0).toUpperCase() || user?.username?.charAt(0).toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-sidebar-foreground truncate">
                {user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user?.username}
              </span>
              {isAdmin && (
                <Shield className="h-3 w-3 text-primary shrink-0" />
              )}
            </div>
            <span className="text-xs text-[#cfcccc] truncate">
              {isAdmin ? "Admin" : "Employee"}
            </span>
          </div>
        </div>
        <button 
          onClick={() => logout()}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-[#cfcccc] transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign Out</span>
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
