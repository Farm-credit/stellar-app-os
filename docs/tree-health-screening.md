# Tree photo health screening (Issue #1715)

## Runtime flow

`POST /api/planting/photo` runs AWS Rekognition label detection on every accepted field photo. The derived labels are passed through the active field-feedback model, or the conservative label-based fallback before a quarterly model exists. Alerts are attached to the tree reference and shown on `/trees/{treeId}`. If AWS is unavailable or the image does not yield usable labels, the upload still succeeds and the tree remains eligible for field-team review; image bytes and raw GPS are not copied into the model tables.

Field staff use `/admin/tree-health` to inspect the photo, confirm the suggested categories (`pest_damage`, `drought_stress`, `disease`), or submit an empty correction for a healthy photo. The route and photo preview require the existing `farmcredit_role=admin` authorization. Corrections are retained as vision-label feature vectors and confirmed labels.

## Quarterly model retraining

The repository includes `.github/workflows/tree-health-quarterly-retrain.yml`, scheduled for 02:00 UTC on January 1, April 1, July 1, and October 1; the workflow can also be run from GitHub Actions. Configure these repository secrets before enabling it:

- `TREE_HEALTH_SITE_URL`: the deployed app base URL, without a trailing slash (for example `https://farmcredit.example.com`).
- `TREE_HEALTH_CRON_SECRET`: a long random bearer secret, also set as an application runtime environment variable with the same value.

The protected `POST /api/admin/tree-health` endpoint triggers the refresh for the current UTC quarter. At least eight reviewed photos are required. Each model release is versioned by quarter and trained from correction examples. A final 20% chronological holdout is used for the reported multi-label exact-match accuracy. The admin review screen also reports the observed exact-match agreement across reviewed photos.

Apply `db/migrations/027_create_tree_health_models.sql` before enabling this feature. AWS Rekognition permissions must include `rekognition:DetectLabels` and AWS credentials/region must be configured for screening. If a quarter has fewer than eight corrections, the workflow will fail visibly rather than silently publish an untrained model; operators should continue collecting field corrections and rerun the workflow after the threshold is met.

## Interpretation and limitations

The classifier learns a small multi-label head over image-recognition labels, using field-team corrections as its training set. It is a triage aid, not an agronomic diagnosis. Predictions are stored as pending review and should not trigger treatment or automated removal without expert confirmation. Model accuracy is only reported after there are labeled examples and should be interpreted in light of the sample size and class balance.
