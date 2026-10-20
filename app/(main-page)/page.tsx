import type { Metadata } from "next";
import HomeShell from "@/features/dashboard/components/home-shell";
import { Landing } from "@/features/dashboard/components/unauthenticated-page";
import { JsonLd } from "@/components/seo/json-ld";
import { publicPageMetadata } from "@/lib/seo/metadata";
import { HOME_TITLE, SITE_DESCRIPTION } from "@/lib/seo/site";
import { buildHomeStructuredData } from "@/lib/seo/structured-data";

export const metadata: Metadata = publicPageMetadata({
  title: HOME_TITLE,
  description: SITE_DESCRIPTION,
  path: "/",
});

// Clerk records a signed-in browser in a `__client_uat` cookie (0 when signed out). Reading it
// before first paint lets the page hide the marketing content from a returning user while Clerk
// loads; everyone else, and every crawler, gets the full page immediately.
const AUTH_HINT_SCRIPT = `try{var c=document.cookie.split("; ");for(var i=0;i<c.length;i++){var p=c[i].split("=");if(p[0].indexOf("__client_uat")===0&&p[1]&&p[1]!=="0"){document.documentElement.setAttribute("data-auth","in");break}}}catch(e){}`;

export default function HomePage() {
  return (
    <>
      <JsonLd data={buildHomeStructuredData()} />
      <script dangerouslySetInnerHTML={{ __html: AUTH_HINT_SCRIPT }} />
      <HomeShell landing={<Landing />} />
    </>
  );
}
