import { readFile } from "fs/promises";
import path from "path";
import type { Metadata } from "next";
import { markdownToHtml, extractLastUpdated } from "@/components/MarkdownRenderer";
import { TermsClient } from "./TermsClient";

export const metadata: Metadata = {
  title: "Terms of Service | Stellar App OS",
  description:
    "Read the Terms of Service for Stellar App OS. Understand your rights and responsibilities when using our platform.",
};

async function getTermsContent(): Promise<{ html: string; lastUpdated: string }> {
  const filePath = path.join(process.cwd(), "content", "terms-of-service.md");
  const raw = await readFile(filePath, "utf-8");
  const html = markdownToHtml(raw);
  const lastUpdated = extractLastUpdated(raw) ?? "January 15, 2026";
  return { html, lastUpdated };
}

export default async function TermsOfServicePage() {
  const { html, lastUpdated } = await getTermsContent();

  return <TermsClient html={html} lastUpdated={lastUpdated} />;
}