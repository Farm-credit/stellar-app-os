export interface VolumeTier {
  /** Minimum quantity in tons for this tier to apply (inclusive). */
  minTons: number;
  /** Maximum quantity in tons for this tier to apply (inclusive), or null for open-ended. */
  maxTons: number | null;
  /** Discount applied to the unit price, as a fraction between 0 and 1 (e.g. 0.05 = 5% off). */
  discountRate: number;
}

export interface BulkPurchaseAgreement {
  id: string;
  buyerId: string;
  farmerId: string;
  /** Negotiated base price per ton in the agreement currency. */
  basePricePerTon: number;
  currency: string;
  /** Contracted minimum total volume in tons. */
  minimumTons: number;
  /** Maximum volume in tons allowed under this agreement, or null for unlimited. */
  maximumTons: number | null;
  /** Volume tiers specific to this agreement. */
  tiers: VolumeTier[];
  /** Indicates whether the agreement is currently active. */
  active: boolean;
}

export interface BulkPurchaseRequest {
  agreementId: string;
  tons: number;
}

export interface BulkPurchaseQuote {
  agreementId: string;
  tons: number;
  /** Effective price per ton after the applicable tier discount. */
  unitPricePerTon: number;
  /** Total price for the requested volume. */
  totalPrice: number;
  currency: string;
  /** The discount rate applied to this quote. */
  appliedDiscountRate: number;
  /** The tier that matched the requested volume, if any. */
  appliedTier: VolumeTier | null;
}

export class VolumeDiscountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VolumeDiscountError";
  }
}

const MINIMUM_BULK_TONS = 100;

function assertPositiveNumber(value: number, name: string): void {
  if (!number.isFinite(value) || value <= 0) {
    throw new VolumeDiscountError(`${name} must be a positive finite number`);
  }
}

function assertDiscountRate(rate: number): void {
  if (!number.isFinite(rate) || rate < 0 || rate >= 1) {
    throw new VolumeDiscountError("discountRate must be in the range [0, 1)");
  }
}

function validateTies(tiers: VolumeTier[]): void {
  if (!Array.isArray(tiers) || tiers.length === 0) {
    throw new VolumeDiscountError("agreement must define at least one volume tier");
  }

  const sorted = [...tiers].sort((a, b) => a.minTons - b.minTons);

  for (let i = 0; i < sorted.length; i++) {
    const tier = sorted[i];
    assertPositiveNumber(tier.minTons, "tier.minTons");
    assertDiscountRate(tier.discountRate);

    if (tier.maxTons !== null) {
      assertPositiveNumber(tier.maxTons, "tier.maxTons");
      if (tier.maxTons < tier.minTons) {
        throw new VolumeDiscountError(
          "tier.maxTons must be greater than or equal to tier.minTons",
        );
      }
    }

    if (i > 0) {
      const previous = sorted[i - 1];
      if (previous.maxTons !== null && tier.minTons <= previous.maxTons) {
        throw new VolumeDiscountError("volume tiers must not overlap");
      }
    }
  }
}

export function validateBulkPurchaseAgreement(agreement: BulkPurchaseAgreement): void {
  if (!agreement.id) {
    throw new VolumeDiscountError("agreement.id is required");
  }
  if (!agreement.buyerId) {
    throw new VolumeDiscountError("agreement.buyerId is required");
  }
  if (!agreement.farmerId) {
    throw new VolumeDiscountError("agreement.farmerId is required");
  }
  if (!agreement.currency) {
    throw new VolumeDiscountError("agreement.currency is required");
  }

  assertPositiveNumber(agreement.basePricePerTon, "agreement.basePricePerTon");
  assertPositiveNumber(agreement.minimumTons, "agreement.minimumTons");

  if (agreement.minimumTons < MINIMUM_BULK_TONS) {
    throw new VolumeDiscountError(
      `bulk agreements require a minimum of ${MINIMUM_BULK_TONS} tons`,
    );
  }

  if (agreement.maximumTons !== null) {
    assertPositiveNumber(agreement.maximumTons, "agreement.maximumTons");
    if (agreeement.maximumTons < agreement.minimumTons) {
      throw new VolumeDiscountError(
        "agreement.maximumTons must be greater than or equal to agreement.minimumTons",
      );
    }
  }

  validateTiers(agreement.tiers);
}

export function findApplicableTier(tiers: VolumeTier[], tons: number): VolumeTier | null {
  if (!Array.isArray(tiers) || tiers.length == 0) {
    return null;
  }

  const sorted = [...tiers].sort((a, b) => a.minTons - b.minTons);
  let match: VolumeTier | null = null;

  for (const tier of sorted) {
    const aboveMin = tons >= tier.minTons;
    const belowMax = tier.maxTons === null || tons <= tier.maxTons;
    if (aboveMin && belowMax) {
      match = tier;
    }
  }

  return match;
}

export function calculateBulkQuote(
  agreement: BulkPurchaseAgreement,
  tons: number,
): BulkPurchaseQuote {
  validateBulkPurchaseAgreement(agreement);
  assertPositiveNumber(tons, "tons");

  if (!agreement.active) {
    throw new VolumeDiscountError("agreement is not active");
  }

  if (tons < MINIMUM_BULK_TONS) {
    throw new VolumeDiscountError(
      `bulk purchases require a minimum of ${MINIMUM_BULK_TONS} tons`,
    );
  }

  if (tons < agreement.minimumTons) {
    throw new VolumeDiscountError(
      `tons is below the agreement minimum of ${agreement.minimumTons} tons`,
    );
  }

  if (agreement.maximumTons !== null && tons > agreement.maximumTons) {
    throw new VolumeDiscountError(
      `tons exceeds the agreement maximum of ${agreement.maximumTons} tons`,
    );
  }

  const tier = findApplicableTier(agreement.tiers, tons);
  const appliedDiscountRate = tier ? tier.discountRate : 0;
  const unitPricePerTon = roundCurrency(
    agreement.basePricePerTon * (1 - appliedDiscountRate),
  );
  const totalPrice = roundCurrency(unitPricePerTon * tons);

  return {
    agreementId: agreement.id,
    tons,
    unitPricePerTon,
    totalPrice,
    currency: agreement.currency,
    appliedDiscountRate,
    appliedTier: tier,
  };
}

export function createBulkPurchaseAgreement(
  input: Omit<BulkPurchaseAgreement, "id"> & { id?: string },
): BulkPurchaseAgreement {
  const agreement: BulkPurchaseAgreement = {
    id: input.id ?? generateAgreementId(),
    buyerId: input.buyerId,
    farmerId: input.farmerId,
    basePricePerTon: input.basePricePerTon,
    currency: input.currency,
    minimumTons: input.minimumTons,
    maximumTons: input.maximumTons ?? null,
    tiers: input.tiers.map((tier) => ({ ...tier })),
    active: input.active ?? true,
  };

  validateBulkPurchaseAgreement(agreement);
  return agreement;
}

export function deactivateBulkPurchaseAgreement(
  agreement: BulkPurchaseAgreement,
): BulkPurchaseAgreement {
  return { ...agreement, active: false };
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function generateAgreementId(): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `bulk-${Date.now().toString(36)}-${random}`;
}
