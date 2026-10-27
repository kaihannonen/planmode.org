# React Native conventions

Applies to `app/` and `src/` in an Expo project.

## Rules

1. **`StyleSheet.create` for static styles.** No object literals created inside
   render; they are a new allocation every frame.
2. **`FlatList` / `FlashList` for lists**, with a stable `keyExtractor`. `map()`
   inside a `ScrollView` renders everything at once.
3. **Safe areas are explicit.** Use `SafeAreaView` or `useSafeAreaInsets`; do not
   assume a notch-less screen.
4. **Platform differences live in files.** `Component.ios.tsx` and
   `Component.android.tsx` beat a wall of `Platform.OS ===` checks.
5. **No `Dimensions.get()` at module scope.** It freezes the value at import time and
   breaks rotation and split screen. Use `useWindowDimensions`.
6. **Touch targets are at least 44×44.** Add `hitSlop` when the visual is smaller.
7. **Images use `expo-image`** for caching and placeholders.
8. **No secrets in the bundle.** Anything in the app is readable by the user; API
   keys belong on a server.
9. **Navigation params are typed.** A typed param list per stack, no `any` in
   `useRoute`.

## Performance

- Memoise row components with `React.memo`.
- Avoid anonymous functions in `renderItem` where it causes re-renders.
- Measure with the React DevTools profiler before optimising.
