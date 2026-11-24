export function getCorporateEsgData(): Promise<{
  treesFunded: number;
  co2SequesteredTonnes: number;
  biodiversityScore: number;
  engagedEmployees: number;
}> {
  return Promise.resolve({
    treesFunded: 0,
    co2SequesteredTonnes: 0,
    biodiversityScore: 0,
    engagedEmployees: 0,
  });
}
