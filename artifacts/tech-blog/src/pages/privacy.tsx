import { SEO } from "@/components/SEO";

export default function Privacy() {
  const updated = "September 18, 2026";
  return (
    <>
      <SEO
        title="Privacy Policy — Mapletechie"
        description="How Mapletechie collects, uses, and protects your information."
        url="/privacy"
      />
      <article className="container mx-auto px-4 md:px-6 py-12 md:py-20 max-w-3xl">
        <header className="mb-10">
          <p className="text-xs uppercase tracking-[0.25em] font-bold text-primary mb-2">Legal</p>
          <h1 className="font-serif text-4xl md:text-5xl font-black leading-[1.05] mb-3">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground">Last updated: {updated}</p>
        </header>

        <div className="prose prose-invert prose-lg max-w-none prose-headings:font-serif prose-headings:font-black prose-a:text-primary">
          <p>
            Mapletechie ("we," "us," or "our") runs the website at <strong>mapletechie.com</strong> (the "Site"). This Privacy Policy explains what information we collect when you visit the Site, how we use it, and the choices you have. We try to keep this short and plain — if anything is unclear, email us at <a href="mailto:hello@mapletechie.com">hello@mapletechie.com</a>.
          </p>

          <h2>1. Information we collect</h2>
          <p>We collect only what we need to run the Site:</p>
          <ul>
            <li>
              <strong>Article comments.</strong> When you submit a comment, we receive the article
              association, comment text, optional name, moderation status, and submission timestamp. New
              comments do not collect an email address. Comments remain pending until an editor reviews
              them. Approved comments are displayed publicly with the name you provided or “Anonymous,”
              the comment text, and the posting date. Pending and rejected comments are available only to
              authorized editors through the moderation area, unless we are required to disclose them by
              law.
            </li>
            <li>
              <strong>General contact form.</strong> The contact form collects your name, email address,
              subject, and message. We store the submission for follow-up, make it available to authorized
              editors, and send a notification to our configured contact address. The notification uses
              your email address as the reply-to so the editor can respond to you.
            </li>
            <li>
              <strong>Advertising and partnership inquiries.</strong> The “Partner with us” form collects
              company name, contact name, email address, partnership type, and campaign message. Website
              and budget are optional fields. We store the inquiry for review and use it to respond about
              potential sponsored posts, newsletter sponsorships, product reviews, brand partnerships, or
              other advertising opportunities.
            </li>
            <li>
              <strong>Newsletter subscriptions.</strong> When you subscribe to our email service, we
              collect your email address and the signup source. We also maintain the subscription status
              and timestamps for signup, confirmation, unsubscribe, and newsletter delivery. We send a
              confirmation email before activating the subscription, include an unsubscribe link in
              newsletters, and use the subscription record to manage delivery.
            </li>
            <li>
              <strong>Reader reviews.</strong> A review may include your name, email address, rating,
              optional title, review text, the associated article, moderation status, and submission
              timestamp. We use this information to review and, where approved, publish the review.
            </li>
            <li>
              <strong>Job applications.</strong> A job application may include your name, email address,
              optional phone number, resume link, portfolio link, cover letter, the job applied for,
              application status, and submission timestamp. We use it to evaluate and respond to your
              application.
            </li>
            <li>
              <strong>Other editorial messages.</strong> If you send us tips, story ideas, or other
              messages through a form or email address, we receive the contact details and content you
              choose to provide.
            </li>
            <li><strong>Information collected automatically.</strong> Like most websites, our servers log basic technical data such as IP address, browser type, pages viewed, and the time of your visit. We use this to keep the Site secure, fix bugs, and understand which articles readers find useful.</li>
            <li><strong>First-party cookies.</strong> We use a small number of cookies that we set ourselves to remember your dark/light theme choice and to keep editors logged into the admin area.</li>
            <li><strong>Advertising cookies.</strong> We display ads on the Site through Google AdSense and may also use other third-party advertising providers at our discretion (see Section 4). These providers and their partners may use cookies and similar technologies to serve ads, measure performance, and — where permitted — personalize what you see. Where required by applicable law, we will request consent before allowing advertising providers to use cookies for personalized advertising.</li>
            <li><strong>Google Analytics.</strong> When a Google Analytics 4 measurement ID is configured for the production Site, Google Analytics collects pseudonymous information about public page views and navigation, such as the page path, device, browser, and approximate location. We do not send article-author details, account information, or other user-provided personal information to Google Analytics.</li>
          </ul>

          <h2>2. How we use your information</h2>
          <ul>
            <li>To respond to contact messages, editorial tips, advertising or partnership inquiries, and job applications.</li>
            <li>To review and, where approved, publish reader comments and reviews.</li>
            <li>To confirm newsletter subscriptions, deliver the newsletter, track delivery status, and let you unsubscribe at any time.</li>
            <li>To keep the Site online, secure, and free of abuse.</li>
            <li>To understand, in aggregate, what content readers value so we can write more of it.</li>
            <li>To serve advertising that helps fund our journalism (see Section 4).</li>
          </ul>
          <p>
            We do not sell your personal information. We do not hand over the
            email addresses, names, resumes, or messages you give us through
            these forms to advertisers or sponsors. Advertising and partnership
            inquiries are used to evaluate and respond to the inquiry, not to
            automatically enroll you in marketing.
            However, our advertising providers, including Google, may receive
            standard browser information (such as your IP address, user agent,
            page URL, device information, and ad-related cookies) when ads are
            loaded on the Site — this is described in Section 4.
          </p>

          <h2>3. How we store and protect your information</h2>
          <p>
            Submissions, newsletter records, comments, reviews, applications, and account data are stored
            in our database with access controls. Authorized editors can view the records needed for their
            editorial or administrative work. Approved comments and approved reviews are public; the
            underlying moderation and contact records are not. We keep information for as long as it is
            useful for the purpose it was collected, to maintain the Site and its records, or as required
            by law. You can ask us to delete information as described below, although we may need to keep
            some information for legal, security, or operational reasons.
          </p>

          <h2>4. Third-party services</h2>
          <p>
            We rely on a small set of trusted services to run the Site, including our hosting provider, our email-routing provider, and analytics for understanding traffic patterns. These providers process limited data on our behalf under their own privacy policies.
          </p>
          <h3>Advertising providers</h3>
          <p>
            We currently use Google AdSense and may, at our discretion, display
            ads supplied by other third-party advertising providers. These
            providers may collect or receive standard browser and device
            information, the page you are viewing, IP address, and cookies or
            similar identifiers to deliver ads, prevent fraud, measure
            performance, and, where permitted, personalize advertising. Each
            provider processes information under its own privacy policy and
            offers its own privacy controls or opt-out methods. We do not give
            advertising providers the names, email addresses, resumes, or
            messages you submit through our forms.
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
          <h3>Google Analytics</h3>
          <p>
            We may use Google Analytics 4 on the production Site to understand
            aggregate traffic and improve our coverage. It is optional
            deployment configuration and is not loaded on admin, API, or
            preview-only paths. Google may use cookies and similar technologies
            to distinguish visits and measure navigation across public pages.
            We send public page paths only; we do not send article-author
            details, account information, or other user-provided personal
            information. For more information, see{" "}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
              Google's Privacy Policy
            </a>.
          </p>
          <h3>Email delivery</h3>
          <p>
            We use an email-routing provider to send contact notifications, newsletter confirmation
            messages, welcome messages, and newsletters. That provider receives the email address and the
            message or subscription information needed to deliver the email. It processes that information
            under its own privacy policy.
          </p>
          <h3>Other links</h3>
          <p>
            Articles on the Site may include links to external websites (including affiliate links — see our Terms of Service). We are not responsible for the privacy practices of those sites.
          </p>

          <h2>5. Your choices and rights</h2>
          <ul>
            <li><strong>Newsletter:</strong> every newsletter email includes an unsubscribe link, and you can also email us to be removed at any time. Unsubscribing stops future newsletter delivery but may leave a record of the request and prior delivery activity.</li>
            <li><strong>Comments and reviews:</strong> because comments and approved reviews can be publicly displayed, email us if you want to ask about correcting or removing a submission. We may need to verify the request and may retain a record of moderation activity.</li>
            <li><strong>Access, correction, deletion:</strong> email <a href="mailto:hello@mapletechie.com">hello@mapletechie.com</a> with enough information for us to identify your submission, such as the email address used or the relevant article or inquiry. We'll review requests to view, correct, or delete your data within a reasonable timeframe, subject to legal and operational limits.</li>
            <li><strong>Cookies:</strong> you can clear or block cookies in your browser; the Site will still work, you'll just need to re-pick your theme each visit.</li>
            <li><strong>Personalized ads:</strong> use the Google Ads Settings link and any privacy controls offered by our other advertising providers, as described in Section 4, to limit personalized advertising. You may still see non-personalized ads on the Site.</li>
            <li><strong>Google Analytics:</strong> you can block cookies or use browser privacy controls and extensions to limit analytics collection.</li>
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
