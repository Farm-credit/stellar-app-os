import type { Project } from "@/lib/types/project";

// Helpers 

export function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString("en-US");
}

export function fmtUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export function pct(partial: number, total: number): number {
  if (total === 0) return 0;
  return Math.min(100, Math.round((partial / total) * 100));
}


export const MOCK_PROJECT: Project = {
  id: "proj_cerrado_001",
  slug: "cerrado-savanna-restoration-brazil",
  title: "Cerrado Savanna Restoration",
  tagline: "Reviving the world's most biodiverse savanna — one native seed at a time",
  status: "active",
  organisation: {
    name: "Instituto Terra Verde",
    website: "https://terraverde.org",
    verified: true,
  },
  location: {
    label: "Minas Gerais, Brazil",
    country: "Brazil",
    region: "South America",
    coordinates: { lat: -18.5122, lng: -44.555 },
  },
  hero: {
    kind: "image",
    src: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1800&q=85",
    alt: "Golden hour over the Cerrado savanna landscape",
  },
  excerpt:
    "The Cerrado is home to 5% of all life on Earth yet has lost nearly half its original cover. We are systematically restoring native plant communities across 30,000 hectares in partnership with 18 local communities.",
  bodyHtml: `
    <h2>Why the Cerrado matters</h2>
    <p>Stretching across central Brazil like an ancient tapestry, the Cerrado savanna holds more biodiversity than any other savanna ecosystem on the planet — over 10,000 plant species, 935 bird species, and 300 mammal species call it home. Yet in under 50 years, agricultural expansion has consumed nearly 50% of its original extent.</p>
    <p>Unlike rainforests, the Cerrado rarely makes international headlines. That relative invisibility has made it devastatingly easy to clear, burn, and convert. Our work changes that calculus.</p>
    <h2>Our restoration method</h2>
    <p>We use a <strong>direct seeding</strong> approach combined with targeted planting of framework species — the ecological architects that facilitate natural regeneration. Each site begins with a comprehensive soil health assessment, followed by native seed sourcing from within 200 km of the restoration area to preserve local genetic diversity.</p>
    <h3>Phase structure</h3>
    <p>Restoration proceeds in three overlapping phases over six years: soil preparation and pioneer species establishment (years 1–2), framework planting and competition management (years 2–4), and long-term monitoring with selective intervention (years 4–6+).</p>
    <h2>Community integration</h2>
    <p>Nineteen Quilombola and indigenous communities are partners in this project — not beneficiaries. Seed collectors, nursery managers, field monitors, and data analysts are all drawn from these communities, creating durable livelihoods rooted in ecosystem health rather than destruction.</p>
    <h2>Scientific oversight</h2>
    <p>All methodology is co-developed with researchers from Universidade de Brasília and verified against Verra's VM0047 standard. Carbon calculations use conservative biomass equations derived from 20 years of Cerrado-specific field research.</p>
  `,
  metrics: [
    { id: "m1", label: "Native Trees Planted", value: 1_840_000, unit: "trees", icon: "🌿", variant: "green", helpText: "Native species from regional seed stock planted since project launch" },
    { id: "m2", label: "CO₂ Removed", value: 124_600, unit: "tCO₂e", icon: "💨", variant: "blue", helpText: "Verified tonnes of CO₂ equivalent sequestered and independently audited" },
    { id: "m3", label: "Hectares Restored", value: 12_800, unit: "ha", icon: "🗺️", variant: "amber", helpText: "Active restoration area out of 30,000 ha project target" },
    { id: "m4", label: "Species Returning", value: 214, unit: "species", icon: "🦜", variant: "green", helpText: "Unique vertebrate and invertebrate species recorded in restored zones" },
    { id: "m5", label: "Community Members", value: 1_240, unit: "people", icon: "🤝", variant: "stone", helpText: "Local people employed full-time or part-time across the project" },
    { id: "m6", label: "Seed Collections", value: 4_700, unit: "kg", icon: "🌱", variant: "amber", helpText: "Kilograms of native seed sourced from community collectors this season" },
  ],
  milestones: [
    { id: "ms1", title: "Project Launch & Baseline Assessment", body: "Ecological surveys, soil profiling, and community consultations across all 12 restoration zones complete.", date: "2021-03", status: "done", completedDate: "2021-05" },
    { id: "ms2", title: "Seed Network Established", body: "Regional seed collection network live with 340 trained collectors across 8 municipalities.", date: "2021-09", status: "done", completedDate: "2021-10" },
    { id: "ms3", title: "First Million Trees", body: "One million native saplings in the ground — a defining milestone celebrated with all partner communities.", date: "2022-08", status: "done", completedDate: "2022-09" },
    { id: "ms4", title: "Verra VCS Certification Round 1", body: "First independent verification cycle completed. 68,200 tCO₂e credits issued on the Verra registry.", date: "2023-03", status: "done", completedDate: "2023-04" },
    { id: "ms5", title: "Wildlife Corridor Connection", body: "Linking the Peixe River corridor to the Grande River basin — creating an unbroken 180 km habitat pathway.", date: "2024-06", status: "active" },
    { id: "ms6", title: "Verra VCS Certification Round 2", body: "Second verification cycle targeting 120,000 additional tCO₂e credits.", date: "2025-02", status: "pending" },
    { id: "ms7", title: "Halfway to Restoration Target", body: "15,000 of 30,000 hectares fully established and monitoring confirmed.", date: "2025-11", status: "pending" },
    { id: "ms8", title: "Full Project Completion", body: "All 30,000 hectares restored, verified, and under permanent protection agreements.", date: "2028-12", status: "pending" },
  ],
  mrvDocuments: [
    { id: "d1", title: "Verra VCS Verification Report 2023", docType: "verification", issuer: "Bureau Veritas", issuedAt: "2023-04-18", href: "#", fileSizeKb: 4_300 },
    { id: "d2", title: "Annual Carbon Audit 2023", docType: "audit", issuer: "SGS Group", issuedAt: "2024-01-30", href: "#", fileSizeKb: 8_900 },
    { id: "d3", title: "Biodiversity Monitoring Report Q3 2024", docType: "report", issuer: "Universidade de Brasília", issuedAt: "2024-09-15", href: "#", fileSizeKb: 12_100 },
    { id: "d4", title: "Gold Standard Climate Impact Certificate", docType: "certificate", issuer: "Gold Standard Foundation", issuedAt: "2024-03-01", href: "#", fileSizeKb: 980 },
  ],
  relatedProjects: [
    { id: "rp1", title: "Amazon Headwaters Reforestation", coverSrc: "https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?w=700&q=75", location: "Pará, Brazil", status: "active", treesPlanted: 3_400_000, co2RemovedTonnes: 287_000, creditPriceUsd: 28 },
    { id: "rp2", title: "Atlantic Forest Recovery Project", coverSrc: "https://images.unsplash.com/photo-1448375240586-882707db888b?w=700&q=75", location: "São Paulo, Brazil", status: "active", treesPlanted: 960_000, co2RemovedTonnes: 74_200, creditPriceUsd: 21 },
    { id: "rp3", title: "Patagonian Steppe Restoration", coverSrc: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=700&q=75", location: "Neuquén, Argentina", status: "active", treesPlanted: 480_000, co2RemovedTonnes: 38_900, creditPriceUsd: 19 },
    { id: "rp4", title: "Borneo Orangutan Habitat", coverSrc: "https://images.unsplash.com/photo-1549366021-9f761d450615?w=700&q=75", location: "Kalimantan, Indonesia", status: "active", treesPlanted: 2_100_000, co2RemovedTonnes: 195_000, creditPriceUsd: 34 },
  ],
  progress: {
    treesTarget: 5_000_000,
    treesPlanted: 1_840_000,
    co2TargetTonnes: 400_000,
    co2RemovedTonnes: 124_600,
    fundingGoalUsd: 18_000_000,
    fundingRaisedUsd: 11_340_000,
  },
  tags: ["Savanna", "Biodiversity", "Carbon Sequestration", "Indigenous Communities", "Brazil", "Verra VCS"],
  creditPriceUsd: 26,
  minCredits: 1,
  publishedAt: "2021-02-01",
  updatedAt: "2024-11-15",
};

export async function getProject(id: string): Promise<Project | null> {
  await new Promise((r) => setTimeout(r, 0));
  if (!id) return null;
  return MOCK_PROJECT;
}
