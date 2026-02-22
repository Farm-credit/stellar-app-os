import { DashboardOverview } from "@/components/organisms/DashboardOverview/DashboardOverview";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Dashboard Overview | Stellar Farm Credit",
    description: "View your environmental impact and upcoming tasks.",
};

export default function DashboardPage() {
    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8 max-w-7xl animate-in fade-in slide-in-from-bottom-4 duration-500">
            <DashboardOverview />
        </div>
    );
}
