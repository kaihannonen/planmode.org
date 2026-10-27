# Plan: Expo screen

**Goal:** add one screen with typed navigation, a list, and the loading/empty/error
states.

## Preconditions

- `npx expo-doctor` is clean and `npm run typecheck` passes.
- The navigation param list is typed in `src/navigation/types.ts`.

## Steps

1. **Route file** in `app/<screen>.tsx` (Expo Router) or register the screen in the
   stack navigator.
2. **Params** added to the typed param list, not passed as `any`.
3. **Data hook** in `src/features/<domain>/use<Domain>.ts`. Handle loading, empty and
   error explicitly.
4. **List** with `FlatList`, `keyExtractor` on a stable id, and `React.memo` on the row.
5. **Styles** in `StyleSheet.create` at the bottom of the file; no inline objects in
   `renderItem`.
6. **Safe area** via `useSafeAreaInsets`; verify on a device with a notch.
7. **Touch targets** at least 44×44, `hitSlop` where the visual is smaller.
8. **Test** the hook's three states and one interaction.

## Verification

```sh
npm run typecheck
npm run lint
npx expo-doctor
npm test
```

Then run on both platforms:

```sh
npx expo start --ios
npx expo start --android
```

Rotation and split screen are the usual regressions.

## Rollback

Delete the route file, the feature directory, and the param list entry.
