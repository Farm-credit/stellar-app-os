#![no_std]

//! Tree Genetics Contract — track species DNA markers for biodiversity metrics
//!
//! Closes #1098

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol, Vec};

const MAX_MARKERS: u32 = 20;
const MONOCULTURE_THRESHOLD_BPS: u32 = 5000;

#[contracttype]
#[derive(Clone, Debug)]
pub struct GeneticMarker {
    pub locus: Symbol,
    pub allele: Symbol,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct SpeciesGenetics {
    pub species: Symbol,
    pub markers: Vec<GeneticMarker>,
    pub genetic_diversity_score: u32,
    pub updated_at: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct PlantingRecord {
    pub region: Symbol,
    pub species: Symbol,
    pub tree_count: u32,
    pub planted_at: u64,
}

#[contract]
pub struct TreeGenetics;

#[contractimpl]
impl TreeGenetics {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic!("already initialized");
        }
        env.storage().instance().set(&symbol_short!("ADMIN"), &admin);
        env.storage().instance().set(&symbol_short!("SEQ"), &0u64);
    }

    pub fn register_genetics(env: Env, species: Symbol, markers: Vec<GeneticMarker>) {
        let admin: Address = env.storage().instance().get(&symbol_short!("ADMIN"))
            .expect("not initialized");
        admin.require_auth();

        if markers.len() == 0 {
            panic!("at least one marker required");
        }
        if markers.len() > MAX_MARKERS {
            panic!("too many markers");
        }

        let diversity = markers.len() as u32 * 100 / MAX_MARKERS;

        let record = SpeciesGenetics {
            species: species.clone(),
            markers,
            genetic_diversity_score: diversity,
            updated_at: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&Self::genetics_key(&env, &species), &record);
        env.storage().persistent().extend_ttl(&Self::genetics_key(&env, &species), 535_680, 535_680);

        env.events().publish(
            (symbol_short!("genetics"), symbol_short!("register")),
            (species, diversity),
        );
    }

    pub fn record_planting(
        env: Env,
        region: Symbol,
        species: Symbol,
        tree_count: u32,
    ) -> u64 {
        if tree_count == 0 {
            panic!("tree_count must be positive");
        }

        let id: u64 = env.storage().instance().get(&symbol_short!("SEQ")).unwrap_or(0) + 1;
        env.storage().instance().set(&symbol_short!("SEQ"), &id);

        let rec = PlantingRecord {
            region: region.clone(),
            species,
            tree_count,
            planted_at: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&Self::planting_key(&env, id), &rec);
        env.storage().persistent().extend_ttl(&Self::planting_key(&env, id), 535_680, 535_680);

        env.events().publish(
            (symbol_short!("plant"),),
            (id, region, rec.species, tree_count),
        );

        id
    }

    pub fn get_genetics(env: Env, species: Symbol) -> Option<SpeciesGenetics> {
        env.storage().persistent().get(&Self::genetics_key(&env, &species))
    }

    pub fn get_diversity_score(env: Env, species: Symbol) -> u32 {
        env.storage().persistent()
            .get::<_, SpeciesGenetics>(&Self::genetics_key(&env, &species))
            .map(|g| g.genetic_diversity_score)
            .unwrap_or(0)
    }

