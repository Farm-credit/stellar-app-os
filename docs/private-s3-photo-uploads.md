# Private S3 tree photo uploads

Authenticated planters request a short-lived upload URL:

```http
POST /api/planters/photo-upload-url
Authorization: Bearer <planter-jwt>
Content-Type: application/json

{"treeId":"TREE-818","contentType":"image/jpeg","contentLength":245760}
```

The response includes a server-generated `key`, `uploadUrl`, expiry, method,
and the exact headers for the subsequent `PUT`. JPEG, PNG, and WebP files up
to 5 MB are accepted. Clients must send the declared content type and length.

## Environment

```dotenv
AWS_REGION=us-east-1
AWS_S3_BUCKET=private-photo-evidence-bucket
# Optional locally; prefer an IAM runtime role in production.
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
# Optional, constrained to 60-900 seconds (default: 300).
S3_UPLOAD_URL_EXPIRES_IN_SECONDS=300
```

Keep S3 Block Public Access enabled. Grant the runtime role only
`s3:PutObject` on `tree-photo-evidence/*`; retrieval should use a separately
authorized signed-download flow. Configure bucket CORS to allow `PUT` from the
application origin with `Content-Type` and `Content-Length` headers.

The application uses the standard AWS credential provider chain, so deployed
environments should use a short-lived IAM role rather than static credentials.
