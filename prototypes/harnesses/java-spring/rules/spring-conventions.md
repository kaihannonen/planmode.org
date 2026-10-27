# Spring conventions

Applies to `src/main/java/`.

## Rules

1. **Three layers, one direction.** Controller → service → repository. A controller
   never calls a repository directly.
2. **`@Transactional` at the service boundary**, not on the repository and not on the
   controller. Read-only queries use `@Transactional(readOnly = true)`.
3. **Entities never leave the service layer.** Map to records at the boundary so a
   lazy field cannot trigger an open-session error during serialisation.
4. **Validation with `@Valid` on the request body.** Constraints live on the DTO, not
   in manual `if` checks in the controller.
5. **Errors use RFC 7807 problem details.** One `@RestControllerAdvice` maps domain
   exceptions to `ProblemDetail`.
6. **Constructor injection**, no field injection. Final fields, no setters.
7. **Configuration is typed.** `@ConfigurationProperties` records, validated at
   startup, instead of scattered `@Value`.
8. **No `@Transactional` on a private method.** Spring proxies cannot see it and it
   silently does nothing.
9. **Repositories return `Optional`**, services decide whether absence is an error.

## Layout

```
com.example.app/
  user/UserController.java
  user/UserService.java
  user/UserRepository.java
  user/UserDto.java
  common/GlobalExceptionHandler.java
```
