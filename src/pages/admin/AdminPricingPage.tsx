import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HighlightOffersManager } from "@/components/admin/pricing/HighlightOffersManager";
import { PixConfigManager } from "@/components/admin/pricing/PixConfigManager";
import { WithdrawalRequestsManager } from "@/components/admin/pricing/WithdrawalRequestsManager";
import { PlanManagementSection } from "@/components/admin/pricing/PlanManagementSection";

export const AdminPricingPage = () => {
    const [activeTab, setActiveTab] = useState("alunos");

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Central de Cobranças</h1>
                    <p className="text-sm text-muted-foreground">
                        Gerencie planos, taxas e faturamento de toda a plataforma.
                    </p>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 bg-white/5 border border-white/10 h-auto gap-1 p-1">
                    <TabsTrigger value="alunos" className="data-[state=active]:bg-primary/20 text-[10px] md:text-sm uppercase font-bold">
                        Alunos
                    </TabsTrigger>
                    <TabsTrigger value="lojistas" className="data-[state=active]:bg-primary/20 text-[10px] md:text-sm uppercase font-bold">
                        Lojistas
                    </TabsTrigger>
                    <TabsTrigger value="profissionais" className="data-[state=active]:bg-primary/20 text-[10px] md:text-sm uppercase font-bold">
                        Profissionais
                    </TabsTrigger>
                    <TabsTrigger value="pix" className="data-[state=active]:bg-primary/20 text-[10px] md:text-sm uppercase font-bold">
                        PIX Config
                    </TabsTrigger>
                    <TabsTrigger value="withdrawals" className="data-[state=active]:bg-primary/20 text-[10px] md:text-sm uppercase font-bold">
                        Saques
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="alunos" className="space-y-4">
                    <PlanManagementSection userType="ALUNO" title="Gestão de Planos: Alunos" />
                </TabsContent>

                <TabsContent value="lojistas" className="space-y-4">
                    <PlanManagementSection userType="LOJISTA" title="Gestão de Planos: Lojistas" />
                    <HighlightOffersManager />
                </TabsContent>

                <TabsContent value="profissionais" className="space-y-4">
                    <PlanManagementSection userType="PROFISSIONAL" title="Gestão de Planos: Profissionais" />
                </TabsContent>

                <TabsContent value="pix" className="space-y-4">
                    <PixConfigManager />
                </TabsContent>

                <TabsContent value="withdrawals" className="space-y-4">
                    <WithdrawalRequestsManager />
                </TabsContent>
            </Tabs>
        </div>
    );
};

export default AdminPricingPage;
