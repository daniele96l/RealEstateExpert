"use client";

import { getMarket, type MarketId } from "@/lib/markets";
import { useI18n } from "@/lib/i18n/context";
import SegmentedControl from "@/components/ui/SegmentedControl";

interface Props {
  market: MarketId;
  onChange: (market: MarketId) => void;
  className?: string;
}

const OPTIONS: MarketId[] = ["it", "cz"];

export default function MarketToggle({ market, onChange, className }: Props) {
  const { t } = useI18n();
  return (
    <SegmentedControl
      className={className}
      ariaLabel={t("market.aria")}
      value={market}
      onChange={onChange}
      options={OPTIONS.map((id) => ({
        id,
        label: getMarket(id).label,
      }))}
    />
  );
}
