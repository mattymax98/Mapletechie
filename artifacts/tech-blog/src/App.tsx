import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { useEffect, lazy, Suspense } from "react";
import { trackPageView } from "@/lib/tracker";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import { HelmetProvider } from "react-helmet-async";
import NotFound from "@/pages/not-found";

import { Layout } from "@/components/layout/Layout";
import Home from "@/pages/home";

// Secondary public pages — split into their own chunks so the homepage doesn't
// ship their JS on first load. The server prerenders each route's content into
// #root, so the initial paint (and LCP) is unaffected; React swaps in once the
// route chunk loads.
const BlogIndex = lazy(() => import("@/pages/blog-index"));
const BlogPost = lazy(() => import("@/pages/blog-post"));
const CategoryIndex = lazy(() => import("@/pages/category-index"));

// Rarely-used public pages — split into their own chunks.
const Contact = lazy(() => import("@/pages/contact"));
const About = lazy(() => import("@/pages/about"));
const Careers = lazy(() => import("@/pages/careers"));
const CareerDetail = lazy(() => import("@/pages/career-detail"));
const Advertise = lazy(() => import("@/pages/advertise"));
const SearchPage = lazy(() => import("@/pages/search"));
const AuthorPage = lazy(() => import("@/pages/author"));
const TagPage = lazy(() => import("@/pages/tag"));
const SeriesPage = lazy(() => import("@/pages/series"));
const Privacy = lazy(() => import("@/pages/privacy"));
const Terms = lazy(() => import("@/pages/terms"));

// Admin pages — never loaded for public visitors, so they ship as lazy chunks.
const AdminLogin = lazy(() => import("@/pages/admin/AdminLogin"));
const AdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard"));
const AdminNewPost = lazy(() => import("@/pages/admin/AdminNewPost"));
const AdminEditPost = lazy(() => import("@/pages/admin/AdminEditPost"));
const AdminGenerate = lazy(() => import("@/pages/admin/AdminGenerate"));
const AdminUsers = lazy(() => import("@/pages/admin/AdminUsers"));
const AdminProfile = lazy(() => import("@/pages/admin/AdminProfile"));
const AdminInbox = lazy(() => import("@/pages/admin/AdminInbox"));
const AdminNewsletter = lazy(() => import("@/pages/admin/AdminNewsletter"));
const AdminJobs = lazy(() => import("@/pages/admin/AdminJobs"));
const AdminAudit = lazy(() => import("@/pages/admin/AdminAudit"));
const AdminAnalytics = lazy(() => import("@/pages/admin/AdminAnalytics"));
const AdminSendEmail = lazy(() => import("@/pages/admin/AdminSendEmail"));
const AdminMedia = lazy(() => import("@/pages/admin/AdminMedia"));
const AdminCategories = lazy(() => import("@/pages/admin/AdminCategories"));
const AdminSettings = lazy(() => import("@/pages/admin/AdminSettings"));
const AdminAbout = lazy(() => import("@/pages/admin/AdminAbout"));

import { AdminProvider } from "@/context/AdminContext";
import { AdminGuard } from "@/components/AdminGuard";
import { MaintenanceGate } from "@/components/MaintenanceGate";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    }
  }
});

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    trackPageView(location);
  }, [location]);
  return null;
}

function RouteFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<RouteFallback />}>
    <Switch>
      {/* Admin routes — no Layout wrapper */}
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin/generate">
        <AdminGuard adminOnly><AdminGenerate /></AdminGuard>
      </Route>
      <Route path="/admin/users">
        <AdminGuard><AdminUsers /></AdminGuard>
      </Route>
      <Route path="/admin/profile">
        <AdminGuard><AdminProfile /></AdminGuard>
      </Route>
      <Route path="/admin/media">
        <AdminGuard><AdminMedia /></AdminGuard>
      </Route>
      <Route path="/admin/categories">
        <AdminGuard><AdminCategories /></AdminGuard>
      </Route>
      <Route path="/admin/inbox">
        <AdminGuard><AdminInbox /></AdminGuard>
      </Route>
      <Route path="/admin/newsletter">
        <AdminGuard><AdminNewsletter /></AdminGuard>
      </Route>
      <Route path="/admin/jobs">
        <AdminGuard><AdminJobs /></AdminGuard>
      </Route>
      <Route path="/admin/audit">
        <AdminGuard><AdminAudit /></AdminGuard>
      </Route>
      <Route path="/admin/analytics">
        <AdminGuard><AdminAnalytics /></AdminGuard>
      </Route>
      <Route path="/admin/send-email">
        <AdminGuard><AdminSendEmail /></AdminGuard>
      </Route>
      <Route path="/admin/settings">
        <AdminGuard adminOnly><AdminSettings /></AdminGuard>
      </Route>
      <Route path="/admin/about">
        <AdminGuard adminOnly><AdminAbout /></AdminGuard>
      </Route>
      <Route path="/admin/posts/new">
        <AdminGuard><AdminNewPost /></AdminGuard>
      </Route>
      <Route path="/admin/posts/:id/edit">
        <AdminGuard><AdminEditPost /></AdminGuard>
      </Route>
      <Route path="/admin">
        <AdminGuard><AdminDashboard /></AdminGuard>
      </Route>

      {/* Public routes — wrapped in Layout, gated by maintenance mode */}
      <Route>
        <MaintenanceGate>
        <Layout>
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/blog" component={BlogIndex} />
            <Route path="/blog/:slug" component={BlogPost} />
            <Route path="/contact" component={Contact} />
            <Route path="/about" component={About} />
            <Route path="/careers" component={Careers} />
            <Route path="/careers/:slug" component={CareerDetail} />
            <Route path="/advertise" component={Advertise} />
            <Route path="/search" component={SearchPage} />
            <Route path="/privacy" component={Privacy} />
            <Route path="/terms" component={Terms} />
            <Route path="/category/:slug" component={CategoryIndex} />
            <Route path="/author/:username" component={AuthorPage} />
            <Route path="/tag/:tag" component={TagPage} />
            <Route path="/series/:slug" component={SeriesPage} />
            <Route component={NotFound} />
          </Switch>
        </Layout>
        </MaintenanceGate>
      </Route>
    </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <HelmetProvider>
      <ThemeProvider defaultTheme="dark" attribute="class" enableSystem>
        <QueryClientProvider client={queryClient}>
          <AdminProvider>
            <TooltipProvider>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <ScrollToTop />
                <Router />
              </WouterRouter>
              <Toaster />
            </TooltipProvider>
          </AdminProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </HelmetProvider>
  );
}

export default App;
