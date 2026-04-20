import { useState } from "react";
import { useSubmitAdInquiry } from "@workspace/api-client-react";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImageUploadField } from "@/components/ImageUploadField";
import { useToast } from "@/hooks/use-toast";
import { Mail, CheckCircle2, BarChart3, Users, Newspaper } from "lucide-react";
import { motion } from "framer-motion";

const AD_TYPES = [
  "Display banner",
  "Sponsored post",
  "Newsletter sponsorship",
  "Product review",
  "Brand partnership",
  "Other",
];

export default function Advertise() {
  const { toast } = useToast();
  const submit = useSubmitAdInquiry();
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    companyName: "",
    contactName: "",
    email: "",
    website: "",
    adType: AD_TYPES[0],
    budget: "",
    message: "",
    creativeUrl: "",
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit.mutate(
      { data: form as any },
      {
        onSuccess: (res: any) => {
          setSubmitted(true);
          toast({ title: "Inquiry sent", description: res?.message || "We'll be in touch within 2 business days." });
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to submit. Please try again.", variant: "destructive" });
        },
      }
    );
  };

  return (
    <div className="container mx-auto px-4 md:px-6 py-12 md:py-20">
      <SEO
        title="Advertise"
        description="Reach Mapletechie's audience of engaged tech readers. Display, sponsorships, and partnerships."
        url="/advertise"
      />

      <div className="max-w-6xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <p className="font-bold uppercase tracking-widest text-sm text-primary mb-4">Partner with us</p>
          <h1 className="font-serif text-5xl md:text-7xl font-bold leading-[0.95] mb-8 tracking-tight">
            Advertise on Mapletechie.
          </h1>
          <p className="text-xl text-muted-foreground font-serif leading-relaxed mb-12 border-l-4 border-primary pl-6 max-w-3xl">
            Our readers come to us because we don't waste their time. If you're building something they
            should know about — tell us. We do display, sponsorships, partnerships, and the occasional
            honest review.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {[
            { icon: Users, label: "Engaged readers", desc: "Tech enthusiasts who actually read." },
            { icon: BarChart3, label: "Honest metrics", desc: "We share real numbers, not vanity stats." },
            { icon: Newspaper, label: "Editorial integrity", desc: "Sponsored content is always labeled." },
          ].map((it) => (
            <div key={it.label} className="bg-card border border-border p-6">
              <it.icon className="h-7 w-7 text-primary mb-3" />
              <p className="font-bold uppercase tracking-wider text-sm mb-1">{it.label}</p>
              <p className="text-sm text-muted-foreground">{it.desc}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div>
            <h2 className="text-3xl font-black uppercase tracking-tight mb-6">Or just email us</h2>
            <div className="bg-card border border-border p-6 mb-6">
              <div className="flex gap-4 items-start">
                <div className="w-12 h-12 bg-muted flex items-center justify-center shrink-0 border border-border">
                  <Mail className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold uppercase tracking-wider text-sm mb-1">Advertising</h3>
                  <a href="mailto:ads@mapletechie.com" className="text-primary hover:underline">ads@mapletechie.com</a>
                  <p className="text-muted-foreground text-sm mt-2">
                    We respond within two business days.
                  </p>
                </div>
              </div>
            </div>
            <p className="text-muted-foreground text-sm">
              Or fill out the form to your right with the details and any creative you have. We'll
              follow up with a media kit and rate sheet.
            </p>
          </div>

          <div>
            {submitted ? (
              <div className="border border-primary bg-primary/5 p-10 text-center h-full flex flex-col items-center justify-center">
                <CheckCircle2 className="h-12 w-12 text-primary mb-4" />
                <h3 className="text-2xl font-bold mb-2">Inquiry received</h3>
                <p className="text-muted-foreground">We'll review and respond within 2 business days.</p>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="bg-card border border-border p-6 md:p-8 space-y-5">
                <h3 className="text-xl font-black uppercase tracking-tight">Send us a brief</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-bold uppercase tracking-wider">Company *</Label>
                    <Input required value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} className="rounded-none mt-2" />
                  </div>
                  <div>
                    <Label className="text-xs font-bold uppercase tracking-wider">Contact name *</Label>
                    <Input required value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} className="rounded-none mt-2" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-bold uppercase tracking-wider">Email *</Label>
                    <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="rounded-none mt-2" />
                  </div>
                  <div>
                    <Label className="text-xs font-bold uppercase tracking-wider">Website</Label>
                    <Input type="url" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://..." className="rounded-none mt-2" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-bold uppercase tracking-wider">Ad type *</Label>
                    <select value={form.adType} onChange={(e) => setForm({ ...form, adType: e.target.value })} className="w-full h-10 mt-2 px-3 bg-background border border-border text-sm">
                      {AD_TYPES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs font-bold uppercase tracking-wider">Budget range</Label>
                    <Input value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} placeholder="e.g. $500–$5,000" className="rounded-none mt-2" />
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-bold uppercase tracking-wider">Tell us about your campaign *</Label>
                  <Textarea
                    required
                    rows={5}
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    placeholder="Goals, timing, audience you want to reach, any specifics..."
                    className="rounded-none mt-2"
                  />
                </div>

                <div>
                  <Label className="text-xs font-bold uppercase tracking-wider">Creative / logo (optional)</Label>
                  <div className="mt-2">
                    <ImageUploadField
                      value={form.creativeUrl}
                      onChange={(url) => setForm({ ...form, creativeUrl: url })}
                      helpText="Upload a banner, logo, or product shot if you'd like us to see it now."
                    />
                  </div>
                </div>

                <Button type="submit" disabled={submit.isPending} className="w-full rounded-none font-black uppercase tracking-widest h-12">
                  {submit.isPending ? "Sending..." : "Send inquiry"}
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
