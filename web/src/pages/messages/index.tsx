import { Card, CardContent } from "@/components/ui/card";
import { MessageSquare } from "lucide-react";

export default function MessagesList() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Messages</h1>
        <p className="text-muted-foreground mt-1">Communication regarding your trades and orders.</p>
      </div>

      <Card className="border-dashed bg-muted/20">
        <CardContent className="py-20 text-center text-muted-foreground flex flex-col items-center">
          <MessageSquare className="h-10 w-10 mb-4 opacity-20" />
          <p className="font-medium text-lg">No active chats</p>
          <p className="text-sm mt-1 max-w-md">Your messages will appear here once you initiate an escrow trade or an order requires discussion.</p>
        </CardContent>
      </Card>
    </div>
  );
}