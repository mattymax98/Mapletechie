import { Helmet } from "react-helmet-async";

interface SEOProps {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: "website" | "article";
  publishedTime?: string;
  author?: string;
  keywords?: string[];
}

const SITE_NAME = "Mapletechie";
const SITE_URL = "https://mapletechie.com";
const DEFAULT_IMAGE = `${SITE_URL}/opengraph.jpg`;
const DEFAULT_DESCRIPTION =
  "Mapletechie — Your go-to source for tech news, gadget reviews, software deep dives, and the latest in AI, EVs, and cybersecurity.";

export function SEO({
  title,
  description = DEFAULT_DESCRIPTION,
  image = DEFAULT_IMAGE,
  url,
  type = "website",
  publishedTime,
  author,
  keywords,
}: SEOProps) {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} — Tech News & Reviews`;
  const canonicalUrl = url ? `${SITE_URL}${url}` : SITE_URL;
  const ogImage = image.startsWith("http") ? image : `${SITE_URL}${image}`;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {keywords && keywords.length > 0 && (
        <meta name="keywords" content={keywords.join(", ")} />
      )}
      <link rel="canonical" href={canonicalUrl} />

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={SITE_NAME} />
      {publishedTime && (
        <meta property="article:published_time" content={publishedTime} />
      )}
      {author && <meta property="article:author" content={author} />}

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
      <meta name="twitter:site" content="@mapletechie" />
    </Helmet>
  );
}
