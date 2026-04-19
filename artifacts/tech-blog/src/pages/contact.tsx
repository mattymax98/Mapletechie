import { useSubmitContact } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Send, MapPin, Mail, Phone } from "lucide-react";
import { motion } from "framer-motion";

const contactSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  subject: z.string().min(5, "Subject must be at least 5 characters"),
  message: z.string().min(10, "Message must be at least 10 characters"),
});

export default function Contact() {
  const { toast } = useToast();
  const submitContact = useSubmitContact();

  const form = useForm<z.infer<typeof contactSchema>>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: "",
      email: "",
      subject: "",
      message: "",
    },
  });

  const onSubmit = (values: z.infer<typeof contactSchema>) => {
    submitContact.mutate(
      { data: values },
      {
        onSuccess: (res) => {
          toast({
            title: "Message Sent",
            description: res.message || "We'll get back to you soon.",
          });
          form.reset();
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Failed to send message. Please try again.",
            variant: "destructive",
          });
        }
      }
    );
  };

  return (
    <div className="container mx-auto px-4 md:px-6 py-12 md:py-20">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 max-w-6xl mx-auto">
        
        {/* Left Side - Info */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-[0.9] mb-8">
            Let's <br/><span className="text-primary">Talk</span>
          </h1>
          <p className="text-xl text-muted-foreground font-serif leading-relaxed mb-10 border-l-4 border-primary pl-6">
            Have a tip about a new startup? Want to submit a guest editorial? 
            Or maybe you're interested in advertising with Mapletechies. Drop us a line.
          </p>

          <div className="space-y-8 mt-12">
            <div className="flex gap-4 items-start">
              <div className="w-12 h-12 bg-muted flex items-center justify-center shrink-0 border border-border">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-bold uppercase tracking-wider text-sm mb-1">Editorial</h3>
                <p className="text-muted-foreground">tips@mapletechies.com</p>
                <p className="text-muted-foreground text-sm mt-1">For leaks, tips, and story ideas.</p>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="w-12 h-12 bg-muted flex items-center justify-center shrink-0 border border-border">
                <Send className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-bold uppercase tracking-wider text-sm mb-1">Advertising</h3>
                <p className="text-muted-foreground">ads@mapletechies.com</p>
                <p className="text-muted-foreground text-sm mt-1">Partner with us to reach tech enthusiasts.</p>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="w-12 h-12 bg-muted flex items-center justify-center shrink-0 border border-border">
                <MapPin className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-bold uppercase tracking-wider text-sm mb-1">HQ</h3>
                <p className="text-muted-foreground">One Market St, Spear Tower<br/>San Francisco, CA 94105</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Right Side - Form */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="bg-card border border-border p-8 md:p-10 relative"
        >
          {/* Decorative elements */}
          <div className="absolute top-0 right-0 w-20 h-20 bg-primary/10 -m-10 blur-2xl rounded-full" />
          
          <h2 className="text-2xl font-black uppercase tracking-tight mb-8">Send a Message</h2>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bold uppercase tracking-wider text-xs">Name</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" className="rounded-none border-t-0 border-x-0 border-b-2 border-border focus-visible:border-primary focus-visible:ring-0 bg-transparent px-0 rounded-b-none" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bold uppercase tracking-wider text-xs">Email</FormLabel>
                      <FormControl>
                        <Input placeholder="john@example.com" type="email" className="rounded-none border-t-0 border-x-0 border-b-2 border-border focus-visible:border-primary focus-visible:ring-0 bg-transparent px-0 rounded-b-none" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="subject"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bold uppercase tracking-wider text-xs">Subject</FormLabel>
                    <FormControl>
                      <Input placeholder="What's this about?" className="rounded-none border-t-0 border-x-0 border-b-2 border-border focus-visible:border-primary focus-visible:ring-0 bg-transparent px-0 rounded-b-none" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="message"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bold uppercase tracking-wider text-xs">Message</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Your message here..." 
                        className="rounded-none border-border focus-visible:border-primary focus-visible:ring-1 resize-none min-h-[150px] bg-background" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button 
                type="submit" 
                className="w-full rounded-none font-black uppercase tracking-widest h-14"
                disabled={submitContact.isPending}
              >
                {submitContact.isPending ? "Sending..." : "Submit Message"}
              </Button>
            </form>
          </Form>
        </motion.div>

      </div>
    </div>
  );
}
