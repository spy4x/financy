// import { ZodSchema } from "zod"

// /** Modify a signal's value by merging the given update object. Does it in immutable way to trigger effects & UI updates. */
// export function set<T>(
//   signal: Signal<T>,
//   update: Partial<T>,
// ): void {
//   signal.value = { ...signal.value, ...update }
// }

// export const ValidationErrorTypeBase = {
//   SCHEMA: "SCHEMA",
// } as const

// export type FormValidationModel<
//   Model,
//   ErrorType extends typeof ValidationErrorTypeBase,
//   ErrorPayload,
// > = {
//   [key in keyof Model]?: {
//     [type in ErrorType as string]?: {
//       message: string
//       payload?: ErrorPayload
//     }
//   }
// }

// /** Check if the validation model has any issues. */
// export function isValid<
//   T extends FormValidationModel<unknown, typeof ValidationErrorTypeBase, unknown>,
// >(
//   vl: T,
// ): boolean {
//   const keysWithIssues = Object.keys(vl).filter((key) => {
//     const item = vl[key as keyof typeof vl]
//     return !item ||
//       Object.keys(item).filter((type) => item && item[type as keyof typeof item]).length > 0
//   })
//   const result = keysWithIssues.length === 0
//   return result
// }

// /** Set a validation state for a specific key in the validation model. */
// export function setValidationState<
//   T extends FormValidationModel<unknown, typeof ValidationErrorTypeBase, unknown>,
// >(
//   vl: T,
//   key: keyof T,
//   type: string,
//   message: undefined | string,
//   payload?: number,
// ): T {
//   return {
//     ...vl,
//     [key]: {
//       ...vl[key],
//       [type]: message === undefined ? undefined : {
//         message,
//         payload,
//       },
//     },
//   }
// }

// export function validateSchema<
//   T,
//   VL extends FormValidationModel<T, typeof ValidationErrorTypeBase, unknown>,
// >(
//   schema: ZodSchema<T>,
//   // value is the object to validate, inferred from the schema
//   value: T extends object ? T : never,
//   validationModel: VL,
// ): VL {
//   let update = { ...validationModel }
//   const result = schema.safeParse(value)
//   const errors = result.error?.flatten().fieldErrors ||
//     {} as Partial<Record<keyof T, string[]>>
//   for (const k of Object.keys(value)) {
//     const fieldError = errors[k as keyof typeof errors]
//     update = setValidationState(
//       update,
//       k as keyof T,
//       ValidationErrorTypeBase.SCHEMA,
//       fieldError ? fieldError.join(". ") : undefined,
//     )
//   }
//   return update
// }

// export function navigate(url: string): void {
//   const link = document.createElement("a")
//   link.href = url
//   link.setAttribute("f-client-nav", "true")
//   link.style.display = "none"

//   document.body.appendChild(link)
//   link.click()
//   document.body.removeChild(link)
// }
