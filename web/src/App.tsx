import { useState } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Login from "@/pages/auth/login";
import Register from "@/pages/auth/register";
import ForgotPassword from "@/pages/auth/forgot-password";
import ResetPassword from "@/pages/auth/reset-password";
import Dashboard from "@/pages/dashboard";
import SeedMarketplace from "@/pages/seed";
import NewSeedListing from "@/pages/seed/new";
import SeedDetail from "@/pages/seed/detail";
import BartarExchange from "@/pages/bartar";
import NewBartarListing from "@/pages/bartar/new";
import BartarDetail from "@/pages/bartar/detail";
import KycVerification from "@/pages/bartar/kyc";
import AiDiagnose from "@/pages/ai-diagnose";
import CartPage from "@/pages/cart";
import MessagesList from "@/pages/messages";
import TradeChat from "@/pages/messages/chat";
import Notifications from "@/pages/notifications";
import Profile from "@/pages/profile";
import AdminDashboard from "@/pages/admin/dashboard";
import AdminKyc from "@/pages/admin/kyc";
import AdminUsers from "@/pages/admin/users";
import AdminLogs from "@/pages/admin/logs";
import SeedOrderDetail from "@/pages/seed/order";
import BartarEscrowDetail from "@/pages/bartar/escrow";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { AppLayout } from "@/components/layout/app-layout";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link, useLocation } from "wouter";
import { Shield } from "lucide-react";

const queryClient = new QueryClient();

function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user } = useAuth();
  
  if (user?.role !== "SUPER_ADMIN" && user?.role !== "ADMIN_MODERATOR") {
    return <div className="p-8">Access Denied</div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-display font-bold">Admin Governance</h1>
          <p className="text-muted-foreground text-sm">Platform oversight and dispute resolution</p>
        </div>
      </div>
      
      <Tabs value={location} className="w-full">
        <TabsList>
          <TabsTrigger value="/admin" asChild>
            <Link href="/admin">Dashboard</Link>
          </TabsTrigger>
          <TabsTrigger value="/admin/kyc" asChild>
            <Link href="/admin/kyc">KYC Queue</Link>
          </TabsTrigger>
          <TabsTrigger value="/admin/users" asChild>
            <Link href="/admin/users">Users</Link>
          </TabsTrigger>
          <TabsTrigger value="/admin/logs" asChild>
            <Link href="/admin/logs">Audit Logs</Link>
          </TabsTrigger>
        </TabsList>
      </Tabs>
      
      <div className="mt-6">
        {children}
      </div>
    </div>
  );
}

function AdminRouter() {
  return (
    <AdminLayout>
      <Switch>
        <Route path="/admin" component={AdminDashboard} />
        <Route path="/admin/kyc" component={AdminKyc} />
        <Route path="/admin/users" component={AdminUsers} />
        <Route path="/admin/logs" component={AdminLogs} />
      </Switch>
    </AdminLayout>
  );
}

function ProtectedRoutes() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/seed" component={SeedMarketplace} />
        <Route path="/seed/listings/new" component={NewSeedListing} />
        <Route path="/seed/listings/:id" component={SeedDetail} />
        <Route path="/seed/orders/:id" component={SeedOrderDetail} />
        <Route path="/bartar" component={BartarExchange} />
        <Route path="/bartar/listings/new" component={NewBartarListing} />
        <Route path="/bartar/listings/:id" component={BartarDetail} />
        <Route path="/bartar/escrow/:id" component={BartarEscrowDetail} />
        <Route path="/bartar/kyc" component={KycVerification} />
        <Route path="/cart" component={CartPage} />
        <Route path="/ai-diagnose" component={AiDiagnose} />
        <Route path="/messages" component={MessagesList} />
        <Route path="/messages/:tradeId" component={TradeChat} />
        <Route path="/notifications" component={Notifications} />
        <Route path="/profile" component={Profile} />
        <Route path="/admin*" component={AdminRouter} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/dashboard" component={ProtectedRoutes} />
      <Route path="/seed*" component={ProtectedRoutes} />
      <Route path="/bartar*" component={ProtectedRoutes} />
      <Route path="/cart*" component={ProtectedRoutes} />
      <Route path="/ai-diagnose*" component={ProtectedRoutes} />
      <Route path="/messages*" component={ProtectedRoutes} />
      <Route path="/notifications*" component={ProtectedRoutes} />
      <Route path="/profile*" component={ProtectedRoutes} />
      <Route path="/admin*" component={ProtectedRoutes} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;