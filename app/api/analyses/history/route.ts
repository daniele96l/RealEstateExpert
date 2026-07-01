import { NextResponse } from "next/server";
import { normalizeHistoryStore } from "@/lib/analysis-history";
import { getAnalysisHistory, saveAnalysisHistory } from "@/lib/server/analysis-history-cache";

export async function GET() {
  try {
    const data = await getAnalysisHistory();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Errore interno" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const store = normalizeHistoryStore(body);
    await saveAnalysisHistory(store);
    return NextResponse.json(store);
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Errore interno" },
      { status: 500 },
    );
  }
}
