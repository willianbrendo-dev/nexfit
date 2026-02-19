
import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation, BrowserRouter } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { useAdminRole } from "./hooks/useAdminRole";
import AuthPage from "./pages/Auth";
import AlunoAtividadePage from "./pages/AlunoAtividade";
import AlunoAtividadeMomentoPage from "./pages/AlunoAtividadeMomento";
import AlunoTreinosHojePage from "./pages/AlunoTreinosHoje";
import AlunoDashboardPage from "./pages/AlunoDashboard";
import AlunoOnboardingPage from "./pages/AlunoOnboarding";

// Admin Imports
import AdminDashboardPage from "./pages/admin/AdminDashboardPage";
import AdminUsersPage from "./pages/admin/AdminUsersPage";
import AdminBillingPage from "./pages/admin/AdminBillingPage";
import AdminStoresPage from "./pages/admin/AdminStoresPage";
import AdminTelemedicinaPage from "./pages/admin/AdminTelemedicinaPage";
import AdminContentPage from "./pages/admin/AdminContentPage";
import AdminNotificationsPage from "./pages/admin/AdminNotificationsPage";
import AdminSettingsPage from "./pages/admin/AdminSettingsPage";
import AdminExercisesPage from "./pages/admin/AdminExercisesPage";
import { AdminLayout } from "./components/admin/layout/AdminLayout";

// Detailed Imports
import MarketplaceCategoriesPage from "./pages/MarketplaceCategoriesPage";
import MarketplaceStoresPage from "./pages/MarketplaceStoresPage";
import MarketplaceStorePage from "./pages/MarketplaceStorePage";
import MarketplaceCartPage from "./pages/MarketplaceCartPage";
import MarketplaceOrdersPage from "./pages/MarketplaceOrdersPage";
import MarketplaceOrderDetailPage from "./pages/MarketplaceOrderDetailPage";
import NutricionistaPage from "./pages/NutricionistaPage";
import TelemedicinaPage from "./pages/TelemedicinaPage";
import LojaDashboardPage from "./pages/LojaDashboard";
import LojaFinanceiroPage from "./pages/LojaFinanceiroPage";
import LojaDestaquePage from "./pages/LojaDestaquePage";
import LojaProdutosPage from "./pages/LojaProdutosPage";
import LojaEstoquePage from "./pages/LojaEstoquePage";
import LojaPerfilPage from "./pages/LojaPerfilPage";
import LojaPlanoPage from "./pages/LojaPlanoPage";
import LojaOrderDetailPage from "./pages/LojaOrderDetailPage";
import ProfessionalRegistrationPage from "./pages/ProfessionalRegistrationPage";
import ProfessionalDashboard from "./pages/ProfessionalDashboard";

import ProfessionalsListPage from "./pages/ProfessionalsListPage";
import ProfessionalLandingPage from "./pages/ProfessionalLandingPage";
import ProfessionalLPEditor from "./pages/ProfessionalLPEditor";
import EntrepreneurPortalPage from "./pages/EntrepreneurPortalPage";
import LojaOnboardingPage from "./pages/LojaOnboardingPage";
import ProfessionalOnboardingPage from "./pages/ProfessionalOnboardingPage";
import ProfessionalChatPage from "./pages/ProfessionalChatPage";
import ProfessionalFinanceiroPage from "./pages/ProfessionalFinanceiroPage";
import ProfessionalProfilePage from "./pages/ProfessionalProfilePage";
import ProfessionalAgendaPage from "./pages/ProfessionalAgendaPage";
import RunningClubPage from "./pages/RunningClubPage";
import RunningClubDetailPage from "./pages/RunningClubDetailPage";
import AlunoPersonalizarAtividadePage from "./pages/AlunoPersonalizarAtividade";
import AlunoPerfilPage from "./pages/AlunoPerfilPage";
import AlunoHistoricoPage from "./pages/AlunoHistoricoPage";
import AlunoHistoricoDetalhePage from "./pages/AlunoHistoricoDetalhePage";
import AlunoEditarPerfilPage from "./pages/AlunoEditarPerfilPage";
import AlunoPreferenciasPage from "./pages/AlunoPreferenciasPage";
import AlunoPlanoPage from "./pages/AlunoPlanoPage";
import AlunoPlanosLP from "./pages/AlunoPlanosLP";
import AlunoPlanosCheckout from "./pages/AlunoPlanosCheckout";
import AlunoChatPage from "./pages/AlunoChatPage";
import AlunoConsultasPage from "./pages/AlunoConsultasPage";
import { UserPreferencesProvider } from "./hooks/useUserPreferences";
import DeviceConnectivityPage from "./pages/DeviceConnectivityPage";
import { ActivityProvider } from "./hooks/useActivityContext";
import AlunoTreinoAtivoPage from "./pages/AlunoTreinoAtivo";
import AlunoProgressoPage from "./pages/AlunoProgressoPage";
import ModoRaizPage from "./pages/ModoRaizPage";
import ModoRaizFormPage from "./pages/ModoRaizFormPage";
import ModoRaizViewPage from "./pages/ModoRaizViewPage";
import ModoRaizTreinoPage from "./pages/ModoRaizTreinoPage";
import { useConnectionStatus } from "@/hooks/useConnectionStatus";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import AdminMasterPage from "./pages/AdminMaster";
import AdminPricingPage from "./pages/admin/AdminPricingPage";
import ProfessionalPlanoPage from "./pages/ProfessionalPlanoPage";

