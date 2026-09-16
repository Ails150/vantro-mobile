// Stub for expo-device. The tests set these directly.
export let isDevice = true
export let __rooted: boolean | Error = false

export function __setDevice(v: boolean) { isDevice = v }
export function __setRooted(v: boolean | Error) { __rooted = v }

export async function isRootedExperimentalAsync(): Promise<boolean> {
  if (__rooted instanceof Error) throw __rooted
  return __rooted
}
