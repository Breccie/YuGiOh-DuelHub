import { NextResponse } from "next/server";
import { getDemoLegalityPreview } from "@/lib/legality";

export function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      {
        error: "Dieser interne Dev-Endpunkt ist in der Desktop-App deaktiviert.",
      },
      { status: 404 },
    );
  }

  return NextResponse.json(getDemoLegalityPreview());
}
