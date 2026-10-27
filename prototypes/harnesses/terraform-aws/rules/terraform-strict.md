# Terraform strict

Applies to every `.tf` file.

## Rules

1. **Pin provider and module versions.** `version = "~> 5.60"` for providers,
   `version = "1.2.3"` for modules. An unpinned provider is a production change you
   did not review.
2. **Remote state with locking.** S3 + DynamoDB, or Terraform Cloud. Local state in a
   shared repo is data loss waiting to happen.
3. **One state per environment.** `dev`, `staging`, `prod` are separate state files,
   not separate workspaces over the same file, unless you have a reason.
4. **`for_each` over `count`.** Removing an item from a `count` list re-indexes
   everything after it and destroys the wrong resources.
5. **No hardcoded account ids, regions or ARNs.** Variables or data sources.
6. **Typed variables with descriptions** and validation blocks for anything a human
   can mistype.
7. **`terraform fmt` and `terraform validate` in CI.** Non-negotiable.
8. **No `-target` in a normal deploy.** It leaves the rest of the graph unapplied and
   the next plan surprises everyone.
9. **`prevent_destroy` on stateful resources** — databases, buckets with data, KMS
   keys.

## Module shape

```
modules/<name>/
  main.tf
  variables.tf
  outputs.tf
  versions.tf
```