    pub fn calculate_biodiversity(env: Env, region: Symbol) -> u32 {
        let total: u64 = env.storage().instance().get(&symbol_short!("SEQ")).unwrap_or(0);
        let mut species_counts: Vec<(Symbol, u32)> = Vec::new(&env);
        let mut total_trees: u32 = 0;

        for id in 1..=total {
            if let Some(rec) = env.storage().persistent()
                .get::<_, PlantingRecord>(&Self::planting_key(&env, id))
            {
                if rec.region == region {
                    total_trees += rec.tree_count;
                    let mut found = false;
                    for i in 0..species_counts.len() {
                        let entry = species_counts.get(i).unwrap();
                        if entry.0 == rec.species {
                            let new_count = entry.1 + rec.tree_count;
                            species_counts.set(i, (rec.species.clone(), new_count));
                            found = true;
                            break;
                        }
                    }
                    if !found {
                        species_counts.push_back((rec.species.clone(), rec.tree_count));
                    }
                }
            }
        }

        if total_trees == 0 || species_counts.len() == 0 {
            return 0;
        }

        let species_count = species_counts.len() as u32;
        let richness_score = if species_count >= 5 { 60 } else { species_count * 12 };

        let max_species_count = species_counts.iter().map(|(_, c)| *c).max().unwrap_or(0);
        let max_percentage = (max_species_count * 10000) / total_trees;

        let evenness_score = if max_percentage >= MONOCULTURE_THRESHOLD_BPS {
            (40 * (10000 - max_percentage)) / (10000 - MONOCULTURE_THRESHOLD_BPS)
        } else {
            40
        };

        let total_score = richness_score + evenness_score;
        if total_score > 100 { 100 } else { total_score }
    }

    pub fn is_monoculture(env: Env, region: Symbol) -> bool {
        let total: u64 = env.storage().instance().get(&symbol_short!("SEQ")).unwrap_or(0);
        let mut species_counts: Vec<(Symbol, u32)> = Vec::new(&env);
        let mut total_trees: u32 = 0;

        for id in 1..=total {
            if let Some(rec) = env.storage().persistent()
                .get::<_, PlantingRecord>(&Self::planting_key(&env, id))
            {
                if rec.region == region {
                    total_trees += rec.tree_count;
                    let mut found = false;
                    for i in 0..species_counts.len() {
                        let entry = species_counts.get(i).unwrap();
                        if entry.0 == rec.species {
                            let new_count = entry.1 + rec.tree_count;
                            species_counts.set(i, (rec.species.clone(), new_count));
                            found = true;
                            break;
                        }
                    }
                    if !found {
                        species_counts.push_back((rec.species.clone(), rec.tree_count));
                    }
                }
            }
        }

        if total_trees == 0 || species_counts.len() == 0 {
            return false;
        }

        let max_species_count = species_counts.iter().map(|(_, c)| *c).max().unwrap_or(0);
        (max_species_count * 10000) / total_trees >= MONOCULTURE_THRESHOLD_BPS
    }

    pub fn list_region_species(env: Env, region: Symbol) -> Vec<Symbol> {
        let total: u64 = env.storage().instance().get(&symbol_short!("SEQ")).unwrap_or(0);
        let mut species: Vec<Symbol> = Vec::new(&env);

        for id in 1..=total {
            if let Some(rec) = env.storage().persistent()
                .get::<_, PlantingRecord>(&Self::planting_key(&env, id))
            {
                if rec.region == region {
                    let mut found = false;
                    for i in 0..species.len() {
                        if species.get(i).unwrap() == rec.species {
                            found = true;
                            break;
                        }
                    }
                    if !found {
                        species.push_back(rec.species);
                    }
                }
            }
        }
        species
    }

    fn genetics_key(env: &Env, species: &Symbol) -> soroban_sdk::Val {
        (symbol_short!("GEN"), species.clone()).into_val(env)
    }

