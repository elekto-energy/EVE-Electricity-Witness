/**
 * Ask-EVE i18n Loader
 *
 * Loads locale files for PDF evidence reports.
 * Language affects document hash but NOT dataset identity.
 *
 * Supported: en, sv
 */

import { readFileSync } from "fs";
import { resolve } from "path";

const I18N_DIR = resolve(__dirname, "i18n");

export type SupportedLocale = "en" | "sv";

export const SUPPORTED_LOCALES: SupportedLocale[] = ["en", "sv"];

export interface Locale {
  meta: { language: string; language_name: string; template_version: string };
  header: Record<string, string>;
  sections: Record<string, string>;
  labels: Record<string, string>;
  methodology_fields: Record<string, string>;
  verification_fields: Record<string, string>;
  disclaimer: string;
  footer: string;
}

const cache = new Map<string, Locale>();

export function loadLocale(lang: SupportedLocale): Locale {
  if (cache.has(lang)) return cache.get(lang)!;

  const filePath = resolve(I18N_DIR, `${lang}.json`);
  try {
    const locale: Locale = JSON.parse(readFileSync(filePath, "utf-8"));
    cache.set(lang, locale);
    return locale;
  } catch (e: any) {
    throw new Error(`Locale '${lang}' not found at ${filePath}. Supported: ${SUPPORTED_LOCALES.join(", ")}`);
  }
}

export function isValidLocale(lang: string): lang is SupportedLocale {
  return SUPPORTED_LOCALES.includes(lang as SupportedLocale);
}
