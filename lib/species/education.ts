/**
 * Educational content for each tree species — Issue #1681.
 *
 * One entry per slug in `TREE_SPECIES`. Each entry carries the adult version
 * (ecology, cultural significance, threats, conservation status, fun facts)
 * plus a short kid-friendly version for school programmes.
 */
import { TREE_SPECIES, type SpeciesInfo } from '@/lib/constants/species';
import { isNativeSpecies } from '@/lib/native-species';

export type ConservationStatus =
  'Least Concern' | 'Near Threatened' | 'Vulnerable' | 'Endangered' | 'Not Evaluated';

export interface KidsContent {
  headline: string;
  intro: string;
  funFacts: string[];
  activity: string;
}

export interface SpeciesEducation {
  slug: string;
  scientificName: string;
  summary: string;
  ecology: string;
  culturalSignificance: string;
  threats: string[];
  conservationStatus: ConservationStatus;
  conservationNote: string;
  funFacts: string[];
  kids: KidsContent;
}

export const SPECIES_EDUCATION: readonly SpeciesEducation[] = [
  {
    slug: 'teak',
    scientificName: 'Tectona grandis',
    summary: 'A tall, durable hardwood prized worldwide for timber that resists rot and insects.',
    ecology:
      'Teak is a deciduous tropical hardwood that sheds its leaves in the dry season, building rich leaf litter that feeds the soil. It thrives in deep, well-drained soils and, once established, shades out much of the undergrowth.',
    culturalSignificance:
      'Teak has built ships, temples and furniture across South and Southeast Asia for centuries, and is a symbol of lasting quality in craftsmanship.',
    threats: [
      'Illegal logging of old-growth stands',
      'Monoculture plantations that reduce biodiversity',
      'Teak defoliator insects',
    ],
    conservationStatus: 'Endangered',
    conservationNote:
      'Natural teak forests are listed as Endangered; plantation teak is widespread and relieves pressure on wild stands when sustainably managed.',
    funFacts: [
      'Teak wood contains natural oils that make it water-resistant, which is why it is used on boat decks.',
      'Some teak trees live for more than 100 years.',
    ],
    kids: {
      headline: 'Teak: the tree that never gets soggy!',
      intro:
        'Teak is a giant tree with oily wood. The oil keeps water out, so teak boats and benches last a very long time.',
      funFacts: [
        'Teak leaves can be as big as a dinner tray.',
        'Boat builders love teak because it does not rot easily.',
      ],
      activity: 'Rub a wet and a dry leaf with your finger — which one feels waxier?',
    },
  },
  {
    slug: 'moringa',
    scientificName: 'Moringa oleifera',
    summary:
      'A fast-growing, drought-tolerant tree whose leaves, pods and seeds are highly nutritious.',
    ecology:
      'Moringa grows quickly in poor, dry soils and tolerates drought, making it a pioneer species for degraded land. Its flowers feed bees and other pollinators, and its roots help hold soil in place.',
    culturalSignificance:
      'Known as the "miracle tree", moringa leaves are eaten across Africa and South Asia and used in traditional medicine. Seeds are also used to clarify drinking water.',
    threats: [
      'Frost in cooler regions',
      'Waterlogged soils that cause root rot',
      'Pod-borer pests',
    ],
    conservationStatus: 'Least Concern',
    conservationNote: 'Widely cultivated and not considered threatened.',
    funFacts: [
      'A moringa tree can grow up to 3 metres in its first year.',
      'Crushed moringa seeds can help make muddy water clearer.',
    ],
    kids: {
      headline: 'Moringa: the superfood tree!',
      intro:
        'Moringa grows super fast and its leaves are packed with vitamins. People call it the miracle tree.',
      funFacts: [
        'It can grow taller than you in a single year.',
        'Its long skinny pods are nicknamed drumsticks.',
      ],
      activity: 'Measure a seedling each week and plot how fast it grows.',
    },
  },
  {
    slug: 'eucalyptus',
    scientificName: 'Eucalyptus spp.',
    summary: 'A fast-growing evergreen from Australia, grown for timber, pulp and shelter belts.',
    ecology:
      'Eucalypts grow rapidly and pull large quantities of carbon from the air. They use a lot of water, so careful siting matters. Their flowers provide nectar for bees and birds.',
    culturalSignificance:
      'In Australia eucalypts (gum trees) are woven into Aboriginal culture and landscape. Elsewhere they are valued as a quick source of fuelwood and poles.',
    threats: [
      'High water use can lower local water tables',
      'Can crowd out native species when planted outside its range',
      'Wildfire, as the leaves hold flammable oils',
    ],
    conservationStatus: 'Not Evaluated',
    conservationNote:
      'Hundreds of species exist, most of them Least Concern; a few Australian species are threatened. FarmCredit limits its use under the native-species policy.',
    funFacts: [
      'Koalas eat the leaves of just a handful of eucalyptus species.',
      'Some eucalypts shed their bark in long ribbons every year.',
    ],
    kids: {
      headline: 'Eucalyptus: the peeling, minty tree',
      intro: 'Eucalyptus leaves smell like mint and its bark peels off in long strips.',
      funFacts: [
        'Koalas munch eucalyptus leaves for dinner.',
        'It is one of the fastest-growing trees on Earth.',
      ],
      activity: 'Crush a leaf (with permission!) and describe its smell in three words.',
    },
  },
  {
    slug: 'mangrove',
    scientificName: 'Rhizophora spp.',
    summary: 'Salt-tolerant coastal trees that shield shorelines and nurture marine life.',
    ecology:
      'Mangroves grow where land meets sea, with tangled prop roots that slow waves and trap sediment. Their roots are nurseries for fish, crabs and prawns, and mangrove soils store several times more carbon than most upland forests.',
    culturalSignificance:
      'Coastal communities rely on mangroves for fish, honey, fuelwood and storm protection, and many fishing traditions are tied to the mangrove forest.',
    threats: [
      'Clearing for shrimp farms and development',
      'Sea-level rise and altered tides',
      'Pollution and oil spills',
    ],
    conservationStatus: 'Vulnerable',
    conservationNote:
      'Roughly one in six mangrove species is threatened with extinction, and a large share of global mangrove cover has been lost since 1980.',
    funFacts: [
      'Mangroves can filter salt from sea water through their roots.',
      'Some mangrove seeds sprout while still on the parent tree.',
    ],
    kids: {
      headline: 'Mangrove: the tree that stands in the sea',
      intro:
        'Mangrove trees live with their feet in salty water! Their roots are a safe home for baby fish.',
      funFacts: [
        'Mangrove roots look like stilts holding the tree up.',
        'They protect beaches from big waves.',
      ],
      activity: 'Build a model shoreline with sticks as roots and see how they slow "waves".',
    },
  },
  {
    slug: 'acacia',
    scientificName: 'Acacia senegal',
    summary: 'A hardy dryland tree that fixes nitrogen and produces gum arabic.',
    ecology:
      'Acacias fix nitrogen in the soil, which helps neighbouring crops. Deep roots reach water far below the surface, so they thrive in the Sahel, and their thorny canopies shelter livestock and wildlife.',
    culturalSignificance:
      'Gum arabic harvested from acacia bark is a traditional income source across the Sahel and an ingredient in food, medicine and art materials.',
    threats: [
      'Overgrazing of seedlings',
      'Drought and desertification',
      'Overharvesting for fuelwood',
    ],
    conservationStatus: 'Least Concern',
    conservationNote:
      'Common across its range, but local populations decline where land is degraded.',
    funFacts: [
      'Acacia gum is used in fizzy drinks and sweets.',
      'Some acacias host ants that defend the tree from browsing animals.',
    ],
    kids: {
      headline: 'Acacia: the thorny helper',
      intro: 'Acacia trees have sharp thorns and make the soil healthier for other plants.',
      funFacts: [
        'Giraffes nibble acacia leaves with their long tongues.',
        'Acacia sap is used to make sweets!',
      ],
      activity: 'Draw a food web that starts with an acacia tree.',
    },
  },
  {
    slug: 'neem',
    scientificName: 'Azadirachta indica',
    summary: 'A drought-resistant evergreen valued for its natural pest-repelling compounds.',
    ecology:
      'Neem tolerates heat and poor soils and provides dense shade. Its leaves and seeds contain compounds that deter many insects, and the tree is a useful windbreak around farms.',
    culturalSignificance:
      'Neem is called the "village pharmacy" in South Asia, where twigs are used as toothbrushes and leaves in remedies and festivals.',
    threats: [
      'Frost and waterlogging',
      'Patenting and over-harvesting of seeds',
      'Dieback diseases',
    ],
    conservationStatus: 'Least Concern',
    conservationNote: 'Widely planted and not considered threatened.',
    funFacts: [
      'Neem oil is used as a natural, plant-based pesticide.',
      'A mature neem tree can cast shade over 100 square metres.',
    ],
    kids: {
      headline: 'Neem: the village pharmacy tree',
      intro: 'Neem leaves taste very bitter, which is why bugs stay away from them.',
      funFacts: [
        'People have used neem twigs as toothbrushes for thousands of years.',
        'Neem trees give great shade on hot days.',
      ],
      activity: 'Find three ways a shady tree makes a school playground better.',
    },
  },
  {
    slug: 'mahogany',
    scientificName: 'Khaya senegalensis',
    summary: 'A majestic West African hardwood with rich reddish timber.',
    ecology:
      'African mahogany grows tall in savannah and forest edges. Its canopy supports birds and insects, and seeds are dispersed by the wind in winged capsules.',
    culturalSignificance:
      'Mahogany furniture and carvings are highly prized, and the tree is often left standing as a village shade tree.',
    threats: [
      'Selective logging for timber',
      'Shoot-borer insects in young trees',
      'Habitat conversion to farmland',
    ],
    conservationStatus: 'Vulnerable',
    conservationNote: 'Listed as Vulnerable due to habitat loss and over-harvesting.',
    funFacts: [
      'Mahogany seeds spin like helicopters when they fall.',
      'Its wood darkens to a deep red-brown with age.',
    ],
    kids: {
      headline: 'Mahogany: the helicopter-seed giant',
      intro: 'Mahogany is a very tall tree. Its seeds spin through the air like tiny helicopters.',
      funFacts: ['The wood is a gorgeous reddish brown.', 'Birds nest high in mahogany branches.'],
      activity: 'Make paper helicopters and see which design stays up longest.',
    },
  },
  {
    slug: 'baobab',
    scientificName: 'Adansonia digitata',
    summary: 'The iconic "upside-down tree" of the African savannah.',
    ecology:
      'Baobabs store water in their swollen trunks to survive long dry spells. Their flowers open at night for bats and moths, and hollow trunks shelter birds, bees and bats.',
    culturalSignificance:
      'Baobabs are meeting places, storytellers and landmarks in many African communities; the fruit and leaves are eaten and the bark is used for rope.',
    threats: [
      'Climate change affecting old trees',
      'Over-harvesting of bark and fruit',
      'Elephant damage to young trees',
    ],
    conservationStatus: 'Least Concern',
    conservationNote:
      'Mainland baobabs are Least Concern, but several Madagascan baobab species are threatened. Many ancient African baobabs have died in recent decades.',
    funFacts: [
      'A baobab trunk can hold up to 120,000 litres of water.',
      'Some baobabs are over 1,000 years old.',
    ],
    kids: {
      headline: 'Baobab: the upside-down tree',
      intro:
        'Baobabs look as if their roots are in the sky! Their huge trunks store water for dry seasons.',
      funFacts: [
        'Baobab fruit is called monkey bread.',
        'Some baobabs are older than most castles.',
      ],
      activity: 'Draw a baobab and label where it stores water.',
    },
  },
  {
    slug: 'bamboo',
    scientificName: 'Phyllostachys edulis',
    summary: 'A giant grass that grows faster than any other woody plant.',
    ecology:
      'Moso bamboo spreads by underground rhizomes and can grow almost a metre a day in spring. It holds steep slopes together and regrows quickly after harvest, making it a renewable carbon store.',
    culturalSignificance:
      'Bamboo is used for scaffolding, food, paper and instruments across Asia, and symbolises resilience and flexibility.',
    threats: [
      'Mass flowering followed by die-off',
      'Spreading beyond its intended area',
      'Conversion of bamboo forest to other crops',
    ],
    conservationStatus: 'Least Concern',
    conservationNote:
      'Widespread and managed commercially; some wild bamboo species are threatened.',
    funFacts: [
      'Bamboo is technically a grass, not a tree.',
      'Some bamboo species flower only once every 60 to 120 years.',
    ],
    kids: {
      headline: 'Bamboo: the speedy giant grass',
      intro: 'Bamboo is a grass that can grow as tall as a building — and fast enough to watch!',
      funFacts: [
        'Pandas eat bamboo for breakfast, lunch and dinner.',
        'It can grow nearly a metre in a single day.',
      ],
      activity: 'Put a marker next to a plant and check how much it grew each day.',
    },
  },
  {
    slug: 'cedar',
    scientificName: 'Khaya grandifoliola',
    summary: 'A large West African timber tree sometimes called African cedar.',
    ecology:
      'West African cedar grows in moist semi-deciduous forests and provides canopy cover for understory crops such as cocoa. Fruits are eaten by squirrels and birds.',
    culturalSignificance:
      'Its bark is used in traditional medicine, and the aromatic timber is used for doors, boats and carvings.',
    threats: ['Overlogging', 'Forest clearing for farming', 'Seedling pests'],
    conservationStatus: 'Vulnerable',
    conservationNote: 'Listed as Vulnerable due to heavy exploitation of natural stands.',
    funFacts: [
      'Its timber has a pleasant cedar-like scent.',
      'Bark is traditionally used to treat fevers.',
    ],
    kids: {
      headline: 'West African cedar: the sweet-smelling tree',
      intro:
        'This forest giant smells like cedar and gives shade to farm crops growing beneath it.',
      funFacts: [
        'Squirrels love to eat its fruits.',
        'Farmers plant it to protect cocoa from the sun.',
      ],
      activity: 'Smell different woods and describe each one.',
    },
  },
  {
    slug: 'pine',
    scientificName: 'Pinus caribaea',
    summary: 'A fast-growing conifer used for timber and watershed restoration.',
    ecology:
      'Caribbean pine tolerates poor, acidic soils and periodic fires. Its needles form a thick litter that suppresses weeds but acidifies soil over time.',
    culturalSignificance:
      'Pine resin and timber support rural livelihoods across Central America and the Caribbean.',
    threats: ['Pine bark beetles', 'Uncontrolled wildfire', 'Monoculture plantations'],
    conservationStatus: 'Least Concern',
    conservationNote: 'Common in its native range; used widely in plantations.',
    funFacts: [
      'Pine cones open to release seeds when it is dry.',
      'Pine needles stay on the tree for around two to three years.',
    ],
    kids: {
      headline: 'Caribbean pine: the cone-bearing tree',
      intro: 'Pine trees keep their needles all year and grow seeds inside woody cones.',
      funFacts: ['Pine cones open and close with the weather.', 'Pine sap is sticky like glue.'],
      activity: 'Collect cones and see which ones are open or closed after a rainy day.',
    },
  },
  {
    slug: 'iroko',
    scientificName: 'Milicia excelsa',
    summary: 'A revered West African forest giant and a hard, termite-resistant timber.',
    ecology:
      'Iroko is a long-lived emergent tree that towers above the forest canopy. Its figs and seeds feed hornbills and monkeys, which in turn spread its seeds.',
    culturalSignificance:
      'In many West African traditions iroko is a sacred tree believed to house spirits, and it is often protected in village groves.',
    threats: [
      'Overharvesting for premium timber',
      'Slow regeneration in logged forests',
      'Forest fragmentation',
    ],
    conservationStatus: 'Near Threatened',
    conservationNote: 'Classified as Near Threatened because of heavy logging pressure.',
    funFacts: ['Iroko can live for 500 years.', 'Its wood is sometimes called African teak.'],
    kids: {
      headline: 'Iroko: the spirit tree',
      intro: 'Iroko is a very tall, very old tree that many villages treat as special and protect.',
      funFacts: ['Hornbills help spread iroko seeds.', 'It can live for centuries.'],
      activity: 'Ask an elder about a special tree in your community.',
    },
  },
  {
    slug: 'shea',
    scientificName: 'Vitellaria paradoxa',
    summary: 'A parkland tree whose nuts produce shea butter.',
    ecology:
      'Shea grows across the African savannah belt and takes 15 to 20 years to bear fruit. Its flowers feed bees, and farmers leave shea trees standing in their fields for the shade and soil benefits.',
    culturalSignificance:
      'Shea butter is known as "women\'s gold" because harvesting and processing it provides income for millions of women in West Africa.',
    threats: [
      'Felling for charcoal and firewood',
      'Ageing tree stands with little regeneration',
      'Climate change reducing fruit yield',
    ],
    conservationStatus: 'Vulnerable',
    conservationNote: 'Listed as Vulnerable because of steady population decline.',
    funFacts: [
      'Shea butter is used in cosmetics and chocolate.',
      'Shea trees can live for 200 years.',
    ],
    kids: {
      headline: 'Shea: the butter tree',
      intro: 'Shea nuts are crushed to make shea butter, a creamy balm used on skin and in food.',
      funFacts: [
        'It takes a shea tree about 20 years to start making nuts.',
        'Lots of families earn a living from shea.',
      ],
      activity: 'Find the products at home that list shea butter as an ingredient.',
    },
  },
  {
    slug: 'cashew',
    scientificName: 'Anacardium occidentale',
    summary: 'A tropical tree that gives us cashew nuts and nutritious cashew apples.',
    ecology:
      'Cashew trees tolerate poor, sandy soils and offer shade for intercropping. Flowers are pollinated by insects, and the nut hangs below a fleshy cashew apple.',
    culturalSignificance:
      'Cashew farming supports millions of smallholders in West Africa, India and Brazil, and cashew apples are made into juices and drinks.',
    threats: [
      'Powdery mildew and pests',
      'Erratic rainfall at flowering',
      'Price swings for raw nuts',
    ],
    conservationStatus: 'Least Concern',
    conservationNote: 'Widely cultivated and not considered threatened.',
    funFacts: [
      'The cashew nut grows outside the fruit, not inside it.',
      'Raw cashew shells contain an irritant, so nuts are always processed before eating.',
    ],
    kids: {
      headline: 'Cashew: the nut that grows outside',
      intro: 'A cashew nut hangs from the bottom of a juicy cashew apple.',
      funFacts: [
        'You can drink cashew apple juice.',
        'Cashew shells must be cooked before the nut is safe to eat.',
      ],
      activity: 'Draw a cashew apple with its nut hanging below it.',
    },
  },
  {
    slug: 'locust_bean',
    scientificName: 'Parkia biglobosa',
    summary: 'A multi-purpose savannah tree whose seeds become a prized fermented seasoning.',
    ecology:
      'African locust bean fixes nitrogen and provides shade and fodder. Its pink pom-pom flowers are pollinated by bats, and pods feed livestock in the dry season.',
    culturalSignificance:
      'Fermented seeds, called dawadawa or iru, are a staple seasoning in West African cooking, and the tree is often protected on farmland.',
    threats: ['Felling for firewood', 'Bush fires', 'Aging populations with few young trees'],
    conservationStatus: 'Least Concern',
    conservationNote: 'Common in parkland farming systems, though young trees are scarce.',
    funFacts: [
      'Its flowers look like red pom-poms and are pollinated by bats.',
      'Locust bean seasoning adds a rich, savoury flavour to stews.',
    ],
    kids: {
      headline: 'African locust bean: the pom-pom flower tree',
      intro:
        'This tree has round red flowers that bats visit at night, and its seeds flavour food.',
      funFacts: [
        'Bats pollinate its flowers.',
        'Its seeds are fermented to make a tasty seasoning.',
      ],
      activity: 'Ask a family member how they use local seasonings in cooking.',
    },
  },
];

const BY_SLUG = new Map(SPECIES_EDUCATION.map((entry) => [entry.slug, entry]));

export function getSpeciesEducation(slug: string): SpeciesEducation | undefined {
  return BY_SLUG.get(slug);
}

export interface SpeciesPageData {
  info: SpeciesInfo;
  education: SpeciesEducation;
  isNative: boolean;
}

export function getSpeciesPageData(slug: string): SpeciesPageData | undefined {
  const info = TREE_SPECIES.find((species) => species.slug === slug);
  const education = BY_SLUG.get(slug);
  if (!info || !education) return undefined;
  return { info, education, isNative: isNativeSpecies(slug) };
}

/** Resolves a species display name (e.g. "African Mahogany") to its page path. */
export function speciesPathForName(name: string, kids = false): string | null {
  const info = TREE_SPECIES.find((species) => species.name === name);
  return info ? speciesPathForSlug(info.slug, kids) : null;
}

export function speciesPathForSlug(slug: string, kids = false): string {
  return kids ? `/species/${slug}/kids` : `/species/${slug}`;
}
