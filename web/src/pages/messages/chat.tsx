import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "wouter";
import { useGetTradeMessages, useGetMe, getGetTradeMessagesQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Send } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function TradeChat() {
  const { tradeId } = useParams<{ tradeId: string }>();
  const { token } = useAuth();
  const { data: user } = useGetMe();
  const { data, isLoading } = useGetTradeMessages(tradeId!, {}, { query: { enabled: !!tradeId, queryKey: getGetTradeMessagesQueryKey(tradeId!, {}) } });
  
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const ws = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (data?.messages) {
      setMessages([...data.messages].reverse());
    }
  }, [data]);

  useEffect(() => {
    if (!token || !tradeId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/ws?token=${token}`;
    
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      ws.current?.send(JSON.stringify({ type: "join", tradeId }));
    };

    ws.current.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "message" && msg.tradeId === tradeId) {
          setMessages(prev => [...prev, msg.message]);
        }
      } catch (e) {
        console.error("Failed to parse websocket message", e);
      }
    };

    const pingInterval = setInterval(() => {
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: "ping" }));
      }
    }, 30000);

    return () => {
      clearInterval(pingInterval);
      ws.current?.close();
    };
  }, [tradeId, token]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !ws.current || ws.current.readyState !== WebSocket.OPEN) return;

    ws.current.send(JSON.stringify({ type: "message", tradeId, content: input.trim() }));
    setInput("");
  };

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-8rem)] flex flex-col">
      <div className="mb-4 flex items-center gap-4">
        <Link href="/messages">
          <Button variant="outline" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-display font-bold">Trade Chat</h1>
          <p className="text-muted-foreground text-sm">Secure escrow messaging</p>
        </div>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden border-primary/20">
        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-12 w-1/2 rounded-lg" />
              <Skeleton className="h-12 w-1/3 rounded-lg ml-auto" />
            </div>
          ) : messages.length > 0 ? (
            messages.map((msg, idx) => {
              const isMine = msg.senderId === user?.id;
              return (
                <div key={msg.id || idx} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[75%] rounded-lg px-4 py-2 ${isMine ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}>
                    <p className="text-sm">{msg.content}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground mt-1">
                    {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString() : 'Just now'}
                  </span>
                </div>
              );
            })
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <p>No messages yet. Start the conversation.</p>
            </div>
          )}
          <div ref={bottomRef} />
        </CardContent>
        <div className="p-3 bg-muted/30 border-t border-border">
          <form onSubmit={handleSend} className="flex gap-2">
            <Input 
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Type a message..."
              className="flex-1"
            />
            <Button type="submit" size="icon" disabled={!input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}