# Plan: Spring endpoint

**Goal:** add one REST resource with a DTO, a service, a repository and tests.

## Preconditions

- `./mvnw verify` passes.
- The package root is known (`com.example.<app>`).

## Steps

1. **DTO records** in `<domain>/dto/`: `CreateRequest`, `UpdateRequest`, `Response`.
   Add Jakarta validation annotations to the request records.
2. **Entity** in `<domain>/` with `@Entity`, no Lombok on it, explicit `equals`/`hashCode`
   only if it is used in a set or map.
3. **Repository** extends `JpaRepository`, plus a derived query for the lookup the
   endpoint needs.
4. **Service** with `@Transactional`, constructor injection, and mapping between entity
   and DTO. Absence throws a domain exception.
5. **Controller** with `@RestController`, `@RequestMapping`, `@Valid`, and explicit
   `ResponseEntity` status codes.
6. **Exception handler** — add the new domain exception to the existing
   `@RestControllerAdvice`, mapping to `ProblemDetail`.
7. **Tests**: `@WebMvcTest` for the controller with a mocked service, `@DataJpaTest`
   for the repository query.

## Verification

```sh
./mvnw verify
./mvnw spring-boot:run
```

Then check the endpoint returns problem details on a validation failure, not a
default Spring error page.

## Rollback

Remove the controller, service, repository and DTOs. If the entity was added, write a
new migration rather than editing an applied one.
