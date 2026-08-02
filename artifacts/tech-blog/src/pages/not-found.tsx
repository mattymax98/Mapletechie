import { Link } from "wouter";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Home, Search, Mail } from "lucide-react";

export default function NotFound() {
  return (
    <>
      <Helmet>
        <title>Page Not Found | Mapletechie</title>
        <meta name="robots" content="noindex, follow" />
        <meta name="googlebot" content="noindex, follow" />
        <meta name="description" content="The page you were looking for could not be found on Mapletechie." />
      </Helmet>
      <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
        <div className="max-w-xl w-full text-center space-y-6">
          <p className="text-7xl font-display font-bold text-orange-500">404</p>
          <h1 className="text-3xl md:text-4xl font-display font-bold text-zinc-100">
            We couldn't find that page
          </h1>
          <p className="text-zinc-400 text-lg leading-relaxed">
            The link may be broken, the page may have moved, or it never existed.
            Try one of the options below to get back on track.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
            <Link href="/">
              <Button className="bg-orange-500 hover:bg-orange-600 text-white" data-testid="button-not-found-home">
                <Home className="w-4 h-4 mr-2" /> Back to homepage
              </Button>
            </Link>
            <Link href="/blog">
              <Button variant="outline" data-testid="button-not-found-blog">
                <Search className="w-4 h-4 mr-2" /> Browse the blog
              </Button>
            </Link>
            <Link href="/contact">
              <Button variant="outline" data-testid="button-not-found-contact">
                <Mail className="w-4 h-4 mr-2" /> Report a broken link
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
