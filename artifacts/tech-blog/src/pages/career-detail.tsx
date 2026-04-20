import { useRoute, Link } from "wouter";
import { useState } from "react";
import { useGetJobBySlug, useSubmitApplication } from "@workspace/api-client-react";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, MapPin, Clock, Briefcase, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";

function blockToList(text: string) {
  return text
    .split(/\n+/)
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
}

export default function CareerDetail() {
  const [, params] = useRoute("/careers/:slug");
  const slug = params?.slug || "";
  const { data: job, isLoading } = useGetJobBySlug(slug);
  const { toast } = useToast();
  const submit = useSubmitApplication();
  const [submitted, setSubmitted] = useState(false);

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    resumeUrl: "",
    portfolioUrl: "",
    coverLetter: "",
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.coverLetter) {
      toast({ title: "Missing info", description: "Name, email, and cover letter are required.", variant: "destructive" });
      return;
    }
    submit.mutate(
      { slug, data: form as any },
      {
        onSuccess: (res: any) => {
          setSubmitted(true);
          toast({ title: "Application sent", description: res?.message || "Thanks — we'll be in touch." });
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to submit. Please try again.", variant: "destructive" });
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-20">
        <div className="max-w-3xl mx-auto h-96 bg-card animate-pulse" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-3xl font-bold mb-4">Job not found</h1>
        <p className="text-muted-foreground mb-6">This posting may have been filled or removed.</p>
        <Link href="/careers">
          <Button className="rounded-none font-bold uppercase tracking-wider">View open roles</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 md:px-6 py-12 md:py-16">
      <SEO title={`${job.title} — Careers`} description={job.summary} url={`/careers/${job.slug}`} />

      <div className="max-w-4xl mx-auto">
        <Link href="/careers">
          <Button variant="ghost" size="sm" className="mb-8 gap-2 text-muted-foreground hover:text-primary">
            <ArrowLeft className="h-4 w-4" /> All roles
          </Button>
        </Link>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <p className="font-bold uppercase tracking-widest text-sm text-primary mb-3">{job.department}</p>
          <h1 className="font-serif text-4xl md:text-6xl font-bold leading-[0.95] mb-6 tracking-tight">{job.title}</h1>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground mb-10 pb-8 border-b border-border">
            <span className="flex items-center gap-2"><MapPin className="h-4 w-4" /> {job.location}</span>
            <span className="flex items-center gap-2"><Clock className="h-4 w-4" /> {job.employmentType}</span>
            {job.compensation && <span className="flex items-center gap-2"><Briefcase className="h-4 w-4" /> {job.compensation}</span>}
          </div>

          <div className="prose prose-lg max-w-none mb-10">
            <p className="font-serif text-xl leading-relaxed text-foreground/90 whitespace-pre-line">{job.description}</p>
          </div>

          <Section title="What you'll do" items={blockToList(job.responsibilities)} />
          <Section title="What we're looking for" items={blockToList(job.requirements)} />
          {job.niceToHaves && <Section title="Nice to have" items={blockToList(job.niceToHaves)} />}
        </motion.div>

        <div id="apply" className="mt-16 border-t-2 border-foreground pt-10">
          <h2 className="text-3xl font-black uppercase tracking-tight mb-2">Apply</h2>
          <p className="text-muted-foreground mb-8">
            Send your application below. We read every one.
          </p>

          {submitted ? (
            <div className="border border-primary bg-primary/5 p-10 text-center">
              <CheckCircle2 className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="text-2xl font-bold mb-2">Application received</h3>
              <p className="text-muted-foreground">Thanks for applying. We'll get back to you within two weeks.</p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-6 bg-card border border-border p-6 md:p-10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label className="font-bold uppercase tracking-wider text-xs">Full name *</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="rounded-none mt-2" />
                </div>
                <div>
                  <Label className="font-bold uppercase tracking-wider text-xs">Email *</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required className="rounded-none mt-2" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label className="font-bold uppercase tracking-wider text-xs">Phone (optional)</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="rounded-none mt-2" />
                </div>
                <div>
                  <Label className="font-bold uppercase tracking-wider text-xs">Portfolio / writing samples (URL)</Label>
                  <Input type="url" value={form.portfolioUrl} onChange={(e) => setForm({ ...form, portfolioUrl: e.target.value })} placeholder="https://..." className="rounded-none mt-2" />
                </div>
              </div>

              <div>
                <Label className="font-bold uppercase tracking-wider text-xs">Resume / CV link</Label>
                <Input type="url" value={form.resumeUrl} onChange={(e) => setForm({ ...form, resumeUrl: e.target.value })} placeholder="Google Drive, Dropbox, LinkedIn URL..." className="rounded-none mt-2" />
                <p className="text-xs text-muted-foreground mt-2">Paste a shareable link to your resume.</p>
              </div>

              <div>
                <Label className="font-bold uppercase tracking-wider text-xs">Cover letter *</Label>
                <Textarea
                  value={form.coverLetter}
                  onChange={(e) => setForm({ ...form, coverLetter: e.target.value })}
                  required
                  rows={8}
                  placeholder="Tell us why you want this role, what you'd bring, and a piece of writing or work you're proud of."
                  className="rounded-none mt-2"
                />
              </div>

              <Button type="submit" disabled={submit.isPending} className="w-full rounded-none font-black uppercase tracking-widest h-14">
                {submit.isPending ? "Sending..." : "Submit application"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mb-10">
      <h3 className="text-2xl font-black uppercase tracking-tight mb-4">{title}</h3>
      <ul className="space-y-3">
        {items.map((item, i) => (
          <li key={i} className="flex gap-3 font-serif text-lg leading-relaxed">
            <span className="text-primary font-bold mt-1">→</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
