/**
 * EVE Legal Positioning — Shared disclaimer text
 *
 * Used by: Ask-EVE Panel, PDF reports, footer, README
 * Single source of truth for legal positioning.
 */

export const EVE_DISCLAIMER = {
  en: {
    short: "Independent deterministic evidence system. Not affiliated with or endorsed by any TSO or regulatory authority.",
    full: "EVE Electricity Witness is a deterministic evidence engine built on publicly available regulatory data sources (ENTSO-E Transparency Platform, EEA emission factors, ERA5 reanalysis). All reports are reproducible and cryptographically verifiable. This system is independently built and is not an official publication from Svenska kraftnät, Energimyndigheten, or any other authority.",
    invite: "This platform is designed so that authorities, journalists and independent experts can verify, challenge and reproduce all results.",
    methodology: "Methodology: TS_V2_EEA_2023_DIRECT. Direct combustion emissions only (Scope 1). No marginal, lifecycle or demand attribution.",
  },
  sv: {
    short: "Fristående deterministisk evidensmotor. Ej ansluten till eller godkänd av någon systemoperatör eller myndighet.",
    full: "EVE Electricity Witness är en deterministisk evidensmotor baserad på öppna regulatoriska datakällor (ENTSO-E Transparency Platform, EEA emissionsfaktorer, ERA5 reanalys). Alla rapporter är reproducerbara och kryptografiskt verifierbara. Systemet är fristående och är inte en officiell publikation från Svenska kraftnät, Energimyndigheten eller annan myndighet.",
    invite: "Plattformen är utformad så att myndigheter, journalister och oberoende experter kan verifiera, ifrågasätta och reproducera alla resultat.",
    methodology: "Metodik: TS_V2_EEA_2023_DIRECT. Enbart direkt förbränning (Scope 1). Ingen marginal-, livscykel- eller efterfrågeattribuering.",
  },
} as const;

export type DisclaimerLang = keyof typeof EVE_DISCLAIMER;
