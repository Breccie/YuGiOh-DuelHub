import type { TradeListItemDto } from "@ygo/contracts";

export function getEraLabel(value: string) {
  const year = new Date(value).getUTCFullYear();

  if (year <= 2003) {
    return "DM Ära";
  }

  if (year <= 2007) {
    return "GX Ära";
  }

  if (year <= 2011) {
    return "5D's Ära";
  }

  if (year <= 2014) {
    return "ZEXAL Ära";
  }

  if (year <= 2017) {
    return "ARC-V Ära";
  }

  return "Moderne Ära";
}

export function formatTradeState(value: TradeListItemDto["threadState"] | string) {
  switch (value) {
    case "awaitingYourResponse":
      return "Wartet auf dich";
    case "waitingForTheirResponse":
      return "Wartet auf Antwort";
    case "waitingForYourConfirmation":
      return "Abschluss offen";
    case "waitingForTheirConfirmation":
      return "Partner bestätigt noch";
    case "completed":
      return "Abgeschlossen";
    case "cancelled":
      return "Abgebrochen";
    default:
      return "Abgelehnt";
  }
}
