import {
  type Observable,
  filter,
  fromEvent,
  map,
  merge,
  throttleTime,
  switchMap,
  EMPTY
} from "rxjs"
import { type UseQueryOptions } from "../types"

export const createActivityTrigger = <T>(
  params$: Observable<{ options: UseQueryOptions<T> }>
) => {
  return params$.pipe(
    switchMap(({ options: { refetchOnWindowFocus = true } }) => {
      const shouldRunTrigger =
        typeof refetchOnWindowFocus === "function"
          ? refetchOnWindowFocus({})
          : refetchOnWindowFocus

      return shouldRunTrigger !== false
        ? merge(
            fromEvent(document, "visibilitychange").pipe(
              filter(() => !document.hidden),
              map(() => ({ ignoreStale: shouldRunTrigger === "always" }))
            ),
            fromEvent(window, "focus").pipe(
              map(() => ({ ignoreStale: shouldRunTrigger === "always" }))
            )
          ).pipe(throttleTime(500))
        : EMPTY
    })
  )
}