const AlunoRoute = ({ children }: { children: JSX.Element }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [profileChecked, setProfileChecked] = useState(false);
  const [profileValid, setProfileValid] = useState(true);
  const [isStoreOwner, setIsStoreOwner] = useState(false);

  useEffect(() => {
    if (!user || loading) return;
    let cancelled = false;
    supabase
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .maybeSingle()
      .then(async ({ data }) => {
        if (cancelled) return;
        if (!data) {
          console.warn("AlunoRoute: perfil não encontrado, deslogando...");
          await supabase.auth.signOut();
          setProfileValid(false);
        } else if (data.role === "store_owner" || data.role === "professional") {
          setIsStoreOwner(true); // Using this as a "not an aluno" flag in this context
        }
        setProfileChecked(true);
      });
    return () => { cancelled = true; };
  }, [user, loading]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-background">Carregando...</div>;
  }

  if (!user || !profileValid) return <Navigate to="/auth" replace />;

  if (!profileChecked) {
    return <div className="flex min-h-screen items-center justify-center bg-background">Carregando...</div>;
  }

  // Store owners e Profissionais nunca devem ver rotas de aluno
  if (isStoreOwner) {
    // Redireciona para o painel correto
    // Se for profissional, o perfil indicou isso no useEffect inicial
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (data?.role === "professional") {
        navigate("/professional/dashboard", { replace: true });
      } else if (data?.role === "store_owner") {
        navigate("/loja/dashboard", { replace: true });
      } else {
        navigate("/", { replace: true });
      }
    });
    return <div className="flex min-h-screen items-center justify-center bg-background">Redirecionando...</div>;
  }

  const isMasterAdmin = user.email === "biotreinerapp@gmail.com";
  const searchParams = new URLSearchParams(location.search);
  const adminView = searchParams.get("adminView") === "1";

  if (isMasterAdmin && !adminView) {
    return <Navigate to="/admin" replace />;
  }

  return children;
};

// Rota dedicada para lojistas - não exige onboarding
const LojaRoute = ({ children }: { children: JSX.Element }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-background">Carregando...</div>;
  }

  if (!user) return <Navigate to="/auth" replace />;

  return children;
};

// Rota dedicada para profissionais
const ProfessionalRoute = ({ children }: { children: JSX.Element }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-background">Carregando...</div>;
  }

  if (!user) return <Navigate to="/auth" replace />;

  return children;
};

const ONBOARDING_CACHE_PREFIX = "biotreiner_onboarding_cache_";

type OnboardingCache = {
  onboarding_completed: boolean;
  altura_cm: number | null;
  peso_kg: number | null;
  training_level: string | null;
  cached_at: number;
};

