import { SEO } from "@/components/SEO";

export default function Terms() {
  const updated = "April 20, 2026";
  return (
    <>
      <SEO
        title="Terms of Service — Mapletechies"
        description="The rules for using mapletechie.com."
      />
      <article className="container mx-auto px-4 md:px-6 py-12 md:py-20 max-w-3xl">
        <header className="mb-10">
          <p className="text-xs uppercase tracking-[0.25em] font-bold text-primary mb-2">Legal</p>
          <h1 className="font-serif text-4xl md:text-5xl font-black leading-[1.05] mb-3">Terms of Service</h1>
          <p className="text-sm text-muted-foreground">Last updated: {updated}</p>
        </header>

        <div className="prose prose-invert prose-lg max-w-none prose-headings:font-serif prose-headings:font-black prose-a:text-primary">
          <p>
            Welcome to Mapletechies. By using <strong>mapletechie.com</strong> (the "Site"), you agree to these Terms of Service. If you don't agree, please don't use the Site. Questions? Email <a href="mailto:hello@mapletechie.com">hello@mapletechie.com</a>.
          </p>

          <h2>1. Who we are</h2>
          <p>
            Mapletechies is an independent tech publication. The Site is operated by an independent editor and is not a registered company. References to "we," "us," and "our" refer to the editorial team behind the Site.
          </p>

          <h2>2. Use of the Site</h2>
          <p>You agree to use the Site lawfully and respectfully. In particular, you agree not to:</p>
          <ul>
            <li>Attempt to break, probe, or interfere with the Site's security or infrastructure.</li>
            <li>Scrape, copy, or republish our articles without written permission, beyond reasonable fair-use quotation with credit and a link back.</li>
            <li>Submit content that is illegal, defamatory, harassing, hateful, or that infringes someone else's rights.</li>
            <li>Use the Site to send spam, malware, or automated bulk traffic.</li>
          </ul>

          <h2>3. Reader-submitted content</h2>
          <p>
            When you submit a reader review, comment, contact message, job application, or newsletter signup, you confirm that:
          </p>
          <ul>
            <li>The content is yours to share, accurate to the best of your knowledge, and not misleading.</li>
            <li>You grant Mapletechies a non-exclusive, worldwide, royalty-free license to display, edit for clarity, and republish that content in connection with the Site (for example, featuring a reader review on a product page).</li>
            <li>We may decline, edit, or remove submissions at our discretion — particularly anything that violates these Terms or our editorial standards.</li>
          </ul>

          <h2>4. Editorial independence and affiliate disclosure</h2>
          <p>
            Our reviews and recommendations are written independently. We are never paid to write a positive review, and sponsors do not see articles before they are published.
          </p>
          <p>
            Some links on the Site — particularly in our Gear section and product round-ups — are affiliate links. If you click one and buy something, we may earn a small commission at no extra cost to you. This helps fund the publication and never changes what we recommend or how we recommend it.
          </p>

          <h2>5. Advertising and sponsorships</h2>
          <p>
            We accept advertising and sponsored placements through our <a href="/advertise">Advertise</a> page. All sponsored content is clearly labeled. Advertisers do not influence our editorial coverage.
          </p>

          <h2>6. Intellectual property</h2>
          <p>
            All articles, photography, illustrations, code, and design on the Site are the property of Mapletechies or used with permission, unless explicitly noted otherwise. You may quote short excerpts with attribution and a link back to the original article. For anything beyond fair use — including republication, translation, or commercial reuse — please email us.
          </p>
          <p>
            Trademarks, logos, and brand names belonging to other companies appear on the Site for editorial purposes (reviews, news coverage) and remain the property of their respective owners.
          </p>

          <h2>7. Third-party links</h2>
          <p>
            The Site contains links to third-party websites and products. We are not responsible for the content, accuracy, availability, or practices of those sites. Visiting them is at your own risk and subject to their own terms.
          </p>

          <h2>8. No warranty</h2>
          <p>
            The Site and its content are provided "as is" for general information. We do our best to be accurate, but we make no warranty that the Site will be uninterrupted, error-free, or that any specific recommendation will be right for you. Always do your own research before buying expensive gear or making decisions based on our coverage.
          </p>

          <h2>9. Limitation of liability</h2>
          <p>
            To the fullest extent permitted by law, Mapletechies and its editors are not liable for any indirect, incidental, or consequential damages arising from your use of the Site. Our total liability for any claim related to the Site will not exceed CAD $100.
          </p>

          <h2>10. Termination</h2>
          <p>
            We may suspend or terminate access to the Site for anyone who breaks these Terms, without notice. You can stop using the Site at any time.
          </p>

          <h2>11. Changes</h2>
          <p>
            We may update these Terms occasionally. The "Last updated" date at the top of this page will reflect the latest version. Continued use of the Site after changes are posted means you accept the updated Terms.
          </p>

          <h2>12. Governing law</h2>
          <p>
            These Terms are governed by the laws of the Province of Ontario, Canada, without regard to conflict-of-law rules. Any dispute will be resolved in the courts located in Ontario, Canada.
          </p>

          <h2>13. Contact</h2>
          <p>
            Questions about these Terms? Email <a href="mailto:hello@mapletechie.com">hello@mapletechie.com</a>.
          </p>
        </div>
      </article>
    </>
  );
}
