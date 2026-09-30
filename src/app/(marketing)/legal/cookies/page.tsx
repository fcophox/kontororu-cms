import type { Metadata } from "next";

import { LegalPage } from "../_components/legal-page";
import { LEGAL_DOCS } from "../_data/legal";

export const metadata: Metadata = {
  title: LEGAL_DOCS.cookies.title,
  description: LEGAL_DOCS.cookies.description,
};

export default function CookiesPage() {
  return <LegalPage slug="cookies" />;
}