    fn planting_key(env: &Env, id: u64) -> soroban_sdk::Val {
        (symbol_short!("PLANT"), id).into_val(env)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{Address, Env, Symbol};

    fn setup() -> (Env, Address, TreeGeneticsClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, TreeGenetics);
        let client = TreeGeneticsClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);
        (env, admin, client)
    }

    fn markers(env: &Env, names: &[&str]) -> Vec<GeneticMarker> {
        let mut result = Vec::new(env);
        for (i, name) in names.iter().enumerate() {
            result.push_back(GeneticMarker {
                locus: Symbol::new(env, &format!("locus_{}", i)),
                allele: Symbol::new(env, name),
            });
        }
        result
    }

    #[test]
    fn test_register_genetics() {
        let (env, _admin, client) = setup();
        let species = Symbol::new(&env, "teak");
        let m = markers(&env, &["a1", "b2", "c3"]);
        client.register_genetics(&species, &m);
        let rec = client.get_genetics(&species).unwrap();
        assert_eq!(rec.markers.len(), 3);
        assert!(rec.genetic_diversity_score > 0);
    }

    #[test]
    #[should_panic(expected = "at least one marker required")]
    fn test_rejects_empty_markers() {
        let (env, _admin, client) = setup();
        let empty: Vec<GeneticMarker> = Vec::new(&env);
        client.register_genetics(&Symbol::new(&env, "teak"), &empty);
    }

    #[test]
    #[should_panic(expected = "too many markers")]
    fn test_rejects_too_many_markers() {
        let (env, _admin, client) = setup();
        let many: Vec<GeneticMarker> = Vec::new(&env);
        for i in 0..25 {
            many.push_back(GeneticMarker {
                locus: Symbol::new(&env, &format!("l{}", i)),
                allele: Symbol::new(&env, "x"),
            });
        }
        client.register_genetics(&Symbol::new(&env, "teak"), &many);
    }

    #[test]
    fn test_record_planting_increments_ids() {
        let (env, _admin, client) = setup();
        let region = Symbol::new(&env, "north");
        let species = Symbol::new(&env, "teak");
        let id1 = client.record_planting(&region, &species, &100);
        let id2 = client.record_planting(&region, &species, &50);
        assert_eq!(id2, id1 + 1);
    }

    #[test]
    #[should_panic(expected = "tree_count must be positive")]
    fn test_rejects_zero_trees() {
        let (env, _admin, client) = setup();
        client.record_planting(&Symbol::new(&env, "north"), &Symbol::new(&env, "teak"), &0);
    }

    #[test]
    fn test_biodiversity_high_with_many_species() {
        let (env, _admin, client) = setup();
        let region = Symbol::new(&env, "north");
        client.record_planting(&region, &Symbol::new(&env, "teak"), &100);
        client.record_planting(&region, &Symbol::new(&env, "moringa"), &100);
        client.record_planting(&region, &Symbol::new(&env, "bamboo"), &100);
        client.record_planting(&region, &Symbol::new(&env, "pine"), &100);
        client.record_planting(&region, &Symbol::new(&env, "shea"), &100);
        assert!(client.calculate_biodiversity(&region) >= 60);
    }

    #[test]
    fn test_monoculture_detected() {
        let (env, _admin, client) = setup();
        let region = Symbol::new(&env, "mono");
        client.record_planting(&region, &Symbol::new(&env, "teak"), &90);
        client.record_planting(&region, &Symbol::new(&env, "moringa"), &10);
        assert!(client.is_monoculture(&region));
    }

    #[test]
    fn test_not_monoculture_when_diverse() {
        let (env, _admin, client) = setup();
        let region = Symbol::new(&env, "diverse");
        client.record_planting(&region, &Symbol::new(&env, "teak"), &40);
        client.record_planting(&region, &Symbol::new(&env, "moringa"), &35);
        client.record_planting(&region, &Symbol::new(&env, "bamboo"), &25);
        assert!(!client.is_monoculture(&region));
    }

    #[test]
    fn test_list_region_species() {
        let (env, _admin, client) = setup();
        let region = Symbol::new(&env, "south");
        client.record_planting(&region, &Symbol::new(&env, "teak"), &50);
        client.record_planting(&region, &Symbol::new(&env, "moringa"), &30);
        client.record_planting(&region, &Symbol::new(&env, "bamboo"), &20);
        assert_eq!(client.list_region_species(&region).len(), 3);
    }

    #[test]
    fn test_empty_region_zero_biodiversity() {
        let (env, _admin, client) = setup();
        let region = Symbol::new(&env, "empty");
        assert_eq!(client.calculate_biodiversity(&region), 0);
        assert!(!client.is_monoculture(&region));
    }

    #[test]
    fn test_unknown_species_zero_diversity() {
        let (env, _admin, client) = setup();
        assert_eq!(client.get_diversity_score(&Symbol::new(&env, "unknown")), 0);
    }
}