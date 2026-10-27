# AWS tagging

Applies to every taggable resource.

## Rules

1. **Four tags are mandatory** on every resource:
   - `Environment` — `dev`, `staging`, `prod`
   - `Owner` — a team or person, not a distribution list
   - `CostCenter` — the billing code
   - `ManagedBy` — `terraform`
2. **Set them once on the provider**, then override only where a resource needs a
   different value:
   ```hcl
   provider "aws" {
     default_tags {
       tags = local.common_tags
     }
   }
   ```
3. **`local.common_tags` is defined in one file** and merged with per-resource tags,
   never redefined inline.
4. **No tag values from `data` lookups that can drift** between plan and apply.
5. **Tag keys are case-sensitive and consistent.** `Environment`, not `environment`
   in one module and `Environment` in another.

## Why it matters

Untagged resources cannot be attributed, cannot be cleaned up safely, and cannot be
included in a cost review. A resource without tags is a resource nobody owns.
