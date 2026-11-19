/**
 * Carbon Methodology Library - 50+ Methods (v2) — Issue #1405
 *
 * Comprehensive standardized database of carbon calculation methodologies across:
 * 1. Reforestation & Afforestation (ARR / Forestry)
 * 2. Soil Sequestration & Regenerative Agriculture
 * 3. Renewable Energy Generation & Supply
 * 4. Methane Reduction, Capture & Destruction
 * 5. Energy Efficiency, Clean Cooking & Demand-side Management
 *
 * Standards supported: Verra (VCS), Gold Standard (GS), UN CDM, Climate Action Reserve (CAR), Plan Vivo, American Carbon Registry (ACR).
 */

export type MethodologyCategory =
  | 'reforestation'
  | 'soil_sequestration'
  | 'renewable_energy'
  | 'methane_reduction'
  | 'energy_efficiency';

export type CarbonStandard =
  | 'Verra (VCS)'
  | 'Gold Standard'
  | 'UN CDM'
  | 'Climate Action Reserve'
  | 'Plan Vivo'
  | 'American Carbon Registry';

export type MethodologyStatus = 'active' | 'under_revision' | 'superseded';

export interface CalculationParameter {
  name: string;
  key: string;
  unit: string;
  description: string;
  defaultValue?: number;
  min?: number;
  max?: number;
}

export interface CarbonMethodology {
  id: string; // e.g. 'VM0047', 'ACM0002'
  code: string;
  name: string;
  category: MethodologyCategory;
  standard: CarbonStandard;
  version: string;
  status: MethodologyStatus;
  summary: string;
  applicability: string[];
  baselineModel: string;
  projectModel: string;
  leakageFormula: string;
  permanenceBufferPct: number; // e.g. 15 for 15% risk buffer
  measurementFrequency: string; // e.g. 'annual', 'biannual'
  defaultEquation: string;
  parameters: CalculationParameter[];
  coBenefits: string[];
}

export interface CalculationInput {
  baselineEmissionsTonnes: number;
  projectEmissionsTonnes: number;
  leakageTonnes?: number;
  activityAreaHectares?: number;
  customParameters?: Record<string, number>;
}

