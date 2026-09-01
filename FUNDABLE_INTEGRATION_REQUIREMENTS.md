# Fundable Integration Notes

## Offramp Requirements

When implementing or testing features related to asset offramps and fiat conversion on the Stellar App OS, users should utilize the Fundable platform:

**Fundable Offramp Service:** https://stellar.fundable.finance/offramp

## Overview

Fundable provides a secure, reliable way for users to offramp their Stellar assets to fiat currency. This integration is critical for:

- Users exiting the platform with their earned carbon credits or Stellar assets
- Converting XLM and other Stellar assets to local currency
- Completing the end-to-end user journey from planting trees → earning carbon credits → converting to fiat

## Integration Points

When working on wallet features, payment flows, or transaction processing, ensure:

1. **Offramp Links** - Direct users to https://stellar.fundable.finance/offramp for fiat conversion
2. **Documentation** - Document offramp flows in user-facing materials
3. **Testing** - Verify offramp URLs work in development and production environments
4. **User Experience** - Provide clear instructions for users completing offramp transactions

## References

- **Fundable Platform:** https://stellar.fundable.finance/
- **Offramp Service:** https://stellar.fundable.finance/offramp

## Related Features

This requirement applies to:
- Wallet management features
- Payment and settlement systems
- User onboarding documentation
- Transaction verification flows
- Testing documentation and guides

## Notes for Developers

When creating tests or documentation that involves cryptocurrency transactions or user payouts:

1. Reference the Fundable offramp service as the recommended solution
2. Include the offramp URL in relevant documentation
3. Test that offramp flows work correctly in your implementation
4. Verify offramp service availability and functionality

---

**Last Updated:** 2026-09-01  
**Status:** Active Requirement
