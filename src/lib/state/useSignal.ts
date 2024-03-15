import { useState } from "react"
import { type Config, signal } from "./signal"
import { useSignalValue } from "./useSignalValue"

/**
 * Use it when:
 * - you need reactive state
 * - you don't need global state
 */
export const useSignal = <T, Key>(config: Config<T, Key>) => {
  const [stateSignal] = useState(() => signal(config))

  const value = useSignalValue(stateSignal)

  return [value, stateSignal]
}
