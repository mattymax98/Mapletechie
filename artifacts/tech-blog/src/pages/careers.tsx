import { Link } from "wouter";
import { useListJobs } from "@workspace/api-client-react";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { ArrowRight, MapPin, Briefcase, Clock } from "lucide-react";
import { motion } from "framer-motion";

export default function Careers() {
  const { data: jobs, isLoading } = useListJobs();

  return (
    <div className="container mx-auto px-4 md:px-6 py-12 md:py-20">
      <SEO
        title="Careers"
        description="Join Mapletechie. Help us build a tech publication readers actually trust."
        url="/careers"
      />

      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <p className="font-bold uppercase tracking-widest text-sm text-primary mb-4">Careers at Mapletechie</p>
          <h1 className="font-serif text-5xl md:text-7xl font-bold leading-[0.95] mb-8 tracking-tight">
            Build a tech publication people actually trust.
          </h1>
          <p className="text-xl text-muted-foreground font-serif leading-relaxed mb-12 border-l-4 border-primary pl-6 max-w-3xl">
            We're a small, opinionated team. We don't chase pageviews. We don't recycle press releases.
            We write what we mean and we mean what we write. If that sounds like the kind of place you want
            to work, take a look below.
          </p>
        </motion.div>

        <h2 className="text-2xl font-black uppercase tracking-tight mb-6">Open Roles</h2>

        {isLoading ? (
          <div className="space-y-4">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-32 bg-card border border-border animate-pulse" />
            ))}
          </div>
        ) : !jobs?.length ? (
          <div className="border border-border bg-card p-10 text-center">
            <Briefcase className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-bold mb-2">No open roles right now.</p>
            <p className="text-muted-foreground mb-4">
              We're always interested in hearing from sharp writers and editors. Drop us a note any time.
            </p>
            <Link href="/contact">
              <Button className="rounded-none font-bold uppercase tracking-wider">Get in touch</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {jobs.map((job: any) => (
              <Link key={job.id} href={`/careers/${job.slug}`}>
                <div className="group border border-border bg-card hover:border-primary p-6 md:p-8 transition-all cursor-pointer">
                  <div className="flex items-start justify-between gap-6 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-3 mb-3">
                        <span className="text-xs font-bold uppercase tracking-widest text-primary">{job.department}</span>
                      </div>
                      <h3 className="text-2xl md:text-3xl font-serif font-bold mb-3 group-hover:text-primary transition-colors">
                        {job.title}
                      </h3>
                      <p className="text-muted-foreground mb-4 max-w-2xl">{job.summary}</p>
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5" />
                          {job.location}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          {job.employmentType}
                        </span>
                        {job.compensation && (
                          <span className="flex items-center gap-1.5">
                            <Briefcase className="h-3.5 w-3.5" />
                            {job.compensation}
                          </span>
                        )}
                      </div>
                    </div>
                    <ArrowRight className="h-6 w-6 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-16 border-t border-border pt-10">
          <h3 className="font-serif text-3xl font-bold mb-4">Don't see your role?</h3>
          <p className="text-muted-foreground mb-6 max-w-2xl">
            We're a growing team. If you think you'd be a fit, send us a note with your work and what
            you'd want to do here.
          </p>
          <Link href="/contact">
            <Button variant="outline" className="rounded-none font-bold uppercase tracking-wider">
              Send us a note
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
