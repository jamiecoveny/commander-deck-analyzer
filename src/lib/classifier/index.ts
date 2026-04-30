// Public surface for the classifier.

export { classify, classifyAll } from "./classify";
export {
  loadClassifierOverrides,
  clearOverridesCache,
} from "./overrides";
export type {
  CategoryRule,
  ClassifierInput,
  ClassifyOptions,
  OverrideEntry,
  OverrideMap,
} from "./types";
