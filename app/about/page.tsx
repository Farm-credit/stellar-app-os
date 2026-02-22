import Head from "next/head";

// Direct imports only
// Update the import path to the correct location of MissionSection
import { MissionSection } from "../../components/organisms/About/MissionSection";
import { TeamSection } from "../../components/organisms/About/TeamSection";
import { TimelineSection } from "../../components/organisms/About/TimelineSection";
import { PartnersSection } from "../../components/organisms/About/PartnersSection";
import { ContactSection } from "../../components/organisms/About/ContactSection";

export default function AboutPage() {
  return (
    <>
      <Head>
        <title>About Us | FarmCredit</title>
        <meta name="description" content="Learn about the FarmCredit team, our mission, milestones, partners, and how to contact us." />
        <meta property="og:title" content="About Us | FarmCredit" />
        <meta property="og:description" content="Learn about the FarmCredit team, our mission, milestones, partners, and how to contact us." />
      </Head>
      <main className="min-h-screen bg-background text-foreground">
        <MissionSection />
        <TeamSection />
        <TimelineSection />
        <PartnersSection />
        <ContactSection />
      </main>
    </>
  );
}
