# Plan: Terraform module

**Goal:** add a reusable module and wire it into one environment without touching the
others.

## Preconditions

- `terraform fmt -check -recursive` and `terraform validate` pass.
- Remote state is configured for the target environment.

## Steps

1. **Module skeleton** at `modules/<name>/` with `main.tf`, `variables.tf`,
   `outputs.tf`, `versions.tf`.
2. **Variables**: typed, described, with `validation` for enums and name patterns. No
   defaults for anything environment-specific.
3. **Resources** use `for_each` over a map, not `count`.
4. **Tags** merged from `var.tags` and `local.common_tags`. Every taggable resource
   gets `tags = local.tags`.
5. **Outputs** expose ids and ARNs the caller needs, nothing internal.
6. **Wire it** into `envs/<env>/main.tf` with a pinned module version or a local path
   during development.
7. **Plan** and read it: `terraform plan -out=tfplan`. Check for unexpected destroys
   before applying.
8. **Apply** only in a non-production environment first.

## Verification

```sh
terraform fmt -check -recursive
terraform validate
terraform plan -out=tfplan
terraform show -json tfplan | jq '.resource_changes[] | select(.change.actions[] == "delete")'
```

The last command should print nothing for an additive change.

## Rollback

`terraform destroy -target=module.<name>` in the environment where it was added, then
remove the module block. Never destroy a module that owns stateful resources without a
snapshot.
