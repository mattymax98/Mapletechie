import { SEO } from "@/components/SEO";

export default function Privacy() {
  const updated = "May 7, 2026";
  return (
    <>
      <SEO
        title="Privacy Policy — Mapletechies"
        description="How Mapletechies collects, uses, and protects your information."
      />
      <article className="container mx-auto px-4 md:px-6 py-12 md:py-20 max-w-3xl">
        <header className="mb-10">
          <p className="text-xs uppercase tracking-[0.25em] font-bold text-primary mb-2">Legal</p>
          <h1 className="font-serif text-4xl md:text-5xl font-black leading-[1.05] mb-3">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground">Last updated: {updated}</p>
        </header>

        <div className="prose prose-invert prose-lg max-w-none prose-headings:font-serif prose-headings:font-black prose-a:text-primary">
          <p>
            Mapletechies ("we," "us," or "our") runs the website at <strong>mapletechie.com</strong> (the "Site"). This Privacy Policy explains what information we collect when you visit the Site, how we use it, and the choices you have. We try to keep this short and plain — if anything is unclear, email us at <a href="mailto:hello@mapletechie.com">hello@mapletechie.com</a>.
          </p>

          <h2>1. Information we collect</h2>
          <p>We collect only what we need to run the Site:</p>
          <ul>
            <li><strong>Information you give us.</strong> When you contact us, sign up for the newsletter, leave a reader review, apply to a job, or write to advertise with us, we receive the email address, name, and any details you choose to include in your message.</li>
            <li><strong>Information collected automatically.</strong> Like most websites, our servers log basic technical data such as IP address, browser type, pages viewed, and the time of your visit. We use this to keep the Site secure, fix bugs, and understand which articles readers find useful.</li>
            <li><strong>First-party cookies.</strong> We use a small number of cookies that we set ourselves to remember your dark/light theme choice and to keep editors logged into the admin area.</li>
            <li><strong>Advertising cookies.</strong> We display ads on the Site through Google AdSense (see Section 4). Google and its partners use cookies and similar technologies to serve ads, measure performance, and — where permitted — personalize what you see. If you visit the Site from the European Economic Area, the United Kingdom, or Switzerland, you'll see a consent banner the first time you visit, and Google's ad partners will only use personalization cookies if you accept them.</li>
          </ul>

          <h2>2. How we use your information</h2>
          <ul>
            <li>To respond to messages you send us.</li>
            <li>To deliver the newsletter (when you sign up) and let you unsubscribe at any time.</li>
            <li>To publish reader reviews you choose to submit.</li>
            <li>To keep the Site online, secure, and free of abuse.</li>
            <li>To understand, in aggregate, what content readers value so we can write more of it.</li>
            <li>To serve advertising that helps fund our journalism (see Section 4).</li>
          </ul>
          <p>
            We do not sell your personal information. We do not hand over the
            email addresses, names, or messages you give us to advertisers.
            However, our ad partner (Google) does receive standard browser
            information (IP address, user agent, page URL, and ad-related
            cookies) when ads are loaded on the Site — this is described in
            Section 4.
          </p>

          <h2>3. How we store and protect your information</h2>
          <p>
            Submissions, newsletter signups, and account data are stored in our database with industry-standard access controls. Only authorized editors can view contact-form submissions. We keep this information for as long as it's useful for the purpose it was collected, or until you ask us to delete it.
          </p>

          <h2>4. Third-party services</h2>
          <p>
            We rely on a small set of trusted services to run the Site, including our hosting provider, our email-routing provider, and analytics for understanding traffic patterns. These providers process limited data on our behalf under their own privacy policies.
          </p>
          <h3>Google AdSense</h3>
          <p>
            We use Google AdSense to display ads on the Site. As a third-party
            vendor, Google uses cookies (including the DoubleClick DART cookie)
            to serve ads based on your prior visits to this Site or other
            sites. Google's use of advertising cookies enables it and its
            partners to serve ads based on your visit to the Site and other
            sites on the internet.
          </p>
          <ul>
            <li>
              You can opt out of personalized advertising by visiting{" "}
              <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer">
                Google Ads Settings
              </a>.
            </li>
            <li>
              You can opt out of a third-party vendor's use of cookies for
              personalized advertising by visiting{" "}
              <a href="https://www.aboutads.info/" target="_blank" rel="noopener noreferrer">
                www.aboutads.info
              </a>{" "}
              or, in the EU,{" "}
              <a href="https://www.youronlinechoices.eu/" target="_blank" rel="noopener noreferrer">
                www.youronlinechoices.eu
              </a>.
            </li>
            <li>
              For more on how Google uses data when you use partner sites or
              apps, see{" "}
              <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer">
                Google's partner sites policy
              </a>{" "}
              and the{" "}
              <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
                Google Privacy Policy
              </a>.
            </li>
          </ul>
          <p>
            If you're in the EEA, the UK, or Switzerland, our consent banner
            (Google's certified Consent Management Platform) lets you accept
            or reject personalized advertising the first time you visit. You
            can change that choice at any time by clearing your cookies for
            this Site.
          </p>
          <h3>Other links</h3>
          <p>
            Articles on the Site may include links to external websites (including affiliate links — see our Terms of Service). We are not responsible for the privacy practices of those sites.
          </p>

          <h2>5. Your choices and rights</h2>
          <ul>
            <li><strong>Newsletter:</strong> every newsletter email includes an unsubscribe link, and you can also email us to be removed at any time.</li>
            <li><strong>Access, correction, deletion:</strong> email <a href="mailto:hello@mapletechie.com">hello@mapletechie.com</a> with the email address you used and we'll handle requests to view, correct, or delete your data within a reasonable timeframe.</li>
            <li><strong>Cookies:</strong> you can clear or block cookies in your browser; the Site will still work, you'll just need to re-pick your theme each visit.</li>
            <li><strong>Personalized ads:</strong> use the Google Ads Settings link in Section 4 to turn off personalization. You'll still see ads on the Site, but they won't be tailored to your browsing history.</li>
            <li><strong>EEA / UK / Switzerland readers:</strong> you have additional rights under the GDPR and UK GDPR — including the right to access, rectify, erase, restrict, or port your personal data, and to object to processing. To exercise any of these, email us at the address in Section 8.</li>
          </ul>

          <h2>6. Children</h2>
          <p>
            The Site is intended for a general adult audience. We do not knowingly collect personal information from children under 13. If you believe a child has submitted information to us, please contact us and we will delete it.
          </p>

          <h2>7. Changes to this policy</h2>
          <p>
            We may update this Privacy Policy from time to time. When we do, we'll update the "Last updated" date at the top of this page. Material changes will be flagged on the homepage or via the newsletter.
          </p>

          <h2>8. Contact</h2>
          <p>
            Questions, requests, or concerns? Email <a href="mailto:hello@mapletechie.com">hello@mapletechie.com</a>.
          </p>
        </div>
      </article>
    </>
  );
}
