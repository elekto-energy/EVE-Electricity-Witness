/**
 * REMOVED — This script generated approximated system prices from avg(SE1-SE4).
 * 
 * EVE CMD does NOT approximate market references.
 * System price must come from Nord Pool Day-Ahead System Price (official clearing reference).
 * 
 * See: ingest_nordpool_system.ts (to be created when Nord Pool API access is available)
 * 
 * Decision: Flaskhals(z,t) = Zonpris(z,t) − Systempris(t)
 * Where Systempris = Nord Pool official, nothing else.
 */

throw new Error("This script has been disabled. Use ingest_nordpool_system.ts with official Nord Pool data.");
