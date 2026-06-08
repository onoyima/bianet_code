import { useGetMe, useListNotifications } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldAlert, Sprout, Building2, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  const { data: user, isLoading: isLoadingUser } = useGetMe();
  const { data: notifications, isLoading: isLoadingNotifs } = useListNotifications({ limit: 5 });

  if (isLoadingUser) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Welcome back, {user?.firstName || 'User'}</h1>
        <p className="text-muted-foreground mt-1">Here's what's happening with your account today.</p>
      </div>

      {user?.kycStatus !== 'APPROVED' && (
        <Card className="border-secondary bg-secondary/5">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-secondary" />
              <CardTitle className="text-secondary">KYC Verification Required</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              To participate in the Bartar commodity exchange, you must complete your business verification.
            </p>
            <Link href="/bartar/kyc">
              <Button variant="outline" className="border-secondary text-secondary hover:bg-secondary hover:text-secondary-foreground">
                Complete KYC
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Seed Listings</CardTitle>
            <Sprout className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground mt-1">Active local listings</p>
            <div className="mt-4">
              <Link href="/seed/listings/new" className="text-sm text-primary hover:underline font-medium">
                Create new listing →
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Bartar Escrows</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground mt-1">Pending transactions</p>
            <div className="mt-4">
              <Link href="/bartar" className="text-sm text-primary hover:underline font-medium">
                Go to exchange →
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingNotifs ? (
              <div className="space-y-2 mt-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : notifications?.data && notifications.data.length > 0 ? (
              <ul className="space-y-3 mt-2">
                {notifications.data.slice(0, 2).map((notif) => (
                  <li key={notif.id} className="text-sm">
                    <span className="font-medium text-foreground block truncate">{notif.title}</span>
                    <span className="text-muted-foreground text-xs">{new Date(notif.createdAt).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground mt-2">No recent activity</p>
            )}
            <div className="mt-4">
              <Link href="/notifications" className="text-sm text-primary hover:underline font-medium">
                View all notifications →
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}