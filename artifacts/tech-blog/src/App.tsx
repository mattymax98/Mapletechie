import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
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
import { AdminProvider } from "@/context/AdminContext";
import { AdminGuard } from "@/components/AdminGuard";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    }
  }
});

function Router() {
  return (
    <Switch>
      {/* Admin routes — no Layout wrapper */}
      <Route path="/admin/login" component={AdminLogin} />
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
      <ThemeProvider defaultTheme="dark" attribute="class">
        <QueryClientProvider client={queryClient}>
          <AdminProvider>
            <TooltipProvider>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
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
