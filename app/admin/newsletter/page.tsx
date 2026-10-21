import { redirect } from "next/navigation";
import { requireNewsletterEditorAccess } from "@/lib/auth/requireNewsletterEditorAccess";
import NewsletterEditor from "./NewsletterEditor";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Newsletter CMS | Admin",
  description: "Create, edit, preview, and schedule monthly forest health newsletters.",
};

export default async function AdminNewsletterPage() {
  const access = await requireNewsletterEditorAccess();

  if (!access.allowed) {
    redirect("/admin");
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Monthly Forest Health Newsletter</h1>
        <p className="mt-2 text-sm text-gray-600">
          Compose and schedule the curated monthly newsletter sent to sponsors. Include platform news,
          featured reforestation stories, species spotlights, and conservation tips. Each subscriber
          also receives a personalised section with their own tree updates.
        </p>
      </header>

      <NewsletterEditor
        editorName={access.user?.name ?? null}
        editorEmail={access.user?.email ?? null}
      />
    </main>
  );
}