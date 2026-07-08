"use client";

import { useI18n, type LocaleId } from "@/lib/i18n/context";
import SegmentedControl from "@/components/ui/SegmentedControl";

interface Props {
  className?: string;
}

const OPTIONS: LocaleId[] = ["it", "en"];

export default function LanguageToggle({ className }: Props) {
  const { locale, setLocale, t } = useI18n();

  return (
    <SegmentedControl
      className={className}
      ariaLabel={t("lang.aria")}
      value={locale}
      onChange={setLocale}
      options={OPTIONS.map((id) => ({
        id,
        label: id.toUpperCase(),
      }))}
    />
  );
}