const readOnboardingCache = (userId: string): OnboardingCache | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${ONBOARDING_CACHE_PREFIX}${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OnboardingCache;
    if (typeof parsed?.cached_at !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeOnboardingCache = (userId: string, data: Omit<OnboardingCache, "cached_at">) => {
  if (typeof window === "undefined") return;
  try {
    const payload: OnboardingCache = { ...data, cached_at: Date.now() };
    window.localStorage.setItem(`${ONBOARDING_CACHE_PREFIX}${userId}`, JSON.stringify(payload));
  } catch {
    // ignore
  }
};

const RequireOnboarding = ({ children }: { children: JSX.Element }) => {
  const { user, loading } = useAuth();
  const { isAdmin, loading: roleLoading } = useAdminRole();
  const { toast } = useToast();
  const [checking, setChecking] = useState(true);
  const [hasSoftCache, setHasSoftCache] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const verifyOnboarding = async () => {
      if (!user) return;

      // SWR: se já temos cache local, não bloqueia a UI enquanto revalida em background.
      const cached = readOnboardingCache(user.id);
      const cachedSatisfies =
        !!cached &&
        !!cached.onboarding_completed &&
        cached.altura_cm !== null &&
        cached.peso_kg !== null &&
        !!cached.training_level;

      setHasSoftCache(Boolean(cached));

      // 1. Sinal de sessionStorage: se acabamos de vir do fluxo de onboarding, confiamos cegamente.
      const justFinished = sessionStorage.getItem(`nexfit_just_finished_onboarding_${user.id}`) === "true";

      // Se temos cache VÁLIDO e COMPLETO, ou acabamos de finalizar, podemos mostrar a UI enquanto revalida.
      if (cachedSatisfies || justFinished) {
        setChecking(false);
      }

      if (isAdmin) {
        // Admins não passam por onboarding
        setChecking(false);
        return;
      }

      // Store owners e Profissionais não passam por onboarding de aluno
      const { data: profileData } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      const roles = (roleData?.map(r => r.role) || []) as string[];
      const userRole = profileData?.role;

      if (userRole === "store_owner" || userRole === "professional" || roles.includes("store_owner") || roles.includes("professional")) {
        console.log("[OnboardingGuard] Bypassing onboarding for role:", userRole || roles);
        setChecking(false);
        return;
      }

      // OFFLINE-FIRST: se estiver offline, usamos cache local (se existir) e não bloqueamos o app.
      if (!navigator.onLine) {
        if (cached) {
          const needsOnboarding =
            !cached.onboarding_completed ||
            cached.altura_cm === null ||
            cached.peso_kg === null ||
            !cached.training_level;
          if (needsOnboarding) navigate("/aluno/onboarding", { replace: true });
        }
        setChecking(false);
        return;
      }

      const onboardingTimeoutMs = 4000;

      const { data, error } = (await Promise.race([
        supabase
          .from("profiles")
          .select("onboarding_completed, altura_cm, peso_kg, training_level")
          .eq("id", user.id)
          .maybeSingle(),
        new Promise<{ data: null; error: Error }>((resolve) =>
          window.setTimeout(() => resolve({ data: null, error: new Error("onboarding_check_timeout") }), onboardingTimeoutMs),
        ),
      ])) as any;

      if (error) {
        // Se cair aqui por instabilidade/sem rede, tentamos cache e não travamos a navegação.
        if (cached) {
          const needsOnboarding =
            !cached.onboarding_completed ||
            cached.altura_cm === null ||
            cached.peso_kg === null ||
            !cached.training_level;
          if (needsOnboarding) navigate("/aluno/onboarding", { replace: true });
        }
        // Sem cache: não bloqueia e não mostra toast destrutivo (evita ruído no modo offline).
        setChecking(false);
        return;
      }

      const needsOnboarding =
        !data ||
        !data.onboarding_completed ||
        data.altura_cm === null ||
        data.peso_kg === null ||
        !data.training_level;

      // Se o perfil não existe (conta deletada ou corrompida), desloga e redireciona.
      if (!data) {
        console.warn("RequireOnboarding: perfil não encontrado, deslogando...");
        await supabase.auth.signOut();
        navigate("/auth", { replace: true });
        setChecking(false);
        return;
      }

      // Só atualiza cache se os dados online forem válidos OU se não tivermos cache recente.
      const isFreshVal = cached && (Date.now() - cached.cached_at < 60000);

      if (!isFreshVal || (data && data.onboarding_completed)) {
        writeOnboardingCache(user.id, {
          onboarding_completed: Boolean(data?.onboarding_completed),
          altura_cm: data?.altura_cm ?? null,
          peso_kg: data?.peso_kg ?? null,
          training_level: data?.training_level ?? null,
        });
      }

      const finalNeedsOnboarding =
        !data ||
        !data.onboarding_completed ||
        data.altura_cm === null ||
        data.peso_kg === null ||
        !data.training_level;

      const justFinishedVal = sessionStorage.getItem(`nexfit_just_finished_onboarding_${user.id}`) === "true";

      if (finalNeedsOnboarding && !isFreshVal && !justFinishedVal) {
        console.log("[OnboardingGuard] Redirecionando para onboarding (online revalidation)");
        navigate("/aluno/onboarding", { replace: true });
      }

      setChecking(false);
    };

    if (!loading && !roleLoading && user) {
      void verifyOnboarding();
    }
  }, [user, loading, roleLoading, navigate, toast, isAdmin]);

  // SWR: só bloqueia em tela cheia no boot inicial sem sessão.
  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-background">Carregando...</div>;
  }

  // Se já existe cache COMPLETO de onboarding, renderiza o app e revalida em background.
  // Se o cache existir mas não for satisfatório (onboarding pendente), DEVEMOS bloquear/mostrar loading
  // para evitar o "flicker" do dashboard antes do redirecionamento para onboarding.
  if ((roleLoading || checking) && (!hasSoftCache || !readOnboardingCache(user.id)?.onboarding_completed)) {
    return <div className="flex min-h-screen items-center justify-center bg-background">Carregando...</div>;
  }

  return children;
};

