import { 
  LayoutDashboard, 
  Users, 
  Calendar, 
  UserSquare2, 
  LogOut
} from "lucide-react";
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

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Contacts", url: "/contacts", icon: Users },
  { title: "Events", url: "/events", icon: Calendar },
  { title: "Employees", url: "/employees", icon: UserSquare2 },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  return (
    <Sidebar className="border-r border-border/20">
      <div className="absolute inset-0 z-0 opacity-[0.03] dot-grid pointer-events-none" />
      <SidebarHeader className="p-4 pt-6 pb-2 relative z-10">
        <div className="flex items-center gap-3 px-2">
          {/* Brand Vinyl/Concentric Circles Icon */}
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-black border border-[#cfcccc]/20 shadow-lg relative overflow-hidden">
            <div className="absolute inset-0 rounded-full border-2 border-primary m-[3px]"></div>
            <div className="absolute inset-0 rounded-full border border-[#00b199] m-[7px]"></div>
            <div className="absolute inset-0 rounded-full bg-[#f14329] m-[11px]"></div>
            <div className="absolute w-1 h-1 rounded-full bg-white z-10"></div>
          </div>
          <span className="font-display text-xl font-bold tracking-tight text-sidebar-foreground">
            Studio Hub
          </span>
        </div>
      </SidebarHeader>
      
      <SidebarContent className="px-2 mt-4 relative z-10">
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
                      <Link href={item.url} className="flex items-center gap-3">
                        {/* Active Indicator Bar */}
                        {isActive && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full" />
                        )}
                        <item.icon className={`h-5 w-5 ${isActive ? "text-primary" : ""}`} />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 pb-6 relative z-10">
        <div className="flex items-center gap-3 rounded-xl bg-sidebar-accent/50 p-3 mb-2 border border-border/10">
          <Avatar className="h-9 w-9 border border-border/20">
            <AvatarImage src={user?.profileImage} alt={user?.username} />
            <AvatarFallback className="bg-primary/20 text-primary font-medium">
              {user?.username?.charAt(0).toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col flex-1 overflow-hidden">
            <span className="text-sm font-medium text-sidebar-foreground truncate">
              {user?.firstName ? `${user.firstName} ${user.lastName || ''}` : user?.username}
            </span>
            <span className="text-xs text-[#cfcccc] truncate">
              {user?.username}
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
