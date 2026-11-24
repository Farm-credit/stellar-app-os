import { mockCarbonProjects } from './carbonProjects';

export interface MockOffsetProject {
  id: string;
  projectType: string;
  location: string;
  certificationStandard: string;
  coBenefits?: string[];
  price: number;
}

export function getMockOffsetProjects(): MockOffsetProject[] {
  return mockCarbonProjects.map((project) => ({
    id: project.id,
    projectType: project.type,
    location: project.location,
    certificationStandard: project.verificationStatus,
    coBenefits: project.coBenefits,
    price: project.pricePerTon,
  }));
}
