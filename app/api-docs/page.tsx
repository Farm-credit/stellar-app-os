import type { Metadata } from "next";
import { ApiDocumentationClient } from "@/components/organisms/ApiDocumentation/ApiDocumentationClient";

export const metadata: Metadata = {
  title: "API Documentation | FarmCredit",
  description:
    "FarmCredit API reference with endpoint details, request/response examples, authentication guidance, and rate limits.",
};

export default function ApiDocumentationPage() {
  return <ApiDocumentationClient />;
}
