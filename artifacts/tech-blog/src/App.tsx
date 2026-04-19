import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import NotFound from "@/pages/not-found";

import { Layout } from "@/components/layout/Layout";
import Home from "@/pages/home";
import BlogIndex from "@/pages/blog-index";
import BlogPost from "@/pages/blog-post";
import Shop from "@/pages/shop";
import Contact from "@/pages/contact";
import CategoryIndex from "@/pages/category-index";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    }
  }
});

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/blog" component={BlogIndex} />
        <Route path="/blog/:slug" component={BlogPost} />
        <Route path="/shop" component={Shop} />
        <Route path="/contact" component={Contact} />
        <Route path="/category/:slug" component={CategoryIndex} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark" attribute="class">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
