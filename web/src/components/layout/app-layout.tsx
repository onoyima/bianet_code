import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Home, Sprout, Building2, MessageSquare, Bell, User, LogOut, Shield, ShoppingCart } from "lucide-react";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: Home },
    { name: "Seed Market", href: "/seed", icon: Sprout },
    { name: "Cart", href: "/cart", icon: ShoppingCart },
    { name: "Bartar Exchange", href: "/bartar", icon: Building2 },
    { name: "Messages", href: "/messages", icon: MessageSquare },
    { name: "Notifications", href: "/notifications", icon: Bell },
    { name: "Profile", href: "/profile", icon: User },
  ];

  if (user?.role === "ADMIN") {
    navigation.push({ name: "Admin", href: "/admin", icon: Shield });
  }

  return (
    <div className="min-h-[100dvh] flex bg-background">
      <aside className="w-64 border-r border-border bg-sidebar flex-shrink-0 flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
          <span className="font-display font-bold text-xl text-sidebar-foreground">Bia'net</span>
        </div>
        <nav className="flex-1 py-4 px-3 space-y-1">
          {navigation.map((item) => {
            const isActive = location.startsWith(item.href);
            return (
              <Link key={item.name} href={item.href} className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"}`}>
                <item.icon className="h-5 w-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-sidebar-border">
          <Button variant="ghost" className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent" onClick={logout}>
            <LogOut className="h-5 w-5 mr-3" />
            Log Out
          </Button>
        </div>
      </aside>
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