export interface CalculationResult {
  methodologyId: string;
  grossReductionTonnes: number;
  leakageTonnes: number;
  bufferDeductionTonnes: number;
  netCreditsIssuedTonnes: number;
  effectivePermanenceBufferPct: number;
  calculatedAt: string;
  breakdown: {
    baselineEmissionsTonnes: number;
    projectEmissionsTonnes: number;
    leakageDeductionsTonnes: number;
    permanenceRiskBufferTonnes: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 50+ Carbon Methodologies Database
// ─────────────────────────────────────────────────────────────────────────────

export const CARBON_METHODOLOGIES: CarbonMethodology[] = [
  // ── Category 1: Reforestation & Afforestation (ARR / Forestry) ─────────────
  {
    id: 'VM0047',
    code: 'VM0047',
    name: 'Afforestation, Reforestation and Revegetation (ARR)',
    category: 'reforestation',
    standard: 'Verra (VCS)',
    version: 'v1.0',
    status: 'active',
    summary: 'Dynamic performance-based ARR methodology with census-based carbon stock changes and remote sensing integration.',
    applicability: ['Degraded lands with canopy cover < 10%', 'No deforestation within last 10 years', 'Afforestation on lands non-forested for ≥ 10 years'],
    baselineModel: 'Historical baseline projection of land cover without intervention',
    projectModel: 'Allometric biomass accumulation equations + soil organic carbon',
    leakageFormula: 'Activity-shifting leakage factor based on displaced agricultural activities (0-15%)',
    permanenceBufferPct: 15,
    measurementFrequency: 'annual',
    defaultEquation: 'Net_tCO2e = (Delta_CAB + Delta_CBB + Delta_CSOC) - PE_ARR - Leakage - AFOLU_Buffer',
    parameters: [
      { name: 'Aboveground Biomass Carbon', key: 'delta_cab', unit: 'tCO2e/ha', description: 'Annual increase in living tree carbon' },
      { name: 'Belowground Root Carbon', key: 'delta_cbb', unit: 'tCO2e/ha', description: 'Root to shoot ratio expansion' },
      { name: 'Buffer Deduction', key: 'buffer_pct', unit: '%', description: 'VCS non-permanence risk buffer', defaultValue: 15 },
    ],
    coBenefits: ['Biodiversity Habitat', 'Watershed Protection', 'Community Employment'],
  },
  {
    id: 'VM0007',
    code: 'VM0007',
    name: 'REDD+ Methodology Framework (RMF)',
    category: 'reforestation',
    standard: 'Verra (VCS)',
    version: 'v1.6',
    status: 'active',
    summary: 'Framework for reducing emissions from deforestation and forest degradation across jurisdictional and nested boundaries.',
    applicability: ['Tropical and subtropical native forests threatened by deforestation', 'Unplanned or planned deforestation drivers'],
    baselineModel: 'Spatial risk mapping of historical 10-year deforestation rate',
    projectModel: 'Patrols, conservation concessions, and alternative community livelihoods',
    leakageFormula: 'Buffer zone leakage monitoring with geographic displacement discounting',
    permanenceBufferPct: 18,
    measurementFrequency: 'annual',
    defaultEquation: 'ER_y = BE_Deforestation_y - PE_y - Leakage_Displacement_y - AFOLU_Buffer',
    parameters: [
      { name: 'Deforestation Rate Avoided', key: 'avoided_ha', unit: 'ha/yr', description: 'Hectares of forest saved from clearcutting' },
      { name: 'Carbon Density', key: 'carbon_density', unit: 'tCO2e/ha', description: 'Average carbon stored per hectare' },
    ],
    coBenefits: ['Endangered Species Protection', 'Indigenous Land Rights', 'Microclimate Stabilization'],
  },
  {
    id: 'AR-ACM0003',
    code: 'AR-ACM0003',
    name: 'Afforestation and Reforestation of Lands Except Wetlands',
    category: 'reforestation',
    standard: 'UN CDM',
    version: 'v2.0',
    status: 'active',
    summary: 'Large-scale CDM methodology for establishing forest on degraded agricultural, grazing, or abandoned lands.',
    applicability: ['Non-wetland degraded lands', 'Crown cover below national forest definition for 10+ years'],
    baselineModel: 'Continuation of pre-project grazing or non-forest vegetation',
    projectModel: 'Stratified biomass sampling with destructive/allometric tree growth curves',
    leakageFormula: 'Agricultural displacement discount based on displaced animal stocking rates',
    permanenceBufferPct: 10,
    measurementFrequency: 'biannual',
    defaultEquation: 'C_AR = Delta_C_PROJ - Delta_C_BSL - GHG_E - Leakage',
    parameters: [
      { name: 'Stem Volume Increment', key: 'vol_inc', unit: 'm3/ha/yr', description: 'Annual volume yield of planted timber/agroforestry' },
      { name: 'Basic Wood Density', key: 'wood_density', unit: 't/m3', description: 'Species specific dry mass density' },
    ],
    coBenefits: ['Soil Erosion Prevention', 'Sustainable Timber', 'Local Rural Incomes'],
  },
  {
    id: 'GS-A/R',
    code: 'GS-A/R',
    name: 'Gold Standard Afforestation / Reforestation Requirements',
    category: 'reforestation',
    standard: 'Gold Standard',
    version: 'v1.2',
    status: 'active',
    summary: 'Rigorous Gold Standard rules requiring multi-species native planting, sustainable forestry stewardship, and SDG verification.',
    applicability: ['Planting native or climate-resilient mixed species', 'High social safeguards and community ownership'],
    baselineModel: 'Verified degraded baseline without spontaneous regeneration',
    projectModel: 'Continuous forest inventory (CFI) plots and permanent sample plots',
    leakageFormula: 'Zero tolerance for displacement onto natural ecosystems',
    permanenceBufferPct: 20,
    measurementFrequency: 'annual',
    defaultEquation: 'GS_NET = (Delta_CAB + Delta_CBB) * (1 - Buffer_20Pct) - Leakage_Displacement',
    parameters: [
      { name: 'Native Species Ratio', key: 'native_ratio', unit: '%', description: 'Percentage of planted native trees (min 70%)' },
      { name: 'Survival Rate', key: 'survival_rate', unit: '%', description: 'Tree survival after year 3' },
    ],
    coBenefits: ['SDG 1 No Poverty', 'SDG 13 Climate Action', 'SDG 15 Life on Land'],
  },
  {
    id: 'CAR-FOR-USA',
    code: 'CAR-FOR-USA',
    name: 'Climate Action Reserve Forest Project Protocol',
    category: 'reforestation',
    standard: 'Climate Action Reserve',
    version: 'v5.0',
    status: 'active',
    summary: 'Reforestation, Improved Forest Management (IFM), and Avoided Conversion protocol for North American timberlands.',
    applicability: ['Private or tribal timberlands in USA', 'Reforestation or lengthening harvest rotation ages'],
    baselineModel: 'Common practice baseline timber stocking regional averages',
    projectModel: 'FIA-calibrated growth and yield simulation (FVS) validated by field plots',
    leakageFormula: 'Standardized 20% secondary market harvest shifting discount',
    permanenceBufferPct: 15,
    measurementFrequency: 'annual',
    defaultEquation: 'Credits = Actual_Stock - Baseline_Regional - Leakage_HarvestShift - Buffer_Contribution',
    parameters: [
      { name: 'Above Baseline Stock', key: 'carbon_delta', unit: 'tCO2e', description: 'Tonnes stored beyond common practice baseline' },
    ],
    coBenefits: ['Salmon Stream Habitat', 'Wildfire Resilience', 'Recreational Access'],
  },
  {
    id: 'PV-TREES',
    code: 'PV-TREES',
    name: 'Plan Vivo Standard for Smallholder Agroforestry & Reforestation',
    category: 'reforestation',
    standard: 'Plan Vivo',
    version: 'v5.0',
    status: 'active',
    summary: 'Community-led smallholder tree planting protocol ensuring at least 60% of carbon income flows directly to rural farmers.',
    applicability: ['Smallholder farms under 5 hectares', 'Community woodlots and boundary planting in Global South'],
    baselineModel: 'Subsistence crop baseline without permanent shade or forestry',
    projectModel: 'Farmer tree register and GPS farm-plot survivorship audits',
    leakageFormula: 'Integrated crop-tree systems that increase food production, preventing leakage',
    permanenceBufferPct: 15,
    measurementFrequency: 'annual',
    defaultEquation: 'Credits_PV = Total_Living_Biomass_tCO2e * 0.85 (Farmer Dedicated Pool)',
    parameters: [
      { name: 'Trees Maintained', key: 'tree_count', unit: 'trees', description: 'Verified surviving trees on farmer plot' },
      { name: 'Sequestration Rate', key: 'seq_rate', unit: 'kg CO2/tree/yr', description: 'Per tree annual sequestration' },
    ],
    coBenefits: ['Direct Farmer Livelihoods', 'Agro-biodiversity', 'Crop Microclimate Shield'],
  },
  {
    id: 'VM0015',
    code: 'VM0015',
    name: 'Avoided Unplanned Deforestation in Frontier Basins',
    category: 'reforestation',
    standard: 'Verra (VCS)',
    version: 'v1.1',
    status: 'active',
    summary: 'Quantification of emissions reductions from avoiding unplanned frontier forest clearing along newly constructed roads.',
    applicability: ['Tropical frontier rainforests', 'High agricultural colonization pressure'],
    baselineModel: 'Land-use spatial diffusion model based on road infrastructure proximity',
    projectModel: 'Satellite surveillance, indigenous ranger patrols, legal titling',
    leakageFormula: 'Trans-boundary leakage belt tracking and aerial radar',
    permanenceBufferPct: 17,
    measurementFrequency: 'annual',
    defaultEquation: 'ER = (BSL_Area_Loss - PROJ_Area_Loss) * Canopy_Carbon_Density - Buffer',
    parameters: [
      { name: 'Frontier Deforestation Rate', key: 'baseline_rate', unit: '%/yr', description: 'Historical clearing trend' },
    ],
    coBenefits: ['Jaguar & Wildlife Corridors', 'Indigenous Territorial Defense'],
  },
  {
    id: 'ACR-ARR',
    code: 'ACR-ARR',
    name: 'ACR Methodology for Afforestation and Reforestation of Degraded Lands',
    category: 'reforestation',
    standard: 'American Carbon Registry',
    version: 'v2.0',
    status: 'active',
    summary: 'American Carbon Registry standard for restoring natural tree canopy on abandoned mine lands and marginal pastures.',
    applicability: ['Severely degraded lands in North America and Latin America', 'No commercial harvest for 40 years'],
    baselineModel: 'Barren ground or non-commercial invasive scrub baseline',
    projectModel: 'Permanent biomass inventory plots with tree core allometry',
    leakageFormula: 'Zero agricultural leakage on verified brownfields or barren lands',
    permanenceBufferPct: 12,
    measurementFrequency: 'annual',
    defaultEquation: 'ACR_Credits = (Biomass_C + Soil_C) - Project_Emissions - Risk_Buffer',
    parameters: [
      { name: 'Hectares Planted', key: 'hectares', unit: 'ha', description: 'Restored acreage' },
    ],
    coBenefits: ['Acid Mine Drainage Remediation', 'Soil Stabilization'],
  },
  {
    id: 'AR-AMS0007',
    code: 'AR-AMS0007',
    name: 'Small-scale Afforestation and Reforestation Under CDM',
    category: 'reforestation',
    standard: 'UN CDM',
    version: 'v3.0',
    status: 'active',
    summary: 'Streamlined CDM protocol for low-income communities planting woodlots < 16,000 tCO2e/yr.',
    applicability: ['Low-income rural communities', 'Low-burden carbon accounting'],
    baselineModel: 'Default regional biomass stock constants from IPCC tables',
    projectModel: 'Sample tree measurement and conservative default root ratios',
    leakageFormula: 'De minimis leakage exemption under CDM small-scale thresholds',
    permanenceBufferPct: 10,
    measurementFrequency: 'every 3 years',
    defaultEquation: 'tCER_Net = Conservative_Biomass_Increase - Project_N2O_Fertilizer',
    parameters: [
      { name: 'Planted Area', key: 'area_ha', unit: 'ha', description: 'Total smallholder woodlot area' },
    ],
    coBenefits: ['Firewood Self-Sufficiency', 'Smallholder Asset Creation'],
  },
  {
    id: 'CAR-MEX-FOR',
    code: 'CAR-MEX-FOR',
    name: 'Climate Action Reserve Mexico Forest Protocol',
    category: 'reforestation',
    standard: 'Climate Action Reserve',
    version: 'v3.0',
    status: 'active',
    summary: 'Ejido and communal forest carbon accounting tailored to community-owned forests across Mexico.',
    applicability: ['Ejidos and agrarian communities in Mexico', 'Community forest enterprise management'],
    baselineModel: 'Historical regional biomass loss or sustainable harvest limits',
    projectModel: 'Community monitoring teams using calibrated digital calipers and drones',
    leakageFormula: 'Activity shifting leakage calculated against municipal timber outputs',
    permanenceBufferPct: 16,
    measurementFrequency: 'annual',
    defaultEquation: 'Net_Ejido = Live_Biomass_Gain - Wood_Products_Decay - Buffer_Pool',
    parameters: [
      { name: 'Community Forest Hectares', key: 'ejido_ha', unit: 'ha', description: 'Communal land under sustainable management' },
    ],
    coBenefits: ['Ejido Governance Strengthening', 'Water Catchment Protection'],
  },
  {
    id: 'VM0034',
    code: 'VM0034',
    name: 'Canadian Boreal & Temperate Forest Peatland Rewetting & ARR',
    category: 'reforestation',
    standard: 'Verra (VCS)',
    version: 'v1.0',
    status: 'active',
    summary: 'Reforestation of cutover forested peatlands combined with hydrological canal blocking.',
    applicability: ['Drained forested peatlands', 'Post-harvest restoration'],
    baselineModel: 'High peat oxidation and CO2/N2O emissions baseline from drained soils',
    projectModel: 'Re-established black spruce/larch canopy and water table restoration to within 10cm of surface',
    leakageFormula: 'Eco-hydrological upstream and downstream buffer checks',
    permanenceBufferPct: 14,
    measurementFrequency: 'annual',
    defaultEquation: 'Credits = Avoided_Peat_Loss + Tree_Growth - CH4_Rewetting_Penalty',
    parameters: [
      { name: 'Peat Depth', key: 'peat_depth_cm', unit: 'cm', description: 'Organic soil depth' },
    ],
    coBenefits: ['Massive Carbon Reservoir Protection', 'Caribou Habitat'],
  },

  // ── Category 2: Soil Sequestration & Regenerative Agriculture ───────────────
  {
    id: 'VM0042',
    code: 'VM0042',
    name: 'Improved Agricultural Land Management (ALM)',
    category: 'soil_sequestration',
    standard: 'Verra (VCS)',
    version: 'v2.0',
    status: 'active',
    summary: 'Premier global standard for agricultural carbon: cover crops, reduced tillage, crop rotations, and organic soil amendments.',
    applicability: ['Cropland and rotational grazing systems', 'Adoption of ≥ 1 regenerative management practice'],
    baselineModel: 'Dynamic counterfactual regional control farms or biogeochemical modeling (DayCent/DNDC)',
    projectModel: 'Stratified soil core sampling (0-30cm) combined with process-based modeling',
    leakageFormula: 'Market crop yield reduction leakage penalty if yield drops > 5%',
    permanenceBufferPct: 15,
    measurementFrequency: 'annual (model), 5-yr (cores)',
    defaultEquation: 'Net_SOC = Delta_SOC_Model - Project_Fertilizer_N2O - Fuel_Use - Yield_Leakage - Buffer_15',
    parameters: [
      { name: 'Baseline Soil Organic Carbon', key: 'bsl_soc', unit: 'tC/ha', description: 'Pre-adoption soil carbon baseline' },
      { name: 'Cover Crop Sequestration Rate', key: 'cover_crop_rate', unit: 'tCO2e/ha/yr', description: 'Additional organic carbon influx', defaultValue: 1.25 },
      { name: 'Synthetic Nitrogen Reduction', key: 'n_reduction_pct', unit: '%', description: 'Reduction in synthetic nitrogen application' },
    ],
    coBenefits: ['Water Infiltration & Drought Resilience', 'Microbiome Diversity', 'Reduced Nutrient Runoff'],
  },
  {
    id: 'GS-SOC-2023',
    code: 'GS-SOC-2023',
    name: 'Gold Standard Soil Organic Carbon Framework',
    category: 'soil_sequestration',
    standard: 'Gold Standard',
    version: 'v1.1',
    status: 'active',
    summary: 'Quantification of soil carbon enhancements for smallholders and commercial agriculture with high social SDG safeguards.',
    applicability: ['Farms introducing multi-species cover cropping, biochar, compost, or agroecological tillage'],
    baselineModel: 'Historical 5-year soil depletion trajectory',
    projectModel: 'Direct wet-combustion / dry-combustion soil carbon testing calibrated with remote sensing',
    leakageFormula: 'Food security safeguard check ensuring no land abandonment',
    permanenceBufferPct: 15,
    measurementFrequency: 'annual',
    defaultEquation: 'GS_SOC = (SOC_t2 - SOC_t1) * Bulk_Density * Area - Farm_Machinery_GHG - Buffer',
    parameters: [
      { name: 'Bulk Density', key: 'bulk_density', unit: 'g/cm3', description: 'Soil bulk density for volume conversion' },
      { name: 'Soil Carbon Increase', key: 'soc_pct_gain', unit: '%', description: 'Percentage increase in topsoil organic matter' },
    ],
    coBenefits: ['SDG 2 Zero Hunger', 'Reduced Fertilizer Costs', 'Earthworm & Fungal Abundance'],
  },
  {
    id: 'CAR-SEP',
    code: 'CAR-SEP',
    name: 'Climate Action Reserve Soil Enrichment Protocol',
    category: 'soil_sequestration',
    standard: 'Climate Action Reserve',
    version: 'v1.1',
    status: 'active',
    summary: 'Rigorous protocol for North American cropland practices that increase SOC and reduce N2O emissions.',
    applicability: ['North American commercial croplands', 'Nitrogen management and regenerative rotation'],
    baselineModel: 'Continuous calibrated regional DayCent model iterations',
    projectModel: 'Ensemble DNDC/DayCent modeling validated by audited physical soil cores',
    leakageFormula: 'Standardized commodity price elasticity leakage deductions',
    permanenceBufferPct: 17,
    measurementFrequency: 'annual',
    defaultEquation: 'Credits = (SOC_Incr + N2O_Reductions) * Uncertainty_Discount - Buffer_Pool',
    parameters: [
      { name: 'Tillage Reduction Level', key: 'tillage_reduction', unit: 'rating', description: 'No-till or strip-till transition scale' },
      { name: 'N2O Emission Reduction', key: 'n2o_saved', unit: 'tCO2e/ha', description: 'Avoided direct and indirect volatilization' },
    ],
    coBenefits: ['Aquifer Nitrate Protection', 'Pollinator Corridors'],
  },
  {
    id: 'VM0044',
    code: 'VM0044',
    name: 'Biochar Utilization in Soil and Non-Soil Applications',
    category: 'soil_sequestration',
    standard: 'Verra (VCS)',
    version: 'v1.1',
    status: 'active',
    summary: 'Durable carbon dioxide removal (CDR) via high-temperature pyrolysis of sustainably sourced biomass applied to agricultural soil.',
    applicability: ['Agricultural and forestry residues', 'Certified pyrolysis facilities with gas capture'],
    baselineModel: 'Open decay or burning of biomass residue',
    projectModel: 'Laboratory H:Corg ratio permanence testing (guaranteeing > 100-year carbon durability)',
    leakageFormula: 'Feedstock competition and haulage transportation emissions',
    permanenceBufferPct: 5,
    measurementFrequency: 'per batch / annual',
    defaultEquation: 'Net_CDR = Biochar_Mass * C_Content * F_Permanence_100yr - Production_GHG - Transport_GHG',
    parameters: [
      { name: 'Biochar Produced', key: 'biochar_tonnes', unit: 'dry tonnes', description: 'High-temperature pyrolyzed biochar' },
      { name: 'Organic Carbon Content', key: 'c_org_pct', unit: '%', description: 'Typically 75-85% pure carbon', defaultValue: 80 },
      { name: 'H:Corg Ratio', key: 'h_c_ratio', unit: 'ratio', description: 'Must be < 0.7 for permanent CDR certification' },
    ],
    coBenefits: ['100+ Year Carbon Removal', 'Soil Cation Exchange Capacity Boost', 'Water Retention'],
  },
  {
    id: 'VM0032',
    code: 'VM0032',
    name: 'Improved Grassland Management (IGM)',
    category: 'soil_sequestration',
    standard: 'Verra (VCS)',
    version: 'v1.0',
    status: 'active',
    summary: 'Rotational adaptive grazing, pasture restoration, and elimination of degradation on savanna and prairie grasslands.',
    applicability: ['Rangelands and grazed pastures', 'Transition to high-density rotational grazing'],
    baselineModel: 'Continuous overgrazing with progressive root loss and bare ground expansion',
    projectModel: 'Multi-paddock mob grazing mimicking native herbivore herds, stimulating root exudates',
    leakageFormula: 'Livestock displacement leakage if herd size is diminished without efficiency gain',
    permanenceBufferPct: 15,
    measurementFrequency: 'annual',
    defaultEquation: 'Credits = Delta_SOC_Rangeland - Enteric_CH4_Adjustment - Buffer',
    parameters: [
      { name: 'Rangeland Area', key: 'rangeland_ha', unit: 'ha', description: 'Pasture area under adaptive multi-paddock grazing' },
    ],
    coBenefits: ['Grassland Bird Nesting', 'Wildfire Fuel Mitigation', 'Drought-Proof Forage'],
  },
  {
    id: 'ACM0022',
    code: 'ACM0022',
    name: 'Alternative Waste Management and Soil Compost Addition',
    category: 'soil_sequestration',
    standard: 'UN CDM',
    version: 'v2.0',
    status: 'active',
    summary: 'Aerobic composting of organic agro-industrial waste and municipal solid waste applied to farm soils.',
    applicability: ['Diversion of organic waste from anaerobic landfills to aerobic composting'],
    baselineModel: 'Anaerobic landfill decomposition releasing methane',
    projectModel: 'Controlled aerobic forced-aeration windrow composting with temperature logging',
    leakageFormula: 'Compost transport and spreader fuel consumption',
    permanenceBufferPct: 8,
    measurementFrequency: 'annual',
    defaultEquation: 'ER = BE_Landfill_CH4 - PE_Composting_CH4_N2O - Fuel_Transport - Buffer',
    parameters: [
      { name: 'Organic Waste Composted', key: 'waste_tonnes', unit: 'tonnes', description: 'Feedstock diverted from landfills' },
    ],
    coBenefits: ['Landfill Diversion', 'Chemical Fertilizer Substitution', 'Humic Acid Enrichment'],
  },
  {
    id: 'VM0017',
    code: 'VM0017',
    name: 'Adoption of Sustainable Agricultural Land Management (SALM)',
    category: 'soil_sequestration',
    standard: 'Verra (VCS)',
    version: 'v1.0',
    status: 'active',
    summary: 'Holistic standard combining soil carbon, on-farm tree planting, and zero-residue burning for smallholder cooperatives.',
    applicability: ['Smallholder agrarian landscapes in developing nations', 'Cooperative aggregator governance'],
    baselineModel: 'Slash-and-burn farming and continuous monocropping',
    projectModel: 'Activity-based monitoring audited with geo-tagged farmer logbooks and sample soil tests',
    leakageFormula: 'Zero leakage due to increased crop yields on existing fields',
    permanenceBufferPct: 15,
    measurementFrequency: 'annual',
    defaultEquation: 'ER = Delta_SOC + Delta_Tree_Biomass - Project_Fertilizer - Buffer',
    parameters: [
      { name: 'Participating Farmers', key: 'farmer_count', unit: 'farmers', description: 'Enrolled smallholders in cooperative' },
    ],
    coBenefits: ['Doubled Crop Yields', 'Climate Shock Resilience', 'Gender Empowerment'],
  },
  {
    id: 'ACR-ACI',
    code: 'ACR-ACI',
    name: 'Avoided Conversion of Grasslands and Shrublands',
    category: 'soil_sequestration',
    standard: 'American Carbon Registry',
    version: 'v2.1',
    status: 'active',
    summary: 'Protecting ancient native prairie and sagebrush grasslands from conversion to intensive monoculture crop cultivation.',
    applicability: ['Native grasslands with high soil organic carbon stocks (> 60 tC/ha)', 'Threatened by crop expansion'],
    baselineModel: 'Expected tillage conversion leading to 30-50% loss of soil carbon within 20 years',
    projectModel: 'Perpetual conservation easements prohibiting breaking of sod',
    leakageFormula: 'County-level agricultural land replacement leakage discount (10-20%)',
    permanenceBufferPct: 10,
    measurementFrequency: 'annual',
    defaultEquation: 'ER = Historical_Conversion_Rate * Soil_Carbon_Oxidation_Rate * Area - Leakage',
    parameters: [
      { name: 'Grassland Saved', key: 'prairie_ha', unit: 'ha', description: 'Acres under perpetual conservation easement' },
    ],
    coBenefits: ['Monarch Butterfly & Bison Habitat', 'Historic Aquifer Recharging'],
  },
  {
    id: 'CAR-GRAZ-USA',
    code: 'CAR-GRAZ-USA',
    name: 'Climate Action Reserve Grassland Project Protocol',
    category: 'soil_sequestration',
    standard: 'Climate Action Reserve',
    version: 'v2.2',
    status: 'active',
    summary: 'Avoided conversion of native grasslands in the United States to annual row crops.',
    applicability: ['Grassland parcels with demonstrated soil capability for cropland conversion'],
    baselineModel: 'Financial inducement model proving viability of row crop cultivation',
    projectModel: 'Long-term grassland stewardship contract and annual satellite imagery audits',
    leakageFormula: 'Standardized 20% agricultural market leakage deduction',
    permanenceBufferPct: 15,
    measurementFrequency: 'annual',
    defaultEquation: 'Credits = Avoided_SOC_Loss + Avoided_N2O_Fertilizer - Leakage - Buffer',
    parameters: [
      { name: 'Soil Suitability Score', key: 'suitability_index', unit: 'score', description: 'USDA soil conversion risk index' },
    ],
    coBenefits: ['Native Plant Diversity', 'Duck Nesting Habitat'],
  },
  {
    id: 'VM0021',
    code: 'VM0021',
    name: 'Soil Carbon Management in Peatlands and Organic Soils',
    category: 'soil_sequestration',
    standard: 'Verra (VCS)',
    version: 'v1.0',
    status: 'active',
    summary: 'Halting oxidation of deep organic peat soils by raising drainage ditch water tables.',
    applicability: ['Cultivated or pastured organic soils (Histosols/peatlands)'],
    baselineModel: 'Continuous deep drainage causing 1-3 cm/year of peat subsidence and high CO2 emissions',
    projectModel: 'Installation of automated canal weirs maintaining elevated water table',
    leakageFormula: 'Downstream hydrological modeling ensuring no external land flooding',
    permanenceBufferPct: 12,
    measurementFrequency: 'annual',
    defaultEquation: 'ER = Peat_Subsidence_Loss_Avoided - Rewetting_CH4 - Buffer',
    parameters: [
      { name: 'Water Table Depth', key: 'water_table_cm', unit: 'cm', description: 'Target water table below ground surface' },
    ],
    coBenefits: ['Flood Mitigation', 'Peat Fire Prevention'],
  },
  {
    id: 'IPCC-T2-SOC',
    code: 'IPCC-T2-SOC',
    name: 'IPCC Tier 2 Cropland Soil Organic Sequestration Standard',
    category: 'soil_sequestration',
    standard: 'Gold Standard',
    version: 'v2.0',
    status: 'active',
    summary: 'Standardized Tier 2 soil carbon accounting using climate-soil-tillage-input interaction factors.',
    applicability: ['Broadacre grain and pulse farms in temperate and tropical climate zones'],
    baselineModel: 'IPCC default steady-state carbon reference stocks for native soil types',
    projectModel: 'Factor-based response multipliers (F_LU, F_MG, F_I) applied over 20-year transition',
    leakageFormula: 'Conservation agriculture zero-leakage guideline',
    permanenceBufferPct: 15,
    measurementFrequency: 'annual',
    defaultEquation: 'Delta_C_SOC = (SOC_REF * F_LU * F_MG * F_I - SOC_Baseline) / 20 * 3.667',
    parameters: [
      { name: 'Reference Carbon Stock', key: 'soc_ref', unit: 'tC/ha', description: 'Regional reference soil carbon stock' },
    ],
    coBenefits: ['Global Standard Compatibility', 'Low Audit Cost for Farmers'],
  },

  // ── Category 3: Renewable Energy Generation & Supply ──────────────────────
  {
    id: 'ACM0002',
    code: 'ACM0002',
    name: 'Grid-Connected Electricity Generation from Renewable Sources',
    category: 'renewable_energy',
    standard: 'UN CDM',
    version: 'v21.0',
    status: 'active',
    summary: 'Flagship standard for large-scale grid-connected wind, solar PV, geothermal, and run-of-river hydro power installations.',
    applicability: ['New grid-connected renewable power plants', 'Supplying electricity to an identified electricity grid'],
    baselineModel: 'Combined Margin (CM) grid emission factor: weighted Build Margin (BM) + Operating Margin (OM)',
    projectModel: 'Zero emissions for solar/wind; minor geothermal steam emissions or hydro reservoir emissions',
    leakageFormula: 'No significant leakage emissions for solar and wind generation',
    permanenceBufferPct: 0,
    measurementFrequency: 'continuous / monthly',
    defaultEquation: 'ER_y = EG_facility_y * EF_grid_CM_y - PE_y',
    parameters: [
      { name: 'Net Electricity Delivered', key: 'eg_delivered_mwh', unit: 'MWh/yr', description: 'Calibrated billing meter electricity fed into grid' },
      { name: 'Grid Combined Margin Factor', key: 'ef_grid', unit: 'tCO2/MWh', description: 'Combined Operating Margin + Build Margin factor', defaultValue: 0.65 },
    ],
    coBenefits: ['Fossil Fuel Displaced', 'Clean Air (Zero NOx/SOx)', 'Local Green Industrial Jobs'],
  },
  {
    id: 'AMS-I.D',
    code: 'AMS-I.D',
    name: 'Grid-Connected Renewable Electricity Generation (Small-scale)',
    category: 'renewable_energy',
    standard: 'UN CDM',
    version: 'v18.0',
    status: 'active',
    summary: 'Small-scale renewable projects with capacity up to 15 MW (rooftop solar, community wind, mini-hydro).',
    applicability: ['Installed renewable electrical capacity ≤ 15 MW', 'Grid-tied installations'],
    baselineModel: 'Simplified regional OM/BM grid emissions factor',
    projectModel: 'Revenue-grade bidirectional electricity meter logging',
    leakageFormula: 'Exempt under CDM small-scale rules',
    permanenceBufferPct: 0,
    measurementFrequency: 'monthly',
    defaultEquation: 'ER = Power_Generated_MWh * Regional_Grid_Factor',
    parameters: [
      { name: 'System Capacity', key: 'capacity_mw', unit: 'MW', description: 'Peak rated AC power output' },
      { name: 'Capacity Factor', key: 'capacity_factor', unit: '%', description: 'Annual operational capacity factor', defaultValue: 28 },
    ],
    coBenefits: ['Decentralized Energy Grid', 'Grid Stability in Remote Areas'],
  },
  {
    id: 'AMS-I.A',
    code: 'AMS-I.A',
    name: 'Electricity Generation by the User (Off-Grid Solar / Microgrids)',
    category: 'renewable_energy',
    standard: 'UN CDM',
    version: 'v17.0',
    status: 'active',
    summary: 'Off-grid solar home systems, micro-utilities, and solar lanterns replacing kerosene lamps and diesel generators.',
    applicability: ['Off-grid rural households and commercial facilities', 'Displacement of fossil-based fuel/lighting'],
    baselineModel: 'Fuel consumption of kerosene lanterns and small diesel gensets (e.g. 0.8 kg CO2/kWh)',
    projectModel: 'Solar PV + battery storage systems with automated smart meter telematics',
    leakageFormula: 'Zero leakage for isolated consumer systems',
    permanenceBufferPct: 0,
    measurementFrequency: 'annual',
    defaultEquation: 'ER = Number_Of_Systems * Default_Fossil_Displacement_Constant',
    parameters: [
      { name: 'Installed Solar Systems', key: 'systems_count', unit: 'units', description: 'Number of active rural solar installations' },
    ],
    coBenefits: ['Elimination of Toxic Indoor Kerosene Smoke', 'Children Evening Study Time', 'Productive Use of Energy'],
  },
  {
    id: 'GS-RES',
    code: 'GS-RES',
    name: 'Gold Standard for Renewable Energy Supply',
    category: 'renewable_energy',
    standard: 'Gold Standard',
    version: 'v2.2',
    status: 'active',
    summary: 'Renewable energy projects meeting stringent additionality, local stakeholder consultation, and sustainable development metrics.',
    applicability: ['Wind, solar, hydro, geothermal in emerging economies', 'Demonstrated financial additionality without carbon credits'],
    baselineModel: 'Country-specific UNFCCC standardized grid baselines',
    projectModel: 'Audited gross generation minus auxiliary transmission line losses',
    leakageFormula: 'Lifecycle upstream emissions evaluated for equipment construction',
    permanenceBufferPct: 0,
    measurementFrequency: 'annual',
    defaultEquation: 'GS_RE = Net_Generation_MWh * Grid_Emissions_Factor - Parasitic_Power_GHG',
    parameters: [
      { name: 'Clean Generation', key: 'gen_mwh', unit: 'MWh', description: 'Net metered generation supplied to consumers' },
    ],
    coBenefits: ['SDG 7 Affordable and Clean Energy', 'SDG 8 Decent Work', 'SDG 13 Climate Action'],
  },
  {
    id: 'ACM0006',
    code: 'ACM0006',
    name: 'Electricity and Heat Generation from Biomass Residues',
    category: 'renewable_energy',
    standard: 'UN CDM',
    version: 'v14.0',
    status: 'active',
    summary: 'Combustion or gasification of agricultural biomass residues (bagasse, rice husks, coffee pulp) for power and process steam.',
    applicability: ['Sustainably harvested agricultural and forestry residues', 'Displacing coal, fuel oil, or grid electricity'],
    baselineModel: 'Fossil fuel combustion in boilers or uncontrolled dumping/decay of biomass residues',
    projectModel: 'High-efficiency cogeneration boiler plant with flue gas scrubbing',
    leakageFormula: 'Biomass diversion leakage from existing alternative user markets',
    permanenceBufferPct: 0,
    measurementFrequency: 'monthly',
    defaultEquation: 'ER = Fossil_Displacement_Heat_Power - Biomass_Processing_Transport_Emissions',
    parameters: [
      { name: 'Biomass Residue Consumed', key: 'biomass_tonnes', unit: 'tonnes', description: 'Dry tonnes of agricultural residue combusted' },
    ],
    coBenefits: ['Circular Agro-Economy', 'Zero Coal Boiler Operation', 'Ash Byproduct Fertilizer'],
  },
  {
    id: 'AMS-I.C',
    code: 'AMS-I.C',
    name: 'Thermal Energy Production with or without Electricity',
    category: 'renewable_energy',
    standard: 'UN CDM',
    version: 'v22.0',
    status: 'active',
    summary: 'Solar water heaters, biomass thermal boilers, and geothermal district heating replacing fossil fuel heating.',
    applicability: ['Solar thermal panels for commercial/domestic water heating', 'District geothermal heat loops'],
    baselineModel: 'Diesel, gas, or coal combustion in existing hot water / steam boilers',
    projectModel: 'Calibrated thermal Btu meters measuring net heat delivered to load',
    leakageFormula: 'Equipment manufacturing and transport fuel',
    permanenceBufferPct: 0,
    measurementFrequency: 'continuous',
    defaultEquation: 'ER = Net_Thermal_Energy_GJ * Fossil_Fuel_Carbon_Intensity_Factor',
    parameters: [
      { name: 'Thermal Energy Produced', key: 'thermal_gj', unit: 'GJ', description: 'Gigajoules of verified heat delivered' },
    ],
    coBenefits: ['Industrial Decarbonization', 'Reduced Operating Costs for Hospitals and Schools'],
  },
  {
    id: 'VM0005',
    code: 'VM0005',
    name: 'Conversion of High-Bleed Pneumatics to Solar Power',
    category: 'renewable_energy',
    standard: 'Verra (VCS)',
    version: 'v1.2',
    status: 'active',
    summary: 'Replacing methane-venting gas pneumatics on remote wells with solar-powered electric instrument compressors.',
    applicability: ['Natural gas production sites and pipeline gathering stations', 'Remote off-grid pneumatic valves'],
    baselineModel: 'Continuous venting of pressurized methane to actuate mechanical valves',
    projectModel: 'Solar PV panel array + battery pack driving zero-emission electric actuators',
    leakageFormula: 'Zero leakage emissions',
    permanenceBufferPct: 0,
    measurementFrequency: 'annual',
    defaultEquation: 'ER = Vented_Volume_CH4_Saved * GWP_Methane_28',
    parameters: [
      { name: 'Actuators Converted', key: 'valve_count', unit: 'valves', description: 'Number of pneumatic valves converted to solar' },
    ],
    coBenefits: ['Zero Fugitive Methane Leaks', 'Clean Solar Powered Automation'],
  },
  {
    id: 'CAR-RE-MEX',
    code: 'CAR-RE-MEX',
    name: 'Climate Action Reserve Mexico Renewable Energy Protocol',
    category: 'renewable_energy',
    standard: 'Climate Action Reserve',
    version: 'v1.0',
    status: 'active',
    summary: 'Accounting for wind and solar additions to the Mexican National Electric System (SEN).',
    applicability: ['Utility scale renewables in Mexico', 'Connection to the SEN national grid'],
    baselineModel: 'Mexican national build-margin and operating-margin emission factors',
    projectModel: 'CENACE-certified settlement meter recordings',
    leakageFormula: 'Zero leakage for SEN interconnection',
    permanenceBufferPct: 0,
    measurementFrequency: 'monthly',
    defaultEquation: 'Credits = SEN_Metered_Generation_MWh * Factor_SEN_tCO2_MWh',
    parameters: [
      { name: 'Generation Delivered', key: 'gen_mwh', unit: 'MWh', description: 'Total verified renewable output' },
    ],
    coBenefits: ['Reduced Heavy Fuel Oil Combustion in Mexican Power Plants'],
  },
  {
    id: 'AMS-I.F',
    code: 'AMS-I.F',
    name: 'Renewable Electricity Generation for Captive Use and Mini-grids',
    category: 'renewable_energy',
    standard: 'UN CDM',
    version: 'v5.0',
    status: 'active',
    summary: 'Commercial & Industrial (C&I) on-site solar systems displacing diesel generator consumption.',
    applicability: ['Factories, mines, hospitals, and schools running on captive diesel gensets'],
    baselineModel: 'Diesel generator specific fuel consumption (0.33 liters/kWh = 0.9 kg CO2/kWh)',
    projectModel: 'Automated solar inverter generation logging',
    leakageFormula: 'Exempt',
    permanenceBufferPct: 0,
    measurementFrequency: 'monthly',
    defaultEquation: 'ER = Solar_Captive_kWh * Diesel_Factor_0.9 - Auxiliary_Losses',
    parameters: [
      { name: 'Captive Solar kWh', key: 'captive_kwh', unit: 'kWh', description: 'Solar electricity directly consumed on-site' },
    ],
    coBenefits: ['Resilient Power Supply', 'Diesel Smog Reduction'],
  },
  {
    id: 'ACR-RENEW',
    code: 'ACR-RENEW',
    name: 'American Carbon Registry Protocol for Grid Renewable Generation',
    category: 'renewable_energy',
    standard: 'American Carbon Registry',
    version: 'v2.0',
    status: 'active',
    summary: 'Renewable energy deployment in sub-regional grid markets displacing peak thermal units.',
    applicability: ['Independent power producer solar and offshore wind farms'],
    baselineModel: 'eGRID subregional marginal emissions displacement factors',
    projectModel: 'Interconnection revenue meter logs',
    leakageFormula: 'Zero leakage',
    permanenceBufferPct: 0,
    measurementFrequency: 'continuous',
    defaultEquation: 'Credits = eGRID_Subregion_Factor * MWh_Generation',
    parameters: [
      { name: 'Renewable Power', key: 'mwh_gen', unit: 'MWh', description: 'Grid supplied power' },
    ],
    coBenefits: ['Offshore Wind Innovation', 'Subregional Peaker Plant Shutdowns'],
  },
  {
    id: 'GS-MINI-HYDRO',
    code: 'GS-MINI-HYDRO',
    name: 'Gold Standard Run-of-River Hydroelectric Generation',
    category: 'renewable_energy',
    standard: 'Gold Standard',
    version: 'v1.4',
    status: 'active',
    summary: 'Ecologically friendly run-of-river mini-hydro plants without significant damming or water inundation.',
    applicability: ['Run-of-river turbines with zero or negligible reservoir area (< 1 ha/MW)'],
    baselineModel: 'Fossil-dominated regional power pool',
    projectModel: 'Penstock and turbine electrical output meters with fish passage monitors',
    leakageFormula: 'Zero reservoir biomass degradation',
    permanenceBufferPct: 0,
    measurementFrequency: 'monthly',
    defaultEquation: 'ER = Hydro_Generation_MWh * Pool_Emissions_Factor',
    parameters: [
      { name: 'Hydro Output', key: 'hydro_mwh', unit: 'MWh', description: 'Net green electricity generated' },
    ],
    coBenefits: ['River Fish Ladder Protection', 'Base-load Clean Electricity'],
  },

  // ── Category 4: Methane Reduction, Capture & Destruction ────────────────────
  {
    id: 'ACM0010',
    code: 'ACM0010',
    name: 'GHG Emission Reductions from Animal Manure Management Systems',
    category: 'methane_reduction',
    standard: 'UN CDM',
    version: 'v9.0',
    status: 'active',
    summary: 'Anaerobic digesters on commercial dairy and swine operations capturing biogas and flaring or generating power.',
    applicability: ['Confined animal feeding operations (dairy, swine, feedlots)', 'Manure stored in deep anaerobic lagoons in baseline'],
    baselineModel: 'Anaerobic lagoon methane production model based on volatile solids (VS) excretion and temperature',
    projectModel: 'Covered lagoon or sealed CSTR anaerobic digester with continuous methane flow and temperature metering',
    leakageFormula: 'Land application of digested effluent digestate N2O tracking',
    permanenceBufferPct: 0,
    measurementFrequency: 'continuous',
    defaultEquation: 'ER = Biogas_Volume * CH4_Concentration * Density_CH4 * GWP_28 - Digester_Parasitic_GHG',
    parameters: [
      { name: 'Methane Captured', key: 'ch4_kg', unit: 'kg CH4', description: 'Metred methane flow to flare or engine' },
      { name: 'Flare Destruction Efficiency', key: 'flare_eff', unit: '%', description: 'Audited flare destruction efficiency', defaultValue: 99.5 },
    ],
    coBenefits: ['Odor Elimination', 'Pathogen Destruction', 'Organic Liquid Fertilizer (Digestate)'],
  },
  {
    id: 'AMS-III.D',
    code: 'AMS-III.D',
    name: 'Methane Recovery in Animal Manure Management (Small-scale)',
    category: 'methane_reduction',
    standard: 'UN CDM',
    version: 'v21.0',
    status: 'active',
    summary: 'Small-scale biodigesters for smallholder cattle and pig farmers providing clean cooking biogas.',
    applicability: ['Rural farms with 2-50 head of livestock', 'Fixed dome or tubular continuous digesters'],
    baselineModel: 'Uncovered slurry pit releasing methane; household cooking with wood',
    projectModel: 'Biogas piped to household stoves; slurry used as rich bio-slurry fertilizer',
    leakageFormula: 'Exempt',
    permanenceBufferPct: 0,
    measurementFrequency: 'annual sample surveys',
    defaultEquation: 'ER = Animal_Heads * Default_CH4_Production_Factor * GWP_28',
    parameters: [
      { name: 'Livestock Count', key: 'animal_count', unit: 'head', description: 'Number of cows/pigs whose manure enters digester' },
    ],
    coBenefits: ['Clean Cooking Fuel', 'Women Relieved from Firewood Collection', 'Chemical Fertilizer Free Farming'],
  },
  {
    id: 'ACM0001',
    code: 'ACM0001',
    name: 'Flaring or Use of Landfill Gas',
    category: 'methane_reduction',
    standard: 'UN CDM',
    version: 'v19.0',
    status: 'active',
    summary: 'Extraction wells, vacuum blowers, and high-efficiency enclosed flares capturing and combusting municipal solid waste landfill methane.',
    applicability: ['Municipal solid waste landfill sites with decomposing organic waste'],
    baselineModel: 'Atmospheric venting of landfill methane through soil cap',
    projectModel: 'Extracted gas volume flow meters and continuous gas chromatograph / infrared CH4 analyzers',
    leakageFormula: 'Electricity used by vacuum extraction blowers',
    permanenceBufferPct: 0,
    measurementFrequency: 'continuous',
    defaultEquation: 'ER = Flow_Rate_Nm3 * CH4_Fraction * Density_CH4 * GWP_28 * Flare_Efficiency - Blower_Emissions',
    parameters: [
      { name: 'Landfill Gas Captured', key: 'lfg_nm3', unit: 'Nm3/yr', description: 'Normal cubic meters of landfill gas captured' },
      { name: 'Methane Content', key: 'ch4_pct', unit: '%', description: 'Methane percentage in captured gas', defaultValue: 52 },
    ],
    coBenefits: ['Landfill Fire & Explosion Prevention', 'Groundwater Leachate Control', 'Elimination of Nuisance Odor'],
  },
  {
    id: 'AMS-III.G',
    code: 'AMS-III.G',
    name: 'Landfill Methane Recovery (Small-scale)',
    category: 'methane_reduction',
    standard: 'UN CDM',
    version: 'v10.0',
    status: 'active',
    summary: 'Small-scale landfill gas recovery schemes producing electricity or feeding industrial boilers.',
    applicability: ['Small municipal landfills emitting < 60,000 tCO2e/yr'],
    baselineModel: 'Uncontrolled atmospheric venting',
    projectModel: 'Passive or low-draw extraction piping into enclosed utility flares',
    leakageFormula: 'Zero',
    permanenceBufferPct: 0,
    measurementFrequency: 'monthly',
    defaultEquation: 'ER = Total_CH4_Destroyed_t * GWP_28',
    parameters: [
      { name: 'Methane Combusted', key: 'ch4_tonnes', unit: 't CH4', description: 'Metric tonnes of methane destroyed' },
    ],
    coBenefits: ['Municipal Safety Improvement', 'Air Quality Enhancement'],
  },
  {
    id: 'VM0041',
    code: 'VM0041',
    name: 'Reduction of Methane Emissions in Rice Cultivation (AWD)',
    category: 'methane_reduction',
    standard: 'Verra (VCS)',
    version: 'v2.0',
    status: 'active',
    summary: 'Alternate Wetting and Drying (AWD) water management in paddy rice fields, halting anaerobic methanogenesis.',
    applicability: ['Irrigated paddy rice production in Asia and Americas'],
    baselineModel: 'Continuous flooding throughout growing season cultivating anaerobic methanogenic archaea',
    projectModel: 'Field water tube sensors letting water drop to 15cm below soil surface before re-flooding, aerating soil',
    leakageFormula: 'Upstream pumping fuel adjustments',
    permanenceBufferPct: 0,
    measurementFrequency: 'seasonal / annual',
    defaultEquation: 'ER = Rice_Area_ha * (Continuous_Flooding_CH4 - AWD_CH4) * GWP_28 - N2O_Tradeoff',
    parameters: [
      { name: 'AWD Rice Field Area', key: 'rice_ha', unit: 'ha', description: 'Paddy area switched to alternate wetting and drying' },
      { name: 'Baseline Methane Rate', key: 'bsl_ch4_rate', unit: 'kg CH4/ha/day', description: 'Default IPCC flooded rice factor', defaultValue: 1.3 },
    ],
    coBenefits: ['30% Irrigation Water Conserved', 'Increased Rice Stalk Strength', 'Farmer Fuel Cost Savings'],
  },
  {
    id: 'AMS-III.E',
    code: 'AMS-III.E',
    name: 'Avoidance of Methane from Biomass Decay Through Controlled Use',
    category: 'methane_reduction',
    standard: 'UN CDM',
    version: 'v16.0',
    status: 'active',
    summary: 'Collecting decaying organic wastes (palm oil mill effluent, distillery vinasse) and treating them in aerobic bio-reactors.',
    applicability: ['Industrial agro-processing facilities with deep anaerobic waste effluent ponds'],
    baselineModel: 'Deep open effluent ponds emitting vast bubbles of methane into air',
    projectModel: 'Closed digester lagoons with high-temperature flares or biogas generators',
    leakageFormula: 'Residue transportation emissions',
    permanenceBufferPct: 0,
    measurementFrequency: 'continuous',
    defaultEquation: 'ER = COD_Treated * Max_CH4_Capacity_B0 * MCF_Lagoon * GWP_28',
    parameters: [
      { name: 'Chemical Oxygen Demand (COD)', key: 'cod_tonnes', unit: 't COD', description: 'Total biological organic load treated' },
    ],
    coBenefits: ['River Water Pollution Clean-up', 'Industrial Green Power'],
  },
  {
    id: 'CAR-LIVESTOCK',
    code: 'CAR-LIVESTOCK',
    name: 'Climate Action Reserve US Livestock Project Protocol',
    category: 'methane_reduction',
    standard: 'Climate Action Reserve',
    version: 'v4.0',
    status: 'active',
    summary: 'Standardized biogas capture and destruction protocol for commercial dairies and swine producers across North America.',
    applicability: ['Commercial livestock farms in the United States'],
    baselineModel: 'State-specific regulatory baseline and lagoon depth methane modeling',
    projectModel: 'Certified Coriolis mass flow meters, automated shutoff valves, and thermal oxidizers',
    leakageFormula: 'Digestate storage tank venting monitoring',
    permanenceBufferPct: 0,
    measurementFrequency: 'continuous 15-minute data logging',
    defaultEquation: 'Credits = Mass_CH4_Destroyed * 28 - Project_Pumping_Emissions',
    parameters: [
      { name: 'Mass Methane Burned', key: 'mass_ch4_kg', unit: 'kg', description: 'Certified mass flow destroyed' },
    ],
    coBenefits: ['Compliance with State Clean Water Acts', 'Nutrient Runoff Management'],
  },
  {
    id: 'CAR-CMM',
    code: 'CAR-CMM',
    name: 'Coal Mine Methane Project Protocol',
    category: 'methane_reduction',
    standard: 'Climate Action Reserve',
    version: 'v2.1',
    status: 'active',
    summary: 'Capturing and destroying fugitive methane vented from active underground and abandoned coal mines.',
    applicability: ['Underground coal mining degasification wells and drainage boreholes'],
    baselineModel: 'Atmospheric venting of high-purity coal seam methane gas',
    projectModel: 'Extraction skids, pipeline injection, thermal oxidation, or flare combustion',
    leakageFormula: 'Compressor station parasitic electric loads',
    permanenceBufferPct: 0,
    measurementFrequency: 'continuous',
    defaultEquation: 'ER = Coal_Methane_Flow * Concentration * GWP_28 - Auxiliary_Energy_GHG',
    parameters: [
      { name: 'CMM Volume', key: 'cmm_mcf', unit: 'MCF', description: 'Thousand cubic feet of drained mine gas' },
    ],
    coBenefits: ['Worker Underground Mine Safety', 'Elimination of Super-pollutant Point Sources'],
  },
  {
    id: 'GS-METHANE-LIVESTOCK',
    code: 'GS-METHANE-LIVESTOCK',
    name: 'Gold Standard Methane Capture and Sustainable Agro-Energy',
    category: 'methane_reduction',
    standard: 'Gold Standard',
    version: 'v1.1',
    status: 'active',
    summary: 'Capturing livestock manure methane with strict community benefit sharing and organic bio-fertilizer distribution.',
    applicability: ['Community pastoralist and cooperative livestock farming'],
    baselineModel: 'Open unmanaged manure dumps emitting methane and contaminating local wells',
    projectModel: 'Biogas capture creating clean cooking fuel and pasteurized organic fertilizer',
    leakageFormula: 'Zero leakage',
    permanenceBufferPct: 0,
    measurementFrequency: 'annual',
    defaultEquation: 'Credits = CH4_Combusted_t * 28 - Auxiliary_Emissions',
    parameters: [
      { name: 'Captured Methane', key: 'ch4_tonnes', unit: 't CH4', description: 'Methane destroyed' },
    ],
    coBenefits: ['Protection of Village Well Water', 'SDG 6 Clean Water & Sanitation'],
  },
  {
    id: 'VM0037',
    code: 'VM0037',
    name: 'Fugitive Methane Leak Abatement in Natural Gas Gathering Systems',
    category: 'methane_reduction',
    standard: 'Verra (VCS)',
    version: 'v1.0',
    status: 'active',
    summary: 'Comprehensive Optical Gas Imaging (OGI) and acoustic leak detection and immediate repair (LDAR) across gas infrastructure.',
    applicability: ['Natural gas pipeline gathering networks, compressor stations, and well pads'],
    baselineModel: 'Historical unmitigated fugitive leak duration and venting rates',
    projectModel: 'Quarterly FLIR thermal camera scanning and Hi-Flow Sampler direct measurement with 48h repair mandates',
    leakageFormula: 'Zero leakage',
    permanenceBufferPct: 0,
    measurementFrequency: 'quarterly',
    defaultEquation: 'ER = Sum(Measured_Leak_Rate * Days_Early_Repaired) * Density * GWP_28',
    parameters: [
      { name: 'Leaks Repaired', key: 'leaks_count', unit: 'leaks', description: 'Number of active fugitive pipeline leaks sealed' },
      { name: 'Average Measured Rate', key: 'avg_leak_scfm', unit: 'scfm', description: 'Mean standard cubic feet per minute measured' },
    ],
    coBenefits: ['Energy Loss Prevention', 'Local Benzene and VOC Smog Reduction'],
  },
  {
    id: 'AMS-III.H',
    code: 'AMS-III.H',
    name: 'Methane Recovery in Wastewater Treatment',
    category: 'methane_reduction',
    standard: 'UN CDM',
    version: 'v17.0',
    status: 'active',
    summary: 'Covering open municipal and industrial wastewater sewage treatment lagoons to capture and combust sewer methane.',
    applicability: ['Municipal sewage and food processing wastewater treatment plants'],
    baselineModel: 'Open anaerobic septic sludge lagoons',
    projectModel: 'Geomembrane high-density polyethylene (HDPE) lagoon covers and biogas flare',
    leakageFormula: 'Effluent dissolved methane testing',
    permanenceBufferPct: 0,
    measurementFrequency: 'monthly',
    defaultEquation: 'ER = COD_Removed_Anaerobic * Bo * MCF * GWP_28 - Sludge_Treatment_GHG',
    parameters: [
      { name: 'Sewage COD Treated', key: 'sewage_cod', unit: 't COD', description: 'Tons of chemical oxygen demand removed' },
    ],
    coBenefits: ['Eradication of Mosquito Breeding Lagoons', 'Odorless City Sewage'],
  },

  // ── Category 5: Energy Efficiency, Clean Cooking & Demand-side Management ───
  {
    id: 'AMS-II.G',
    code: 'AMS-II.G',
    name: 'Energy Efficiency Measures in Thermal Applications of Non-Renewable Biomass',
    category: 'energy_efficiency',
    standard: 'UN CDM',
    version: 'v13.0',
    status: 'active',
    summary: 'Distribution of high-efficiency fuel-efficient biomass cookstoves replacing open 3-stone fires in developing nations.',
    applicability: ['Households relying on non-renewable wood or charcoal for domestic cooking'],
    baselineModel: 'Three-stone open wood fire thermal efficiency (10%) and non-renewable biomass fraction (fNRB)',
    projectModel: 'Tier 3/4 clean cookstoves with thermal efficiency ≥ 35% with smart thermal sensor logging',
    leakageFormula: 'Use of old baseline stove (stove stacking) discounted via Kitchen Performance Tests (KPT)',
    permanenceBufferPct: 0,
    measurementFrequency: 'annual survey + sensor audits',
    defaultEquation: 'ER = Stoves_Active * Wood_Baseline_kg * fNRB * NCV_biomass * EF_wood * (1 - Eff_BSL / Eff_PROJ) - Leakage',
    parameters: [
      { name: 'Active Cookstoves', key: 'stoves_count', unit: 'stoves', description: 'Number of audited operational stoves' },
      { name: 'Fraction of Non-Renewable Biomass (fNRB)', key: 'fnrb', unit: 'fraction', description: 'Fraction of wood sourced from depleted forests', defaultValue: 0.85 },
      { name: 'Efficiency of Improved Stove', key: 'eff_proj', unit: '%', description: 'Thermal efficiency of improved stove', defaultValue: 38 },
    ],
    coBenefits: ['Prevented Chronic Respiratory Illness in Women & Children', 'Saved Deforestation', 'Halt of Soot & Black Carbon'],
  },
  {
    id: 'GS-TPDDTEC',
    code: 'GS-TPDDTEC',
    name: 'Gold Standard Clean Cooking and Drinking Water Solutions',
    category: 'energy_efficiency',
    standard: 'Gold Standard',
    version: 'v3.1',
    status: 'active',
    summary: 'Gold Standard protocol for advanced cookstoves, water filtration systems, and institutional kitchens with strict fNRB verification.',
    applicability: ['Community households and schools using traditional biomass for boiling water and cooking'],
    baselineModel: 'Wood gathering surveys, boiling water consumption logs, regional fNRB default caps',
    projectModel: 'Distributed water purifiers (gravity filter/chlorination) and advanced rocket/gasifier stoves',
    leakageFormula: 'Discount for residual wood consumption verified by physical kitchen audits',
    permanenceBufferPct: 0,
    measurementFrequency: 'annual',
    defaultEquation: 'GS_Credits = Clean_Water_Liters * Wood_Boiling_Factor * fNRB * 0.9 - Distribution_Footprint',
    parameters: [
      { name: 'Clean Liters Purified', key: 'purified_liters', unit: 'liters/yr', description: 'Liters of safe drinking water provided without boiling' },
    ],
    coBenefits: ['Zero Water-Borne Typhoid & Cholera', 'Saved Fuel Expenditure', 'Empowered Rural Women'],
  },
  {
    id: 'AMS-II.C',
    code: 'AMS-II.C',
    name: 'Demand-Side Energy Efficiency Activities for Specific Technologies',
    category: 'energy_efficiency',
    standard: 'UN CDM',
    version: 'v15.0',
    status: 'active',
    summary: 'Replacing inefficient electric equipment (industrial pumps, AC chillers, electric motors) with high-efficiency variable speed drives.',
    applicability: ['Industrial facilities, commercial buildings, water pumping stations'],
    baselineModel: 'Low-efficiency single-speed equipment energy consumption curve',
    projectModel: 'High-efficiency motor/compressor fitted with digital power loggers (kWh)',
    leakageFormula: 'Scrapping and decommissioning verification of old inefficient units to prevent rebound leakage',
    permanenceBufferPct: 0,
    measurementFrequency: 'continuous metered',
    defaultEquation: 'ER = (kWh_BSL - kWh_PROJ) * EF_Grid_tCO2_kWh',
    parameters: [
      { name: 'Energy Saved', key: 'energy_saved_kwh', unit: 'kWh/yr', description: 'Measured kilowatt-hour savings' },
      { name: 'Grid Emission Factor', key: 'grid_factor', unit: 'kg CO2/kWh', description: 'Grid emission intensity', defaultValue: 0.58 },
    ],
    coBenefits: ['Lower Electricity Bills for Industry', 'Relieved Peak Grid Stress'],
  },
  {
    id: 'AMS-II.J',
    code: 'AMS-II.J',
    name: 'Demand-Side Activities for Efficient Lighting Technologies',
    category: 'energy_efficiency',
    standard: 'UN CDM',
    version: 'v7.0',
    status: 'active',
    summary: 'Large-scale municipal and domestic rollout of solid-state LED fixtures replacing incandescent bulbs and fluorescent tubes.',
    applicability: ['Residential and municipal street lighting retrofits'],
    baselineModel: '60W-100W incandescent lamp operational hours (typically 3.5 hrs/day residential, 11 hrs/day street)',
    projectModel: '7W-9W high-lumen LED lamps distributed with old lamp collection exchange',
    leakageFormula: 'Compulsory crushing and destruction of exchanged incandescent lamps prevents leakage',
    permanenceBufferPct: 0,
    measurementFrequency: 'annual survivability audits',
    defaultEquation: 'ER = Number_Of_LEDs * (Wattage_BSL - Wattage_LED) * Daily_Hours * 365 / 1000 * EF_Grid',
    parameters: [
      { name: 'LEDs Installed', key: 'led_count', unit: 'bulbs', description: 'Audited operational LED units' },
    ],
    coBenefits: ['Reduced Mercury from Fluorescent Disposal', 'Better Night Urban Visibility'],
  },
  {
    id: 'VM0008',
    code: 'VM0008',
    name: 'Weatherization and Thermal Efficiency of Residential Buildings',
    category: 'energy_efficiency',
    standard: 'Verra (VCS)',
    version: 'v1.1',
    status: 'active',
    summary: 'Deep architectural thermal envelope retrofits: multi-pane argon glazing, exterior wall insulation, and blower-door air sealing.',
    applicability: ['Single-family and multi-family residential structures in cold/moderate climates'],
    baselineModel: 'Pre-retrofit calibrated utility billing gas/heating oil and electricity consumption',
    projectModel: 'Post-retrofit weather-normalized utility billing analysis (PRISM methodology)',
    leakageFormula: 'Comfort rebound temperature effect discount (10%)',
    permanenceBufferPct: 0,
    measurementFrequency: 'annual billing cycles',
    defaultEquation: 'ER = Weather_Normalized_Heating_Fuel_Saved * Fuel_Emission_Factor * 0.9',
    parameters: [
      { name: 'Homes Weatherized', key: 'homes_count', unit: 'homes', description: 'Number of insulated dwellings' },
    ],
    coBenefits: ['Winter Freeze Safety for Vulnerable Families', 'Reduced Heating Costs'],
  },
  {
    id: 'AM0020',
    code: 'AM0020',
    name: 'Baseline Methodology for Water Pumping Efficiency in Agricultural Canals',
    category: 'energy_efficiency',
    standard: 'UN CDM',
    version: 'v2.0',
    status: 'active',
    summary: 'Replacement of old diesel and inefficient agricultural irrigation pumps with automated solar or high-efficiency variable-flow pumps.',
    applicability: ['Irrigation districts, farmers cooperatives, agricultural canal systems'],
    baselineModel: 'Old diesel centrifugal pumps operating at < 40% mechanical efficiency',
    projectModel: 'Modern submersible solar/electric pumps with smart flow telemetry',
    leakageFormula: 'Water volumetric quota enforcement to avoid rebound water exploitation',
    permanenceBufferPct: 0,
    measurementFrequency: 'seasonal',
    defaultEquation: 'ER = Diesel_Liters_Displaced * EF_Diesel_kgCO2_L / 1000',
    parameters: [
      { name: 'Diesel Saved', key: 'diesel_liters', unit: 'liters', description: 'Volume of fuel avoided' },
    ],
    coBenefits: ['Farmer Pumping Fuel Independence', 'Precision Irrigation Management'],
  },
  {
    id: 'CAR-COMM-HEAT',
    code: 'CAR-COMM-HEAT',
    name: 'Commercial Clean Heat and Heat Pump Conversion Protocol',
    category: 'energy_efficiency',
    standard: 'Climate Action Reserve',
    version: 'v1.0',
    status: 'active',
    summary: 'Conversion of fossil gas boilers in commercial complexes, hospitals, and universities to air-to-water heat pumps (COP ≥ 3.5).',
    applicability: ['Commercial and institutional hydronic space heating systems'],
    baselineModel: '80% efficiency natural gas boilers burning high volumes of methane',
    projectModel: 'Variable refrigerant flow (VRF) or central electric heat pump loops',
    leakageFormula: 'Refrigerant F-gas leakage monitoring and subtraction',
    permanenceBufferPct: 0,
    measurementFrequency: 'monthly',
    defaultEquation: 'Credits = Natural_Gas_Therms_Saved * 0.0053 tCO2/Therm - Grid_Electricity_HeatPump_GHG',
    parameters: [
      { name: 'Natural Gas Displaced', key: 'gas_therms', unit: 'therms', description: 'Therms of natural gas combustion eliminated' },
    ],
    coBenefits: ['Zero Boiler Chimney Emissions', 'Year-round Heating and Cooling Efficiency'],
  },
  {
    id: 'AMS-II.E',
    code: 'AMS-II.E',
    name: 'Energy Efficiency and Fuel Switching in Industrial Facilities',
    category: 'energy_efficiency',
    standard: 'UN CDM',
    version: 'v12.0',
    status: 'active',
    summary: 'Waste heat recovery systems, flue gas economizers, and steam trap maintenance in cement, steel, and chemical manufacturing.',
    applicability: ['Heavy manufacturing and processing plants with high-temperature exhaust stacks'],
    baselineModel: 'Venting high-grade thermal exhaust to atmosphere; running auxiliary fossil fuel steam boilers',
    projectModel: 'Organic Rankine Cycle (ORC) turbines and waste heat recovery steam generators (HRSG)',
    leakageFormula: 'Exempt',
    permanenceBufferPct: 0,
    measurementFrequency: 'continuous',
    defaultEquation: 'ER = Heat_Recovered_GJ * Baseline_Fuel_Intensity - Auxiliary_Fan_Power_GHG',
    parameters: [
      { name: 'Industrial Waste Heat Recovered', key: 'heat_recovered_gj', unit: 'GJ', description: 'Waste energy converted to useful work' },
    ],
    coBenefits: ['Industrial Competitiveness', 'Reduced Air Thermal Pollution'],
  },
  {
    id: 'VM0018',
    code: 'VM0018',
    name: 'Energy Efficiency and Low-Carbon District Heating Networks',
    category: 'energy_efficiency',
    standard: 'Verra (VCS)',
    version: 'v1.0',
    status: 'active',
    summary: 'Modernization of municipal district heating networks: pipe thermal insulation, smart substations, and geothermal integration.',
    applicability: ['Urban municipal district heating pipe networks'],
    baselineModel: 'High distribution thermal loss (25-35%) and coal-fired peak boiler operation',
    projectModel: 'Polyurethane pre-insulated twin pipes and automated hydraulic balancing valves',
    leakageFormula: 'Zero leakage',
    permanenceBufferPct: 0,
    measurementFrequency: 'annual heating season',
    defaultEquation: 'ER = Thermal_Losses_Avoided_MWh * Fuel_Carbon_Factor',
    parameters: [
      { name: 'Thermal Distribution Loss Reduced', key: 'thermal_mwh_saved', unit: 'MWh', description: 'Avoided pipeline heat dissipation' },
    ],
    coBenefits: ['Warm Urban Homes', 'Reduced City Smog Inversion'],
  },
  {
    id: 'VM0019',
    code: 'VM0019',
    name: 'Fleet Vehicle Fuel Efficiency and Low-Rolling-Resistance Retrofits',
    category: 'energy_efficiency',
    standard: 'Verra (VCS)',
    version: 'v1.0',
    status: 'active',
    summary: 'Commercial truck fleet aerodynamic side skirts, low-rolling-resistance tires, automated tire inflation, and telematics eco-driving.',
    applicability: ['Long-haul class 8 heavy-duty commercial truck fleets'],
    baselineModel: 'Standard tractor-trailer diesel consumption (e.g. 6.5 miles per gallon)',
    projectModel: 'EPA SmartWay verified aerodynamic fairings and real-time CAN-bus telematics fuel tracking',
    leakageFormula: 'Route shift and vehicle re-assignment checks',
    permanenceBufferPct: 0,
    measurementFrequency: 'monthly telematics',
    defaultEquation: 'ER = Diesel_Gallons_Saved * 0.01021 tCO2/Gallon',
    parameters: [
      { name: 'Fleet Diesel Saved', key: 'diesel_gallons', unit: 'gallons', description: 'Gallons of diesel saved via aerodynamic efficiency' },
    ],
    coBenefits: ['Reduced Highway Particulate Matter PM2.5', 'Logistics Freight Savings'],
  },
  {
    id: 'GS-ELEC-BUS',
    code: 'GS-ELEC-BUS',
    name: 'Gold Standard Clean Public Transportation and Electric Bus Deployment',
    category: 'energy_efficiency',
    standard: 'Gold Standard',
    version: 'v1.0',
    status: 'active',
    summary: 'Replacing diesel municipal bus transit lines with battery-electric buses powered by dedicated renewable charging depots.',
    applicability: ['Urban municipal public transit agencies replacing diesel bus fleets'],
    baselineModel: 'Legacy Euro III/IV diesel buses consuming 45 liters diesel/100 km',
    projectModel: 'Direct telematics tracking of electric bus passenger kilometers and depot charging kWh',
    leakageFormula: 'Disposal tracking of retired diesel buses',
    permanenceBufferPct: 0,
    measurementFrequency: 'monthly',
    defaultEquation: 'ER = Diesel_Bus_Km * 1.2 kg CO2/km - Electric_Charging_kWh * EF_Grid',
    parameters: [
      { name: 'Electric Bus Distance', key: 'bus_km', unit: 'km', description: 'Zero-emission transit kilometers driven' },
    ],
    coBenefits: ['Zero Street Diesel Exhaust', 'Quiet Clean Urban Neighborhoods', 'Accessible Public Transit'],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Core Service API Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns all methodologies matching optional query filters
 */
export function listMethodologies(filters?: {
  category?: MethodologyCategory;
  standard?: CarbonStandard;
  status?: MethodologyStatus;
  search?: string;
  page?: number;
  limit?: number;
}): { methodologies: CarbonMethodology[]; total: number; page: number; totalPages: number } {
  let list = [...CARBON_METHODOLOGIES];

  if (filters?.category) {
    list = list.filter((m) => m.category === filters.category);
  }
  if (filters?.standard) {
    list = list.filter((m) => m.standard === filters.standard);
  }
  if (filters?.status) {
    list = list.filter((m) => m.status === filters.status);
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase().trim();
    list = list.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        m.code.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        m.summary.toLowerCase().includes(q) ||
        m.coBenefits.some((b) => b.toLowerCase().includes(q))
    );
  }

  const total = list.length;
  const page = Math.max(1, filters?.page || 1);
  const limit = Math.max(1, Math.min(100, filters?.limit || 20));
  const totalPages = Math.ceil(total / limit) || 1;
  const startIndex = (page - 1) * limit;

  return {
    methodologies: list.slice(startIndex, startIndex + limit),
    total,
    page,
    totalPages,
  };
}

/**
 * Retrieve a specific methodology by ID or Code
 */
export function getMethodologyById(idOrCode: string): CarbonMethodology | undefined {
  const norm = idOrCode.toLowerCase().trim();
  return CARBON_METHODOLOGIES.find(
    (m) => m.id.toLowerCase() === norm || m.code.toLowerCase() === norm
  );
}

/**
 * Calculate net carbon credits using standard formula for a given methodology
 */
export function calculateMethodologyCredits(
  methodologyId: string,
  input: CalculationInput
): CalculationResult {
  const methodology = getMethodologyById(methodologyId);
  if (!methodology) {
    throw new Error(`Methodology '${methodologyId}' not found in library`);
  }

  const { baselineEmissionsTonnes, projectEmissionsTonnes } = input;
  const leakageTonnes = input.leakageTonnes ?? 0;

  if (baselineEmissionsTonnes < 0 || projectEmissionsTonnes < 0) {
    throw new Error('Baseline and project emissions must be non-negative');
  }

  // Gross reduction before leakage
  const grossReductionTonnes = Math.max(0, baselineEmissionsTonnes - projectEmissionsTonnes);

  // Net before buffer pool
  const netAfterLeakage = Math.max(0, grossReductionTonnes - leakageTonnes);

  // Permanence buffer deduction for nature-based sequestration methods
  const bufferDeductionTonnes = Number(
    ((netAfterLeakage * methodology.permanenceBufferPct) / 100).toFixed(2)
  );

  const netCreditsIssuedTonnes = Number(
    Math.max(0, netAfterLeakage - bufferDeductionTonnes).toFixed(2)
  );

  return {
    methodologyId: methodology.id,
    grossReductionTonnes: Number(grossReductionTonnes.toFixed(2)),
    leakageTonnes: Number(leakageTonnes.toFixed(2)),
    bufferDeductionTonnes,
    netCreditsIssuedTonnes,
    effectivePermanenceBufferPct: methodology.permanenceBufferPct,
    calculatedAt: new Date().toISOString(),
    breakdown: {
      baselineEmissionsTonnes,
      projectEmissionsTonnes,
      leakageDeductionsTonnes: leakageTonnes,
      permanenceRiskBufferTonnes: bufferDeductionTonnes,
    },
  };
}

/**
 * Aggregates statistics across all 50+ methodologies
 */
export function getMethodologyLibraryStats() {
  const byCategory: Record<MethodologyCategory, number> = {
    reforestation: 0,
    soil_sequestration: 0,
    renewable_energy: 0,
    methane_reduction: 0,
    energy_efficiency: 0,
  };

  const byStandard: Record<string, number> = {};

  for (const m of CARBON_METHODOLOGIES) {
    byCategory[m.category] = (byCategory[m.category] || 0) + 1;
    byStandard[m.standard] = (byStandard[m.standard] || 0) + 1;
  }

  return {
    totalMethodologies: CARBON_METHODOLOGIES.length,
    byCategory,
    byStandard,
    categories: Object.keys(byCategory),
    standards: Object.keys(byStandard),
  };
}
