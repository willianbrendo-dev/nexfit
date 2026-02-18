
import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Loader2,
    Plus,
    ArrowUpCircle,
    ArrowDownCircle,
    Wallet,
    Settings2,
    CheckCircle,
    XCircle,
    Eye,
    Filter,
    CalendarDays,
    TrendingUp,
    TrendingDown,
    Activity
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { IntegrationSettingsPanel } from "@/components/admin/IntegrationSettingsPanel";

type PagamentoRow = {
    id: string;
    user_id: string;
    provider: "pix";
    desired_plan: string;
    status: "pending" | "approved" | "rejected";
    requested_at: string;
    receipt_path: string;
    processed_at: string | null;
    processed_by: string | null;
    rejection_reason: string | null;
};

type PaymentRowUi = PagamentoRow & {
    user_name: string;
    user_email: string;
};

type TransactionRow = {
    id: string;
    type: 'income' | 'expense';
    amount_cents: number;
    description: string;
    category: string;
    date: string;
};

export const AdminBillingPage = () => {
    const { toast } = useToast();
    const { user: sessionUser } = useAuth();
    const queryClient = useQueryClient();

    // UI States
    const [activeTab, setActiveTab] = useState("overview");
    const [paymentStatus, setPaymentStatus] = useState<"all" | "approved" | "pending" | "rejected">("pending");
    const [isApiDialogOpen, setIsApiDialogOpen] = useState(false);
    const [isExpenseDialogOpen, setIsExpenseDialogOpen] = useState(false);
    const [processingId, setProcessingId] = useState<string | null>(null);

    // Filter states
    const [timeRange, setTimeRange] = useState("30d");

    // Form states for manual transaction
    const [newExpense, setNewExpense] = useState({
        description: "",
        amount: "",
        category: "Infraestrutura",
        date: new Date().toISOString().split('T')[0],
        type: 'expense' as 'income' | 'expense'
    });

    // Queries
    const { data: payments = [], isLoading: loadingPayments } = useQuery<PaymentRowUi[]>({
        queryKey: ["admin-billing-payments", paymentStatus],
        queryFn: async () => {
            let q = supabase
                .from("pagamentos")
                .select("*")
                .order("requested_at", { ascending: false });

            if (paymentStatus !== "all") {
                q = q.eq("status", paymentStatus);
            }

            const { data, error } = await q;
            if (error) throw error;

            const rows = (data ?? []) as any[];

            // Map users (same logic as before)
            const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
            if (!userIds.length) return [];

            const { data: profiles } = await supabase
                .from("profiles")
                .select("id, nome, email")
                .in("id", userIds);

            const profilesMap = new Map(profiles?.map(p => [p.id, p]));

            return rows.map(r => ({
                ...r,
                user_name: profilesMap.get(r.user_id)?.nome || "Usuário",
                user_email: profilesMap.get(r.user_id)?.email || ""
            }));
        }
    });

    const { data: transactions = [], isLoading: loadingTransactions } = useQuery<TransactionRow[]>({
        queryKey: ["admin-financial-transactions", timeRange],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("financial_transactions")
                .select("*")
                .order("date", { ascending: false });
            if (error) throw error;
            return data as TransactionRow[];
        }
    });

    // Totals Calculation
    const stats = useMemo(() => {
        const income = transactions
            .filter(t => t.type === 'income')
            .reduce((acc, t) => acc + t.amount_cents, 0);

        const expenses = transactions
            .filter(t => t.type === 'expense')
            .reduce((acc, t) => acc + t.amount_cents, 0);

        return {
            income: income / 100,
            expenses: expenses / 100,
            balance: (income - expenses) / 100
        };
    }, [transactions]);

    // Actions
    const handleApprove = async (payment: PaymentRowUi) => {
        if (!sessionUser) return;
        setProcessingId(payment.id);
        try {
            // 1. Update Profile
            const { error: pErr } = await supabase
                .from("profiles")
                .update({
                    subscription_plan: payment.desired_plan,
                    plan_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
                })
                .eq("id", payment.user_id);
            if (pErr) throw pErr;

            // 2. Update Payment
            const { error: payErr } = await supabase
                .from("pagamentos")
                .update({ status: "approved", processed_at: new Date().toISOString(), processed_by: sessionUser.id })
                .eq("id", payment.id);
            if (payErr) throw payErr;

            // 3. Register Income Transaction
            const amountCents = 4990; // Default or fetch from pricing configs
            await supabase.from("financial_transactions").insert({
                type: 'income',
                amount_cents: amountCents,
                description: `Assinatura ${payment.desired_plan} - ${payment.user_name}`,
                category: 'Assinaturas',
                reference_id: payment.id,
                date: new Date().toISOString().split('T')[0]
            });

            toast({ title: "Pagamento Aprovado", description: "O acesso do aluno foi liberado." });
            queryClient.invalidateQueries({ queryKey: ["admin-billing-payments"] });
            queryClient.invalidateQueries({ queryKey: ["admin-financial-transactions"] });
        } catch (err: any) {
            toast({ title: "Erro na aprovação", description: err.message, variant: "destructive" });
        } finally {
            setProcessingId(null);
        }
    };

    const handleCreateTransaction = async () => {
        if (!newExpense.description || !newExpense.amount) return;

        try {
            setProcessingId("new-transaction");
            const amountCents = Math.round(parseFloat(newExpense.amount.replace(',', '.')) * 100);

            const { error } = await supabase.from("financial_transactions").insert({
                type: newExpense.type,
                amount_cents: amountCents,
                description: newExpense.description,
                category: newExpense.category,
                date: newExpense.date
            });

            if (error) throw error;

            toast({
                title: newExpense.type === 'income' ? "Receita registrada" : "Despesa registrada",
                description: "O lançamento foi adicionado ao faturamento."
            });
            setIsExpenseDialogOpen(false);
            setNewExpense({
                description: "",
                amount: "",
                category: "Infraestrutura",
                date: new Date().toISOString().split('T')[0],
                type: 'expense'
            });
            queryClient.invalidateQueries({ queryKey: ["admin-financial-transactions"] });
        } catch (err: any) {
            toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
        } finally {
            setProcessingId(null);
        }
    };

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-700">
            {/* Header Section */}
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Faturamento</h1>
                    <p className="text-muted-foreground mt-1">Visão holística da saúde financeira do Nexfit.</p>
                </div>
                <div className="flex items-center gap-3">
                    <Button
                        variant="outline"
                        onClick={() => setIsApiDialogOpen(true)}
                        className="bg-white/5 border-white/10 hover:bg-white/10 text-white gap-2"
                    >
                        <Settings2 className="h-4 w-4 text-green-400" />
                        APIs
                    </Button>
                    <div className="flex items-center gap-2">
                        <Button
                            onClick={() => {
                                setNewExpense(prev => ({ ...prev, type: 'income' }));
                                setIsExpenseDialogOpen(true);
                            }}
                            className="bg-green-600 hover:bg-green-700 text-white gap-2"
                        >
                            <Plus className="h-4 w-4" />
                            <span className="hidden sm:inline">Receita</span>
                            <span className="sm:hidden">Rec.</span>
                        </Button>
                        <Button
                            onClick={() => {
                                setNewExpense(prev => ({ ...prev, type: 'expense' }));
                                setIsExpenseDialogOpen(true);
                            }}
                            className="bg-red-600 hover:bg-red-700 text-white gap-2"
                        >
                            <Plus className="h-4 w-4" />
                            <span className="hidden sm:inline">Despesa</span>
                            <span className="sm:hidden">Desp.</span>
                        </Button>
                    </div>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-6 md:grid-cols-3">
                <Card className="bg-black/40 border-white/5 backdrop-blur-xl group hover:border-green-500/30 transition-all">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Receita Total</CardTitle>
                        <ArrowUpCircle className="h-5 w-5 text-green-500 group-hover:scale-110 transition-transform" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-white tracking-tight">{formatCurrency(stats.income)}</div>
                        <p className="text-xs text-green-500 flex items-center mt-1">
                            <TrendingUp className="h-3 w-3 mr-1" />
                            +12.5% em relação ao mês anterior
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-black/40 border-white/5 backdrop-blur-xl group hover:border-red-500/30 transition-all">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Despesas</CardTitle>
                        <ArrowDownCircle className="h-5 w-5 text-red-500 group-hover:scale-110 transition-transform" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-white tracking-tight">{formatCurrency(stats.expenses)}</div>
                        <p className="text-xs text-red-400 flex items-center mt-1">
                            <Activity className="h-3 w-3 mr-1" />
                            Fixo: Aluguel, AWS, Mercado Pago
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-black/40 border-white/5 backdrop-blur-xl group hover:border-blue-500/30 transition-all shadow-[0_0_20px_rgba(59,130,246,0.05)]">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Saldo Líquido</CardTitle>
                        <Wallet className="h-5 w-5 text-blue-400 group-hover:scale-110 transition-transform" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-white tracking-tight">{formatCurrency(stats.balance)}</div>
                        <p className="text-xs text-muted-foreground mt-1">Patrimônio livre disponível</p>
                    </CardContent>
                </Card>
            </div>

            {/* Main Content Area */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                <TabsList className="bg-black/40 border border-white/5 p-1">
                    <TabsTrigger value="overview" className="data-[state=active]:bg-green-600 data-[state=active]:text-white transition-all">Overview</TabsTrigger>
                    <TabsTrigger value="payments" className="data-[state=active]:bg-green-600 data-[state=active]:text-white transition-all">Aprovação de Pix</TabsTrigger>
                    <TabsTrigger value="expenses" className="data-[state=active]:bg-green-600 data-[state=active]:text-white transition-all">Histórico de Transações</TabsTrigger>
                </TabsList>

                <TabsContent value="overview">
                    <Card className="bg-black/40 border-white/5">
                        <CardHeader>
                            <CardTitle className="text-white text-lg font-semibold">Projeção e Rendimento</CardTitle>
                            <CardDescription>Visualização rápida do fluxo de caixa.</CardDescription>
                        </CardHeader>
                        <CardContent className="h-[200px] flex items-center justify-center border-t border-white/5">
                            <div className="text-center">
                                <Activity className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                                <p className="text-muted-foreground text-sm">Gráfico de desempenho será exibido aqui quando houver mais dados.</p>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="payments" className="space-y-4">
                    <div className="flex justify-between items-center">
                        <div className="flex gap-2">
                            <Badge
                                variant={paymentStatus === 'pending' ? 'default' : 'outline'}
                                className="cursor-pointer"
                                onClick={() => setPaymentStatus('pending')}
                            >Pendentes</Badge>
                            <Badge
                                variant={paymentStatus === 'approved' ? 'default' : 'outline'}
                                className="cursor-pointer"
                                onClick={() => setPaymentStatus('approved')}
                            >Aprovados</Badge>
                        </div>
                    </div>

                    <div className="rounded-xl border border-white/5 bg-black/20 overflow-hidden">
                        <Table>
                            <TableHeader className="bg-white/5">
                                <TableRow className="border-white/5">
                                    <TableHead className="text-white">Aluno</TableHead>
                                    <TableHead className="text-white">Plano</TableHead>
                                    <TableHead className="text-white">Status</TableHead>
                                    <TableHead className="text-white text-right">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loadingPayments ? (
                                    <TableRow><TableCell colSpan={4} className="text-center p-8"><Loader2 className="animate-spin h-6 w-6 mx-auto" /></TableCell></TableRow>
                                ) : payments.length === 0 ? (
                                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground h-20">Nenhum pagamento pendente.</TableCell></TableRow>
                                ) : (
                                    payments.map(p => (
                                        <TableRow key={p.id} className="border-white/5 hover:bg-white/5">
                                            <TableCell>
                                                <div className="font-medium text-white">{p.user_name}</div>
                                                <div className="text-xs text-muted-foreground">{p.user_email}</div>
                                            </TableCell>
                                            <TableCell><Badge variant="outline">{p.desired_plan}</Badge></TableCell>
                                            <TableCell>
                                                <Badge className={p.status === 'pending' ? 'bg-yellow-500/10 text-yellow-500' : 'bg-green-500/10 text-green-500'}>
                                                    {p.status === 'pending' ? 'Pendente' : 'Aprovado'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {p.status === 'pending' && (
                                                    <div className="flex justify-end gap-2">
                                                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => window.open(supabase.storage.from("payment_receipts").getPublicUrl(p.receipt_path).data.publicUrl, '_blank')}>
                                                            <Eye className="h-4 w-4 text-blue-400" />
                                                        </Button>
                                                        <Button size="sm" className="bg-green-600 h-8" onClick={() => handleApprove(p)} disabled={!!processingId}>
                                                            {processingId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                                                        </Button>
                                                    </div>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </TabsContent>

                <TabsContent value="expenses">
                    <div className="rounded-xl border border-white/5 bg-black/20 overflow-hidden">
                        <Table>
                            <TableHeader className="bg-white/5">
                                <TableRow className="border-white/5">
                                    <TableHead className="text-white">Data</TableHead>
                                    <TableHead className="text-white">Descrição</TableHead>
                                    <TableHead className="text-white">Categoria</TableHead>
                                    <TableHead className="text-white text-right">Valor</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loadingTransactions ? (
                                    <TableRow><TableCell colSpan={4} className="text-center p-8"><Loader2 className="animate-spin h-6 w-6 mx-auto" /></TableCell></TableRow>
                                ) : transactions.length === 0 ? (
                                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground h-20">Sem transações registradas.</TableCell></TableRow>
                                ) : (
                                    transactions.map(t => (
                                        <TableRow key={t.id} className="border-white/5 hover:bg-white/5">
                                            <TableCell className="text-muted-foreground">{new Date(t.date).toLocaleDateString('pt-BR')}</TableCell>
                                            <TableCell className="text-white font-medium">{t.description}</TableCell>
                                            <TableCell><Badge variant="secondary" className="bg-white/5">{t.category}</Badge></TableCell>
                                            <TableCell className={`text-right font-bold ${t.type === 'income' ? 'text-green-400' : 'text-red-400'}`}>
                                                {t.type === 'income' ? '+' : '-'} {formatCurrency(t.amount_cents / 100)}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </TabsContent>
            </Tabs>

            {/* API Settings Dialog */}
            <Dialog open={isApiDialogOpen} onOpenChange={setIsApiDialogOpen}>
                <DialogContent className="bg-[#1a1a1a] border-white/10 text-white sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Settings2 className="h-5 w-5 text-green-500" />
                            Configuração de APIs Financeiras
                        </DialogTitle>
                        <DialogDescription className="text-muted-foreground">
                            Gerencie as chaves de integração do Mercado Pago e outras plataformas.
                        </DialogDescription>
                    </DialogHeader>
                    <IntegrationSettingsPanel />
                </DialogContent>
            </Dialog>

            {/* New Transaction Dialog */}
            <Dialog open={isExpenseDialogOpen} onOpenChange={setIsExpenseDialogOpen}>
                <DialogContent className="bg-[#1a1a1a] border-white/10 text-white">
                    <DialogHeader>
                        <DialogTitle>
                            {newExpense.type === 'income' ? 'Lançar Nova Receita' : 'Lançar Nova Despesa'}
                        </DialogTitle>
                        <DialogDescription>Crie um registro manual de entrada ou saída de caixa.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Descrição</Label>
                            <Input
                                placeholder="Ex: Venda avulsa, Mensalidade AWS..."
                                value={newExpense.description}
                                onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                                className="bg-black/20 border-white/10"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Valor (R$)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    placeholder="0,00"
                                    value={newExpense.amount}
                                    onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                                    className="bg-black/20 border-white/10"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Data</Label>
                                <Input
                                    type="date"
                                    value={newExpense.date}
                                    onChange={(e) => setNewExpense({ ...newExpense, date: e.target.value })}
                                    className="bg-black/20 border-white/10"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Categoria</Label>
                            <Select
                                value={newExpense.category}
                                onValueChange={(v) => setNewExpense({ ...newExpense, category: v })}
                            >
                                <SelectTrigger className="bg-black/20 border-white/10">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Infraestrutura">Infraestrutura</SelectItem>
                                    <SelectItem value="Marketing">Marketing</SelectItem>
                                    <SelectItem value="Venda Direta">Venda Direta</SelectItem>
                                    <SelectItem value="Serviços">Serviços</SelectItem>
                                    <SelectItem value="Outros">Outros</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsExpenseDialogOpen(false)}>Cancelar</Button>
                        <Button
                            className={newExpense.type === 'income' ? "bg-green-600 hover:bg-green-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"}
                            onClick={handleCreateTransaction}
                            disabled={!!processingId}
                        >
                            {processingId === 'new-transaction' ? <Loader2 className="animate-spin h-4 w-4" /> : "Salvar Lançamento"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default AdminBillingPage;
