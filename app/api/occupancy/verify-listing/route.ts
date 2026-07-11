import { NextResponse } from "next/server";
import { verifyImmobiliareListingDates } from "@/lib/server/verify-immobiliare-listing";

export const maxDuration = 120;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id") ?? searchParams.get("url");
    if (!id?.trim()) {
      return NextResponse.json(
        { detail: "Parametro id o url obbligatorio (es. im_94562640 o URL annuncio)" },
        { status: 400 },
      );
    }

    const result = await verifyImmobiliareListingDates({
      id,
      city: searchParams.get("city"),
      portal: searchParams.get("portal"),
      asOf: searchParams.get("asOf"),
    });

    if (result.blocked) {
      return NextResponse.json(result, { status: 503 });
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Verifica date annuncio non riuscita";
    const status = /non valido/i.test(message) ? 400 : 500;
    return NextResponse.json({ detail: message }, { status });
  }
}
