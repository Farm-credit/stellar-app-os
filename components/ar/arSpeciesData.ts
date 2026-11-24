export interface ARSpeciesAsset {
  id: string;
  name: string;
  scientificName: string;
  modelGlb: string;
  modelUsdz: string;
  scale: [number, number, number];
}

export const TOP_20_AR_SPECIES: ARSpeciesAsset[] = [
  { id: "teak", name: "Teak", scientificName: "Tectona grandis", modelGlb: "/models/teak.glb", modelUsdz: "/models/teak.usdz", scale: [1, 1, 1] },
  { id: "moringa", name: "Moringa", scientificName: "Moringa oleifera", modelGlb: "/models/moringa.glb", modelUsdz: "/models/moringa.usdz", scale: [1, 1, 1] },
  { id: "eucalyptus", name: "Eucalyptus", scientificName: "Eucalyptus globulus", modelGlb: "/models/eucalyptus.glb", modelUsdz: "/models/eucalyptus.usdz", scale: [1, 1, 1] },
  { id: "mangrove", name: "Red Mangrove", scientificName: "Rhizophora mangle", modelGlb: "/models/mangrove.glb", modelUsdz: "/models/mangrove.usdz", scale: [1, 1, 1] },
  { id: "neem", name: "Neem", scientificName: "Azadirachta indica", modelGlb: "/models/neem.glb", modelUsdz: "/models/neem.usdz", scale: [1, 1, 1] },
  { id: "shea", name: "Shea Tree", scientificName: "Vitellaria paradoxa", modelGlb: "/models/shea.glb", modelUsdz: "/models/shea.usdz", scale: [1, 1, 1] },
  { id: "acacia", name: "Acacia", scientificName: "Acacia senegal", modelGlb: "/models/acacia.glb", modelUsdz: "/models/acacia.usdz", scale: [1, 1, 1] },
  { id: "baobab", name: "African Baobab", scientificName: "Adansonia digitata", modelGlb: "/models/baobab.glb", modelUsdz: "/models/baobab.usdz", scale: [1.2, 1.2, 1.2] },
  { id: "cocoa", name: "Cocoa Tree", scientificName: "Theobroma cacao", modelGlb: "/models/cocoa.glb", modelUsdz: "/models/cocoa.usdz", scale: [1, 1, 1] },
  { id: "cashew", name: "Cashew", scientificName: "Anacardium occidentale", modelGlb: "/models/cashew.glb", modelUsdz: "/models/cashew.usdz", scale: [1, 1, 1] },
  { id: "avocado", name: "Avocado", scientificName: "Persea americana", modelGlb: "/models/avocado.glb", modelUsdz: "/models/avocado.usdz", scale: [1, 1, 1] },
  { id: "mango", name: "Mango", scientificName: "Mangifera indica", modelGlb: "/models/mango.glb", modelUsdz: "/models/mango.usdz", scale: [1, 1, 1] },
  { id: "oil-palm", name: "Oil Palm", scientificName: "Elaeis guineensis", modelGlb: "/models/oil-palm.glb", modelUsdz: "/models/oil-palm.usdz", scale: [1, 1, 1] },
  { id: "gmelina", name: "Gmelina", scientificName: "Gmelina arborea", modelGlb: "/models/gmelina.glb", modelUsdz: "/models/gmelina.usdz", scale: [1, 1, 1] },
  { id: "pine", name: "Caribbean Pine", scientificName: "Pinus caribaea", modelGlb: "/models/pine.glb", modelUsdz: "/models/pine.usdz", scale: [1, 1, 1] },
  { id: "iroko", name: "Iroko", scientificName: "Milicia excelsa", modelGlb: "/models/iroko.glb", modelUsdz: "/models/iroko.usdz", scale: [1.1, 1.1, 1.1] },
  { id: "mahogany", name: "African Mahogany", scientificName: "Khaya ivorensis", modelGlb: "/models/mahogany.glb", modelUsdz: "/models/mahogany.usdz", scale: [1, 1, 1] },
  { id: "cb-wood", name: "Blackwood", scientificName: "Dalbergia melanoxylon", modelGlb: "/models/blackwood.glb", modelUsdz: "/models/blackwood.usdz", scale: [1, 1, 1] },
  { id: "cacao", name: "Wild Cacao", scientificName: "Theobroma sylvestre", modelGlb: "/models/wild-cacao.glb", modelUsdz: "/models/wild-cacao.usdz", scale: [1, 1, 1] },
  { id: "citrus", name: "Citrus / Orange", scientificName: "Citrus sinensis", modelGlb: "/models/citrus.glb", modelUsdz: "/models/citrus.usdz", scale: [1, 1, 1] }
];

export function getARAssetForSpecies(speciesName: string): ARSpeciesAsset | undefined {
  const query = speciesName.toLowerCase().trim();
  return TOP_20_AR_SPECIES.find(
    s => s.id === query || s.name.toLowerCase() === query || s.scientificName.toLowerCase().includes(query)
  );
}
