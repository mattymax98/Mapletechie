import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { useEffect } from "react";
import { trackPageView } from "@/lib/tracker";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import { HelmetProvider } from "react-helmet-async";
import NotFound from "@/pages/not-found";

import { Layout } from "@/components/layout/Layout";
import Home from "@/pages/home";
import BlogIndex from "@/pages/blog-index";
import BlogPost from "@/pages/blog-post";
import Shop from "@/pages/shop";
import Contact from "@/pages/contact";
import CategoryIndex from "@/pages/category-index";
import About from "@/pages/about";
import AdminLogin from "@/pages/admin/AdminLogin";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminNewPost from "@/pages/admin/AdminNewPost";
import AdminEditPost from "@/pages/admin/AdminEditPost";
import AdminGenerate from "@/pages/admin/AdminGenerate";
import AdminUsers from "@/pages/admin/AdminUsers";
import AdminProfile from "@/pages/admin/AdminProfile";
import AdminProducts from "@/pages/admin/AdminProducts";
import AdminInbox from "@/pages/admin/AdminInbox";
import AdminNewsletter from "@/pages/admin/AdminNewsletter";
import AdminJobs from "@/pages/admin/AdminJobs";
import AdminAudit from "@/pages/admin/AdminAudit";
import AdminAnalytics from "@/pages/admin/AdminAnalytics";
import Careers from "@/pages/careers";
import CareerDetail from "@/pages/career-detail";
import Advertise from "@/pages/advertise";
import Reviews from "@/pages/reviews";
import SearchPage from "@/pages/search";
import Privacy from "@/pages/privacy";
import Terms from "@/pages/terms";
import { AdminProvider } from "@/context/AdminContext";
import { AdminGuard } from "@/components/AdminGuard";

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

function Router() {
  return (
    <Switch>
      {/* Admin routes — no Layout wrapper */}
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin/generate">
        <AdminGuard><AdminGenerate /></AdminGuard>
      </Route>
      <Route path="/admin/users">
        <AdminGuard><AdminUsers /></AdminGuard>
      </Route>
      <Route path="/admin/profile">
        <AdminGuard><AdminProfile /></AdminGuard>
      </Route>
      <Route path="/admin/products">
        <AdminGuard><AdminProducts /></AdminGuard>
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
      <Route path="/admin/posts/new">
        <AdminGuard><AdminNewPost /></AdminGuard>
      </Route>
      <Route path="/admin/posts/:id/edit">
        <AdminGuard><AdminEditPost /></AdminGuard>
      </Route>
      <Route path="/admin">
        <AdminGuard><AdminDashboard /></AdminGuard>
      </Route>

      {/* Public routes — wrapped in Layout */}
      <Route>
        <Layout>
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/blog" component={BlogIndex} />
            <Route path="/blog/:slug" component={BlogPost} />
            <Route path="/shop" component={Shop} />
            <Route path="/contact" component={Contact} />
            <Route path="/about" component={About} />
            <Route path="/careers" component={Careers} />
            <Route path="/careers/:slug" component={CareerDetail} />
            <Route path="/advertise" component={Advertise} />
            <Route path="/reviews" component={Reviews} />
            <Route path="/search" component={SearchPage} />
            <Route path="/privacy" component={Privacy} />
            <Route path="/terms" component={Terms} />
            <Route path="/category/:slug" component={CategoryIndex} />
            <Route component={NotFound} />
          </Switch>
        </Layout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <HelmetProvider>
      <ThemeProvider defaultTheme="light" attribute="class">
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
