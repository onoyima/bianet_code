import { useState } from "react";
import { useListNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, Check, Info } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListNotificationsQueryKey } from "@workspace/api-client-react";

export default function Notifications() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useListNotifications();
  const markReadMutation = useMarkNotificationRead();
  const markAllReadMutation = useMarkAllNotificationsRead();

  const handleMarkRead = async (id: string) => {
    await markReadMutation.mutateAsync({ id });
    queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
  };

  const handleMarkAllRead = async () => {
    await markAllReadMutation.mutateAsync();
    queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Notifications</h1>
          <p className="text-muted-foreground mt-1">Stay updated on your trades and account activity.</p>
        </div>
        <Button variant="outline" onClick={handleMarkAllRead} disabled={!data?.data || data.data.length === 0}>
          <Check className="h-4 w-4 mr-2" />
          Mark all as read
        </Button>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          Array(5).fill(0).map((_, i) => (
            <Card key={i} className="opacity-50">
              <CardContent className="p-4 flex gap-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-5 w-1/3" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </CardContent>
            </Card>
          ))
        ) : data?.data && data.data.length > 0 ? (
          data.data.map((notification) => (
            <Card key={notification.id} className={`transition-colors ${!notification.isRead ? 'border-primary/30 bg-primary/5' : ''}`}>
              <CardContent className="p-4 flex gap-4 items-start">
                <div className={`p-2 rounded-full mt-1 ${!notification.isRead ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                  <Bell className="h-5 w-5" />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex justify-between items-start">
                    <h3 className={`font-medium ${!notification.isRead ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {notification.title}
                    </h3>
                    <span className="text-xs text-muted-foreground whitespace-nowrap ml-4">
                      {new Date(notification.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-foreground/80">{notification.body}</p>
                </div>
                {!notification.isRead && (
                  <Button variant="ghost" size="icon" onClick={() => handleMarkRead(notification.id)} className="h-8 w-8 text-muted-foreground hover:text-primary">
                    <Check className="h-4 w-4" />
                  </Button>
                )}
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="text-center py-20 border border-dashed rounded-xl bg-card">
            <Info className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <h3 className="text-lg font-medium text-foreground">You're all caught up</h3>
            <p className="text-muted-foreground text-sm mt-1">No new notifications at the moment.</p>
          </div>
        )}
      </div>
    </div>
  );
}