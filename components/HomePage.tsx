"use client";

import { I18nProvider } from "@/lib/i18n/context";
import HomePageContent from "@/components/HomePageContent";

export default function HomePage() {
  return (
    <I18nProvider>
      <HomePageContent />
    </I18nProvider>
  );
}