const AdminMasterRoute = ({ children }: { children: JSX.Element }) => {
  const { user, loading } = useAuth();
  const { isAdmin, loading: roleLoading, error } = useAdminRole();

  if (loading || roleLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        Carregando...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const isMasterAdmin = user.email === "biotreinerapp@gmail.com";

  if (error) {
    console.error("Erro ao verificar role admin:", error);
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
        <h1 className="mb-2 text-2xl font-bold text-foreground">Acesso negado</h1>
        <p className="mb-4 text-muted-foreground">
          Não foi possível verificar suas permissões. Tente novamente mais tarde.
        </p>
      </div>
    );
  }

  if (!isAdmin && !isMasterAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
        <h1 className="mb-2 text-2xl font-bold text-foreground">Acesso negado</h1>
        <p className="mb-4 text-muted-foreground">
          Você não tem permissão para acessar o painel administrador.
        </p>
        <a
          href="/aluno/dashboard"
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Voltar para o app
        </a>
      </div>
    );
  }

  return children;
};

const OfflineFirstManager = () => {
  useConnectionStatus();
  useOfflineSync();
  return null;
};

const AppRoutes = () => (
  <>
    <OfflineFirstManager />
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/entrepreneur/register" element={<EntrepreneurPortalPage />} />

      {/* Admin Routes */}
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminDashboardPage />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="financial" element={<AdminBillingPage />} />
        <Route path="stores" element={<AdminStoresPage />} />
        <Route path="telemedicina" element={<AdminTelemedicinaPage />} />
        <Route path="pricing" element={<AdminPricingPage />} />
        <Route path="content" element={<AdminContentPage />} />
        <Route path="exercises" element={<AdminExercisesPage />} />
        <Route path="notifications" element={<AdminNotificationsPage />} />
        <Route path="settings" element={<AdminSettingsPage />} />
      </Route>

      <Route
        path="/aluno/atividade"
        element={
          <AlunoRoute>
            <RequireOnboarding>
              <AlunoTreinosHojePage />
            </RequireOnboarding>
          </AlunoRoute>
        }
      />
      <Route
        path="/aluno/treinos"
        element={
          <AlunoRoute>
            <RequireOnboarding>
              <AlunoTreinosHojePage />
            </RequireOnboarding>
          </AlunoRoute>
        }
      />
      <Route
        path="/aluno/monitoramento"
        element={
          <AlunoRoute>
            <RequireOnboarding>
              <AlunoAtividadeMomentoPage />
            </RequireOnboarding>
          </AlunoRoute>
        }
      />
      <Route
        path="/aluno/monitoramento-tempo-real"
        element={
          <AlunoRoute>
            <RequireOnboarding>
              <AlunoAtividadePage />
            </RequireOnboarding>
          </AlunoRoute>
        }
      />
      <Route
        path="/aluno/treino-ativo"
        element={
          <AlunoRoute>
            <RequireOnboarding>
              <AlunoTreinoAtivoPage />
            </RequireOnboarding>
          </AlunoRoute>
        }
      />
      <Route
        path="/aluno/modo-raiz/:id/treino/:dayIndex"
        element={
          <AlunoRoute>
            <RequireOnboarding>
              <ModoRaizTreinoPage />
            </RequireOnboarding>
          </AlunoRoute>
        }
      />
      <Route
        path="/aluno/atividade-personalizar"
        element={
          <AlunoRoute>
            <RequireOnboarding>
              <AlunoPersonalizarAtividadePage />
            </RequireOnboarding>
          </AlunoRoute>
        }
      />
      <Route
        path="/aluno/onboarding"
        element={
          <AlunoRoute>
            <AlunoOnboardingPage />
          </AlunoRoute>
        }
      />
      <Route
        path="/aluno/dashboard"
        element={
          <AlunoRoute>
            <RequireOnboarding>
              <AlunoDashboardPage />
            </RequireOnboarding>
          </AlunoRoute>
        }
      />
      <Route
        path="/aluno/perfil"
        element={
          <AlunoRoute>
            <RequireOnboarding>
              <AlunoPerfilPage />
            </RequireOnboarding>
          </AlunoRoute>
        }
      />
      <Route
        path="/aluno/perfil/editar"
        element={
          <AlunoRoute>
            <RequireOnboarding>
              <AlunoEditarPerfilPage />
            </RequireOnboarding>
          </AlunoRoute>
        }
      />
      <Route
        path="/aluno/perfil/plano"
        element={
          <AlunoRoute>
            <RequireOnboarding>
              <AlunoPlanoPage />
            </RequireOnboarding>
          </AlunoRoute>
        }
      />
      <Route
        path="/aluno/planos"
        element={
          <AlunoRoute>
            <RequireOnboarding>
              <AlunoPlanosLP />
            </RequireOnboarding>
          </AlunoRoute>
        }
      />
      <Route
        path="/aluno/planos/checkout/:planType"
        element={
          <AlunoRoute>
            <RequireOnboarding>
              <AlunoPlanosCheckout />
            </RequireOnboarding>
          </AlunoRoute>
        }
      />
      <Route
        path="/aluno/perfil/preferencias"
        element={
          <AlunoRoute>
            <RequireOnboarding>
              <AlunoPreferenciasPage />
            </RequireOnboarding>
          </AlunoRoute>
        }
      />
      <Route
        path="/aluno/conectividade"
        element={
          <AlunoRoute>
            <RequireOnboarding>
              <DeviceConnectivityPage />
            </RequireOnboarding>
          </AlunoRoute>
        }
      />
      <Route
        path="/aluno/historico"
        element={
          <AlunoRoute>
            <RequireOnboarding>
              <AlunoHistoricoPage />
            </RequireOnboarding>
          </AlunoRoute>
        }
      />
      <Route
        path="/aluno/historico/:id"
        element={
          <AlunoRoute>
            <RequireOnboarding>
              <AlunoHistoricoDetalhePage />
            </RequireOnboarding>
          </AlunoRoute>
        }
      />
      <Route
        path="/aluno/chat"
        element={
          <AlunoRoute>
            <RequireOnboarding>
              <AlunoChatPage />
            </RequireOnboarding>
          </AlunoRoute>
        }
      />
      <Route
        path="/aluno/consultas"
        element={
          <AlunoRoute>
            <RequireOnboarding>
              <AlunoConsultasPage />
            </RequireOnboarding>
          </AlunoRoute>
        }
      />
      <Route
        path="/aluno/progresso"
        element={
          <AlunoRoute>
            <RequireOnboarding>
              <AlunoProgressoPage />
            </RequireOnboarding>
          </AlunoRoute>
        }
      />
      <Route
        path="/aluno/running-club"
        element={
          <AlunoRoute>
            <RequireOnboarding>
              <RunningClubPage />
            </RequireOnboarding>
          </AlunoRoute>
        }
      />
      <Route
        path="/aluno/running-club/:clubId"
        element={
          <AlunoRoute>
            <RequireOnboarding>
              <RunningClubDetailPage />
            </RequireOnboarding>
          </AlunoRoute>
        }
      />
      <Route
        path="/aluno/nutricionista"
        element={
          <AlunoRoute>
            <RequireOnboarding>
              <NutricionistaPage />
            </RequireOnboarding>
          </AlunoRoute>
        }
      />
      <Route
        path="/telemedicina"
        element={
          <AlunoRoute>
            <RequireOnboarding>
              <TelemedicinaPage />
            </RequireOnboarding>
          </AlunoRoute>
        }
      />
      <Route
        path="/marketplace"
        element={
          <AlunoRoute>
            <RequireOnboarding>
              <MarketplaceCategoriesPage />
            </RequireOnboarding>
          </AlunoRoute>
        }
      />
      <Route
        path="/marketplace/categoria/:category"
        element={
          <AlunoRoute>
            <RequireOnboarding>
              <MarketplaceStoresPage />
            </RequireOnboarding>
          </AlunoRoute>
        }
      />
      <Route
        path="/marketplace/loja/:storeId"
        element={
          <AlunoRoute>
            <RequireOnboarding>
              <MarketplaceStorePage />
            </RequireOnboarding>
          </AlunoRoute>
        }
      />
      <Route
        path="/marketplace/loja/:storeId/carrinho"
        element={
          <AlunoRoute>
            <RequireOnboarding>
              <MarketplaceCartPage />
            </RequireOnboarding>
          </AlunoRoute>
        }
      />
      <Route
        path="/marketplace/pedidos"
        element={
          <AlunoRoute>
            <RequireOnboarding>
              <MarketplaceOrdersPage />
            </RequireOnboarding>
          </AlunoRoute>
        }
      />
      <Route
        path="/marketplace/pedido/:orderId"
        element={
          <AlunoRoute>
            <RequireOnboarding>
              <MarketplaceOrderDetailPage />
            </RequireOnboarding>
          </AlunoRoute>
        }
      />
      <Route
        path="/aluno/modo-raiz"
        element={
          <AlunoRoute>
            <RequireOnboarding>
              <ModoRaizPage />
            </RequireOnboarding>
          </AlunoRoute>
        }
      />
      <Route
        path="/aluno/modo-raiz/nova"
        element={
          <AlunoRoute>
            <RequireOnboarding>
              <ModoRaizFormPage />
            </RequireOnboarding>
          </AlunoRoute>
        }
      />
      <Route
        path="/aluno/modo-raiz/:id"
        element={
          <AlunoRoute>
            <RequireOnboarding>
              <ModoRaizViewPage />
            </RequireOnboarding>
          </AlunoRoute>
        }
      />
      <Route
        path="/aluno/modo-raiz/:id/editar"
        element={
          <AlunoRoute>
            <RequireOnboarding>
              <ModoRaizFormPage />
            </RequireOnboarding>
          </AlunoRoute>
        }
      />
      {/* Onboarding Routes (Public) */}
      <Route path="/loja/onboarding" element={<LojaOnboardingPage />} />
      <Route path="/professional/onboarding" element={<ProfessionalOnboardingPage />} />

      {/* Loja Routes */}
      <Route
        path="/loja/dashboard"
        element={
          <LojaRoute>
            <LojaDashboardPage />
          </LojaRoute>
        }
      />
      <Route
        path="/loja/financeiro"
        element={
          <LojaRoute>
            <LojaFinanceiroPage />
          </LojaRoute>
        }
      />
      <Route
        path="/loja/destaque"
        element={
          <LojaRoute>
            <LojaDestaquePage />
          </LojaRoute>
        }
      />
      <Route
        path="/loja/produtos"
        element={
          <LojaRoute>
            <LojaProdutosPage />
          </LojaRoute>
        }
      />
      <Route
        path="/loja/estoque"
        element={
          <LojaRoute>
            <LojaEstoquePage />
          </LojaRoute>
        }
      />
      <Route
        path="/loja/perfil"
        element={
          <LojaRoute>
            <LojaPerfilPage />
          </LojaRoute>
        }
      />
      <Route
        path="/loja/plano"
        element={
          <LojaRoute>
            <LojaPlanoPage />
          </LojaRoute>
        }
      />
      <Route
        path="/loja/pedido/:orderId"
        element={
          <LojaRoute>
            <LojaOrderDetailPage />
          </LojaRoute>
        }
      />

      {/* Professional Routes */}
      <Route
        path="/professional/register"
        element={
          <ProfessionalRoute>
            <ProfessionalRegistrationPage />
          </ProfessionalRoute>
        }
      />
      <Route
        path="/professional/dashboard"
        element={
          <ProfessionalRoute>
            <ProfessionalDashboard />
          </ProfessionalRoute>
        }
      />
      <Route
        path="/professional/lp-editor"
        element={
          <ProfessionalRoute>
            <ProfessionalLPEditor />
          </ProfessionalRoute>
        }
      />
      <Route
        path="/professional/lp/:professionalId"
        element={<ProfessionalLandingPage />}
      />
      <Route
        path="/professional/onboarding"
        element={
          <ProfessionalRoute>
            <ProfessionalOnboardingPage />
          </ProfessionalRoute>
        }
      />
      <Route
        path="/professional/chat"
        element={
          <ProfessionalRoute>
            <ProfessionalChatPage />
          </ProfessionalRoute>
        }
      />
      <Route
        path="/professional/agenda"
        element={
          <ProfessionalRoute>
            <ProfessionalAgendaPage />
          </ProfessionalRoute>
        }
      />
      <Route
        path="/professional/financeiro"
        element={
          <ProfessionalRoute>
            <ProfessionalFinanceiroPage />
          </ProfessionalRoute>
        }
      />
      <Route
        path="/professional/profile"
        element={
          <ProfessionalRoute>
            <ProfessionalProfilePage />
          </ProfessionalRoute>
        }
      />
      <Route
        path="/professional/plano"
        element={
          <ProfessionalRoute>
            <ProfessionalPlanoPage />
          </ProfessionalRoute>
        }
      />

      {/* Public Professional Pages */}
      <Route path="/profissionais" element={<ProfessionalsListPage />} />
      <Route path="/profissional/:professionalId" element={<ProfessionalLandingPage />} />

      {/* Legacy Admin Routes (Kept for reference/migration) */}
      <Route
        path="/admin-master"
        element={
          <AdminMasterRoute>
            <AdminMasterPage />
          </AdminMasterRoute>
        }
      />
      <Route
        path="/admin-master/usuarios"
        element={
          <AdminMasterRoute>
            <AdminMasterPage />
          </AdminMasterRoute>
        }
      />
      <Route
        path="/admin-master/usuarios/solicitacoes-upgrade"
        element={
          <AdminMasterRoute>
            <AdminMasterPage />
          </AdminMasterRoute>
        }
      />
      <Route
        path="/admin-master/marketplace"
        element={
          <AdminMasterRoute>
            <AdminMasterPage />
          </AdminMasterRoute>
        }
      />
      <Route
        path="/admin-pricing"
        element={
          <AdminMasterRoute>
            <AdminPricingPage />
          </AdminMasterRoute>
        }
      />
      {/* LEAGCY ADMIN CONSOLE ROUTES REMOVED */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  </>
);

const ScrollToTopOnDashboard = () => {
  const location = useLocation();

  useEffect(() => {
    if (location.pathname === "/aluno/dashboard") {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
    }
  }, [location.pathname]);

  return null;
};

const App = () => (
  <AuthProvider>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <UserPreferencesProvider>
        <ActivityProvider>
          <ScrollToTopOnDashboard />
          <AppRoutes />
        </ActivityProvider>
      </UserPreferencesProvider>
    </BrowserRouter>
  </AuthProvider>
);

export default App;
