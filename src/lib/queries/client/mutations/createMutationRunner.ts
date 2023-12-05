/* eslint-disable @typescript-eslint/naming-convention */
import {
  BehaviorSubject,
  Subject,
  combineLatest,
  concatMap,
  distinctUntilChanged,
  filter,
  finalize,
  identity,
  map,
  merge,
  mergeMap,
  of,
  shareReplay,
  skip,
  startWith,
  switchMap,
  take,
  takeUntil,
} from "rxjs"
import { isDefined } from "../../../utils/isDefined"
import { type MutationOptions } from "./types"
import { mergeResults } from "./operators"
import { Mutation } from "./Mutation"

export type MutationRunner = ReturnType<typeof createMutationRunner>

export const createMutationRunner = <T, MutationArg>({
  __queryFinalizeHook,
  __queryInitHook,
  __queryTriggerHook,
  mutationKey
}: Pick<
  MutationOptions<any, any>,
  | "__queryInitHook"
  | "__queryTriggerHook"
  | "__queryFinalizeHook"
  | "mutationKey"
>) => {
  const trigger$ = new Subject<{
    args: MutationArg
    options: MutationOptions<T, MutationArg>
  }>()
  const cancel$ = new Subject<void>()
  let closed = false
  const mapOperator$ = new BehaviorSubject<
    MutationOptions<any, any>["mapOperator"]
  >("merge")
  const mutationsListSubject = new BehaviorSubject<Array<Mutation<any>>>([])

  /**
   * Mutation can be destroyed in two ways
   * - caller unsubscribe to the mutation
   * - caller call destroy directly
   */
  const destroy = () => {
    if (closed) {
      throw new Error("Trying to close an already closed mutation")
    }

    closed = true

    mapOperator$.complete()
    mutationsListSubject.complete()
    trigger$.complete()
    /**
     * make sure we cancel ongoing requests if we destroy this runner before they finish
     */
    cancel$.next()
    cancel$.complete()
  }

  const stableMapOperator$ = mapOperator$.pipe(
    filter(isDefined),
    distinctUntilChanged()
  )

  const runner$ = stableMapOperator$.pipe(
    (__queryInitHook as typeof identity) ?? identity,
    mergeMap((mapOperator) => {
      const switchOperator =
        mapOperator === "concat"
          ? concatMap
          : mapOperator === "switch"
            ? switchMap
            : mergeMap

      let mutationsForCurrentMapOperatorSubject: Array<Mutation<any>> = []

      const removeMutation = (mutation: Mutation<any>) => {
        mutationsForCurrentMapOperatorSubject =
          mutationsForCurrentMapOperatorSubject.filter(
            (item) => item !== mutation
          )

        mutationsListSubject.next(
          mutationsListSubject.getValue().filter((item) => item !== mutation)
        )
      }

      return trigger$.pipe(
        takeUntil(stableMapOperator$.pipe(skip(1))),
        map(({ args, options }) => {
          const mutation = new Mutation({
            args,
            ...options,
            mapOperator
          })

          mutationsForCurrentMapOperatorSubject = [
            ...mutationsForCurrentMapOperatorSubject,
            mutation
          ]

          mutationsListSubject.next([
            ...mutationsListSubject.getValue(),
            mutation
          ])

          return mutation
        }),
        switchOperator((mutation) => {
          if (!mutationsListSubject.getValue().includes(mutation)) return of({})

          /**
           * @important
           * we need to make sure to unsubscribe to the mutation.
           * either when it is finished or by cancelling this one in the
           * runner.
           */
          const queryIsOver$ = merge(
            cancel$,
            mutation.mutation$.pipe(
              filter(({ status }) => status === "success" || status === "error")
            )
          )

          const isThisCurrentFunctionLastOneCalled = trigger$.pipe(
            take(1),
            map(() => mapOperator === "concat"),
            startWith(true),
            takeUntil(queryIsOver$)
          )

          const result$ = combineLatest([
            mutation.mutation$,
            isThisCurrentFunctionLastOneCalled
          ]).pipe(
            map(([result, isLastMutationCalled]) => {
              if (
                (result.status === "success" || result.status === "error") &&
                !isLastMutationCalled
              ) {
                return {}
              }

              return result
            }),
            takeUntil(cancel$.pipe()),
            mergeResults,
            finalize(() => {
              removeMutation(mutation)
            })
          )

          return result$
        }),
        mergeResults,
        (__queryTriggerHook as typeof identity) ?? identity
      )
    }),
    (__queryFinalizeHook as typeof identity) ?? identity,
    shareReplay(1)
  )

  cancel$.subscribe(() => {
    /**
     * on cancel we remove all queries because they should either be cancelled
     * or not run on next switch
     */
    if (mutationsListSubject.getValue().length === 0) return

    mutationsListSubject.next([])
  })

  return {
    mutationKey,
    runner$,
    trigger: ({
      args,
      options
    }: {
      args: MutationArg
      options: MutationOptions<T, MutationArg>
    }) => {
      mapOperator$.next(options.mapOperator)
      trigger$.next({ args, options })
    },
    cancel$,
    destroy,
    mutationsListSubject,
    getClosed: () => closed
  }
}
