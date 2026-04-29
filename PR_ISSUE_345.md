# Backend Image Storage and GPS Metadata Extraction (Issue #345)

## Summary

This pull request implements secure AWS S3 storage mechanisms for GPS-tagged planting photos submitted by farmers, validates metadata coordinates mathematically, and incorporates encryption for downstream location processing in compliance with privacy guidelines.

## Related Issue

Closes #345

## What Was Implemented

### Core Features

- ✅ Exif GPS extraction utilizing `exifr`.
- ✅ Verification calculation preventing false submissions beyond a 500-meter radius boundary.
- ✅ AES-256-GCM symmetric encryption handling for internal placement logic.
- ✅ AWS S3 client framework equipped for private photo archiving functionality.
- ✅ Full `multipart/form-data` support on `POST /api/planting/photo` route.

### Technical Implementation

- ✅ **Strict Typescript Compatibility**: Zero `any` casting mappings.
- ✅ **Secure File System Mapping**: Enforced environment variable requirements for privacy. 
- ✅ **Cryptographic Integration**: Reused `randomBytes(12)` standard definitions from location proofing files.

## Files Changed

### New Endpoints
- `app/api/planting/photo/route.ts` - Primary API orchestrating extraction, validation, and encryption

### New Utilities
- `lib/aws/s3.ts` - Amazon S3 client upload and pre-signed fetching
- `lib/geo/distance.ts` - Haversine distance formula algorithm function

### Updated Types
- `lib/zk/locationProof.ts` - Added `encryptGpsCoordinates` AES-GCM engine module

## Acceptance Criteria Status

✅ **Extract EXIF GPS metadata** - Evaluates buffer arrays.  
✅ **Validate against farmer-submitted coordinates** - Strictly limits to 500m disparity.  
✅ **Store encrypted** - Coordinates rendered as Base64 AES-GCM ciphertext.  
✅ **Set up AWS S3 for storing** - Safely uploads to `planting-photos/` S3 keys.  
✅ **Implement access controls for privacy** - Utilizes `getSignedPrivateUrl` implementations.

---

**This PR accomplishes all core requests for secure image tracking without accruing technical debt.**
