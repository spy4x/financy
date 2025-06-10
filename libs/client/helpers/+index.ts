import { Signal } from "@preact/signals"
import { useLocation } from "wouter-preact"

/** Modify a signal's value by merging the given update object. Does it in immutable way to trigger effects & UI updates. */
export function set<T>(
  signal: Signal<T>,
  update: Partial<T>,
): void {
  signal.value = { ...signal.value, ...update }
}

export const ValidationErrorTypeBase = {
  SCHEMA: "SCHEMA",
} as const

export type FormValidationModel<
  Model,
  ErrorType extends typeof ValidationErrorTypeBase,
  ErrorPayload,
> = {
  [key in keyof Model]?: {
    [type in ErrorType as string]?: {
      message: string
      payload?: ErrorPayload
    }
  }
}

/** Check if the validation model has any issues. */
export function isValid<
  T extends FormValidationModel<
    unknown,
    typeof ValidationErrorTypeBase,
    unknown
  >,
>(
  vl: T,
): boolean {
  const keysWithIssues = Object.keys(vl).filter((key) => {
    const item = vl[key as keyof typeof vl]
    return !item ||
      Object.keys(item).filter((type) => item && item[type as keyof typeof item]).length > 0
  })
  const result = keysWithIssues.length === 0
  return result
}

/** Set a validation state for a specific key in the validation model. */
export function setValidationState<
  T extends FormValidationModel<
    unknown,
    typeof ValidationErrorTypeBase,
    unknown
  >,
>(
  vl: T,
  key: keyof T,
  type: string,
  message: undefined | string,
  payload?: number,
): T {
  return {
    ...vl,
    [key]: {
      ...vl[key],
      [type]: message === undefined ? undefined : {
        message,
        payload,
      },
    },
  }
}

export function navigate(url: string): void {
  const [_, navigate] = useLocation()
  navigate(url)
}
