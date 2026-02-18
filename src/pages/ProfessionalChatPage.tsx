import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
    Send,
    Search,
    User,
    ChevronLeft,
    MoreVertical,
    MessageSquare,
    Loader2,
    Home,
    MessageCircle,
    DollarSign,
    Lock
} from "lucide-react";
import { ProfessionalFloatingNavIsland } from "@/components/navigation/ProfessionalFloatingNavIsland";
import { cn } from "@/lib/utils";
import { useUserPlan } from "@/hooks/useUserPlan";
import { Rocket } from "lucide-react";

interface ChatRoom {
    id: string;
    student_id: string;
    professional_id: string;
    last_message_at: string;
    student: {
        display_name: string;
        avatar_url: string | null;
    };
    unread_count?: number;
}

interface Message {
    id: string;
    room_id: string;
    sender_id: string;
    content: text;
    created_at: string;
}

export default function ProfessionalChatPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [rooms, setRooms] = useState<ChatRoom[]>([]);
    const [activeRoom, setActiveRoom] = useState<ChatRoom | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState("");
    const { isElite, isMaster, loading: loadingPlan } = useUserPlan();
    const canAccessChat = true; // Always unlocked
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (canAccessChat) {
            loadRooms();
        }
    }, [user, canAccessChat]);

    useEffect(() => {
        if (activeRoom) {
            loadMessages(activeRoom.id);
            subscribeToMessages(activeRoom.id);
        }
    }, [activeRoom]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const loadRooms = async () => {
        if (!user) return;
        try {
            // Get professional ID
            const { data: prof } = await supabase
                .from("professionals")
                .select("id")
                .eq("user_id", user.id)
                .single();

            if (!prof) return;

            const { data, error } = await supabase
                .from("professional_chat_rooms")
                .select(`
                    *,
                    student:profiles!professional_chat_rooms_student_id_fkey(display_name, avatar_url)
                `)
                .eq("professional_id", prof.id)
                .order("last_message_at", { ascending: false });

            if (error) throw error;
            setRooms(data as any);
        } catch (error: any) {
            console.error("Load rooms error:", error);
        } finally {
            setLoadingRooms(false);
        }
    };

    const loadMessages = async (roomId: string) => {
        setLoadingMessages(true);
        try {
            const { data, error } = await supabase
                .from("professional_chat_messages")
                .select("*")
                .eq("room_id", roomId)
                .order("created_at", { ascending: true });

            if (error) throw error;
            setMessages(data as any);
        } catch (error: any) {
            console.error("Load messages error:", error);
        } finally {
            setLoadingMessages(false);
        }
    };

    const subscribeToMessages = (roomId: string) => {
        const channel = supabase
            .channel(`room-${roomId}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "professional_chat_messages",
                    filter: `room_id=eq.${roomId}`,
                },
                (payload) => {
                    setMessages((current) => [...current, payload.new as Message]);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    };

    const handleSendMessage = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!user || !activeRoom || !newMessage.trim()) return;

        const content = newMessage;
        setNewMessage("");

        try {
            const { error } = await supabase.from("professional_chat_messages").insert({
                room_id: activeRoom.id,
                sender_id: user.id,
                content: content,
            });

            if (error) throw error;

            // Update last message timestamp in room
            await supabase
                .from("professional_chat_rooms")
                .update({ last_message_at: new Date().toISOString() })
                .eq("id", activeRoom.id);

        } catch (error: any) {
            toast({
                title: "Erro ao enviar",
                description: error.message,
                variant: "destructive",
            });
        }
    };

    if (loadingRooms || loadingPlan) {
        return (
            <div className="flex h-screen items-center justify-center bg-zinc-950">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!canAccessChat) {
        return (
            <main className="flex h-screen bg-black overflow-hidden flex-col items-center justify-center p-8 text-center">
                <div className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                    <Lock className="h-12 w-12 text-primary" />
                </div>
                <h1 className="text-3xl font-black text-white uppercase tracking-tight mb-4">Elite Plan Necessário</h1>
                <p className="text-zinc-500 max-w-md mb-8">
                    A funcionalidade de chat com alunos e agendamento é exclusiva para profissionais do plano Elite. Faça o upgrade agora para desbloquear!
                </p>
                <div className="flex gap-4">
                    <Button onClick={() => navigate("/professional/dashboard")} variant="outline" className="border-white/10 text-white">
                        Voltar ao Início
                    </Button>
                    <Button onClick={() => navigate("/professional/pricing")} className="bg-primary text-black hover:bg-primary/90">
                        <Rocket className="mr-2 h-4 w-4" /> Devenir Elite
                    </Button>
                </div>
                <ProfessionalFloatingNavIsland />
            </main>
        );
    }

    return (
        <main className="flex h-screen bg-black overflow-hidden">
            {/* Rooms Sidebar */}
            <div className={cn(
                "w-full md:w-80 border-r border-white/5 bg-zinc-950 flex flex-col transition-all duration-300",
                !sidebarOpen && "hidden md:flex"
            )}>
                <div className="p-4 border-b border-white/5 space-y-4">
                    <h1 className="text-xl font-black text-white uppercase tracking-tight">Conversas</h1>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                        <Input
                            placeholder="Buscar aluno..."
                            className="pl-9 bg-white/5 border-white/5 text-xs h-9 rounded-full"
                        />
                    </div>
                </div>

                <ScrollArea className="flex-1">
                    {loadingRooms ? (
                        <div className="p-8 flex justify-center">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        </div>
                    ) : rooms.length === 0 ? (
                        <div className="p-8 text-center">
                            <MessageSquare className="h-10 w-10 text-zinc-800 mx-auto mb-2" />
                            <p className="text-[10px] text-zinc-600 uppercase font-bold">Nenhuma conversa ativa</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-white/5">
                            {rooms.map((room) => (
                                <button
                                    key={room.id}
                                    onClick={() => {
                                        setActiveRoom(room);
                                        if (window.innerWidth < 768) setSidebarOpen(false);
                                    }}
                                    className={cn(
                                        "w-full p-4 flex items-center gap-3 transition-colors hover:bg-white/5 text-left",
                                        activeRoom?.id === room.id && "bg-white/5"
                                    )}
                                >
                                    <div className="h-12 w-12 rounded-full bg-white/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                                        {room.student?.avatar_url ? (
                                            <img src={room.student.avatar_url} alt="" className="h-full w-full object-cover" />
                                        ) : (
                                            <User className="h-6 w-6 text-zinc-400" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-0.5">
                                            <p className="text-sm font-bold text-white truncate">{room.student?.display_name || "Aluno"}</p>
                                            <span className="text-[9px] text-zinc-500">
                                                {new Date(room.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <p className="text-xs text-zinc-500 truncate">Clique para ver as mensagens</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </ScrollArea>

                <div className="p-4 md:hidden">
                    <ProfessionalFloatingNavIsland />
                </div>
            </div>

            {/* Chat Area */}
            <div className={cn(
                "flex-1 flex flex-col bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] bg-fixed",
                sidebarOpen && "hidden md:flex"
            )}>
                {activeRoom ? (
                    <>
                        <header className="p-4 bg-zinc-950/80 backdrop-blur-md border-b border-white/5 flex items-center justify-between z-10">
                            <div className="flex items-center gap-3">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setSidebarOpen(true)}
                                    className="md:hidden text-white"
                                >
                                    <ChevronLeft className="h-5 w-5" />
                                </Button>
                                <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center overflow-hidden">
                                    {activeRoom.student?.avatar_url ? (
                                        <img src={activeRoom.student.avatar_url} alt="" className="h-full w-full object-cover" />
                                    ) : (
                                        <User className="h-5 w-5 text-zinc-400" />
                                    )}
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-white leading-none">{activeRoom.student?.display_name || "Aluno"}</p>
                                    <p className="text-[10px] text-primary mt-1 flex items-center gap-1 font-bold uppercase tracking-wider">
                                        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" /> Online
                                    </p>
                                </div>
                            </div>
                            <Button variant="ghost" size="icon" className="text-zinc-400"><MoreVertical className="h-5 w-5" /></Button>
                        </header>

                        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                            <div className="space-y-4">
                                {messages.map((msg) => {
                                    const isMe = msg.sender_id === user?.id;
                                    return (
                                        <div
                                            key={msg.id}
                                            className={cn(
                                                "flex flex-col max-w-[80%]",
                                                isMe ? "ml-auto items-end" : "mr-auto items-start"
                                            )}
                                        >
                                            <div className={cn(
                                                "px-4 py-2.5 rounded-2xl text-sm shadow-sm",
                                                isMe
                                                    ? "bg-primary text-black rounded-tr-none"
                                                    : "bg-zinc-800 text-white rounded-tl-none"
                                            )}>
                                                {msg.content}
                                            </div>
                                            <span className="text-[9px] text-zinc-600 mt-1 px-1">
                                                {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </ScrollArea>

                        <footer className="p-4 bg-zinc-950/80 backdrop-blur-md border-t border-white/5 z-10">
                            <form onSubmit={handleSendMessage} className="flex items-center gap-2 max-w-4xl mx-auto">
                                <Input
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    placeholder="Escreva sua mensagem..."
                                    className="bg-white/5 border-white/5 text-sm h-12 rounded-2xl"
                                />
                                <Button type="submit" size="icon" className="h-12 w-12 rounded-2xl bg-primary text-black hover:bg-primary/90">
                                    <Send className="h-5 w-5" />
                                </Button>
                            </form>
                        </footer>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                        <div className="h-20 w-20 rounded-full bg-white/5 flex items-center justify-center mb-4">
                            <MessageSquare className="h-10 w-10 text-zinc-800" />
                        </div>
                        <h2 className="text-xl font-black text-white uppercase tracking-tight">Suas Mensagens</h2>
                        <p className="text-xs text-zinc-500 max-w-xs mt-2">
                            Selecione um aluno na lista ao lado para iniciar ou retomar uma conversa.
                        </p>
                    </div>
                )}
            </div>

            <div className="hidden md:block">
                <ProfessionalFloatingNavIsland />
            </div>
        </main>
    );
}
