var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// packages/hub/src/daemon.ts
import { createHash as createHash4, randomBytes as randomBytes6, randomUUID as randomUUID4 } from "node:crypto";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname as dirname4, join as join4 } from "node:path";
import { setTimeout as delay2 } from "node:timers/promises";

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/system/memory/memory.mjs
var memory_exports = {};
__export(memory_exports, {
  Assign: () => Assign,
  Clone: () => Clone,
  Create: () => Create,
  Discard: () => Discard,
  Metrics: () => Metrics,
  Update: () => Update
});

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/system/memory/metrics.mjs
var Metrics = {
  assign: 0,
  create: 0,
  clone: 0,
  discard: 0,
  update: 0
};

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/system/memory/assign.mjs
function Assign(left, right) {
  Metrics.assign += 1;
  return { ...left, ...right };
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/guard/guard.mjs
var guard_exports = {};
__export(guard_exports, {
  Entries: () => Entries,
  EntriesRegExp: () => EntriesRegExp,
  Every: () => Every,
  EveryAll: () => EveryAll,
  GraphemeCount: () => GraphemeCount2,
  HasPropertyKey: () => HasPropertyKey,
  IsArray: () => IsArray,
  IsAsyncIterator: () => IsAsyncIterator,
  IsBigInt: () => IsBigInt,
  IsBoolean: () => IsBoolean,
  IsClassInstance: () => IsClassInstance,
  IsConstructor: () => IsConstructor,
  IsDeepEqual: () => IsDeepEqual,
  IsEqual: () => IsEqual,
  IsFunction: () => IsFunction,
  IsGreaterEqualThan: () => IsGreaterEqualThan,
  IsGreaterThan: () => IsGreaterThan,
  IsInteger: () => IsInteger,
  IsIterator: () => IsIterator,
  IsLessEqualThan: () => IsLessEqualThan,
  IsLessThan: () => IsLessThan,
  IsMaxLength: () => IsMaxLength2,
  IsMinLength: () => IsMinLength2,
  IsMultipleOf: () => IsMultipleOf,
  IsNull: () => IsNull,
  IsNumber: () => IsNumber,
  IsObject: () => IsObject,
  IsObjectNotArray: () => IsObjectNotArray,
  IsString: () => IsString,
  IsSymbol: () => IsSymbol,
  IsUndefined: () => IsUndefined,
  IsUnsafePropertyKey: () => IsUnsafePropertyKey,
  IsValueLike: () => IsValueLike,
  Keys: () => Keys,
  Symbols: () => Symbols,
  TakeLeft: () => TakeLeft,
  Values: () => Values
});

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/guard/string.mjs
function IsBetween(value, min, max) {
  return value >= min && value <= max;
}
function IsRegionalIndicator(value) {
  return IsBetween(value, 127462, 127487);
}
function IsVariationSelector(value) {
  return IsBetween(value, 65024, 65039);
}
function IsCombiningMark(value) {
  return IsBetween(value, 768, 879) || IsBetween(value, 6832, 6911) || IsBetween(value, 7616, 7679) || IsBetween(value, 65056, 65071);
}
function CodePointLength(value) {
  return value > 65535 ? 2 : 1;
}
function ConsumeModifiers(value, index) {
  while (index < value.length) {
    const point = value.codePointAt(index);
    if (IsCombiningMark(point) || IsVariationSelector(point)) {
      index += CodePointLength(point);
    } else {
      break;
    }
  }
  return index;
}
function NextGraphemeClusterIndex(value, clusterStart) {
  const startCP = value.codePointAt(clusterStart);
  let clusterEnd = clusterStart + CodePointLength(startCP);
  clusterEnd = ConsumeModifiers(value, clusterEnd);
  while (clusterEnd < value.length - 1 && value[clusterEnd] === "\u200D") {
    const nextCP = value.codePointAt(clusterEnd + 1);
    clusterEnd += 1 + CodePointLength(nextCP);
    clusterEnd = ConsumeModifiers(value, clusterEnd);
  }
  if (IsRegionalIndicator(startCP) && clusterEnd < value.length && IsRegionalIndicator(value.codePointAt(clusterEnd))) {
    clusterEnd += CodePointLength(value.codePointAt(clusterEnd));
  }
  return clusterEnd;
}
function IsGraphemeCodePoint(value) {
  return IsBetween(value, 55296, 56319) || // High surrogate
  IsBetween(value, 768, 879) || // Combining diacritical marks
  value === 8205;
}
function GraphemeCount(value) {
  let count = 0;
  let index = 0;
  while (index < value.length) {
    index = NextGraphemeClusterIndex(value, index);
    count++;
  }
  return count;
}
function IsMinLength(value, minLength) {
  if (minLength === 0)
    return true;
  let count = 0;
  let index = 0;
  while (index < value.length) {
    index = NextGraphemeClusterIndex(value, index);
    count++;
    if (count >= minLength)
      return true;
  }
  return false;
}
function IsMaxLength(value, maxLength) {
  let count = 0;
  let index = 0;
  while (index < value.length) {
    index = NextGraphemeClusterIndex(value, index);
    count++;
    if (count > maxLength)
      return false;
  }
  return true;
}
function IsMinLengthFast(value, minLength) {
  if (minLength === 0)
    return true;
  let index = 0;
  while (index < value.length) {
    if (IsGraphemeCodePoint(value.charCodeAt(index))) {
      return IsMinLength(value, minLength);
    }
    index++;
    if (index >= minLength)
      return true;
  }
  return false;
}
function IsMaxLengthFast(value, maxLength) {
  let index = 0;
  while (index < value.length) {
    if (IsGraphemeCodePoint(value.charCodeAt(index))) {
      return IsMaxLength(value, maxLength);
    }
    index++;
    if (index > maxLength)
      return false;
  }
  return true;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/guard/guard.mjs
function IsArray(value) {
  return Array.isArray(value);
}
function IsAsyncIterator(value) {
  return IsObject(value) && Symbol.asyncIterator in value;
}
function IsBigInt(value) {
  return IsEqual(typeof value, "bigint");
}
function IsBoolean(value) {
  return IsEqual(typeof value, "boolean");
}
function IsConstructor(value) {
  if (IsUndefined(value) || !IsFunction(value))
    return false;
  const result = Function.prototype.toString.call(value);
  if (/^class\s/.test(result))
    return true;
  if (/\[native code\]/.test(result))
    return true;
  return false;
}
function IsFunction(value) {
  return IsEqual(typeof value, "function");
}
function IsInteger(value) {
  return Number.isInteger(value);
}
function IsIterator(value) {
  return IsObject(value) && Symbol.iterator in value;
}
function IsNull(value) {
  return IsEqual(value, null);
}
function IsNumber(value) {
  return Number.isFinite(value);
}
function IsObjectNotArray(value) {
  return IsObject(value) && !IsArray(value);
}
function IsObject(value) {
  return IsEqual(typeof value, "object") && !IsNull(value);
}
function IsString(value) {
  return IsEqual(typeof value, "string");
}
function IsSymbol(value) {
  return IsEqual(typeof value, "symbol");
}
function IsUndefined(value) {
  return IsEqual(value, void 0);
}
function IsEqual(left, right) {
  return left === right;
}
function IsGreaterThan(left, right) {
  return left > right;
}
function IsLessThan(left, right) {
  return left < right;
}
function IsLessEqualThan(left, right) {
  return left <= right;
}
function IsGreaterEqualThan(left, right) {
  return left >= right;
}
function IsMultipleOf(dividend, divisor) {
  if (IsBigInt(dividend) || IsBigInt(divisor)) {
    return BigInt(dividend) % BigInt(divisor) === 0n;
  }
  const tolerance = 1e-10;
  if (!IsNumber(dividend))
    return true;
  if (IsInteger(dividend) && 1 / divisor % 1 === 0)
    return true;
  const mod = dividend % divisor;
  return Math.min(Math.abs(mod), Math.abs(mod - divisor)) < tolerance;
}
function IsClassInstance(value) {
  if (!IsObject(value))
    return false;
  const proto = globalThis.Object.getPrototypeOf(value);
  if (IsNull(proto))
    return false;
  return IsEqual(typeof proto.constructor, "function") && !(IsEqual(proto.constructor, globalThis.Object) || IsEqual(proto.constructor.name, "Object"));
}
function IsValueLike(value) {
  return IsBigInt(value) || IsBoolean(value) || IsNull(value) || IsNumber(value) || IsString(value) || IsUndefined(value);
}
function GraphemeCount2(value) {
  return GraphemeCount(value);
}
function IsMaxLength2(value, length) {
  return IsMaxLengthFast(value, length);
}
function IsMinLength2(value, length) {
  return IsMinLengthFast(value, length);
}
function Every(value, offset, callback) {
  for (let index = offset; index < value.length; index++) {
    if (!callback(value[index], index))
      return false;
  }
  return true;
}
function EveryAll(value, offset, callback) {
  let result = true;
  for (let index = offset; index < value.length; index++) {
    if (!callback(value[index], index))
      result = false;
  }
  return result;
}
function TakeLeft(array, true_, false_) {
  return IsEqual(array.length, 0) ? false_() : true_(array[0], array.slice(1));
}
function IsUnsafePropertyKey(key) {
  return IsEqual(key, "__proto__") || IsEqual(key, "constructor") || IsEqual(key, "prototype");
}
function HasPropertyKey(value, key) {
  return IsUnsafePropertyKey(key) ? Object.prototype.hasOwnProperty.call(value, key) : key in value;
}
function EntriesRegExp(value) {
  return Keys(value).map((key) => [new RegExp(`^${key}$`), value[key]]);
}
function Entries(value) {
  return Object.entries(value);
}
function Keys(value) {
  return Object.getOwnPropertyNames(value);
}
function Symbols(value) {
  return Object.getOwnPropertySymbols(value);
}
function Values(value) {
  return Object.values(value);
}
function DeepEqualObject(left, right) {
  if (!IsObject(right))
    return false;
  const keys = Keys(left);
  return IsEqual(keys.length, Keys(right).length) && keys.every((key) => IsDeepEqual(left[key], right[key]));
}
function DeepEqualArray(left, right) {
  return IsArray(right) && IsEqual(left.length, right.length) && left.every((_, index) => IsDeepEqual(left[index], right[index]));
}
function IsDeepEqual(left, right) {
  return IsArray(left) ? DeepEqualArray(left, right) : IsObject(left) ? DeepEqualObject(left, right) : IsEqual(left, right);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/guard/globals.mjs
var globals_exports = {};
__export(globals_exports, {
  IsBigInt64Array: () => IsBigInt64Array,
  IsBigUint64Array: () => IsBigUint64Array,
  IsBoolean: () => IsBoolean2,
  IsDate: () => IsDate,
  IsFloat32Array: () => IsFloat32Array,
  IsFloat64Array: () => IsFloat64Array,
  IsInt16Array: () => IsInt16Array,
  IsInt32Array: () => IsInt32Array,
  IsInt8Array: () => IsInt8Array,
  IsMap: () => IsMap,
  IsNumber: () => IsNumber2,
  IsRegExp: () => IsRegExp,
  IsSet: () => IsSet,
  IsString: () => IsString2,
  IsTypeArray: () => IsTypeArray,
  IsUint16Array: () => IsUint16Array,
  IsUint32Array: () => IsUint32Array,
  IsUint8Array: () => IsUint8Array,
  IsUint8ClampedArray: () => IsUint8ClampedArray
});
function IsBoolean2(value) {
  return value instanceof Boolean;
}
function IsNumber2(value) {
  return value instanceof Number;
}
function IsString2(value) {
  return value instanceof String;
}
function IsTypeArray(value) {
  return globalThis.ArrayBuffer.isView(value);
}
function IsInt8Array(value) {
  return value instanceof globalThis.Int8Array;
}
function IsUint8Array(value) {
  return value instanceof globalThis.Uint8Array;
}
function IsUint8ClampedArray(value) {
  return value instanceof globalThis.Uint8ClampedArray;
}
function IsInt16Array(value) {
  return value instanceof globalThis.Int16Array;
}
function IsUint16Array(value) {
  return value instanceof globalThis.Uint16Array;
}
function IsInt32Array(value) {
  return value instanceof globalThis.Int32Array;
}
function IsUint32Array(value) {
  return value instanceof globalThis.Uint32Array;
}
function IsFloat32Array(value) {
  return value instanceof globalThis.Float32Array;
}
function IsFloat64Array(value) {
  return value instanceof globalThis.Float64Array;
}
function IsBigInt64Array(value) {
  return value instanceof globalThis.BigInt64Array;
}
function IsBigUint64Array(value) {
  return value instanceof globalThis.BigUint64Array;
}
function IsRegExp(value) {
  return value instanceof globalThis.RegExp;
}
function IsDate(value) {
  return value instanceof globalThis.Date;
}
function IsSet(value) {
  return value instanceof globalThis.Set;
}
function IsMap(value) {
  return value instanceof globalThis.Map;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/system/memory/clone.mjs
function IsGuard(value) {
  return guard_exports.IsObject(value) && guard_exports.HasPropertyKey(value, "~guard");
}
function FromGuard(value) {
  return value;
}
function FromArray(value) {
  return value.map((value2) => FromValue(value2));
}
function FromObject(value) {
  const result = {};
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Object.keys(descriptors)) {
    const descriptor = descriptors[key];
    if (guard_exports.HasPropertyKey(descriptor, "value")) {
      Object.defineProperty(result, key, { ...descriptor, value: FromValue(descriptor.value) });
    }
  }
  return result;
}
function FromRegExp(value) {
  return new RegExp(value.source, value.flags);
}
function FromUnknown(value) {
  return value;
}
function FromValue(value) {
  return value instanceof RegExp ? FromRegExp(value) : IsGuard(value) ? FromGuard(value) : guard_exports.IsArray(value) ? FromArray(value) : guard_exports.IsObject(value) ? FromObject(value) : FromUnknown(value);
}
function Clone(value) {
  Metrics.clone += 1;
  return FromValue(value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/system/settings/settings.mjs
var settings_exports = {};
__export(settings_exports, {
  Get: () => Get,
  Reset: () => Reset,
  Set: () => Set2
});
var settings = {
  immutableTypes: false,
  maxErrors: 8,
  useAcceleration: true,
  exactOptionalPropertyTypes: false,
  enumerableKind: false,
  correctiveParse: false
};
function Reset() {
  settings.immutableTypes = false;
  settings.maxErrors = 8;
  settings.useAcceleration = true;
  settings.exactOptionalPropertyTypes = false;
  settings.enumerableKind = false;
  settings.correctiveParse = false;
}
function Set2(options) {
  for (const key of guard_exports.Keys(options)) {
    const value = options[key];
    if (value !== void 0) {
      Object.defineProperty(settings, key, { value });
    }
  }
}
function Get() {
  return settings;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/system/memory/create.mjs
function MergeHidden(left, right) {
  for (const key of Object.keys(right)) {
    Object.defineProperty(left, key, {
      configurable: true,
      writable: true,
      enumerable: false,
      value: right[key]
    });
  }
  return left;
}
function Merge(left, right) {
  return { ...left, ...right };
}
function Create(hidden, enumerable, options = {}) {
  Metrics.create += 1;
  const settings2 = settings_exports.Get();
  const withOptions = Merge(enumerable, options);
  const withHidden = settings2.enumerableKind ? Merge(withOptions, hidden) : MergeHidden(withOptions, hidden);
  return settings2.immutableTypes ? Object.freeze(withHidden) : withHidden;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/system/memory/discard.mjs
function Discard(value, propertyKeys) {
  Metrics.discard += 1;
  const result = {};
  const descriptors = Object.getOwnPropertyDescriptors(Clone(value));
  const keysToDiscard = new Set(propertyKeys);
  for (const key of Object.keys(descriptors)) {
    if (keysToDiscard.has(key))
      continue;
    Object.defineProperty(result, key, descriptors[key]);
  }
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/system/memory/update.mjs
function Update(current, hidden, enumerable) {
  Metrics.update += 1;
  const settings2 = settings_exports.Get();
  const result = Clone(current);
  for (const key of Object.keys(hidden)) {
    Object.defineProperty(result, key, {
      configurable: true,
      writable: true,
      enumerable: settings2.enumerableKind,
      value: hidden[key]
    });
  }
  for (const key of Object.keys(enumerable)) {
    Object.defineProperty(result, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: enumerable[key]
    });
  }
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/schema.mjs
function IsKind(value, kind) {
  return guard_exports.IsObject(value) && guard_exports.HasPropertyKey(value, "~kind") && guard_exports.IsEqual(value["~kind"], kind);
}
function IsSchema(value) {
  return guard_exports.IsObject(value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/action/_optional.mjs
function OptionalAddAction(type) {
  return memory_exports.Create({ ["~kind"]: "OptionalAddAction" }, { type }, {});
}
function IsOptionalAddAction(value) {
  return guard_exports.IsObject(value) && guard_exports.HasPropertyKey(value, "~kind") && guard_exports.HasPropertyKey(value, "type") && guard_exports.IsEqual(value["~kind"], "OptionalAddAction") && IsSchema(value.type);
}
function OptionalRemoveAction(type) {
  return memory_exports.Create({ ["~kind"]: "OptionalRemoveAction" }, { type }, {});
}
function IsOptionalRemoveAction(value) {
  return guard_exports.IsObject(value) && guard_exports.HasPropertyKey(value, "~kind") && guard_exports.HasPropertyKey(value, "type") && guard_exports.IsEqual(value["~kind"], "OptionalRemoveAction") && IsSchema(value.type);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/action/_readonly.mjs
function ReadonlyAddAction(type) {
  return memory_exports.Create({ ["~kind"]: "ReadonlyAddAction" }, { type }, {});
}
function IsReadonlyAddAction(value) {
  return guard_exports.IsObject(value) && guard_exports.HasPropertyKey(value, "~kind") && guard_exports.HasPropertyKey(value, "type") && guard_exports.IsEqual(value["~kind"], "ReadonlyAddAction") && IsSchema(value.type);
}
function ReadonlyRemoveAction(type) {
  return memory_exports.Create({ ["~kind"]: "ReadonlyRemoveAction" }, { type }, {});
}
function IsReadonlyRemoveAction(value) {
  return guard_exports.IsObject(value) && guard_exports.HasPropertyKey(value, "~kind") && guard_exports.HasPropertyKey(value, "type") && guard_exports.IsEqual(value["~kind"], "ReadonlyRemoveAction") && IsSchema(value.type);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/deferred.mjs
function Deferred(action, parameters, options) {
  return memory_exports.Create({ "~kind": "Deferred" }, { action, parameters, options }, {});
}
function IsDeferred(value) {
  return IsKind(value, "Deferred");
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/promise.mjs
function _Promise_(item, options) {
  return memory_exports.Create({ ["~kind"]: "Promise" }, { type: "promise", item }, options);
}
function IsPromise(value) {
  return IsKind(value, "Promise");
}
function PromiseOptions(type) {
  return memory_exports.Discard(type, ["~kind", "type", "item"]);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/_immutable.mjs
function ImmutableAdd(type) {
  return memory_exports.Update(type, { "~immutable": true }, {});
}
function Immutable(type) {
  return ImmutableAdd(type);
}
function IsImmutable(value) {
  return IsSchema(value) && guard_exports.HasPropertyKey(value, "~immutable");
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/_optional.mjs
function OptionalRemove(type) {
  const result = memory_exports.Discard(type, ["~optional"]);
  return result;
}
function OptionalAdd(type) {
  return memory_exports.Update(type, { "~optional": true }, {});
}
function Optional(type) {
  return OptionalAdd(type);
}
function IsOptional(value) {
  return IsSchema(value) && guard_exports.HasPropertyKey(value, "~optional");
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/_readonly.mjs
function ReadonlyRemove(type) {
  return memory_exports.Discard(type, ["~readonly"]);
}
function ReadonlyAdd(type) {
  return memory_exports.Update(type, { "~readonly": true }, {});
}
function Readonly(type) {
  return ReadonlyAdd(type);
}
function IsReadonly(value) {
  return IsSchema(value) && guard_exports.HasPropertyKey(value, "~readonly");
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/base.mjs
function BaseProperty(value) {
  return {
    enumerable: settings_exports.Get().enumerableKind,
    writable: false,
    configurable: false,
    value
  };
}
var Base = class {
  constructor() {
    globalThis.Object.defineProperty(this, "~kind", BaseProperty("Base"));
    globalThis.Object.defineProperty(this, "~guard", BaseProperty({
      check: (value) => this.Check(value),
      errors: (value) => this.Errors(value)
    }));
  }
  /** Checks a value or returns false if invalid */
  Check(_value) {
    return true;
  }
  /** Returns errors for a value. Return an empty array if valid.  */
  Errors(_value) {
    return [];
  }
  /** Converts a value into this type */
  Convert(value) {
    return value;
  }
  /** Cleans a value according to this type */
  Clean(value) {
    return value;
  }
  /** Returns a default value for this type */
  Default(value) {
    return value;
  }
  /** Creates a new instance of this type */
  Create() {
    throw new Error("Create not implemented");
  }
  /** Clones this type  */
  Clone() {
    throw Error("Clone not implemented");
  }
};
function IsBase(value) {
  return IsKind(value, "Base");
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/array.mjs
function _Array_(items, options) {
  return memory_exports.Create({ "~kind": "Array" }, { type: "array", items }, options);
}
function IsArray2(value) {
  return IsKind(value, "Array");
}
function ArrayOptions(type) {
  return memory_exports.Discard(type, ["~kind", "type", "items"]);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/async_iterator.mjs
function AsyncIterator(iteratorItems, options) {
  return memory_exports.Create({ "~kind": "AsyncIterator" }, { type: "asyncIterator", iteratorItems }, options);
}
function IsAsyncIterator2(value) {
  return IsKind(value, "AsyncIterator");
}
function AsyncIteratorOptions(type) {
  return memory_exports.Discard(type, ["~kind", "type", "iteratorItems"]);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/constructor.mjs
function Constructor(parameters, instanceType, options = {}) {
  return memory_exports.Create({ "~kind": "Constructor" }, { type: "constructor", parameters, instanceType }, options);
}
function IsConstructor2(value) {
  return IsKind(value, "Constructor");
}
function ConstructorOptions(type) {
  return memory_exports.Discard(type, ["~kind", "type", "parameters", "instanceType"]);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/function.mjs
function _Function_(parameters, returnType, options = {}) {
  return memory_exports.Create({ ["~kind"]: "Function" }, { type: "function", parameters, returnType }, options);
}
function IsFunction2(value) {
  return IsKind(value, "Function");
}
function FunctionOptions(type) {
  return memory_exports.Discard(type, ["~kind", "type", "parameters", "returnType"]);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/ref.mjs
function Ref(ref, options) {
  return memory_exports.Create({ ["~kind"]: "Ref" }, { $ref: ref }, options);
}
function IsRef(value) {
  return IsKind(value, "Ref");
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/generic.mjs
function Generic(parameters, expression) {
  return memory_exports.Create({ "~kind": "Generic" }, { type: "generic", parameters, expression });
}
function IsGeneric(value) {
  return IsKind(value, "Generic");
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/any.mjs
function Any(options) {
  return memory_exports.Create({ ["~kind"]: "Any" }, {}, options);
}
function IsAny(value) {
  return IsKind(value, "Any");
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/never.mjs
var NeverPattern = "(?!)";
function Never(options) {
  return memory_exports.Create({ "~kind": "Never" }, { not: {} }, options);
}
function IsNever(value) {
  return IsKind(value, "Never");
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/properties.mjs
function RequiredArray(properties) {
  return guard_exports.Keys(properties).filter((key) => !IsOptional(properties[key]));
}
function PropertyKeys(properties) {
  return guard_exports.Keys(properties);
}
function PropertyValues(properties) {
  return guard_exports.Values(properties);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/object.mjs
function _Object_(properties, options = {}) {
  const requiredKeys = RequiredArray(properties);
  const required = requiredKeys.length > 0 ? { required: requiredKeys } : {};
  return memory_exports.Create({ "~kind": "Object" }, { type: "object", ...required, properties }, options);
}
function IsObject2(value) {
  return IsKind(value, "Object");
}
function ObjectOptions(type) {
  return memory_exports.Discard(type, ["~kind", "type", "properties", "required"]);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/union.mjs
function Union(anyOf, options = {}) {
  return memory_exports.Create({ "~kind": "Union" }, { anyOf }, options);
}
function IsUnion(value) {
  return IsKind(value, "Union");
}
function UnionOptions(type) {
  return memory_exports.Discard(type, ["~kind", "anyOf"]);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/unknown.mjs
function Unknown(options) {
  return memory_exports.Create({ ["~kind"]: "Unknown" }, {}, options);
}
function IsUnknown(value) {
  return IsKind(value, "Unknown");
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/cyclic.mjs
function Cyclic($defs, $ref, options) {
  const defs = guard_exports.Keys($defs).reduce((result, key) => {
    return { ...result, [key]: memory_exports.Update($defs[key], {}, { $id: key }) };
  }, {});
  return memory_exports.Create({ ["~kind"]: "Cyclic" }, { $defs: defs, $ref }, options);
}
function IsCyclic(value) {
  return IsKind(value, "Cyclic");
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/unsafe.mjs
function Unsafe(schema) {
  return memory_exports.Update(schema, { ["~unsafe"]: null }, {});
}
function IsUnsafe(value) {
  return guard_exports.IsObjectNotArray(value) && guard_exports.HasPropertyKey(value, "~unsafe") && guard_exports.IsNull(value["~unsafe"]);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/system/arguments/arguments.mjs
var arguments_exports = {};
__export(arguments_exports, {
  Match: () => Match
});
function Match(args, match) {
  return match[args.length]?.(...args) ?? (() => {
    throw Error("Invalid Arguments");
  })();
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/infer.mjs
function Infer(...args) {
  const [name, extends_] = arguments_exports.Match(args, {
    2: (name2, extends_2) => [name2, extends_2, extends_2],
    1: (name2) => [name2, Unknown(), Unknown()]
  });
  return memory_exports.Create({ ["~kind"]: "Infer" }, { type: "infer", name, extends: extends_ }, {});
}
function IsInfer(value) {
  return IsKind(value, "Infer");
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/enum/typescript_enum_to_enum_values.mjs
function IsTypeScriptEnumLike(value) {
  return guard_exports.IsObjectNotArray(value);
}
function TypeScriptEnumToEnumValues(type) {
  const keys = guard_exports.Keys(type).filter((key) => isNaN(key));
  return keys.reduce((result, key) => [...result, type[key]], []);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/enum.mjs
function Enum(value, options) {
  const values = IsTypeScriptEnumLike(value) ? TypeScriptEnumToEnumValues(value) : value;
  return memory_exports.Create({ "~kind": "Enum" }, { enum: values }, options);
}
function IsEnum(value) {
  return IsKind(value, "Enum");
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/intersect.mjs
function Intersect(types, options = {}) {
  return memory_exports.Create({ "~kind": "Intersect" }, { allOf: types }, options);
}
function IsIntersect(value) {
  return IsKind(value, "Intersect");
}
function IntersectOptions(type) {
  return memory_exports.Discard(type, ["~kind", "allOf"]);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/system/hashing/hash.mjs
var hash_exports = {};
__export(hash_exports, {
  Hash: () => Hash,
  HashCode: () => HashCode
});

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/system/unreachable/unreachable.mjs
function Unreachable() {
  throw new Error("Unreachable");
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/system/hashing/hash.mjs
function InstanceKeys(value) {
  const propertyKeys = /* @__PURE__ */ new Set();
  let current = value;
  while (current && current !== Object.prototype) {
    for (const key of Reflect.ownKeys(current)) {
      if (key !== "constructor" && typeof key !== "symbol")
        propertyKeys.add(key);
    }
    current = Object.getPrototypeOf(current);
  }
  return [...propertyKeys];
}
function IsIEEE754(value) {
  return typeof value === "number";
}
var ByteMarker;
(function(ByteMarker2) {
  ByteMarker2[ByteMarker2["Array"] = 0] = "Array";
  ByteMarker2[ByteMarker2["BigInt"] = 1] = "BigInt";
  ByteMarker2[ByteMarker2["Boolean"] = 2] = "Boolean";
  ByteMarker2[ByteMarker2["Date"] = 3] = "Date";
  ByteMarker2[ByteMarker2["Constructor"] = 4] = "Constructor";
  ByteMarker2[ByteMarker2["Function"] = 5] = "Function";
  ByteMarker2[ByteMarker2["Null"] = 6] = "Null";
  ByteMarker2[ByteMarker2["Number"] = 7] = "Number";
  ByteMarker2[ByteMarker2["Object"] = 8] = "Object";
  ByteMarker2[ByteMarker2["RegExp"] = 9] = "RegExp";
  ByteMarker2[ByteMarker2["String"] = 10] = "String";
  ByteMarker2[ByteMarker2["Symbol"] = 11] = "Symbol";
  ByteMarker2[ByteMarker2["TypeArray"] = 12] = "TypeArray";
  ByteMarker2[ByteMarker2["Undefined"] = 13] = "Undefined";
})(ByteMarker || (ByteMarker = {}));
var Accumulator = BigInt("14695981039346656037");
var [Prime, Size] = [BigInt("1099511628211"), BigInt(
  "18446744073709551616"
  /* 2 ^ 64 */
)];
var Bytes = Array.from({ length: 256 }).map((_, i) => BigInt(i));
var F64 = new Float64Array(1);
var F64In = new DataView(F64.buffer);
var F64Out = new Uint8Array(F64.buffer);
function FNV1A64_OP(byte) {
  Accumulator = Accumulator ^ Bytes[byte];
  Accumulator = Accumulator * Prime % Size;
}
function FromArray2(value) {
  FNV1A64_OP(ByteMarker.Array);
  for (const item of value) {
    FromValue2(item);
  }
}
function FromBigInt(value) {
  FNV1A64_OP(ByteMarker.BigInt);
  F64In.setBigInt64(0, value);
  for (const byte of F64Out) {
    FNV1A64_OP(byte);
  }
}
function FromBoolean(value) {
  FNV1A64_OP(ByteMarker.Boolean);
  FNV1A64_OP(value ? 1 : 0);
}
function FromConstructor(value) {
  FNV1A64_OP(ByteMarker.Constructor);
  FromValue2(value.toString());
}
function FromDate(value) {
  FNV1A64_OP(ByteMarker.Date);
  FromValue2(value.getTime());
}
function FromFunction(value) {
  FNV1A64_OP(ByteMarker.Function);
  FromValue2(value.toString());
}
function FromNull(_value) {
  FNV1A64_OP(ByteMarker.Null);
}
function FromNumber(value) {
  FNV1A64_OP(ByteMarker.Number);
  F64In.setFloat64(
    0,
    value,
    true
    /* little-endian */
  );
  for (const byte of F64Out) {
    FNV1A64_OP(byte);
  }
}
function FromObject2(value) {
  FNV1A64_OP(ByteMarker.Object);
  for (const key of InstanceKeys(value).sort()) {
    FromValue2(key);
    FromValue2(value[key]);
  }
}
function FromRegExp2(value) {
  FNV1A64_OP(ByteMarker.RegExp);
  FromString(value.toString());
}
var encoder = new TextEncoder();
function FromString(value) {
  FNV1A64_OP(ByteMarker.String);
  for (const byte of encoder.encode(value)) {
    FNV1A64_OP(byte);
  }
}
function FromSymbol(value) {
  FNV1A64_OP(ByteMarker.Symbol);
  FromValue2(value.toString());
}
function FromTypeArray(value) {
  FNV1A64_OP(ByteMarker.TypeArray);
  const buffer = new Uint8Array(value.buffer);
  for (let i = 0; i < buffer.length; i++) {
    FNV1A64_OP(buffer[i]);
  }
}
function FromUndefined(_value) {
  return FNV1A64_OP(ByteMarker.Undefined);
}
function FromValue2(value) {
  return globals_exports.IsTypeArray(value) ? FromTypeArray(value) : globals_exports.IsDate(value) ? FromDate(value) : globals_exports.IsRegExp(value) ? FromRegExp2(value) : globals_exports.IsBoolean(value) ? FromBoolean(value.valueOf()) : globals_exports.IsString(value) ? FromString(value.valueOf()) : globals_exports.IsNumber(value) ? FromNumber(value.valueOf()) : IsIEEE754(value) ? FromNumber(value) : guard_exports.IsArray(value) ? FromArray2(value) : guard_exports.IsBoolean(value) ? FromBoolean(value) : guard_exports.IsBigInt(value) ? FromBigInt(value) : guard_exports.IsConstructor(value) ? FromConstructor(value) : guard_exports.IsNull(value) ? FromNull(value) : guard_exports.IsObject(value) ? FromObject2(value) : guard_exports.IsString(value) ? FromString(value) : guard_exports.IsSymbol(value) ? FromSymbol(value) : guard_exports.IsUndefined(value) ? FromUndefined(value) : guard_exports.IsFunction(value) ? FromFunction(value) : Unreachable();
}
function HashCode(value) {
  Accumulator = BigInt("14695981039346656037");
  FromValue2(value);
  return Accumulator;
}
function Hash(value) {
  return HashCode(value).toString(16).padStart(16, "0");
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/system/locale/en_US.mjs
function en_US(error) {
  switch (error.keyword) {
    case "additionalProperties":
      return "must not have additional properties";
    case "anyOf":
      return "must match a schema in anyOf";
    case "boolean":
      return "schema is false";
    case "const":
      return "must be equal to constant";
    case "contains":
      return "must contain at least 1 valid item";
    case "dependencies":
      return `must have properties ${error.params.dependencies.join(", ")} when property ${error.params.property} is present`;
    case "dependentRequired":
      return `must have properties ${error.params.dependencies.join(", ")} when property ${error.params.property} is present`;
    case "enum":
      return "must be equal to one of the allowed values";
    case "exclusiveMaximum":
      return `must be ${error.params.comparison} ${error.params.limit}`;
    case "exclusiveMinimum":
      return `must be ${error.params.comparison} ${error.params.limit}`;
    case "format":
      return `must match format "${error.params.format}"`;
    case "if":
      return `must match "${error.params.failingKeyword}" schema`;
    case "maxItems":
      return `must not have more than ${error.params.limit} items`;
    case "maxLength":
      return `must not have more than ${error.params.limit} characters`;
    case "maxProperties":
      return `must not have more than ${error.params.limit} properties`;
    case "maximum":
      return `must be ${error.params.comparison} ${error.params.limit}`;
    case "minItems":
      return `must not have fewer than ${error.params.limit} items`;
    case "minLength":
      return `must not have fewer than ${error.params.limit} characters`;
    case "minProperties":
      return `must not have fewer than ${error.params.limit} properties`;
    case "minimum":
      return `must be ${error.params.comparison} ${error.params.limit}`;
    case "multipleOf":
      return `must be multiple of ${error.params.multipleOf}`;
    case "not":
      return "must not be valid";
    case "oneOf":
      return "must match exactly one schema in oneOf";
    case "pattern":
      return `must match pattern "${error.params.pattern}"`;
    case "propertyNames":
      return `property names ${error.params.propertyNames.join(", ")} are invalid`;
    case "required":
      return `must have required properties ${error.params.requiredProperties.join(", ")}`;
    case "type":
      return typeof error.params.type === "string" ? `must be ${error.params.type}` : `must be either ${error.params.type.join(" or ")}`;
    case "unevaluatedItems":
      return "must not have unevaluated items";
    case "unevaluatedProperties":
      return "must not have unevaluated properties";
    case "uniqueItems":
      return `must not have duplicate items`;
    case "~guard":
      return `must match check function`;
    case "~refine":
      return error.params.message;
    // deno-coverage-ignore - unreachable
    default:
      return "an unknown validation error occurred";
  }
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/system/locale/_config.mjs
var locale = en_US;
function Get2() {
  return locale;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/_codec.mjs
var EncodeBuilder = class {
  constructor(type, decode) {
    this.type = type;
    this.decode = decode;
  }
  Encode(callback) {
    const type = this.type;
    const decode = IsCodec(type) ? (value) => this.decode(type["~codec"].decode(value)) : this.decode;
    const encode = IsCodec(type) ? (value) => type["~codec"].encode(callback(value)) : callback;
    const codec = { decode, encode };
    return memory_exports.Update(this.type, { "~codec": codec }, {});
  }
};
var DecodeBuilder = class {
  constructor(type) {
    this.type = type;
  }
  Decode(callback) {
    return new EncodeBuilder(this.type, callback);
  }
};
function Codec(type) {
  return new DecodeBuilder(type);
}
function Decode(type, callback) {
  return Codec(type).Decode(callback).Encode(() => {
    throw Error("Encode not implemented");
  });
}
function Encode(type, callback) {
  return Codec(type).Decode(() => {
    throw Error("Decode not implemented");
  }).Encode(callback);
}
function IsCodec(value) {
  return IsSchema(value) && guard_exports.HasPropertyKey(value, "~codec") && guard_exports.IsObject(value["~codec"]) && guard_exports.HasPropertyKey(value["~codec"], "encode") && guard_exports.HasPropertyKey(value["~codec"], "decode");
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/_refine.mjs
function RefineAdd(type, refinement) {
  const refinements = IsRefine(type) ? [...type["~refine"], refinement] : [refinement];
  return memory_exports.Update(type, { "~refine": refinements }, {});
}
function Refine(...args) {
  const [type, check, error_or_message] = arguments_exports.Match(args, {
    3: (type2, check2, error2) => [type2, check2, error2],
    2: (type2, check2) => [type2, check2, () => "Refine Error"]
  });
  const error = guard_exports.IsString(error_or_message) ? () => error_or_message : error_or_message;
  return RefineAdd(type, { check, error });
}
function IsRefinement(value) {
  return guard_exports.IsObjectNotArray(value) && guard_exports.HasPropertyKey(value, "check") && guard_exports.HasPropertyKey(value, "error") && guard_exports.IsFunction(value.check) && guard_exports.IsFunction(value.error);
}
function IsRefine(value) {
  return IsSchema(value) && guard_exports.HasPropertyKey(value, "~refine") && guard_exports.IsArray(value["~refine"]) && guard_exports.Every(value["~refine"], 0, (value2) => IsRefinement(value2));
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/bigint.mjs
var BigIntPattern = "-?(?:0|[1-9][0-9]*)n";
function BigInt2(options) {
  return memory_exports.Create({ "~kind": "BigInt" }, { type: "bigint" }, options);
}
function IsBigInt2(value) {
  return IsKind(value, "BigInt");
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/boolean.mjs
function Boolean2(options) {
  return memory_exports.Create({ "~kind": "Boolean" }, { type: "boolean" }, options);
}
function IsBoolean3(value) {
  return IsKind(value, "Boolean");
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/identifier.mjs
function Identifier(name) {
  return memory_exports.Create({ "~kind": "Identifier" }, { name });
}
function IsIdentifier(value) {
  return IsKind(value, "Identifier");
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/integer.mjs
var IntegerPattern = "-?(?:0|[1-9][0-9]*)";
function Integer(options) {
  return memory_exports.Create({ "~kind": "Integer" }, { type: "integer" }, options);
}
function IsInteger2(value) {
  return IsKind(value, "Integer");
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/iterator.mjs
function Iterator(iteratorItems, options) {
  return memory_exports.Create({ "~kind": "Iterator" }, { type: "iterator", iteratorItems }, options);
}
function IsIterator2(value) {
  return IsKind(value, "Iterator");
}
function IteratorOptions(type) {
  return memory_exports.Discard(type, ["~kind", "type", "iteratorItems"]);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/literal.mjs
var InvalidLiteralValue = class extends Error {
  constructor(value) {
    super(`Invalid Literal value`);
    Object.defineProperty(this, "cause", {
      value: { value },
      writable: false,
      configurable: false,
      enumerable: false
    });
  }
};
function LiteralTypeName(value) {
  return guard_exports.IsBigInt(value) ? "bigint" : guard_exports.IsBoolean(value) ? "boolean" : guard_exports.IsNumber(value) ? "number" : guard_exports.IsString(value) ? "string" : (() => {
    throw new InvalidLiteralValue(value);
  })();
}
function Literal(value, options) {
  return memory_exports.Create({ "~kind": "Literal" }, { type: LiteralTypeName(value), const: value }, options);
}
function IsLiteralValue(value) {
  return guard_exports.IsBigInt(value) || guard_exports.IsBoolean(value) || guard_exports.IsNumber(value) || guard_exports.IsString(value);
}
function IsLiteralBigInt(value) {
  return IsLiteral(value) && guard_exports.IsBigInt(value.const);
}
function IsLiteralBoolean(value) {
  return IsLiteral(value) && guard_exports.IsBoolean(value.const);
}
function IsLiteralNumber(value) {
  return IsLiteral(value) && guard_exports.IsNumber(value.const);
}
function IsLiteralString(value) {
  return IsLiteral(value) && guard_exports.IsString(value.const);
}
function IsLiteral(value) {
  return IsKind(value, "Literal");
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/null.mjs
function Null(options) {
  return memory_exports.Create({ "~kind": "Null" }, { type: "null" }, options);
}
function IsNull2(value) {
  return IsKind(value, "Null");
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/number.mjs
var NumberPattern = "-?(?:0|[1-9][0-9]*)(?:.[0-9]+)?";
function Number2(options) {
  return memory_exports.Create({ "~kind": "Number" }, { type: "number" }, options);
}
function IsNumber3(value) {
  return IsKind(value, "Number");
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/symbol.mjs
function Symbol2(options) {
  return memory_exports.Create({ "~kind": "Symbol" }, { type: "symbol" }, options);
}
function IsSymbol2(value) {
  return IsKind(value, "Symbol");
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/parameter.mjs
function Parameter(...args) {
  const [name, extends_, equals] = arguments_exports.Match(args, {
    3: (name2, extends_2, equals2) => [name2, extends_2, equals2],
    2: (name2, extends_2) => [name2, extends_2, extends_2],
    1: (name2) => [name2, Unknown(), Unknown()]
  });
  return memory_exports.Create({ "~kind": "Parameter" }, { name, extends: extends_, equals }, {});
}
function IsParameter(value) {
  return IsKind(value, "Parameter");
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/string.mjs
var StringPattern = ".*";
function String2(options) {
  return memory_exports.Create({ "~kind": "String" }, { type: "string" }, options);
}
function IsString3(value) {
  return IsKind(value, "String");
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/patterns/pattern.mjs
function ParsePatternIntoTypes(pattern) {
  const parsed = Pattern(pattern);
  const result = guard_exports.IsEqual(parsed.length, 2) ? parsed[0] : [];
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/template_literal/is_finite.mjs
function FromLiteral(_value) {
  return true;
}
function FromTypesReduce(types) {
  return guard_exports.TakeLeft(types, (left, right) => FromType(left) ? FromTypesReduce(right) : false, () => true);
}
function FromTypes(types) {
  const result = guard_exports.IsEqual(types.length, 0) ? false : FromTypesReduce(types);
  return result;
}
function FromType(type) {
  return IsUnion(type) ? FromTypes(type.anyOf) : IsLiteral(type) ? FromLiteral(type.const) : false;
}
function IsTemplateLiteralFinite(types) {
  const result = FromTypes(types);
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/template_literal/create.mjs
function TemplateLiteralCreate(pattern) {
  return memory_exports.Create({ ["~kind"]: "TemplateLiteral" }, { type: "string", pattern }, {});
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/template_literal/decode.mjs
function FromLiteralPush(variants, value, result = []) {
  return guard_exports.TakeLeft(variants, (left, right) => FromLiteralPush(right, value, [...result, `${left}${value}`]), () => result);
}
function FromLiteral2(variants, value) {
  return guard_exports.IsEqual(variants.length, 0) ? [`${value}`] : FromLiteralPush(variants, value);
}
function FromUnion(variants, types, result = []) {
  return guard_exports.TakeLeft(types, (left, right) => FromUnion(variants, right, [...result, ...FromType2(variants, left)]), () => result);
}
function FromType2(variants, type) {
  const result = IsUnion(type) ? FromUnion(variants, type.anyOf) : IsLiteral(type) ? FromLiteral2(variants, type.const) : Unreachable();
  return result;
}
function DecodeFromSpan(variants, types) {
  return guard_exports.TakeLeft(types, (left, right) => DecodeFromSpan(FromType2(variants, left), right), () => variants);
}
function VariantsToLiterals(variants) {
  return variants.map((variant) => Literal(variant));
}
function DecodeTypesAsUnion(types) {
  const variants = DecodeFromSpan([], types);
  const literals = VariantsToLiterals(variants);
  const result = Union(literals);
  return result;
}
function DecodeTypes(types) {
  return guard_exports.IsEqual(types.length, 0) ? Unreachable() : (
    // Literal('') :
    guard_exports.IsEqual(types.length, 1) && IsLiteral(types[0]) ? types[0] : DecodeTypesAsUnion(types)
  );
}
function TemplateLiteralDecodeUnsafe(pattern) {
  const types = ParsePatternIntoTypes(pattern);
  const result = guard_exports.IsEqual(types.length, 0) ? String2() : IsTemplateLiteralFinite(types) ? DecodeTypes(types) : TemplateLiteralCreate(pattern);
  return result;
}
function TemplateLiteralDecode(pattern) {
  const decoded = TemplateLiteralDecodeUnsafe(pattern);
  const result = IsTemplateLiteral(decoded) ? String2() : decoded;
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/record/record_create.mjs
function CreateRecord(key, value) {
  const type = "object";
  const patternProperties = { [key]: value };
  return memory_exports.Create({ ["~kind"]: "Record" }, { type, patternProperties });
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/record/from_key_any.mjs
function FromAnyKey(value) {
  return CreateRecord(StringKey, value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/record/from_key_boolean.mjs
function FromBooleanKey(value) {
  return _Object_({ true: value, false: value });
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/enum/enum_to_union.mjs
function FromEnumValue(value) {
  return guard_exports.IsString(value) || guard_exports.IsNumber(value) ? Literal(value) : guard_exports.IsNull(value) ? Null() : Never();
}
function EnumValuesToVariants(values) {
  const result = values.map((value) => FromEnumValue(value));
  return result;
}
function EnumValuesToUnion(values) {
  const variants = EnumValuesToVariants(values);
  const result = Union(variants);
  return result;
}
function EnumToUnion(type) {
  const result = EnumValuesToUnion(type.enum);
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/record/from_key_enum.mjs
function FromEnumKey(values, value) {
  const unionKey = EnumValuesToUnion(values);
  const result = FromKey(unionKey, value);
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/record/from_key_integer.mjs
function FromIntegerKey(_key, value) {
  const result = CreateRecord(IntegerKey, value);
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/tuple.mjs
function Tuple(types, options = {}) {
  const [items, minItems, additionalItems] = [types, types.length, false];
  return memory_exports.Create({ ["~kind"]: "Tuple" }, { type: "array", additionalItems, items, minItems }, options);
}
function IsTuple(value) {
  return IsKind(value, "Tuple");
}
function TupleOptions(type) {
  return memory_exports.Discard(type, ["~kind", "type", "items", "minItems", "additionalItems"]);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/tuple/to_object.mjs
function TupleElementsToProperties(types) {
  const result = types.reduceRight((result2, right, index) => {
    return { [index]: right, ...result2 };
  }, {});
  return result;
}
function TupleToObject(type) {
  const properties = TupleElementsToProperties(type.items);
  const result = _Object_(properties);
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/evaluate/composite.mjs
function IsReadonlyProperty(left, right) {
  return IsReadonly(left) ? IsReadonly(right) ? true : false : false;
}
function IsOptionalProperty(left, right) {
  return IsOptional(left) ? IsOptional(right) ? true : false : false;
}
function CompositeProperty(left, right) {
  const isReadonly = IsReadonlyProperty(left, right);
  const isOptional = IsOptionalProperty(left, right);
  const evaluated = EvaluateIntersect([left, right]);
  const property = ReadonlyRemove(OptionalRemove(evaluated));
  return isReadonly && isOptional ? ReadonlyAdd(OptionalAdd(property)) : isReadonly && !isOptional ? ReadonlyAdd(property) : !isReadonly && isOptional ? OptionalAdd(property) : property;
}
function CompositePropertyKey(left, right, key) {
  return key in left ? key in right ? CompositeProperty(left[key], right[key]) : left[key] : key in right ? right[key] : Never();
}
function CompositeProperties(left, right) {
  const keys = /* @__PURE__ */ new Set([...guard_exports.Keys(right), ...guard_exports.Keys(left)]);
  return [...keys].reduce((result, key) => {
    return { ...result, [key]: CompositePropertyKey(left, right, key) };
  }, {});
}
function GetProperties(type) {
  const result = IsObject2(type) ? type.properties : IsTuple(type) ? TupleElementsToProperties(type.items) : Unreachable();
  return result;
}
function Composite(left, right) {
  const leftProperties = GetProperties(left);
  const rightProperties = GetProperties(right);
  const properties = CompositeProperties(leftProperties, rightProperties);
  return _Object_(properties);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/evaluate/narrow.mjs
function Narrow(left, right) {
  const result = Compare(left, right);
  return guard_exports.IsEqual(result, ResultLeftInside) ? left : guard_exports.IsEqual(result, ResultRightInside) ? right : guard_exports.IsEqual(result, ResultEqual) ? right : Never();
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/evaluate/distribute.mjs
function IsObjectLike(type) {
  return IsObject2(type) || IsTuple(type);
}
function IsUnionOperand(left, right) {
  const isUnionLeft = IsUnion(left);
  const isUnionRight = IsUnion(right);
  const result = isUnionLeft || isUnionRight;
  return result;
}
function DistributeOperation(left, right) {
  const evaluatedLeft = EvaluateType(left);
  const evaluatedRight = EvaluateType(right);
  const isUnionOperand = IsUnionOperand(evaluatedLeft, evaluatedRight);
  const isObjectLeft = IsObjectLike(evaluatedLeft);
  const IsObjectRight = IsObjectLike(evaluatedRight);
  const result = isUnionOperand ? EvaluateIntersect([evaluatedLeft, evaluatedRight]) : isObjectLeft && IsObjectRight ? Composite(evaluatedLeft, evaluatedRight) : isObjectLeft && !IsObjectRight ? evaluatedLeft : !isObjectLeft && IsObjectRight ? evaluatedRight : Narrow(evaluatedLeft, evaluatedRight);
  return result;
}
function DistributeType(type, types, result = []) {
  return guard_exports.TakeLeft(types, (left, right) => DistributeType(type, right, [...result, DistributeOperation(type, left)]), () => guard_exports.IsEqual(result.length, 0) ? [type] : result);
}
function DistributeUnion(types, distribution, result = []) {
  return guard_exports.TakeLeft(types, (left, right) => DistributeUnion(right, distribution, [...result, ...Distribute([left], distribution)]), () => result);
}
function Distribute(types, result = []) {
  return guard_exports.TakeLeft(types, (left, right) => IsUnion(left) ? Distribute(right, DistributeUnion(left.anyOf, result)) : Distribute(right, DistributeType(left, result)), () => result);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/evaluate/evaluate.mjs
function EvaluateIntersect(types) {
  const distribution = Distribute(types);
  const result = Broaden(distribution);
  return result;
}
function EvaluateUnion(types) {
  const result = Broaden(types);
  return result;
}
function EvaluateType(type) {
  return IsIntersect(type) ? EvaluateIntersect(type.allOf) : IsUnion(type) ? EvaluateUnion(type.anyOf) : type;
}
function EvaluateUnionFast(types) {
  const result = guard_exports.IsEqual(types.length, 1) ? types[0] : guard_exports.IsEqual(types.length, 0) ? Never() : Union(types);
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/record/from_key_intersect.mjs
function FromIntersectKey(types, value) {
  const evaluatedKey = EvaluateIntersect(types);
  const result = FromKey(evaluatedKey, value);
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/record/from_key_literal.mjs
function FromLiteralKey(key, value) {
  return guard_exports.IsString(key) || guard_exports.IsNumber(key) ? _Object_({ [key]: value }) : guard_exports.IsEqual(key, false) ? _Object_({ false: value }) : guard_exports.IsEqual(key, true) ? _Object_({ true: value }) : _Object_({});
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/record/from_key_number.mjs
function FromNumberKey(_key, value) {
  const result = CreateRecord(NumberKey, value);
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/record/from_key_string.mjs
function FromStringKey(key, value) {
  return guard_exports.HasPropertyKey(key, "pattern") && (guard_exports.IsString(key.pattern) || key.pattern instanceof RegExp) ? CreateRecord(key.pattern.toString(), value) : CreateRecord(StringKey, value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/record/from_key_template_literal.mjs
function FromTemplateKey(pattern, value) {
  const types = ParsePatternIntoTypes(pattern);
  const finite = IsTemplateLiteralFinite(types);
  const result = finite ? FromKey(TemplateLiteralDecode(pattern), value) : CreateRecord(pattern, value);
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/evaluate/flatten.mjs
function FlattenType(type) {
  const result = IsUnion(type) ? Flatten(type.anyOf) : [type];
  return result;
}
function Flatten(types) {
  return types.reduce((result, type) => {
    return [...result, ...FlattenType(type)];
  }, []);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/record/from_key_union.mjs
function StringOrNumberCheck(types) {
  return types.some((type) => IsString3(type) || IsNumber3(type) || IsInteger2(type));
}
function TryBuildRecord(types, value) {
  return guard_exports.IsEqual(StringOrNumberCheck(types), true) ? CreateRecord(StringKey, value) : void 0;
}
function CreateProperties(types, value) {
  return types.reduce((result, left) => {
    return IsLiteral(left) && (guard_exports.IsString(left.const) || guard_exports.IsNumber(left.const)) ? { ...result, [left.const]: value } : result;
  }, {});
}
function CreateObject(types, value) {
  const properties = CreateProperties(types, value);
  const result = _Object_(properties);
  return result;
}
function FromUnionKey(types, value) {
  const flattened = Flatten(types);
  const record = TryBuildRecord(flattened, value);
  return IsSchema(record) ? record : CreateObject(flattened, value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/record/from_key.mjs
function FromKey(key, value) {
  const result = IsAny(key) ? FromAnyKey(value) : IsBoolean3(key) ? FromBooleanKey(value) : IsEnum(key) ? FromEnumKey(key.enum, value) : IsInteger2(key) ? FromIntegerKey(key, value) : IsIntersect(key) ? FromIntersectKey(key.allOf, value) : IsLiteral(key) ? FromLiteralKey(key.const, value) : IsNumber3(key) ? FromNumberKey(key, value) : IsUnion(key) ? FromUnionKey(key.anyOf, value) : IsString3(key) ? FromStringKey(key, value) : IsTemplateLiteral(key) ? FromTemplateKey(key.pattern, value) : _Object_({});
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/record/instantiate.mjs
function RecordAction(key, value, options) {
  const result = CanInstantiate([key]) ? memory_exports.Update(FromKey(key, value), {}, options) : RecordDeferred(key, value, options);
  return result;
}
function RecordInstantiate(context, state, key, value, options) {
  const instantiatedKey = InstantiateType(context, state, key);
  const instantiatedValue = InstantiateType(context, state, value);
  return RecordAction(instantiatedKey, instantiatedValue, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/record.mjs
var IntegerKey = `^${IntegerPattern}$`;
var NumberKey = `^${NumberPattern}$`;
var StringKey = `^${StringPattern}$`;
function RecordDeferred(key, value, options = {}) {
  return Deferred("Record", [key, value], options);
}
function Record(key, value, options = {}) {
  return RecordAction(key, value, options);
}
function RecordFromPattern(key, value) {
  return CreateRecord(key, value);
}
function RecordPattern(type) {
  return guard_exports.Keys(type.patternProperties)[0];
}
function RecordKey(type) {
  const pattern = RecordPattern(type);
  const result = guard_exports.IsEqual(pattern, StringKey) ? String2() : guard_exports.IsEqual(pattern, IntegerKey) ? Integer() : guard_exports.IsEqual(pattern, NumberKey) ? Number2() : TemplateLiteralDecodeUnsafe(pattern);
  return result;
}
function RecordValue(type) {
  return type.patternProperties[RecordPattern(type)];
}
function IsRecord(value) {
  return IsKind(value, "Record");
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/rest.mjs
function Rest(type) {
  return memory_exports.Create({ "~kind": "Rest" }, { type: "rest", items: type }, {});
}
function IsRest(value) {
  return IsKind(value, "Rest");
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/this.mjs
function This(options) {
  return memory_exports.Create({ ["~kind"]: "This" }, { $ref: "#" }, options);
}
function IsThis(value) {
  return IsKind(value, "This");
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/undefined.mjs
function Undefined(options) {
  return memory_exports.Create({ "~kind": "Undefined" }, { type: "undefined" }, options);
}
function IsUndefined2(value) {
  return IsKind(value, "Undefined");
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/void.mjs
function Void(options) {
  return memory_exports.Create({ "~kind": "Void" }, { type: "void" }, options);
}
function IsVoid(value) {
  return IsKind(value, "Void");
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/script/mapping.mjs
function IntrinsicOrCall(ref, parameters) {
  return guard_exports.IsEqual(ref, "Array") ? _Array_(parameters[0]) : guard_exports.IsEqual(ref, "AsyncIterator") ? AsyncIterator(parameters[0]) : guard_exports.IsEqual(ref, "Iterator") ? Iterator(parameters[0]) : guard_exports.IsEqual(ref, "Promise") ? _Promise_(parameters[0]) : guard_exports.IsEqual(ref, "Awaited") ? AwaitedDeferred(parameters[0]) : guard_exports.IsEqual(ref, "Capitalize") ? CapitalizeDeferred(parameters[0]) : guard_exports.IsEqual(ref, "ConstructorParameters") ? ConstructorParametersDeferred(parameters[0]) : guard_exports.IsEqual(ref, "Evaluate") ? EvaluateDeferred(parameters[0]) : guard_exports.IsEqual(ref, "Exclude") ? ExcludeDeferred(parameters[0], parameters[1]) : guard_exports.IsEqual(ref, "Extract") ? ExtractDeferred(parameters[0], parameters[1]) : guard_exports.IsEqual(ref, "Index") ? IndexDeferred(parameters[0], parameters[1]) : guard_exports.IsEqual(ref, "InstanceType") ? InstanceTypeDeferred(parameters[0]) : guard_exports.IsEqual(ref, "Lowercase") ? LowercaseDeferred(parameters[0]) : guard_exports.IsEqual(ref, "NonNullable") ? NonNullableDeferred(parameters[0]) : guard_exports.IsEqual(ref, "Omit") ? OmitDeferred(parameters[0], parameters[1]) : guard_exports.IsEqual(ref, "Options") ? OptionsDeferred(parameters[0], parameters[1]) : guard_exports.IsEqual(ref, "Parameters") ? ParametersDeferred(parameters[0]) : guard_exports.IsEqual(ref, "Partial") ? PartialDeferred(parameters[0]) : guard_exports.IsEqual(ref, "Pick") ? PickDeferred(parameters[0], parameters[1]) : guard_exports.IsEqual(ref, "Readonly") ? ReadonlyObjectDeferred(parameters[0]) : guard_exports.IsEqual(ref, "KeyOf") ? KeyOfDeferred(parameters[0]) : guard_exports.IsEqual(ref, "Record") ? RecordDeferred(parameters[0], parameters[1]) : guard_exports.IsEqual(ref, "Required") ? RequiredDeferred(parameters[0]) : guard_exports.IsEqual(ref, "ReturnType") ? ReturnTypeDeferred(parameters[0]) : guard_exports.IsEqual(ref, "Uncapitalize") ? UncapitalizeDeferred(parameters[0]) : guard_exports.IsEqual(ref, "Uppercase") ? UppercaseDeferred(parameters[0]) : CallConstruct(Ref(ref), parameters);
}
function Unreachable2() {
  throw Error("Unreachable");
}
var DelimitedDecode = (input, result = []) => {
  return input.reduce((result2, left) => {
    return guard_exports.IsArray(left) && guard_exports.IsEqual(left.length, 2) ? [...result2, left[0]] : [...result2, left];
  }, []);
};
var Delimited = (input) => {
  const [left, right] = input;
  return DelimitedDecode([...left, ...right]);
};
function GenericParameterExtendsEqualsMapping(input) {
  return Parameter(input[0], input[2], input[4]);
}
function GenericParameterExtendsMapping(input) {
  return Parameter(input[0], input[2], input[2]);
}
function GenericParameterEqualsMapping(input) {
  return Parameter(input[0], Unknown(), input[2]);
}
function GenericParameterIdentifierMapping(input) {
  return Parameter(input, Unknown(), Unknown());
}
function GenericParameterMapping(input) {
  return input;
}
function GenericParameterListMapping(input) {
  return Delimited(input);
}
function GenericParametersMapping(input) {
  return input[1];
}
function GenericCallArgumentListMapping(input) {
  return Delimited(input);
}
function GenericCallArgumentsMapping(input) {
  return input[1];
}
function GenericCallMapping(input) {
  return IntrinsicOrCall(input[0], input[1]);
}
function OptionalSemiColonMapping(input) {
  return null;
}
function KeywordStringMapping(input) {
  return String2();
}
function KeywordNumberMapping(input) {
  return Number2();
}
function KeywordBooleanMapping(input) {
  return Boolean2();
}
function KeywordUndefinedMapping(input) {
  return Undefined();
}
function KeywordNullMapping(input) {
  return Null();
}
function KeywordIntegerMapping(input) {
  return Integer();
}
function KeywordBigIntMapping(input) {
  return BigInt2();
}
function KeywordUnknownMapping(input) {
  return Unknown();
}
function KeywordAnyMapping(input) {
  return Any();
}
function KeywordObjectMapping(input) {
  return _Object_({});
}
function KeywordNeverMapping(input) {
  return Never();
}
function KeywordSymbolMapping(input) {
  return Symbol2();
}
function KeywordVoidMapping(input) {
  return Void();
}
function KeywordThisMapping(input) {
  return This();
}
function KeywordMapping(input) {
  return input;
}
function TemplateInterpolateMapping(input) {
  return input[1];
}
function TemplateSpanMapping(input) {
  return Literal(input);
}
function TemplateBodyMapping(input) {
  return guard_exports.IsEqual(input.length, 3) ? [input[0], input[1], ...input[2]] : [input[0]];
}
function TemplateLiteralTypesMapping(input) {
  return input[1];
}
function TemplateLiteralMapping(input) {
  return TemplateLiteralDeferred(input);
}
function LiteralBigIntMapping(input) {
  return Literal(BigInt(input));
}
function LiteralBooleanMapping(input) {
  return Literal(guard_exports.IsEqual(input, "true"));
}
function LiteralNumberMapping(input) {
  return Literal(parseFloat(input));
}
function LiteralStringMapping(input) {
  return Literal(input);
}
function LiteralMapping(input) {
  return input;
}
function KeyOfMapping(input) {
  return input.length > 0;
}
function IndexArrayMapping(input) {
  return input.reduce((result, current) => {
    return guard_exports.IsEqual(current.length, 3) ? [...result, [current[1]]] : [...result, []];
  }, []);
}
function ExtendsMapping(input) {
  return guard_exports.IsEqual(input.length, 6) ? [input[1], input[3], input[5]] : [];
}
function BaseMapping(input) {
  return guard_exports.IsArray(input) && guard_exports.IsEqual(input.length, 3) ? input[1] : input;
}
var FactorIndexArray = (Type2, indexArray) => {
  return indexArray.reduce((result, left) => {
    const _left = left;
    return guard_exports.IsEqual(_left.length, 1) ? IndexDeferred(result, _left[0]) : guard_exports.IsEqual(_left.length, 0) ? _Array_(result) : Unreachable2();
  }, Type2);
};
var FactorExtends = (type, extend) => {
  return guard_exports.IsEqual(extend.length, 3) ? ConditionalDeferred(type, extend[0], extend[1], extend[2]) : type;
};
function FactorMapping(input) {
  const [keyOf, type, indexArray, extend] = input;
  return keyOf ? FactorExtends(KeyOfDeferred(FactorIndexArray(type, indexArray)), extend) : FactorExtends(FactorIndexArray(type, indexArray), extend);
}
function ExprBinaryMapping(left, rest) {
  return guard_exports.IsEqual(rest.length, 3) ? (() => {
    const [operator, right, next] = rest;
    const Schema = ExprBinaryMapping(right, next);
    if (guard_exports.IsEqual(operator, "&")) {
      return IsIntersect(Schema) ? Intersect([left, ...Schema.allOf]) : Intersect([left, Schema]);
    }
    if (guard_exports.IsEqual(operator, "|")) {
      return IsUnion(Schema) ? Union([left, ...Schema.anyOf]) : Union([left, Schema]);
    }
    Unreachable2();
  })() : left;
}
function ExprTermTailMapping(input) {
  return input;
}
function ExprTermMapping(input) {
  const [left, rest] = input;
  return ExprBinaryMapping(left, rest);
}
function ExprTailMapping(input) {
  return input;
}
function ExprMapping(input) {
  const [left, rest] = input;
  return ExprBinaryMapping(left, rest);
}
function ExprReadonlyMapping(input) {
  return ImmutableAdd(input[1]);
}
function ExprPipeMapping(input) {
  return input[1];
}
function GenericTypeMapping(input) {
  return Generic(input[0], input[2]);
}
function InferTypeMapping(input) {
  return guard_exports.IsEqual(input.length, 4) ? Infer(input[1], input[3]) : guard_exports.IsEqual(input.length, 2) ? Infer(input[1], Unknown()) : Unreachable2();
}
function TypeMapping(input) {
  return input;
}
function PropertyKeyNumberMapping(input) {
  return `${input}`;
}
function PropertyKeyIdentMapping(input) {
  return input;
}
function PropertyKeyQuotedMapping(input) {
  return input;
}
function PropertyKeyIndexMapping(input) {
  return IsInteger2(input[3]) ? IntegerKey : IsNumber3(input[3]) ? NumberKey : IsSymbol2(input[3]) ? StringKey : IsString3(input[3]) ? StringKey : Unreachable2();
}
function PropertyKeyMapping(input) {
  return input;
}
function ReadonlyMapping(input) {
  return input.length > 0;
}
function OptionalMapping(input) {
  return input.length > 0;
}
function PropertyMapping(input) {
  const [isReadonly, key, isOptional, _colon, type] = input;
  return {
    [key]: isReadonly && isOptional ? ReadonlyAdd(OptionalAdd(type)) : isReadonly && !isOptional ? ReadonlyAdd(type) : !isReadonly && isOptional ? OptionalAdd(type) : type
  };
}
function PropertyDelimiterMapping(input) {
  return input;
}
function PropertyListMapping(input) {
  return Delimited(input);
}
function PropertiesReduce(propertyList) {
  return propertyList.reduce((result, left) => {
    const isPatternProperties = guard_exports.HasPropertyKey(left, IntegerKey) || guard_exports.HasPropertyKey(left, NumberKey) || guard_exports.HasPropertyKey(left, StringKey);
    return isPatternProperties ? [result[0], memory_exports.Assign(result[1], left)] : [memory_exports.Assign(result[0], left), result[1]];
  }, [{}, {}]);
}
function PropertiesMapping(input) {
  return PropertiesReduce(input[1]);
}
function _Object_Mapping(input) {
  const [properties, patternProperties] = input;
  const options = guard_exports.IsEqual(guard_exports.Keys(patternProperties).length, 0) ? {} : { patternProperties };
  return _Object_(properties, options);
}
function ElementNamedMapping(input) {
  return guard_exports.IsEqual(input.length, 5) ? ReadonlyAdd(OptionalAdd(input[4])) : guard_exports.IsEqual(input.length, 3) ? input[2] : guard_exports.IsEqual(input.length, 4) ? guard_exports.IsEqual(input[2], "readonly") ? ReadonlyAdd(input[3]) : OptionalAdd(input[3]) : Unreachable2();
}
function ElementReadonlyOptionalMapping(input) {
  return ReadonlyAdd(OptionalAdd(input[1]));
}
function ElementReadonlyMapping(input) {
  return ReadonlyAdd(input[1]);
}
function ElementOptionalMapping(input) {
  return OptionalAdd(input[0]);
}
function ElementBaseMapping(input) {
  return input;
}
function ElementMapping(input) {
  return guard_exports.IsEqual(input.length, 2) ? Rest(input[1]) : guard_exports.IsEqual(input.length, 1) ? input[0] : Unreachable2();
}
function ElementListMapping(input) {
  return Delimited(input);
}
function TupleMapping(input) {
  return Tuple(input[1]);
}
function ParameterReadonlyOptionalMapping(input) {
  return ReadonlyAdd(OptionalAdd(input[4]));
}
function ParameterReadonlyMapping(input) {
  return ReadonlyAdd(input[3]);
}
function ParameterOptionalMapping(input) {
  return OptionalAdd(input[3]);
}
function ParameterTypeMapping(input) {
  return input[2];
}
function ParameterBaseMapping(input) {
  return input;
}
function ParameterMapping(input) {
  return guard_exports.IsEqual(input.length, 2) ? Rest(input[1]) : guard_exports.IsEqual(input.length, 1) ? input[0] : Unreachable2();
}
function ParameterListMapping(input) {
  return Delimited(input);
}
function _Function_Mapping(input) {
  return _Function_(input[1], input[4]);
}
function ConstructorMapping(input) {
  return Constructor(input[2], input[5]);
}
function ApplyReadonly(state, type) {
  return guard_exports.IsEqual(state, "remove") ? ReadonlyRemoveAction(type) : guard_exports.IsEqual(state, "add") ? ReadonlyAddAction(type) : type;
}
function MappedReadonlyMapping(input) {
  return guard_exports.IsEqual(input.length, 2) && guard_exports.IsEqual(input[0], "-") ? "remove" : guard_exports.IsEqual(input.length, 2) && guard_exports.IsEqual(input[0], "+") ? "add" : guard_exports.IsEqual(input.length, 1) ? "add" : "none";
}
function ApplyOptional(state, type) {
  return guard_exports.IsEqual(state, "remove") ? OptionalRemoveAction(type) : guard_exports.IsEqual(state, "add") ? OptionalAddAction(type) : type;
}
function MappedOptionalMapping(input) {
  return guard_exports.IsEqual(input.length, 2) && guard_exports.IsEqual(input[0], "-") ? "remove" : guard_exports.IsEqual(input.length, 2) && guard_exports.IsEqual(input[0], "+") ? "add" : guard_exports.IsEqual(input.length, 1) ? "add" : "none";
}
function MappedAsMapping(input) {
  return guard_exports.IsEqual(input.length, 2) ? [input[1]] : [];
}
function MappedMapping(input) {
  return guard_exports.IsArray(input[6]) && guard_exports.IsEqual(input[6].length, 1) ? MappedDeferred(Identifier(input[3]), input[5], input[6][0], ApplyReadonly(input[1], ApplyOptional(input[8], input[10]))) : MappedDeferred(Identifier(input[3]), input[5], Ref(input[3]), ApplyReadonly(input[1], ApplyOptional(input[8], input[10])));
}
function ReferenceMapping(input) {
  return Ref(input);
}
function OptionsMapping(input) {
  return OptionsDeferred(input[2], input[4]);
}
function JsonNumberMapping(input) {
  return parseFloat(input);
}
function JsonBooleanMapping(input) {
  return guard_exports.IsEqual(input, "true");
}
function JsonStringMapping(input) {
  return input;
}
function JsonNullMapping(input) {
  return null;
}
function JsonPropertyMapping(input) {
  return { [input[0]]: input[2] };
}
function JsonPropertyListMapping(input) {
  return Delimited(input);
}
function JsonObjectMappingReduce(propertyList) {
  return propertyList.reduce((result, left) => {
    return memory_exports.Assign(result, left);
  }, {});
}
function JsonObjectMapping(input) {
  return JsonObjectMappingReduce(input[1]);
}
function JsonElementListMapping(input) {
  return Delimited(input);
}
function JsonArrayMapping(input) {
  return input[1];
}
function JsonMapping(input) {
  return input;
}
function PatternBigIntMapping(input) {
  return BigInt2();
}
function PatternStringMapping(input) {
  return String2();
}
function PatternNumberMapping(input) {
  return Number2();
}
function PatternIntegerMapping(input) {
  return Integer();
}
function PatternNeverMapping(input) {
  return Never();
}
function PatternTextMapping(input) {
  return Literal(input);
}
function PatternBaseMapping(input) {
  return input;
}
function PatternGroupMapping(input) {
  return Union(input[1]);
}
function PatternUnionMapping(input) {
  return input.length === 3 ? [...input[0], ...input[2]] : input.length === 1 ? [...input[0]] : [];
}
function PatternTermMapping(input) {
  return [input[0], ...input[1]];
}
function PatternBodyMapping(input) {
  return input;
}
function PatternMapping(input) {
  return input[1];
}
function InterfaceDeclarationHeritageListMapping(input) {
  return Delimited(input);
}
function InterfaceDeclarationHeritageMapping(input) {
  return guard_exports.IsEqual(input.length, 2) ? input[1] : [];
}
function InterfaceDeclarationGenericMapping(input) {
  const parameters = input[2];
  const heritage = input[3];
  const [properties, patternProperties] = input[4];
  const options = guard_exports.IsEqual(guard_exports.Keys(patternProperties).length, 0) ? {} : { patternProperties };
  return { [input[1]]: Generic(parameters, InterfaceDeferred(heritage, properties, options)) };
}
function InterfaceDeclarationMapping(input) {
  const heritage = input[2];
  const [properties, patternProperties] = input[3];
  const options = guard_exports.IsEqual(guard_exports.Keys(patternProperties).length, 0) ? {} : { patternProperties };
  return { [input[1]]: InterfaceDeferred(heritage, properties, options) };
}
function TypeAliasDeclarationGenericMapping(input) {
  return { [input[1]]: Generic(input[2], input[4]) };
}
function TypeAliasDeclarationMapping(input) {
  return { [input[1]]: input[3] };
}
function ExportKeywordMapping(input) {
  return null;
}
function ModuleDeclarationDelimiterMapping(input) {
  return input;
}
function ModuleDeclarationListMapping(input) {
  return PropertiesReduce(Delimited(input));
}
function ModuleDeclarationMapping(input) {
  return input[1];
}
function ModuleMapping(input) {
  const moduleDeclaration = input[0];
  const moduleDeclarationList = input[1];
  return ModuleDeferred(memory_exports.Assign(moduleDeclaration, moduleDeclarationList[0]));
}
function ScriptMapping(input) {
  return input;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/script/token/internal/match.mjs
function IsMatch(value) {
  return IsEqual(value.length, 2);
}
function Match2(input, ok, fail) {
  return IsMatch(input) ? ok(input[0], input[1]) : fail();
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/script/token/internal/take.mjs
function TakeVariant(variant, input) {
  return IsEqual(input.indexOf(variant), 0) ? [variant, input.slice(variant.length)] : [];
}
function Take(variants, input) {
  for (let i = 0; i < variants.length; i++) {
    const result = TakeVariant(variants[i], input);
    if (IsMatch(result))
      return result;
  }
  return [];
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/script/token/internal/char.mjs
function Range(start2, end) {
  return Array.from({ length: end - start2 + 1 }, (_, i) => String.fromCharCode(start2 + i));
}
var Alpha = [
  ...Range(97, 122),
  // Lowercase
  ...Range(65, 90)
  // Uppercase
];
var Zero = "0";
var NonZero = Range(49, 57);
var Digit = [Zero, ...NonZero];
var WhiteSpace = " ";
var NewLine = "\n";
var UnderScore = "_";
var Dot = ".";
var DollarSign = "$";
var Hyphen = "-";

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/script/token/internal/trim.mjs
var LineComment = "//";
var OpenComment = "/*";
var CloseComment = "*/";
function DiscardMultilineComment(input) {
  const index = input.indexOf(CloseComment);
  const result = IsEqual(index, -1) ? "" : input.slice(index + 2);
  return result;
}
function DiscardLineComment(input) {
  const index = input.indexOf(NewLine);
  const result = IsEqual(index, -1) ? "" : input.slice(index);
  return result;
}
function TrimStartUntilNewline(input) {
  return input.replace(/^[ \t\r\f\v]+/, "");
}
function TrimWhitespace(input) {
  const trimmed = TrimStartUntilNewline(input);
  return trimmed.startsWith(OpenComment) ? TrimWhitespace(DiscardMultilineComment(trimmed.slice(2))) : trimmed.startsWith(LineComment) ? TrimWhitespace(DiscardLineComment(trimmed.slice(2))) : trimmed;
}
function Trim(input) {
  const trimmed = input.trimStart();
  return trimmed.startsWith(OpenComment) ? Trim(DiscardMultilineComment(trimmed.slice(2))) : trimmed.startsWith(LineComment) ? Trim(DiscardLineComment(trimmed.slice(2))) : trimmed;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/script/token/internal/optional.mjs
function Optional2(value, input) {
  return Match2(Take([value], input), (Optional4, Rest2) => [Optional4, Rest2], () => ["", input]);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/script/token/internal/many.mjs
function IsDiscard(discard, input) {
  return discard.includes(input);
}
function Many(allowed, discard, input, result = "") {
  return Match2(Take(allowed, input), (Char, Rest2) => IsDiscard(discard, Char) ? Many(allowed, discard, Rest2, result) : Many(allowed, discard, Rest2, `${result}${Char}`), () => [result, input]);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/script/token/unsigned_integer.mjs
function TakeNonZero(input) {
  return Take(NonZero, input);
}
var AllowedDigits = [...Digit, UnderScore];
function TakeDigits(input) {
  return Many(AllowedDigits, [UnderScore], input);
}
function TakeUnsignedInteger(input) {
  return Match2(Take([Zero], input), (Zero2, ZeroRest) => [Zero2, ZeroRest], () => Match2(
    TakeNonZero(input),
    (NonZero2, NonZeroRest) => Match2(TakeDigits(NonZeroRest), (Digits, DigitsRest) => [`${NonZero2}${Digits}`, DigitsRest], () => []),
    // fail: did not match Digits
    () => []
  ));
}
function UnsignedInteger(input) {
  return TakeUnsignedInteger(Trim(input));
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/script/token/integer.mjs
function TakeSign(input) {
  return Optional2(Hyphen, input);
}
function TakeSignedInteger(input) {
  return Match2(
    TakeSign(input),
    (Sign, SignRest) => Match2(UnsignedInteger(SignRest), (UnsignedInteger2, UnsignedIntegerRest) => [`${Sign}${UnsignedInteger2}`, UnsignedIntegerRest], () => []),
    // fail: did not match unsigned integer
    () => []
  );
}
function Integer2(input) {
  return TakeSignedInteger(Trim(input));
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/script/token/bigint.mjs
function TakeBigInt(input) {
  return Match2(
    Integer2(input),
    (Integer3, IntegerRest) => Match2(Take(["n"], IntegerRest), (_N, NRest) => [`${Integer3}`, NRest], () => []),
    // fail: did not match 'n'
    () => []
  );
}
function BigInt3(input) {
  return TakeBigInt(input);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/script/token/const.mjs
function TakeConst(const_, input) {
  return Take([const_], input);
}
function Const(const_, input) {
  return IsEqual(const_, "") ? ["", input] : const_.startsWith(NewLine) ? TakeConst(const_, TrimWhitespace(input)) : const_.startsWith(WhiteSpace) ? TakeConst(const_, input) : TakeConst(const_, Trim(input));
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/script/token/ident.mjs
var Initial = [...Alpha, UnderScore, DollarSign];
function TakeInitial(input) {
  return Take(Initial, input);
}
var Remaining = [...Initial, ...Digit];
function TakeRemaining(input, result = "") {
  return Match2(Take(Remaining, input), (Remaining2, RemainingRest) => TakeRemaining(RemainingRest, `${result}${Remaining2}`), () => [result, input]);
}
function TakeIdent(input) {
  return Match2(
    TakeInitial(input),
    (Initial2, InitialRest) => Match2(TakeRemaining(InitialRest), (Remaining2, RemainingRest) => [`${Initial2}${Remaining2}`, RemainingRest], () => []),
    // fail: did not match Remaining
    () => []
  );
}
function Ident(input) {
  return TakeIdent(Trim(input));
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/script/token/unsigned_number.mjs
var AllowedDigits2 = [...Digit, UnderScore];
function IsLeadingDot(input) {
  return IsMatch(Take([Dot], input));
}
function TakeFractional(input) {
  return Match2(Many(AllowedDigits2, [UnderScore], input), (Digits, DigitsRest) => IsEqual(Digits, "") ? [] : [Digits, DigitsRest], () => []);
}
function LeadingDot(input) {
  return Match2(
    Take([Dot], input),
    (Dot2, DotRest) => Match2(TakeFractional(DotRest), (Fractional, FractionalRest) => [`0${Dot2}${Fractional}`, FractionalRest], () => []),
    // fail: did not match Fractional
    () => []
  );
}
function LeadingInteger(input) {
  return Match2(
    UnsignedInteger(input),
    (Integer3, IntegerRest) => Match2(
      Take([Dot], IntegerRest),
      (Dot2, DotRest) => Match2(TakeFractional(DotRest), (Fractional, FractionalRest) => [`${Integer3}${Dot2}${Fractional}`, FractionalRest], () => [`${Integer3}`, DotRest]),
      // fail: did not match Fractional, use Integer
      () => [`${Integer3}`, IntegerRest]
    ),
    // fail: did not match Dot, use Integer
    () => []
  );
}
function TakeUnsignedNumber(input) {
  return IsLeadingDot(input) ? LeadingDot(input) : LeadingInteger(input);
}
function UnsignedNumber(input) {
  return TakeUnsignedNumber(Trim(input));
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/script/token/number.mjs
function TakeSign2(input) {
  return Optional2(Hyphen, input);
}
function TakeSignedNumber(input) {
  return Match2(
    TakeSign2(input),
    (Sign, SignRest) => Match2(UnsignedNumber(SignRest), (UnsignedInteger2, UnsignedIntegerRest) => [`${Sign}${UnsignedInteger2}`, UnsignedIntegerRest], () => []),
    // fail: did not match unsigned integer
    () => []
  );
}
function Number3(input) {
  return TakeSignedNumber(Trim(input));
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/script/token/until.mjs
function TakeOne(input) {
  const result = IsEqual(input, "") ? [] : [input.slice(0, 1), input.slice(1)];
  return result;
}
function IsInputMatchSentinal(end, input) {
  return TakeLeft(end, (left, right) => input.startsWith(left) ? true : IsInputMatchSentinal(right, input), () => false);
}
function Until(end, input, result = "") {
  return Match2(
    TakeOne(input),
    (One, Rest2) => IsInputMatchSentinal(end, input) ? [result, input] : Until(end, Rest2, `${result}${One}`),
    () => []
  );
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/script/token/span.mjs
function MultiLine(start2, end, input) {
  return Match2(
    Take([start2], input),
    (_, Rest2) => Match2(
      Until([end], Rest2),
      (Until2, UntilRest) => Match2(Take([end], UntilRest), (_2, Rest3) => [`${Until2}`, Rest3], () => []),
      // fail: did not match End
      () => []
    ),
    // fail: did not match Until
    () => []
  );
}
function SingleLine(start2, end, input) {
  return Match2(
    Take([start2], input),
    (_, Rest2) => Match2(
      Until([NewLine, end], Rest2),
      (Until2, UntilRest) => Match2(Take([end], UntilRest), (_2, EndRest) => [`${Until2}`, EndRest], () => []),
      // fail: did not match End
      () => []
    ),
    // fail: did not match Until
    () => []
  );
}
function Span(start2, end, multiLine, input) {
  return multiLine ? MultiLine(start2, end, Trim(input)) : SingleLine(start2, end, Trim(input));
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/script/token/string.mjs
function TakeInitial2(quotes, input) {
  return Take(quotes, input);
}
function TakeSpan(quote, input) {
  return Span(quote, quote, false, input);
}
function TakeString(quotes, input) {
  return Match2(TakeInitial2(quotes, input), (Initial2, InitialRest) => TakeSpan(Initial2, `${Initial2}${InitialRest}`), () => []);
}
function String3(quotes, input) {
  return TakeString(quotes, Trim(input));
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/script/token/until_1.mjs
function Until_1(end, input) {
  return Match2(Until(end, input), (Until2, UntilRest) => IsEqual(Until2, "") ? [] : [Until2, UntilRest], () => []);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/script/parser.mjs
var If = (result, left, right = () => []) => result.length === 2 ? left(result) : right();
var GenericParameterExtendsEquals = (input) => If(If(Ident(input), ([_0, input2]) => If(Const("extends", input2), ([_1, input3]) => If(Type(input3), ([_2, input4]) => If(Const("=", input4), ([_3, input5]) => If(Type(input5), ([_4, input6]) => [[_0, _1, _2, _3, _4], input6]))))), ([_0, input2]) => [GenericParameterExtendsEqualsMapping(_0), input2]);
var GenericParameterExtends = (input) => If(If(Ident(input), ([_0, input2]) => If(Const("extends", input2), ([_1, input3]) => If(Type(input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [GenericParameterExtendsMapping(_0), input2]);
var GenericParameterEquals = (input) => If(If(Ident(input), ([_0, input2]) => If(Const("=", input2), ([_1, input3]) => If(Type(input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [GenericParameterEqualsMapping(_0), input2]);
var GenericParameterIdentifier = (input) => If(Ident(input), ([_0, input2]) => [GenericParameterIdentifierMapping(_0), input2]);
var GenericParameter = (input) => If(If(GenericParameterExtendsEquals(input), ([_0, input2]) => [_0, input2], () => If(GenericParameterExtends(input), ([_0, input2]) => [_0, input2], () => If(GenericParameterEquals(input), ([_0, input2]) => [_0, input2], () => If(GenericParameterIdentifier(input), ([_0, input2]) => [_0, input2], () => [])))), ([_0, input2]) => [GenericParameterMapping(_0), input2]);
var GenericParameterList_0 = (input, result = []) => If(If(GenericParameter(input), ([_0, input2]) => If(Const(",", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => GenericParameterList_0(input2, [...result, _0]), () => [result, input]);
var GenericParameterList = (input) => If(If(GenericParameterList_0(input), ([_0, input2]) => If(If(If(GenericParameter(input2), ([_02, input3]) => [[_02], input3]), ([_02, input3]) => [_02, input3], () => If([[], input2], ([_02, input3]) => [_02, input3], () => [])), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [GenericParameterListMapping(_0), input2]);
var GenericParameters = (input) => If(If(Const("<", input), ([_0, input2]) => If(GenericParameterList(input2), ([_1, input3]) => If(Const(">", input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [GenericParametersMapping(_0), input2]);
var GenericCallArgumentList_0 = (input, result = []) => If(If(Type(input), ([_0, input2]) => If(Const(",", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => GenericCallArgumentList_0(input2, [...result, _0]), () => [result, input]);
var GenericCallArgumentList = (input) => If(If(GenericCallArgumentList_0(input), ([_0, input2]) => If(If(If(Type(input2), ([_02, input3]) => [[_02], input3]), ([_02, input3]) => [_02, input3], () => If([[], input2], ([_02, input3]) => [_02, input3], () => [])), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [GenericCallArgumentListMapping(_0), input2]);
var GenericCallArguments = (input) => If(If(Const("<", input), ([_0, input2]) => If(GenericCallArgumentList(input2), ([_1, input3]) => If(Const(">", input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [GenericCallArgumentsMapping(_0), input2]);
var GenericCall = (input) => If(If(Ident(input), ([_0, input2]) => If(GenericCallArguments(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [GenericCallMapping(_0), input2]);
var OptionalSemiColon = (input) => If(If(If(Const(";", input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => If([[], input], ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [OptionalSemiColonMapping(_0), input2]);
var KeywordString = (input) => If(Const("string", input), ([_0, input2]) => [KeywordStringMapping(_0), input2]);
var KeywordNumber = (input) => If(Const("number", input), ([_0, input2]) => [KeywordNumberMapping(_0), input2]);
var KeywordBoolean = (input) => If(Const("boolean", input), ([_0, input2]) => [KeywordBooleanMapping(_0), input2]);
var KeywordUndefined = (input) => If(Const("undefined", input), ([_0, input2]) => [KeywordUndefinedMapping(_0), input2]);
var KeywordNull = (input) => If(Const("null", input), ([_0, input2]) => [KeywordNullMapping(_0), input2]);
var KeywordInteger = (input) => If(Const("integer", input), ([_0, input2]) => [KeywordIntegerMapping(_0), input2]);
var KeywordBigInt = (input) => If(Const("bigint", input), ([_0, input2]) => [KeywordBigIntMapping(_0), input2]);
var KeywordUnknown = (input) => If(Const("unknown", input), ([_0, input2]) => [KeywordUnknownMapping(_0), input2]);
var KeywordAny = (input) => If(Const("any", input), ([_0, input2]) => [KeywordAnyMapping(_0), input2]);
var KeywordObject = (input) => If(Const("object", input), ([_0, input2]) => [KeywordObjectMapping(_0), input2]);
var KeywordNever = (input) => If(Const("never", input), ([_0, input2]) => [KeywordNeverMapping(_0), input2]);
var KeywordSymbol = (input) => If(Const("symbol", input), ([_0, input2]) => [KeywordSymbolMapping(_0), input2]);
var KeywordVoid = (input) => If(Const("void", input), ([_0, input2]) => [KeywordVoidMapping(_0), input2]);
var KeywordThis = (input) => If(Const("this", input), ([_0, input2]) => [KeywordThisMapping(_0), input2]);
var Keyword = (input) => If(If(KeywordString(input), ([_0, input2]) => [_0, input2], () => If(KeywordNumber(input), ([_0, input2]) => [_0, input2], () => If(KeywordBoolean(input), ([_0, input2]) => [_0, input2], () => If(KeywordUndefined(input), ([_0, input2]) => [_0, input2], () => If(KeywordNull(input), ([_0, input2]) => [_0, input2], () => If(KeywordInteger(input), ([_0, input2]) => [_0, input2], () => If(KeywordBigInt(input), ([_0, input2]) => [_0, input2], () => If(KeywordUnknown(input), ([_0, input2]) => [_0, input2], () => If(KeywordAny(input), ([_0, input2]) => [_0, input2], () => If(KeywordObject(input), ([_0, input2]) => [_0, input2], () => If(KeywordNever(input), ([_0, input2]) => [_0, input2], () => If(KeywordSymbol(input), ([_0, input2]) => [_0, input2], () => If(KeywordVoid(input), ([_0, input2]) => [_0, input2], () => If(KeywordThis(input), ([_0, input2]) => [_0, input2], () => [])))))))))))))), ([_0, input2]) => [KeywordMapping(_0), input2]);
var TemplateInterpolate = (input) => If(If(Const("${", input), ([_0, input2]) => If(Type(input2), ([_1, input3]) => If(Const("}", input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [TemplateInterpolateMapping(_0), input2]);
var TemplateSpan = (input) => If(Until(["${", "`"], input), ([_0, input2]) => [TemplateSpanMapping(_0), input2]);
var TemplateBody = (input) => If(If(If(TemplateSpan(input), ([_0, input2]) => If(TemplateInterpolate(input2), ([_1, input3]) => If(TemplateBody(input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [_0, input2], () => If(If(TemplateSpan(input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => If(If(TemplateSpan(input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => []))), ([_0, input2]) => [TemplateBodyMapping(_0), input2]);
var TemplateLiteralTypes = (input) => If(If(Const("`", input), ([_0, input2]) => If(TemplateBody(input2), ([_1, input3]) => If(Const("`", input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [TemplateLiteralTypesMapping(_0), input2]);
var TemplateLiteral = (input) => If(TemplateLiteralTypes(input), ([_0, input2]) => [TemplateLiteralMapping(_0), input2]);
var LiteralBigInt = (input) => If(BigInt3(input), ([_0, input2]) => [LiteralBigIntMapping(_0), input2]);
var LiteralBoolean = (input) => If(If(Const("true", input), ([_0, input2]) => [_0, input2], () => If(Const("false", input), ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [LiteralBooleanMapping(_0), input2]);
var LiteralNumber = (input) => If(Number3(input), ([_0, input2]) => [LiteralNumberMapping(_0), input2]);
var LiteralString = (input) => If(String3(["'", '"'], input), ([_0, input2]) => [LiteralStringMapping(_0), input2]);
var Literal2 = (input) => If(If(LiteralBigInt(input), ([_0, input2]) => [_0, input2], () => If(LiteralBoolean(input), ([_0, input2]) => [_0, input2], () => If(LiteralNumber(input), ([_0, input2]) => [_0, input2], () => If(LiteralString(input), ([_0, input2]) => [_0, input2], () => [])))), ([_0, input2]) => [LiteralMapping(_0), input2]);
var KeyOf = (input) => If(If(If(Const("keyof", input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => If([[], input], ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [KeyOfMapping(_0), input2]);
var IndexArray_0 = (input, result = []) => If(If(If(Const("[", input), ([_0, input2]) => If(Type(input2), ([_1, input3]) => If(Const("]", input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [_0, input2], () => If(If(Const("[", input), ([_0, input2]) => If(Const("]", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => IndexArray_0(input2, [...result, _0]), () => [result, input]);
var IndexArray = (input) => If(IndexArray_0(input), ([_0, input2]) => [IndexArrayMapping(_0), input2]);
var Extends = (input) => If(If(If(Const("extends", input), ([_0, input2]) => If(Type(input2), ([_1, input3]) => If(Const("?", input3), ([_2, input4]) => If(Type(input4), ([_3, input5]) => If(Const(":", input5), ([_4, input6]) => If(Type(input6), ([_5, input7]) => [[_0, _1, _2, _3, _4, _5], input7])))))), ([_0, input2]) => [_0, input2], () => If([[], input], ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [ExtendsMapping(_0), input2]);
var Base2 = (input) => If(If(If(Const("(", input), ([_0, input2]) => If(Type(input2), ([_1, input3]) => If(Const(")", input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [_0, input2], () => If(Keyword(input), ([_0, input2]) => [_0, input2], () => If(_Object_2(input), ([_0, input2]) => [_0, input2], () => If(Tuple2(input), ([_0, input2]) => [_0, input2], () => If(TemplateLiteral(input), ([_0, input2]) => [_0, input2], () => If(Literal2(input), ([_0, input2]) => [_0, input2], () => If(Constructor2(input), ([_0, input2]) => [_0, input2], () => If(_Function_2(input), ([_0, input2]) => [_0, input2], () => If(Mapped(input), ([_0, input2]) => [_0, input2], () => If(Options(input), ([_0, input2]) => [_0, input2], () => If(GenericCall(input), ([_0, input2]) => [_0, input2], () => If(Reference(input), ([_0, input2]) => [_0, input2], () => [])))))))))))), ([_0, input2]) => [BaseMapping(_0), input2]);
var Factor = (input) => If(If(KeyOf(input), ([_0, input2]) => If(Base2(input2), ([_1, input3]) => If(IndexArray(input3), ([_2, input4]) => If(Extends(input4), ([_3, input5]) => [[_0, _1, _2, _3], input5])))), ([_0, input2]) => [FactorMapping(_0), input2]);
var ExprTermTail = (input) => If(If(If(Const("&", input), ([_0, input2]) => If(Factor(input2), ([_1, input3]) => If(ExprTermTail(input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [_0, input2], () => If([[], input], ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [ExprTermTailMapping(_0), input2]);
var ExprTerm = (input) => If(If(Factor(input), ([_0, input2]) => If(ExprTermTail(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [ExprTermMapping(_0), input2]);
var ExprTail = (input) => If(If(If(Const("|", input), ([_0, input2]) => If(ExprTerm(input2), ([_1, input3]) => If(ExprTail(input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [_0, input2], () => If([[], input], ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [ExprTailMapping(_0), input2]);
var Expr = (input) => If(If(ExprTerm(input), ([_0, input2]) => If(ExprTail(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [ExprMapping(_0), input2]);
var ExprReadonly = (input) => If(If(Const("readonly", input), ([_0, input2]) => If(Expr(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [ExprReadonlyMapping(_0), input2]);
var ExprPipe = (input) => If(If(Const("|", input), ([_0, input2]) => If(Expr(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [ExprPipeMapping(_0), input2]);
var GenericType = (input) => If(If(GenericParameters(input), ([_0, input2]) => If(Const("=", input2), ([_1, input3]) => If(Type(input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [GenericTypeMapping(_0), input2]);
var InferType = (input) => If(If(If(Const("infer", input), ([_0, input2]) => If(Ident(input2), ([_1, input3]) => If(Const("extends", input3), ([_2, input4]) => If(Expr(input4), ([_3, input5]) => [[_0, _1, _2, _3], input5])))), ([_0, input2]) => [_0, input2], () => If(If(Const("infer", input), ([_0, input2]) => If(Ident(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [InferTypeMapping(_0), input2]);
var Type = (input) => If(If(InferType(input), ([_0, input2]) => [_0, input2], () => If(ExprPipe(input), ([_0, input2]) => [_0, input2], () => If(ExprReadonly(input), ([_0, input2]) => [_0, input2], () => If(Expr(input), ([_0, input2]) => [_0, input2], () => [])))), ([_0, input2]) => [TypeMapping(_0), input2]);
var PropertyKeyNumber = (input) => If(Number3(input), ([_0, input2]) => [PropertyKeyNumberMapping(_0), input2]);
var PropertyKeyIdent = (input) => If(Ident(input), ([_0, input2]) => [PropertyKeyIdentMapping(_0), input2]);
var PropertyKeyQuoted = (input) => If(String3(["'", '"'], input), ([_0, input2]) => [PropertyKeyQuotedMapping(_0), input2]);
var PropertyKeyIndex = (input) => If(If(Const("[", input), ([_0, input2]) => If(Ident(input2), ([_1, input3]) => If(Const(":", input3), ([_2, input4]) => If(If(KeywordInteger(input4), ([_02, input5]) => [_02, input5], () => If(KeywordNumber(input4), ([_02, input5]) => [_02, input5], () => If(KeywordString(input4), ([_02, input5]) => [_02, input5], () => If(KeywordSymbol(input4), ([_02, input5]) => [_02, input5], () => [])))), ([_3, input5]) => If(Const("]", input5), ([_4, input6]) => [[_0, _1, _2, _3, _4], input6]))))), ([_0, input2]) => [PropertyKeyIndexMapping(_0), input2]);
var PropertyKey = (input) => If(If(PropertyKeyNumber(input), ([_0, input2]) => [_0, input2], () => If(PropertyKeyIdent(input), ([_0, input2]) => [_0, input2], () => If(PropertyKeyQuoted(input), ([_0, input2]) => [_0, input2], () => If(PropertyKeyIndex(input), ([_0, input2]) => [_0, input2], () => [])))), ([_0, input2]) => [PropertyKeyMapping(_0), input2]);
var Readonly2 = (input) => If(If(If(Const("readonly", input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => If([[], input], ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [ReadonlyMapping(_0), input2]);
var Optional3 = (input) => If(If(If(Const("?", input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => If([[], input], ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [OptionalMapping(_0), input2]);
var Property = (input) => If(If(Readonly2(input), ([_0, input2]) => If(PropertyKey(input2), ([_1, input3]) => If(Optional3(input3), ([_2, input4]) => If(Const(":", input4), ([_3, input5]) => If(Type(input5), ([_4, input6]) => [[_0, _1, _2, _3, _4], input6]))))), ([_0, input2]) => [PropertyMapping(_0), input2]);
var PropertyDelimiter = (input) => If(If(If(Const(",", input), ([_0, input2]) => If(Const("\n", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [_0, input2], () => If(If(Const(";", input), ([_0, input2]) => If(Const("\n", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [_0, input2], () => If(If(Const(",", input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => If(If(Const(";", input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => If(If(Const("\n", input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => []))))), ([_0, input2]) => [PropertyDelimiterMapping(_0), input2]);
var PropertyList_0 = (input, result = []) => If(If(Property(input), ([_0, input2]) => If(PropertyDelimiter(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => PropertyList_0(input2, [...result, _0]), () => [result, input]);
var PropertyList = (input) => If(If(PropertyList_0(input), ([_0, input2]) => If(If(If(Property(input2), ([_02, input3]) => [[_02], input3]), ([_02, input3]) => [_02, input3], () => If([[], input2], ([_02, input3]) => [_02, input3], () => [])), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [PropertyListMapping(_0), input2]);
var Properties = (input) => If(If(Const("{", input), ([_0, input2]) => If(PropertyList(input2), ([_1, input3]) => If(Const("}", input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [PropertiesMapping(_0), input2]);
var _Object_2 = (input) => If(Properties(input), ([_0, input2]) => [_Object_Mapping(_0), input2]);
var ElementNamed = (input) => If(If(If(Ident(input), ([_0, input2]) => If(Const("?", input2), ([_1, input3]) => If(Const(":", input3), ([_2, input4]) => If(Const("readonly", input4), ([_3, input5]) => If(Type(input5), ([_4, input6]) => [[_0, _1, _2, _3, _4], input6]))))), ([_0, input2]) => [_0, input2], () => If(If(Ident(input), ([_0, input2]) => If(Const(":", input2), ([_1, input3]) => If(Const("readonly", input3), ([_2, input4]) => If(Type(input4), ([_3, input5]) => [[_0, _1, _2, _3], input5])))), ([_0, input2]) => [_0, input2], () => If(If(Ident(input), ([_0, input2]) => If(Const("?", input2), ([_1, input3]) => If(Const(":", input3), ([_2, input4]) => If(Type(input4), ([_3, input5]) => [[_0, _1, _2, _3], input5])))), ([_0, input2]) => [_0, input2], () => If(If(Ident(input), ([_0, input2]) => If(Const(":", input2), ([_1, input3]) => If(Type(input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [_0, input2], () => [])))), ([_0, input2]) => [ElementNamedMapping(_0), input2]);
var ElementReadonlyOptional = (input) => If(If(Const("readonly", input), ([_0, input2]) => If(Type(input2), ([_1, input3]) => If(Const("?", input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [ElementReadonlyOptionalMapping(_0), input2]);
var ElementReadonly = (input) => If(If(Const("readonly", input), ([_0, input2]) => If(Type(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [ElementReadonlyMapping(_0), input2]);
var ElementOptional = (input) => If(If(Type(input), ([_0, input2]) => If(Const("?", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [ElementOptionalMapping(_0), input2]);
var ElementBase = (input) => If(If(ElementNamed(input), ([_0, input2]) => [_0, input2], () => If(ElementReadonlyOptional(input), ([_0, input2]) => [_0, input2], () => If(ElementReadonly(input), ([_0, input2]) => [_0, input2], () => If(ElementOptional(input), ([_0, input2]) => [_0, input2], () => If(Type(input), ([_0, input2]) => [_0, input2], () => []))))), ([_0, input2]) => [ElementBaseMapping(_0), input2]);
var Element = (input) => If(If(If(Const("...", input), ([_0, input2]) => If(ElementBase(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [_0, input2], () => If(If(ElementBase(input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [ElementMapping(_0), input2]);
var ElementList_0 = (input, result = []) => If(If(Element(input), ([_0, input2]) => If(Const(",", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => ElementList_0(input2, [...result, _0]), () => [result, input]);
var ElementList = (input) => If(If(ElementList_0(input), ([_0, input2]) => If(If(If(Element(input2), ([_02, input3]) => [[_02], input3]), ([_02, input3]) => [_02, input3], () => If([[], input2], ([_02, input3]) => [_02, input3], () => [])), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [ElementListMapping(_0), input2]);
var Tuple2 = (input) => If(If(Const("[", input), ([_0, input2]) => If(ElementList(input2), ([_1, input3]) => If(Const("]", input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [TupleMapping(_0), input2]);
var ParameterReadonlyOptional = (input) => If(If(Ident(input), ([_0, input2]) => If(Const("?", input2), ([_1, input3]) => If(Const(":", input3), ([_2, input4]) => If(Const("readonly", input4), ([_3, input5]) => If(Type(input5), ([_4, input6]) => [[_0, _1, _2, _3, _4], input6]))))), ([_0, input2]) => [ParameterReadonlyOptionalMapping(_0), input2]);
var ParameterReadonly = (input) => If(If(Ident(input), ([_0, input2]) => If(Const(":", input2), ([_1, input3]) => If(Const("readonly", input3), ([_2, input4]) => If(Type(input4), ([_3, input5]) => [[_0, _1, _2, _3], input5])))), ([_0, input2]) => [ParameterReadonlyMapping(_0), input2]);
var ParameterOptional = (input) => If(If(Ident(input), ([_0, input2]) => If(Const("?", input2), ([_1, input3]) => If(Const(":", input3), ([_2, input4]) => If(Type(input4), ([_3, input5]) => [[_0, _1, _2, _3], input5])))), ([_0, input2]) => [ParameterOptionalMapping(_0), input2]);
var ParameterType = (input) => If(If(Ident(input), ([_0, input2]) => If(Const(":", input2), ([_1, input3]) => If(Type(input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [ParameterTypeMapping(_0), input2]);
var ParameterBase = (input) => If(If(ParameterReadonlyOptional(input), ([_0, input2]) => [_0, input2], () => If(ParameterReadonly(input), ([_0, input2]) => [_0, input2], () => If(ParameterOptional(input), ([_0, input2]) => [_0, input2], () => If(ParameterType(input), ([_0, input2]) => [_0, input2], () => [])))), ([_0, input2]) => [ParameterBaseMapping(_0), input2]);
var Parameter2 = (input) => If(If(If(Const("...", input), ([_0, input2]) => If(ParameterBase(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [_0, input2], () => If(If(ParameterBase(input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [ParameterMapping(_0), input2]);
var ParameterList_0 = (input, result = []) => If(If(Parameter2(input), ([_0, input2]) => If(Const(",", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => ParameterList_0(input2, [...result, _0]), () => [result, input]);
var ParameterList = (input) => If(If(ParameterList_0(input), ([_0, input2]) => If(If(If(Parameter2(input2), ([_02, input3]) => [[_02], input3]), ([_02, input3]) => [_02, input3], () => If([[], input2], ([_02, input3]) => [_02, input3], () => [])), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [ParameterListMapping(_0), input2]);
var _Function_2 = (input) => If(If(Const("(", input), ([_0, input2]) => If(ParameterList(input2), ([_1, input3]) => If(Const(")", input3), ([_2, input4]) => If(Const("=>", input4), ([_3, input5]) => If(Type(input5), ([_4, input6]) => [[_0, _1, _2, _3, _4], input6]))))), ([_0, input2]) => [_Function_Mapping(_0), input2]);
var Constructor2 = (input) => If(If(Const("new", input), ([_0, input2]) => If(Const("(", input2), ([_1, input3]) => If(ParameterList(input3), ([_2, input4]) => If(Const(")", input4), ([_3, input5]) => If(Const("=>", input5), ([_4, input6]) => If(Type(input6), ([_5, input7]) => [[_0, _1, _2, _3, _4, _5], input7])))))), ([_0, input2]) => [ConstructorMapping(_0), input2]);
var MappedReadonly = (input) => If(If(If(Const("+", input), ([_0, input2]) => If(Const("readonly", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [_0, input2], () => If(If(Const("-", input), ([_0, input2]) => If(Const("readonly", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [_0, input2], () => If(If(Const("readonly", input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => If([[], input], ([_0, input2]) => [_0, input2], () => [])))), ([_0, input2]) => [MappedReadonlyMapping(_0), input2]);
var MappedOptional = (input) => If(If(If(Const("+", input), ([_0, input2]) => If(Const("?", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [_0, input2], () => If(If(Const("-", input), ([_0, input2]) => If(Const("?", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [_0, input2], () => If(If(Const("?", input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => If([[], input], ([_0, input2]) => [_0, input2], () => [])))), ([_0, input2]) => [MappedOptionalMapping(_0), input2]);
var MappedAs = (input) => If(If(If(Const("as", input), ([_0, input2]) => If(Type(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [_0, input2], () => If([[], input], ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [MappedAsMapping(_0), input2]);
var Mapped = (input) => If(If(Const("{", input), ([_0, input2]) => If(MappedReadonly(input2), ([_1, input3]) => If(Const("[", input3), ([_2, input4]) => If(Ident(input4), ([_3, input5]) => If(Const("in", input5), ([_4, input6]) => If(Type(input6), ([_5, input7]) => If(MappedAs(input7), ([_6, input8]) => If(Const("]", input8), ([_7, input9]) => If(MappedOptional(input9), ([_8, input10]) => If(Const(":", input10), ([_9, input11]) => If(Type(input11), ([_10, input12]) => If(OptionalSemiColon(input12), ([_11, input13]) => If(Const("}", input13), ([_12, input14]) => [[_0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12], input14]))))))))))))), ([_0, input2]) => [MappedMapping(_0), input2]);
var Reference = (input) => If(Ident(input), ([_0, input2]) => [ReferenceMapping(_0), input2]);
var Options = (input) => If(If(Const("Options", input), ([_0, input2]) => If(Const("<", input2), ([_1, input3]) => If(Type(input3), ([_2, input4]) => If(Const(",", input4), ([_3, input5]) => If(JsonObject(input5), ([_4, input6]) => If(Const(">", input6), ([_5, input7]) => [[_0, _1, _2, _3, _4, _5], input7])))))), ([_0, input2]) => [OptionsMapping(_0), input2]);
var JsonNumber = (input) => If(Number3(input), ([_0, input2]) => [JsonNumberMapping(_0), input2]);
var JsonBoolean = (input) => If(If(Const("true", input), ([_0, input2]) => [_0, input2], () => If(Const("false", input), ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [JsonBooleanMapping(_0), input2]);
var JsonString = (input) => If(String3(['"', "'"], input), ([_0, input2]) => [JsonStringMapping(_0), input2]);
var JsonNull = (input) => If(Const("null", input), ([_0, input2]) => [JsonNullMapping(_0), input2]);
var JsonProperty = (input) => If(If(PropertyKey(input), ([_0, input2]) => If(Const(":", input2), ([_1, input3]) => If(Json(input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [JsonPropertyMapping(_0), input2]);
var JsonPropertyList_0 = (input, result = []) => If(If(JsonProperty(input), ([_0, input2]) => If(PropertyDelimiter(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => JsonPropertyList_0(input2, [...result, _0]), () => [result, input]);
var JsonPropertyList = (input) => If(If(JsonPropertyList_0(input), ([_0, input2]) => If(If(If(JsonProperty(input2), ([_02, input3]) => [[_02], input3]), ([_02, input3]) => [_02, input3], () => If([[], input2], ([_02, input3]) => [_02, input3], () => [])), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [JsonPropertyListMapping(_0), input2]);
var JsonObject = (input) => If(If(Const("{", input), ([_0, input2]) => If(JsonPropertyList(input2), ([_1, input3]) => If(Const("}", input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [JsonObjectMapping(_0), input2]);
var JsonElementList_0 = (input, result = []) => If(If(Json(input), ([_0, input2]) => If(Const(",", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => JsonElementList_0(input2, [...result, _0]), () => [result, input]);
var JsonElementList = (input) => If(If(JsonElementList_0(input), ([_0, input2]) => If(If(If(Json(input2), ([_02, input3]) => [[_02], input3]), ([_02, input3]) => [_02, input3], () => If([[], input2], ([_02, input3]) => [_02, input3], () => [])), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [JsonElementListMapping(_0), input2]);
var JsonArray = (input) => If(If(Const("[", input), ([_0, input2]) => If(JsonElementList(input2), ([_1, input3]) => If(Const("]", input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [JsonArrayMapping(_0), input2]);
var Json = (input) => If(If(JsonNumber(input), ([_0, input2]) => [_0, input2], () => If(JsonBoolean(input), ([_0, input2]) => [_0, input2], () => If(JsonString(input), ([_0, input2]) => [_0, input2], () => If(JsonNull(input), ([_0, input2]) => [_0, input2], () => If(JsonObject(input), ([_0, input2]) => [_0, input2], () => If(JsonArray(input), ([_0, input2]) => [_0, input2], () => [])))))), ([_0, input2]) => [JsonMapping(_0), input2]);
var PatternBigInt = (input) => If(Const("-?(?:0|[1-9][0-9]*)n", input), ([_0, input2]) => [PatternBigIntMapping(_0), input2]);
var PatternString = (input) => If(Const(".*", input), ([_0, input2]) => [PatternStringMapping(_0), input2]);
var PatternNumber = (input) => If(Const("-?(?:0|[1-9][0-9]*)(?:.[0-9]+)?", input), ([_0, input2]) => [PatternNumberMapping(_0), input2]);
var PatternInteger = (input) => If(Const("-?(?:0|[1-9][0-9]*)", input), ([_0, input2]) => [PatternIntegerMapping(_0), input2]);
var PatternNever = (input) => If(Const("(?!)", input), ([_0, input2]) => [PatternNeverMapping(_0), input2]);
var PatternText = (input) => If(Until_1(["-?(?:0|[1-9][0-9]*)n", ".*", "-?(?:0|[1-9][0-9]*)(?:.[0-9]+)?", "-?(?:0|[1-9][0-9]*)", "(?!)", "(", ")", "$", "|"], input), ([_0, input2]) => [PatternTextMapping(_0), input2]);
var PatternBase = (input) => If(If(PatternBigInt(input), ([_0, input2]) => [_0, input2], () => If(PatternString(input), ([_0, input2]) => [_0, input2], () => If(PatternNumber(input), ([_0, input2]) => [_0, input2], () => If(PatternInteger(input), ([_0, input2]) => [_0, input2], () => If(PatternNever(input), ([_0, input2]) => [_0, input2], () => If(PatternGroup(input), ([_0, input2]) => [_0, input2], () => If(PatternText(input), ([_0, input2]) => [_0, input2], () => []))))))), ([_0, input2]) => [PatternBaseMapping(_0), input2]);
var PatternGroup = (input) => If(If(Const("(", input), ([_0, input2]) => If(PatternBody(input2), ([_1, input3]) => If(Const(")", input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [PatternGroupMapping(_0), input2]);
var PatternUnion = (input) => If(If(If(PatternTerm(input), ([_0, input2]) => If(Const("|", input2), ([_1, input3]) => If(PatternUnion(input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [_0, input2], () => If(If(PatternTerm(input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => If([[], input], ([_0, input2]) => [_0, input2], () => []))), ([_0, input2]) => [PatternUnionMapping(_0), input2]);
var PatternTerm = (input) => If(If(PatternBase(input), ([_0, input2]) => If(PatternBody(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [PatternTermMapping(_0), input2]);
var PatternBody = (input) => If(If(PatternUnion(input), ([_0, input2]) => [_0, input2], () => If(PatternTerm(input), ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [PatternBodyMapping(_0), input2]);
var Pattern = (input) => If(If(Const("^", input), ([_0, input2]) => If(PatternBody(input2), ([_1, input3]) => If(Const("$", input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [PatternMapping(_0), input2]);
var InterfaceDeclarationHeritageList_0 = (input, result = []) => If(If(Type(input), ([_0, input2]) => If(Const(",", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => InterfaceDeclarationHeritageList_0(input2, [...result, _0]), () => [result, input]);
var InterfaceDeclarationHeritageList = (input) => If(If(InterfaceDeclarationHeritageList_0(input), ([_0, input2]) => If(If(If(Type(input2), ([_02, input3]) => [[_02], input3]), ([_02, input3]) => [_02, input3], () => If([[], input2], ([_02, input3]) => [_02, input3], () => [])), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [InterfaceDeclarationHeritageListMapping(_0), input2]);
var InterfaceDeclarationHeritage = (input) => If(If(If(Const("extends", input), ([_0, input2]) => If(InterfaceDeclarationHeritageList(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [_0, input2], () => If([[], input], ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [InterfaceDeclarationHeritageMapping(_0), input2]);
var InterfaceDeclarationGeneric = (input) => If(If(Const("interface", input), ([_0, input2]) => If(Ident(input2), ([_1, input3]) => If(GenericParameters(input3), ([_2, input4]) => If(InterfaceDeclarationHeritage(input4), ([_3, input5]) => If(Properties(input5), ([_4, input6]) => [[_0, _1, _2, _3, _4], input6]))))), ([_0, input2]) => [InterfaceDeclarationGenericMapping(_0), input2]);
var InterfaceDeclaration = (input) => If(If(Const("interface", input), ([_0, input2]) => If(Ident(input2), ([_1, input3]) => If(InterfaceDeclarationHeritage(input3), ([_2, input4]) => If(Properties(input4), ([_3, input5]) => [[_0, _1, _2, _3], input5])))), ([_0, input2]) => [InterfaceDeclarationMapping(_0), input2]);
var TypeAliasDeclarationGeneric = (input) => If(If(Const("type", input), ([_0, input2]) => If(Ident(input2), ([_1, input3]) => If(GenericParameters(input3), ([_2, input4]) => If(Const("=", input4), ([_3, input5]) => If(Type(input5), ([_4, input6]) => [[_0, _1, _2, _3, _4], input6]))))), ([_0, input2]) => [TypeAliasDeclarationGenericMapping(_0), input2]);
var TypeAliasDeclaration = (input) => If(If(Const("type", input), ([_0, input2]) => If(Ident(input2), ([_1, input3]) => If(Const("=", input3), ([_2, input4]) => If(Type(input4), ([_3, input5]) => [[_0, _1, _2, _3], input5])))), ([_0, input2]) => [TypeAliasDeclarationMapping(_0), input2]);
var ExportKeyword = (input) => If(If(If(Const("export", input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => If([[], input], ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [ExportKeywordMapping(_0), input2]);
var ModuleDeclarationDelimiter = (input) => If(If(If(Const(";", input), ([_0, input2]) => If(Const("\n", input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [_0, input2], () => If(If(Const(";", input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => If(If(Const("\n", input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => []))), ([_0, input2]) => [ModuleDeclarationDelimiterMapping(_0), input2]);
var ModuleDeclarationList_0 = (input, result = []) => If(If(ModuleDeclaration(input), ([_0, input2]) => If(ModuleDeclarationDelimiter(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => ModuleDeclarationList_0(input2, [...result, _0]), () => [result, input]);
var ModuleDeclarationList = (input) => If(If(ModuleDeclarationList_0(input), ([_0, input2]) => If(If(If(ModuleDeclaration(input2), ([_02, input3]) => [[_02], input3]), ([_02, input3]) => [_02, input3], () => If([[], input2], ([_02, input3]) => [_02, input3], () => [])), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [ModuleDeclarationListMapping(_0), input2]);
var ModuleDeclaration = (input) => If(If(ExportKeyword(input), ([_0, input2]) => If(If(InterfaceDeclarationGeneric(input2), ([_02, input3]) => [_02, input3], () => If(InterfaceDeclaration(input2), ([_02, input3]) => [_02, input3], () => If(TypeAliasDeclarationGeneric(input2), ([_02, input3]) => [_02, input3], () => If(TypeAliasDeclaration(input2), ([_02, input3]) => [_02, input3], () => [])))), ([_1, input3]) => If(OptionalSemiColon(input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [ModuleDeclarationMapping(_0), input2]);
var Module = (input) => If(If(ModuleDeclaration(input), ([_0, input2]) => If(ModuleDeclarationList(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [ModuleMapping(_0), input2]);
var Script = (input) => If(If(Module(input), ([_0, input2]) => [_0, input2], () => If(GenericType(input), ([_0, input2]) => [_0, input2], () => If(Type(input), ([_0, input2]) => [_0, input2], () => []))), ([_0, input2]) => [ScriptMapping(_0), input2]);

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/patterns/template.mjs
function ParseTemplateIntoTypes(template) {
  const parsed = TemplateLiteralTypes(`\`${template}\``);
  const result = guard_exports.IsEqual(parsed.length, 2) ? parsed[0] : Unreachable();
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/template_literal/encode.mjs
function JoinString(input) {
  return input.join("|");
}
function UnwrapTemplateLiteralPattern(pattern) {
  return pattern.slice(1, pattern.length - 1);
}
function EncodeLiteral(value, right, pattern) {
  return EncodeTypes(right, `${pattern}${value}`);
}
function EncodeBigInt(right, pattern) {
  return EncodeTypes(right, `${pattern}${BigIntPattern}`);
}
function EncodeInteger(right, pattern) {
  return EncodeTypes(right, `${pattern}${IntegerPattern}`);
}
function EncodeNumber(right, pattern) {
  return EncodeTypes(right, `${pattern}${NumberPattern}`);
}
function EncodeBoolean(right, pattern) {
  return EncodeType(Union([Literal("false"), Literal("true")]), right, pattern);
}
function EncodeString(right, pattern) {
  return EncodeTypes(right, `${pattern}${StringPattern}`);
}
function EncodeTemplateLiteral(templatePattern, right, pattern) {
  return EncodeTypes(right, `${pattern}${UnwrapTemplateLiteralPattern(templatePattern)}`);
}
function EncodeTemplateLiteralDeferred(types, right, pattern) {
  const templateLiteral = TemplateLiteralAction(types, {});
  const result = EncodeType(templateLiteral, right, pattern);
  return result;
}
function EncodeEnum(types, right, pattern) {
  const variants = EnumValuesToVariants(types);
  return EncodeUnion(variants, right, pattern);
}
function EncodeUnion(types, right, pattern, result = []) {
  return guard_exports.TakeLeft(types, (head, tail) => EncodeUnion(tail, right, pattern, [...result, EncodeType(head, [], "")]), () => EncodeTypes(right, `${pattern}(${JoinString(result)})`));
}
function EncodeType(type, right, pattern) {
  return IsEnum(type) ? EncodeEnum(type.enum, right, pattern) : IsInteger2(type) ? EncodeInteger(right, pattern) : IsLiteral(type) ? EncodeLiteral(type.const, right, pattern) : IsBigInt2(type) ? EncodeBigInt(right, pattern) : IsBoolean3(type) ? EncodeBoolean(right, pattern) : IsNumber3(type) ? EncodeNumber(right, pattern) : IsString3(type) ? EncodeString(right, pattern) : IsTemplateLiteral(type) ? EncodeTemplateLiteral(type.pattern, right, pattern) : IsTemplateLiteralDeferred(type) ? EncodeTemplateLiteralDeferred(type.parameters[0], right, pattern) : IsUnion(type) ? EncodeUnion(type.anyOf, right, pattern) : NeverPattern;
}
function EncodeTypes(types, pattern) {
  return guard_exports.TakeLeft(types, (left, right) => EncodeType(left, right, pattern), () => pattern);
}
function EncodePattern(types) {
  const encoded = EncodeTypes(types, "");
  const result = `^${encoded}$`;
  return result;
}
function TemplateLiteralEncode(types) {
  const pattern = EncodePattern(types);
  const result = TemplateLiteralCreate(pattern);
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/template_literal/instantiate.mjs
function TemplateLiteralAction(types, options) {
  const result = CanInstantiate(types) ? memory_exports.Update(TemplateLiteralEncode(types), {}, options) : TemplateLiteralDeferred(types, options);
  return result;
}
function TemplateLiteralInstantiate(context, state, types, options) {
  const instantiatedTypes = InstantiateTypes(context, state, types);
  return TemplateLiteralAction(instantiatedTypes, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/template_literal.mjs
function TemplateLiteralDeferred(types, options = {}) {
  return Deferred("TemplateLiteral", [types], options);
}
function IsTemplateLiteralDeferred(value) {
  return IsSchema(value) && guard_exports.HasPropertyKey(value, "action") && guard_exports.IsEqual(value.action, "TemplateLiteral");
}
function TemplateLiteralFromTypes(types) {
  return TemplateLiteralAction(types, {});
}
function TemplateLiteralFromString(template) {
  const types = ParseTemplateIntoTypes(template);
  return TemplateLiteralFromTypes(types);
}
function TemplateLiteral2(input, options = {}) {
  const type = guard_exports.IsString(input) ? TemplateLiteralFromString(input) : TemplateLiteralFromTypes(input);
  return memory_exports.Update(type, {}, options);
}
function IsTemplateLiteral(value) {
  return IsKind(value, "TemplateLiteral");
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/extends/result.mjs
var result_exports = {};
__export(result_exports, {
  ExtendsFalse: () => ExtendsFalse,
  ExtendsTrue: () => ExtendsTrue,
  ExtendsUnion: () => ExtendsUnion,
  IsExtendsFalse: () => IsExtendsFalse,
  IsExtendsTrue: () => IsExtendsTrue,
  IsExtendsTrueLike: () => IsExtendsTrueLike,
  IsExtendsUnion: () => IsExtendsUnion,
  Match: () => Match3
});
function ExtendsUnion(inferred) {
  return memory_exports.Create({ ["~kind"]: "ExtendsUnion" }, { inferred });
}
function IsExtendsUnion(value) {
  return guard_exports.IsObject(value) && guard_exports.HasPropertyKey(value, "~kind") && guard_exports.HasPropertyKey(value, "inferred") && guard_exports.IsEqual(value["~kind"], "ExtendsUnion") && guard_exports.IsObject(value.inferred);
}
function ExtendsTrue(inferred) {
  return memory_exports.Create({ ["~kind"]: "ExtendsTrue" }, { inferred });
}
function IsExtendsTrue(value) {
  return guard_exports.IsObject(value) && guard_exports.HasPropertyKey(value, "~kind") && guard_exports.HasPropertyKey(value, "inferred") && guard_exports.IsEqual(value["~kind"], "ExtendsTrue") && guard_exports.IsObject(value.inferred);
}
function ExtendsFalse() {
  return memory_exports.Create({ ["~kind"]: "ExtendsFalse" }, {});
}
function IsExtendsFalse(value) {
  return guard_exports.IsObject(value) && guard_exports.HasPropertyKey(value, "~kind") && guard_exports.IsEqual(value["~kind"], "ExtendsFalse");
}
function IsExtendsTrueLike(value) {
  return IsExtendsUnion(value) || IsExtendsTrue(value);
}
function Match3(result, true_, false_) {
  return IsExtendsTrueLike(result) ? true_(result.inferred) : false_();
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/extends/extends_right.mjs
function ExtendsRightInfer(inferred, name, left, right) {
  return Match3(ExtendsLeft(inferred, left, right), (checkInferred) => ExtendsTrue(memory_exports.Assign(memory_exports.Assign(inferred, checkInferred), { [name]: left })), () => ExtendsFalse());
}
function ExtendsRightAny(inferred, _left) {
  return ExtendsTrue(inferred);
}
function ExtendsRightEnum(inferred, left, right) {
  const union = EnumValuesToUnion(right);
  return ExtendsLeft(inferred, left, union);
}
function ExtendsRightIntersect(inferred, left, right) {
  return guard_exports.TakeLeft(right, (head, tail) => Match3(ExtendsLeft(inferred, left, head), (inferred2) => ExtendsRightIntersect(inferred2, left, tail), () => ExtendsFalse()), () => ExtendsTrue(inferred));
}
function ExtendsRightTemplateLiteral(inferred, left, right) {
  const decoded = TemplateLiteralDecode(right);
  return ExtendsLeft(inferred, left, decoded);
}
function ExtendsRightUnion(inferred, left, right) {
  return guard_exports.TakeLeft(right, (head, tail) => Match3(ExtendsLeft(inferred, left, head), (inferred2) => ExtendsTrue(inferred2), () => ExtendsRightUnion(inferred, left, tail)), () => ExtendsFalse());
}
function ExtendsRight(inferred, left, right) {
  return IsAny(right) ? ExtendsRightAny(inferred, left) : IsEnum(right) ? ExtendsRightEnum(inferred, left, right.enum) : IsInfer(right) ? ExtendsRightInfer(inferred, right.name, left, right.extends) : IsIntersect(right) ? ExtendsRightIntersect(inferred, left, right.allOf) : IsTemplateLiteral(right) ? ExtendsRightTemplateLiteral(inferred, left, right.pattern) : IsUnion(right) ? ExtendsRightUnion(inferred, left, right.anyOf) : IsUnknown(right) ? ExtendsTrue(inferred) : ExtendsFalse();
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/extends/any.mjs
function ExtendsAny(inferred, left, right) {
  return IsInfer(right) ? ExtendsRight(inferred, left, right) : IsAny(right) ? ExtendsTrue(inferred) : IsUnknown(right) ? ExtendsTrue(inferred) : ExtendsUnion(inferred);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/extends/array.mjs
function ExtendsImmutable(left, right) {
  const isImmutableLeft = IsImmutable(left);
  const isImmutableRight = IsImmutable(right);
  return isImmutableLeft && isImmutableRight ? true : !isImmutableLeft && isImmutableRight ? true : isImmutableLeft && !isImmutableRight ? false : true;
}
function ExtendsArray(inferred, arrayLeft, left, right) {
  return IsArray2(right) ? ExtendsImmutable(arrayLeft, right) ? ExtendsLeft(inferred, left, right.items) : ExtendsFalse() : ExtendsRight(inferred, arrayLeft, right);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/extends/async_iterator.mjs
function ExtendsAsyncIterator(inferred, left, right) {
  return IsAsyncIterator2(right) ? ExtendsLeft(inferred, left, right.iteratorItems) : ExtendsRight(inferred, AsyncIterator(left), right);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/extends/bigint.mjs
function ExtendsBigInt(inferred, left, right) {
  return IsBigInt2(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/extends/boolean.mjs
function ExtendsBoolean(inferred, left, right) {
  return IsBoolean3(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/extends/parameters.mjs
function ParameterCompare(inferred, left, leftRest, right, rightRest) {
  const checkLeft = IsInfer(right) ? left : right;
  const checkRight = IsInfer(right) ? right : left;
  const isLeftOptional = IsOptional(left);
  const isRightOptional = IsOptional(right);
  return !isLeftOptional && isRightOptional ? ExtendsFalse() : Match3(ExtendsLeft(inferred, checkLeft, checkRight), (inferred2) => ExtendsParameters(inferred2, leftRest, rightRest), () => ExtendsFalse());
}
function ParameterRight(inferred, left, leftRest, rightRest) {
  return guard_exports.TakeLeft(rightRest, (head, tail) => ParameterCompare(inferred, left, leftRest, head, tail), () => IsOptional(left) ? ExtendsTrue(inferred) : ExtendsFalse());
}
function ParametersLeft(inferred, left, rightRest) {
  return guard_exports.TakeLeft(left, (head, tail) => ParameterRight(inferred, head, tail, rightRest), () => ExtendsTrue(inferred));
}
function ExtendsParameters(inferred, left, right) {
  return ParametersLeft(inferred, left, right);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/extends/return_type.mjs
function ExtendsReturnType(inferred, left, right) {
  return IsVoid(right) ? ExtendsTrue(inferred) : ExtendsLeft(inferred, left, right);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/extends/constructor.mjs
function ExtendsConstructor(inferred, parameters, returnType, right) {
  return IsAny(right) ? ExtendsTrue(inferred) : IsUnknown(right) ? ExtendsTrue(inferred) : IsConstructor2(right) ? Match3(ExtendsParameters(inferred, parameters, right["parameters"]), (inferred2) => ExtendsReturnType(inferred2, returnType, right["instanceType"]), () => ExtendsFalse()) : ExtendsFalse();
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/extends/enum.mjs
function ExtendsEnum(inferred, left, right) {
  return ExtendsLeft(inferred, EnumToUnion(left), right);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/extends/function.mjs
function ExtendsFunction(inferred, parameters, returnType, right) {
  return IsAny(right) ? ExtendsTrue(inferred) : IsUnknown(right) ? ExtendsTrue(inferred) : IsFunction2(right) ? Match3(ExtendsParameters(inferred, parameters, right["parameters"]), (inferred2) => ExtendsReturnType(inferred2, returnType, right["returnType"]), () => ExtendsFalse()) : ExtendsFalse();
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/extends/integer.mjs
function ExtendsInteger(inferred, left, right) {
  return IsInteger2(right) ? ExtendsTrue(inferred) : IsNumber3(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/extends/intersect.mjs
function ExtendsIntersect(inferred, left, right) {
  const evaluated = EvaluateIntersect(left);
  return ExtendsLeft(inferred, evaluated, right);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/extends/iterator.mjs
function ExtendsIterator(inferred, left, right) {
  return IsIterator2(right) ? ExtendsLeft(inferred, left, right.iteratorItems) : ExtendsRight(inferred, Iterator(left), right);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/extends/literal.mjs
function ExtendsLiteralValue(inferred, left, right) {
  return left === right ? ExtendsTrue(inferred) : ExtendsFalse();
}
function ExtendsLiteralBigInt(inferred, left, right) {
  return IsLiteral(right) ? ExtendsLiteralValue(inferred, left, right.const) : IsBigInt2(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, Literal(left), right);
}
function ExtendsLiteralBoolean(inferred, left, right) {
  return IsLiteral(right) ? ExtendsLiteralValue(inferred, left, right.const) : IsBoolean3(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, Literal(left), right);
}
function ExtendsLiteralNumber(inferred, left, right) {
  return IsLiteral(right) ? ExtendsLiteralValue(inferred, left, right.const) : IsNumber3(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, Literal(left), right);
}
function ExtendsLiteralString(inferred, left, right) {
  return IsLiteral(right) ? ExtendsLiteralValue(inferred, left, right.const) : IsString3(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, Literal(left), right);
}
function ExtendsLiteral(inferred, left, right) {
  return guard_exports.IsBigInt(left.const) ? ExtendsLiteralBigInt(inferred, left.const, right) : guard_exports.IsBoolean(left.const) ? ExtendsLiteralBoolean(inferred, left.const, right) : guard_exports.IsNumber(left.const) ? ExtendsLiteralNumber(inferred, left.const, right) : guard_exports.IsString(left.const) ? ExtendsLiteralString(inferred, left.const, right) : Unreachable();
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/extends/never.mjs
function ExtendsNever(inferred, left, right) {
  return IsInfer(right) ? ExtendsRight(inferred, left, right) : ExtendsTrue(inferred);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/extends/null.mjs
function ExtendsNull(inferred, left, right) {
  return IsNull2(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/extends/number.mjs
function ExtendsNumber(inferred, left, right) {
  return IsNumber3(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/extends/object.mjs
function ExtendsPropertyOptional(inferred, left, right) {
  return IsOptional(left) ? IsOptional(right) ? ExtendsTrue(inferred) : ExtendsFalse() : ExtendsTrue(inferred);
}
function ExtendsProperty(inferred, left, right) {
  return (
    // Right TInfer<TNever> is TExtendsFalse
    IsInfer(right) && IsNever(right.extends) ? ExtendsFalse() : Match3(ExtendsLeft(inferred, left, right), (inferred2) => ExtendsPropertyOptional(inferred2, left, right), () => ExtendsFalse())
  );
}
function ExtractInferredProperties(keys, properties) {
  return keys.reduce((result, key) => {
    return key in properties ? IsExtendsTrueLike(properties[key]) ? { ...result, ...properties[key].inferred } : Unreachable() : Unreachable();
  }, {});
}
function ExtendsPropertiesComparer(inferred, left, right) {
  const properties = {};
  for (const rightKey of guard_exports.Keys(right)) {
    properties[rightKey] = rightKey in left ? ExtendsProperty({}, left[rightKey], right[rightKey]) : IsOptional(right[rightKey]) ? IsInfer(right[rightKey]) ? ExtendsTrue(memory_exports.Assign(inferred, { [right[rightKey].name]: right[rightKey].extends })) : ExtendsTrue(inferred) : ExtendsFalse();
  }
  const checked = guard_exports.Values(properties).every((result) => IsExtendsTrueLike(result));
  const extracted = checked ? ExtractInferredProperties(guard_exports.Keys(properties), properties) : {};
  return checked ? ExtendsTrue(extracted) : ExtendsFalse();
}
function ExtendsProperties(inferred, left, right) {
  const compared = ExtendsPropertiesComparer(inferred, left, right);
  return IsExtendsTrueLike(compared) ? ExtendsTrue(memory_exports.Assign(inferred, compared.inferred)) : ExtendsFalse();
}
function ExtendsObjectToObject(inferred, left, right) {
  return ExtendsProperties(inferred, left, right);
}
function ExtendsObject(inferred, left, right) {
  return IsObject2(right) ? ExtendsObjectToObject(inferred, left, right.properties) : ExtendsRight(inferred, _Object_(left), right);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/extends/promise.mjs
function ExtendsPromise(inferred, left, right) {
  return IsPromise(right) ? ExtendsLeft(inferred, left, right.item) : ExtendsRight(inferred, _Promise_(left), right);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/extends/string.mjs
function ExtendsString(inferred, left, right) {
  return IsString3(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/extends/symbol.mjs
function ExtendsSymbol(inferred, left, right) {
  return IsSymbol2(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/extends/template_literal.mjs
function ExtendsTemplateLiteral(inferred, left, right) {
  const decoded = TemplateLiteralDecode(left);
  return ExtendsLeft(inferred, decoded, right);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/extends/inference.mjs
function Inferrable(name, type) {
  return memory_exports.Create({ "~kind": "Inferrable" }, { name, type }, {});
}
function IsInferable(value) {
  return guard_exports.IsObject(value) && guard_exports.HasPropertyKey(value, "~kind") && guard_exports.HasPropertyKey(value, "name") && guard_exports.HasPropertyKey(value, "type") && guard_exports.IsEqual(value["~kind"], "Inferrable") && guard_exports.IsString(value.name) && guard_exports.IsObject(value.type);
}
function TryRestInferable(type) {
  return IsRest(type) ? IsInfer(type.items) ? IsArray2(type.items.extends) ? Inferrable(type.items.name, type.items.extends.items) : IsUnknown(type.items.extends) ? Inferrable(type.items.name, type.items.extends) : void 0 : Unreachable() : void 0;
}
function TryInferable(type) {
  return IsInfer(type) ? Inferrable(type.name, type.extends) : void 0;
}
function TryInferResults(rest, right, result = []) {
  return guard_exports.TakeLeft(rest, (head, tail) => Match3(ExtendsLeft({}, head, right), () => TryInferResults(tail, right, [...result, head]), () => void 0), () => result);
}
function InferTupleResult(inferred, name, left, right) {
  const results = TryInferResults(left, right);
  return guard_exports.IsArray(results) ? ExtendsTrue(memory_exports.Assign(inferred, { [name]: Tuple(results) })) : ExtendsFalse();
}
function InferUnionResult(inferred, name, left, right) {
  const results = TryInferResults(left, right);
  return guard_exports.IsArray(results) ? ExtendsTrue(memory_exports.Assign(inferred, { [name]: Union(results) })) : ExtendsFalse();
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/extends/tuple.mjs
function Reverse(types) {
  return [...types].reverse();
}
function ApplyReverse(types, reversed) {
  return reversed ? Reverse(types) : types;
}
function Reversed(types) {
  const first = types.length > 0 ? types[0] : void 0;
  const inferrable = IsSchema(first) ? TryRestInferable(first) : void 0;
  return IsSchema(inferrable);
}
function ElementsCompare(inferred, reversed, left, leftRest, right, rightRest) {
  return Match3(ExtendsLeft(inferred, left, right), (checkInferred) => Elements(checkInferred, reversed, leftRest, rightRest), () => ExtendsFalse());
}
function ElementsLeft(inferred, reversed, leftRest, right, rightRest) {
  const inferable = TryRestInferable(right);
  return (
    // Rest Inferrable Right Means we delegate to TInferTupleResult to Generate a Result
    IsInferable(inferable) ? InferTupleResult(inferred, inferable["name"], ApplyReverse(leftRest, reversed), inferable["type"]) : guard_exports.TakeLeft(leftRest, (head, tail) => ElementsCompare(inferred, reversed, head, tail, right, rightRest), () => ExtendsFalse())
  );
}
function ElementsRight(inferred, reversed, leftRest, rightRest) {
  return guard_exports.TakeLeft(rightRest, (head, tail) => ElementsLeft(inferred, reversed, leftRest, head, tail), () => guard_exports.IsEqual(leftRest.length, 0) ? ExtendsTrue(inferred) : ExtendsFalse());
}
function Elements(inferred, reversed, leftRest, rightRest) {
  return ElementsRight(inferred, reversed, leftRest, rightRest);
}
function ExtendsTupleToTuple(inferred, left, right) {
  const instantiatedRight = InstantiateElements(inferred, { callstack: [] }, right);
  const reversed = Reversed(instantiatedRight);
  return Elements(inferred, reversed, ApplyReverse(left, reversed), ApplyReverse(instantiatedRight, reversed));
}
function ExtendsTupleToArray(inferred, left, right) {
  const inferrable = TryInferable(right);
  return IsInferable(inferrable) ? InferUnionResult(inferred, inferrable["name"], left, inferrable["type"]) : guard_exports.TakeLeft(left, (head, tail) => Match3(ExtendsLeft(inferred, head, right), (inferred2) => ExtendsTupleToArray(inferred2, tail, right), () => ExtendsFalse()), () => ExtendsTrue(inferred));
}
function ExtendsTuple(inferred, left, right) {
  const instantiatedLeft = InstantiateElements(inferred, { callstack: [] }, left);
  return IsTuple(right) ? ExtendsTupleToTuple(inferred, instantiatedLeft, right.items) : IsArray2(right) ? ExtendsTupleToArray(inferred, instantiatedLeft, right.items) : ExtendsRight(inferred, Tuple(instantiatedLeft), right);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/extends/undefined.mjs
function ExtendsUndefined(inferred, left, right) {
  return IsVoid(right) ? ExtendsTrue(inferred) : IsUndefined2(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/extends/union.mjs
function ExtendsUnionSome(inferred, type, unionTypes) {
  return guard_exports.TakeLeft(unionTypes, (head, tail) => Match3(ExtendsLeft(inferred, type, head), (inferred2) => ExtendsTrue(inferred2), () => ExtendsUnionSome(inferred, type, tail)), () => ExtendsFalse());
}
function ExtendsUnionLeft(inferred, left, right) {
  return guard_exports.TakeLeft(left, (head, tail) => Match3(ExtendsUnionSome(inferred, head, right), (inferred2) => ExtendsUnionLeft(inferred2, tail, right), () => ExtendsFalse()), () => ExtendsTrue(inferred));
}
function ExtendsUnion2(inferred, left, right) {
  const inferrable = TryInferable(right);
  return IsInferable(inferrable) ? InferUnionResult(inferred, inferrable.name, left, inferrable.type) : IsUnion(right) ? ExtendsUnionLeft(inferred, left, right.anyOf) : ExtendsUnionLeft(inferred, left, [right]);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/extends/unknown.mjs
function ExtendsUnknown(inferred, left, right) {
  return IsInfer(right) ? ExtendsRight(inferred, left, right) : IsAny(right) ? ExtendsTrue(inferred) : IsUnknown(right) ? ExtendsTrue(inferred) : ExtendsFalse();
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/extends/void.mjs
function ExtendsVoid(inferred, left, right) {
  return IsVoid(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/extends/extends_left.mjs
function ExtendsLeft(inferred, left, right) {
  return IsAny(left) ? ExtendsAny(inferred, left, right) : IsArray2(left) ? ExtendsArray(inferred, left, left.items, right) : IsAsyncIterator2(left) ? ExtendsAsyncIterator(inferred, left.iteratorItems, right) : IsBigInt2(left) ? ExtendsBigInt(inferred, left, right) : IsBoolean3(left) ? ExtendsBoolean(inferred, left, right) : IsConstructor2(left) ? ExtendsConstructor(inferred, left.parameters, left.instanceType, right) : IsEnum(left) ? ExtendsEnum(inferred, left, right) : IsFunction2(left) ? ExtendsFunction(inferred, left.parameters, left.returnType, right) : IsInteger2(left) ? ExtendsInteger(inferred, left, right) : IsIntersect(left) ? ExtendsIntersect(inferred, left.allOf, right) : IsIterator2(left) ? ExtendsIterator(inferred, left.iteratorItems, right) : IsLiteral(left) ? ExtendsLiteral(inferred, left, right) : IsNever(left) ? ExtendsNever(inferred, left, right) : IsNull2(left) ? ExtendsNull(inferred, left, right) : IsNumber3(left) ? ExtendsNumber(inferred, left, right) : IsObject2(left) ? ExtendsObject(inferred, left.properties, right) : IsPromise(left) ? ExtendsPromise(inferred, left.item, right) : IsString3(left) ? ExtendsString(inferred, left, right) : IsSymbol2(left) ? ExtendsSymbol(inferred, left, right) : IsTemplateLiteral(left) ? ExtendsTemplateLiteral(inferred, left.pattern, right) : IsTuple(left) ? ExtendsTuple(inferred, left.items, right) : IsUndefined2(left) ? ExtendsUndefined(inferred, left, right) : IsUnion(left) ? ExtendsUnion2(inferred, left.anyOf, right) : IsUnknown(left) ? ExtendsUnknown(inferred, left, right) : IsVoid(left) ? ExtendsVoid(inferred, left, right) : ExtendsFalse();
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/interface/instantiate.mjs
function InterfaceOperation(heritage, properties) {
  const result = EvaluateIntersect([...heritage, _Object_(properties)]);
  return result;
}
function InterfaceAction(heritage, properties, options) {
  const result = CanInstantiate(heritage) ? memory_exports.Update(InterfaceOperation(heritage, properties), {}, options) : InterfaceDeferred(heritage, properties, options);
  return result;
}
function InterfaceInstantiate(context, state, heritage, properties, options) {
  const instantiatedHeritage = InstantiateTypes(context, state, heritage);
  const instantiatedProperties = InstantiateProperties(context, state, properties);
  return InterfaceAction(instantiatedHeritage, instantiatedProperties, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/action/interface.mjs
function InterfaceDeferred(heritage, properties, options = {}) {
  return Deferred("Interface", [heritage, properties], options);
}
function IsInterfaceDeferred(value) {
  return IsSchema(value) && guard_exports.HasPropertyKey(value, "action") && guard_exports.IsEqual(value.action, "Interface");
}
function Interface(heritage, properties, options = {}) {
  return InterfaceAction(heritage, properties, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/cyclic/check.mjs
function FromRef(stack, context, ref) {
  return stack.includes(ref) ? true : FromType3([...stack, ref], context, context[ref]);
}
function FromProperties(stack, context, properties) {
  const types = PropertyValues(properties);
  return FromTypes2(stack, context, types);
}
function FromTypes2(stack, context, types) {
  return guard_exports.TakeLeft(types, (left, right) => FromType3(stack, context, left) ? true : FromTypes2(stack, context, right), () => false);
}
function FromType3(stack, context, type) {
  return IsRef(type) ? FromRef(stack, context, type.$ref) : IsArray2(type) ? FromType3(stack, context, type.items) : IsAsyncIterator2(type) ? FromType3(stack, context, type.iteratorItems) : IsConstructor2(type) ? FromTypes2(stack, context, [...type.parameters, type.instanceType]) : IsFunction2(type) ? FromTypes2(stack, context, [...type.parameters, type.returnType]) : IsInterfaceDeferred(type) ? FromProperties(stack, context, type.parameters[1]) : IsIntersect(type) ? FromTypes2(stack, context, type.allOf) : IsIterator2(type) ? FromType3(stack, context, type.iteratorItems) : IsObject2(type) ? FromProperties(stack, context, type.properties) : IsPromise(type) ? FromType3(stack, context, type.item) : IsUnion(type) ? FromTypes2(stack, context, type.anyOf) : IsTuple(type) ? FromTypes2(stack, context, type.items) : IsRecord(type) ? FromType3(stack, context, RecordValue(type)) : false;
}
function CyclicCheck(stack, context, type) {
  const result = FromType3(stack, context, type);
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/cyclic/candidates.mjs
function ResolveCandidateKeys(context, keys) {
  return keys.reduce((result, left) => {
    return left in context ? CyclicCheck([left], context, context[left]) ? [...result, left] : result : Unreachable();
  }, []);
}
function CyclicCandidates(context) {
  const keys = PropertyKeys(context);
  const result = ResolveCandidateKeys(context, keys);
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/cyclic/dependencies.mjs
function FromRef2(context, ref, result) {
  return result.includes(ref) ? result : ref in context ? FromType4(context, context[ref], [...result, ref]) : Unreachable();
}
function FromProperties2(context, properties, result) {
  const types = PropertyValues(properties);
  return FromTypes3(context, types, result);
}
function FromTypes3(context, types, result) {
  return types.reduce((result2, left) => {
    return FromType4(context, left, result2);
  }, result);
}
function FromType4(context, type, result) {
  return IsRef(type) ? FromRef2(context, type.$ref, result) : IsArray2(type) ? FromType4(context, type.items, result) : IsAsyncIterator2(type) ? FromType4(context, type.iteratorItems, result) : IsConstructor2(type) ? FromTypes3(context, [...type.parameters, type.instanceType], result) : IsFunction2(type) ? FromTypes3(context, [...type.parameters, type.returnType], result) : IsInterfaceDeferred(type) ? FromProperties2(context, type.parameters[1], result) : IsIntersect(type) ? FromTypes3(context, type.allOf, result) : IsIterator2(type) ? FromType4(context, type.iteratorItems, result) : IsObject2(type) ? FromProperties2(context, type.properties, result) : IsPromise(type) ? FromType4(context, type.item, result) : IsUnion(type) ? FromTypes3(context, type.anyOf, result) : IsTuple(type) ? FromTypes3(context, type.items, result) : IsRecord(type) ? FromType4(context, RecordValue(type), result) : result;
}
function CyclicDependencies(context, key, type) {
  const result = FromType4(context, type, [key]);
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/cyclic/extends.mjs
function FromRef3(_ref) {
  return Any();
}
function FromProperties3(properties) {
  return guard_exports.Keys(properties).reduce((result, key) => {
    return { ...result, [key]: FromType5(properties[key]) };
  }, {});
}
function FromTypes4(types) {
  return types.reduce((result, left) => {
    return [...result, FromType5(left)];
  }, []);
}
function FromType5(type) {
  return IsRef(type) ? FromRef3(type.$ref) : IsArray2(type) ? _Array_(FromType5(type.items), ArrayOptions(type)) : IsAsyncIterator2(type) ? AsyncIterator(FromType5(type.iteratorItems)) : IsConstructor2(type) ? Constructor(FromTypes4(type.parameters), FromType5(type.instanceType)) : IsFunction2(type) ? _Function_(FromTypes4(type.parameters), FromType5(type.returnType)) : IsIntersect(type) ? Intersect(FromTypes4(type.allOf)) : IsIterator2(type) ? Iterator(FromType5(type.iteratorItems)) : IsObject2(type) ? _Object_(FromProperties3(type.properties)) : IsPromise(type) ? _Promise_(FromType5(type.item)) : IsRecord(type) ? Record(RecordKey(type), FromType5(RecordValue(type))) : IsUnion(type) ? Union(FromTypes4(type.anyOf)) : IsTuple(type) ? Tuple(FromTypes4(type.items)) : type;
}
function CyclicAnyFromParameters(defs, ref) {
  return ref in defs ? FromType5(defs[ref]) : Unknown();
}
function CyclicExtends(type) {
  return CyclicAnyFromParameters(type.$defs, type.$ref);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/cyclic/instantiate.mjs
function CyclicInterface(context, heritage, properties) {
  const instantiatedHeritage = InstantiateTypes(context, { callstack: [] }, heritage);
  const instantiatedProperties = InstantiateProperties({}, { callstack: [] }, properties);
  const evaluatedInterface = EvaluateIntersect([...instantiatedHeritage, _Object_(instantiatedProperties)]);
  return evaluatedInterface;
}
function CyclicDefinitions(context, dependencies) {
  const keys = guard_exports.Keys(context).filter((key) => dependencies.includes(key));
  return keys.reduce((result, key) => {
    const type = context[key];
    const instantiatedType = IsInterfaceDeferred(type) ? CyclicInterface(context, type.parameters[0], type.parameters[1]) : type;
    return { ...result, [key]: instantiatedType };
  }, {});
}
function InstantiateCyclic(context, ref, type) {
  const dependencies = CyclicDependencies(context, ref, type);
  const definitions = CyclicDefinitions(context, dependencies);
  const result = Cyclic(definitions, ref);
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/cyclic/target.mjs
function Resolve(defs, ref) {
  return ref in defs ? IsRef(defs[ref]) ? Resolve(defs, defs[ref].$ref) : defs[ref] : Never();
}
function CyclicTarget(defs, ref) {
  const result = Resolve(defs, ref);
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/extends/extends.mjs
function Canonical(type) {
  return IsCyclic(type) ? CyclicExtends(type) : IsUnsafe(type) ? Unknown() : type;
}
function Extends2(inferred, left, right) {
  const canonicalLeft = Canonical(left);
  const canonicalRight = Canonical(right);
  return ExtendsLeft(inferred, canonicalLeft, canonicalRight);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/evaluate/compare.mjs
var ResultEqual = "equal";
var ResultDisjoint = "disjoint";
var ResultLeftInside = "left-inside";
var ResultRightInside = "right-inside";
function Compare(left, right) {
  const extendsCheck = [
    IsUnknown(left) ? result_exports.ExtendsFalse() : Extends2({}, left, right),
    IsUnknown(left) ? result_exports.ExtendsTrue({}) : Extends2({}, right, left)
  ];
  return result_exports.IsExtendsTrueLike(extendsCheck[0]) && result_exports.IsExtendsTrueLike(extendsCheck[1]) ? ResultEqual : result_exports.IsExtendsTrueLike(extendsCheck[0]) && result_exports.IsExtendsFalse(extendsCheck[1]) ? ResultLeftInside : result_exports.IsExtendsFalse(extendsCheck[0]) && result_exports.IsExtendsTrueLike(extendsCheck[1]) ? ResultRightInside : ResultDisjoint;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/evaluate/broaden.mjs
function BroadFilter(type, types) {
  return types.filter((left) => {
    return Compare(type, left) === ResultRightInside ? false : true;
  });
}
function IsBroadestType(type, types) {
  const result = types.some((left) => {
    const result2 = Compare(type, left);
    return guard_exports.IsEqual(result2, ResultLeftInside) || guard_exports.IsEqual(result2, ResultEqual);
  });
  return guard_exports.IsEqual(result, false);
}
function BroadenType(type, types) {
  const evaluated = EvaluateType(type);
  return IsAny(evaluated) ? [evaluated] : IsBroadestType(evaluated, types) ? [...BroadFilter(evaluated, types), evaluated] : types;
}
function BroadenTypes(types) {
  return types.reduce((result, left) => {
    return IsObject2(left) ? [...result, left] : (
      // push
      IsNever(left) ? result : (
        // ignore
        BroadenType(left, result)
      )
    );
  }, []);
}
function Broaden(types) {
  const broadened = BroadenTypes(types);
  const flattened = Flatten(broadened);
  const result = flattened.length === 0 ? Never() : flattened.length === 1 ? flattened[0] : Union(flattened);
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/evaluate/instantiate.mjs
function EvaluateAction(type, options) {
  const result = memory_exports.Update(EvaluateType(type), {}, options);
  return result;
}
function EvaluateInstantiate(context, state, type, options) {
  const instantiatedType = InstantiateType(context, state, type);
  return EvaluateAction(instantiatedType, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/call/distribute_arguments.mjs
function CollectDistributionNames(expression, result = []) {
  return (
    // Conditional
    IsDeferred(expression) && guard_exports.IsEqual(expression.action, "Conditional") ? IsRef(expression.parameters[0]) ? CollectDistributionNames(expression.parameters[2], CollectDistributionNames(expression.parameters[3], [...result, expression.parameters[0]["$ref"]])) : CollectDistributionNames(expression.parameters[2], CollectDistributionNames(expression.parameters[3], result)) : IsDeferred(expression) && guard_exports.IsEqual(expression.action, "Mapped") ? IsDeferred(expression.parameters[1]) && guard_exports.IsEqual(expression.parameters[1].action, "KeyOf") && IsRef(expression.parameters[1].parameters[0]) ? [...result, expression.parameters[1].parameters[0]["$ref"]] : result : result
  );
}
function BuildDistributionArray(parameters, names) {
  return parameters.reduce((result, left) => [...result, names.includes(left.name)], []);
}
function ZipDistributionArray(arguments_, distributionArray, result = []) {
  return guard_exports.TakeLeft(arguments_, (argumentLeft, argumentRight) => guard_exports.TakeLeft(distributionArray, (booleanLeft, booleanRight) => ZipDistributionArray(argumentRight, booleanRight, [...result, [booleanLeft, argumentLeft]]), () => result), () => result);
}
function Expand(type) {
  return IsUnion(type) ? [...type.anyOf] : [type];
}
function Append(current, type) {
  return current.reduce((result, left) => [...result, [...left, type]], []);
}
function Cross(current, variants) {
  return variants.reduce((result, left) => {
    return [...result, ...Append(current, left)];
  }, []);
}
function Distribute2(zipped) {
  return zipped.reduce((result, left) => {
    return guard_exports.IsEqual(left[0], true) ? Cross(result, Expand(left[1])) : Cross(result, [left[1]]);
  }, [[]]);
}
function DistributeArguments(parameters, arguments_, expression) {
  const distributionNames = CollectDistributionNames(expression);
  const distributionArray = BuildDistributionArray(parameters, distributionNames);
  const zippedArguments = ZipDistributionArray(arguments_, distributionArray);
  return IsDeferred(expression) && guard_exports.IsEqual(expression.action, "Conditional") ? Distribute2(zippedArguments) : IsDeferred(expression) && guard_exports.IsEqual(expression.action, "Mapped") ? Distribute2(zippedArguments) : [arguments_];
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/call/resolve_target.mjs
function FromNotResolvable() {
  return ["(not-resolvable)", Never()];
}
function FromNotGeneric() {
  return ["(not-generic)", Never()];
}
function FromGeneric(name, parameters, expression) {
  return [name, Generic(parameters, expression)];
}
function FromRef4(context, ref, arguments_) {
  return ref in context ? FromType6(context, ref, context[ref], arguments_) : FromNotResolvable();
}
function FromType6(context, name, target, arguments_) {
  return IsGeneric(target) ? FromGeneric(name, target.parameters, target.expression) : IsRef(target) ? FromRef4(context, target.$ref, arguments_) : FromNotGeneric();
}
function ResolveTarget(context, target, arguments_) {
  return FromType6(context, "(anonymous)", target, arguments_);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/call/resolve_arguments.mjs
function AssertArgumentExtends(name, type, extends_) {
  if (IsInfer(type) || IsCall(type) || result_exports.IsExtendsTrueLike(Extends2({}, type, extends_)))
    return;
  const cause = { parameter: name, expect: extends_, actual: type };
  throw new Error(`Argument for parameter ${name} does not satisfy constraint`, { cause });
}
function BindArgument(context, state, name, extends_, type) {
  const instantiatedArgument = InstantiateType(context, state, type);
  AssertArgumentExtends(name, instantiatedArgument, extends_);
  return memory_exports.Assign(context, { [name]: instantiatedArgument });
}
function BindArguments(context, state, parameterLeft, parameterRight, arguments_) {
  const instantiatedExtends = InstantiateType(context, state, parameterLeft.extends);
  const instantiatedEquals = InstantiateType(context, state, parameterLeft.equals);
  return guard_exports.TakeLeft(arguments_, (left, right) => BindParameters(BindArgument(context, state, parameterLeft["name"], instantiatedExtends, left), state, parameterRight, right), () => BindParameters(BindArgument(context, state, parameterLeft["name"], instantiatedExtends, instantiatedEquals), state, parameterRight, []));
}
function BindParameters(context, state, parameters, arguments_) {
  return guard_exports.TakeLeft(parameters, (left, right) => BindArguments(context, state, left, right, arguments_), () => context);
}
function ResolveArgumentsContext(context, state, parameters, arguments_) {
  return BindParameters(context, state, parameters, arguments_);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/call/instantiate.mjs
function Peek(state) {
  const result = guard_exports.IsGreaterThan(state.callstack.length, 0) ? state.callstack[state.callstack.length - 1] : "";
  return result;
}
function IsTailCall(state, name) {
  const result = guard_exports.IsEqual(Peek(state), name);
  return result;
}
function CallDispatch(context, state, target, parameters, expression, arguments_) {
  const argumentsContext = ResolveArgumentsContext(context, state, parameters, arguments_);
  const returnType = InstantiateType(argumentsContext, { callstack: [...state.callstack, target.$ref] }, expression);
  return InstantiateType(context, state, returnType);
}
function CallDistributed(context, state, target, parameters, expression, distributedArguments) {
  return distributedArguments.reduce((result, arguments_) => [...result, CallDispatch(context, state, target, parameters, expression, arguments_)], []);
}
function CallImmediate(context, state, target, parameters, expression, arguments_) {
  const distributedArguments = DistributeArguments(parameters, arguments_, expression);
  const returnTypes = CallDistributed(context, state, target, parameters, expression, distributedArguments);
  const result = guard_exports.IsEqual(returnTypes.length, 1) ? returnTypes[0] : EvaluateUnion(returnTypes);
  return result;
}
function CallInstantiate(context, state, target, arguments_) {
  const instantiatedArguments = InstantiateTypes(context, state, arguments_);
  const resolved = ResolveTarget(context, target, arguments_);
  const name = resolved[0];
  const type = resolved[1];
  const result = IsGeneric(type) ? IsTailCall(state, name) ? CallConstruct(Ref(name), instantiatedArguments) : CallImmediate(context, state, Ref(name), type.parameters, type.expression, instantiatedArguments) : CallConstruct(target, instantiatedArguments);
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/types/call.mjs
function CallConstruct(target, arguments_) {
  return memory_exports.Create({ ["~kind"]: "Call" }, { target, arguments: arguments_ }, {});
}
function Call(target, arguments_) {
  return CallInstantiate({}, { callstack: [] }, target, arguments_);
}
function IsCall(value) {
  return IsKind(value, "Call");
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/intrinsics/mapping.mjs
function ApplyMapping(mapping, value) {
  return mapping(value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/intrinsics/from_literal.mjs
function FromLiteral3(mapping, value) {
  return guard_exports.IsString(value) ? Literal(ApplyMapping(mapping, value)) : Literal(value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/intrinsics/from_template_literal.mjs
function FromTemplateLiteral(mapping, pattern) {
  const decoded = TemplateLiteralDecode(pattern);
  const result = FromType7(mapping, decoded);
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/intrinsics/from_union.mjs
function FromUnion2(mapping, types) {
  const result = types.map((type) => FromType7(mapping, type));
  return Union(result);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/intrinsics/from_type.mjs
function FromType7(mapping, type) {
  return IsLiteral(type) ? FromLiteral3(mapping, type.const) : IsTemplateLiteral(type) ? FromTemplateLiteral(mapping, type.pattern) : IsUnion(type) ? FromUnion2(mapping, type.anyOf) : type;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/action/capitalize.mjs
function CapitalizeDeferred(type, options = {}) {
  return Deferred("Capitalize", [type], options);
}
function Capitalize(type, options = {}) {
  return CapitalizeAction(type, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/action/lowercase.mjs
function LowercaseDeferred(type, options = {}) {
  return Deferred("Lowercase", [type], options);
}
function Lowercase(type, options = {}) {
  return LowercaseAction(type, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/action/uncapitalize.mjs
function UncapitalizeDeferred(type, options = {}) {
  return Deferred("Uncapitalize", [type], options);
}
function Uncapitalize(type, options = {}) {
  return UncapitalizeAction(type, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/action/uppercase.mjs
function UppercaseDeferred(type, options = {}) {
  return Deferred("Uppercase", [type], options);
}
function Uppercase(type, options = {}) {
  return UppercaseAction(type, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/intrinsics/instantiate.mjs
var CapitalizeMapping = (input) => input[0].toUpperCase() + input.slice(1);
var LowercaseMapping = (input) => input.toLowerCase();
var UncapitalizeMapping = (input) => input[0].toLowerCase() + input.slice(1);
var UppercaseMapping = (input) => input.toUpperCase();
function CapitalizeAction(type, options) {
  const result = CanInstantiate([type]) ? memory_exports.Update(FromType7(CapitalizeMapping, type), {}, options) : CapitalizeDeferred(type, options);
  return result;
}
function LowercaseAction(type, options) {
  const result = CanInstantiate([type]) ? memory_exports.Update(FromType7(LowercaseMapping, type), {}, options) : LowercaseDeferred(type, options);
  return result;
}
function UncapitalizeAction(type, options) {
  const result = CanInstantiate([type]) ? memory_exports.Update(FromType7(UncapitalizeMapping, type), {}, options) : UncapitalizeDeferred(type, options);
  return result;
}
function UppercaseAction(type, options) {
  const result = CanInstantiate([type]) ? memory_exports.Update(FromType7(UppercaseMapping, type), {}, options) : UppercaseDeferred(type, options);
  return result;
}
function CapitalizeInstantiate(context, state, type, options) {
  const instantiatedType = InstantiateType(context, state, type);
  return CapitalizeAction(instantiatedType, options);
}
function LowercaseInstantiate(context, state, type, options) {
  const instantiatedType = InstantiateType(context, state, type);
  return LowercaseAction(instantiatedType, options);
}
function UncapitalizeInstantiate(context, state, type, options) {
  const instantiatedType = InstantiateType(context, state, type);
  return UncapitalizeAction(instantiatedType, options);
}
function UppercaseInstantiate(context, state, type, options) {
  const instantiatedType = InstantiateType(context, state, type);
  return UppercaseAction(instantiatedType, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/action/conditional.mjs
function ConditionalDeferred(left, right, true_, false_, options = {}) {
  return Deferred("Conditional", [left, right, true_, false_], options);
}
function Conditional(left, right, true_, false_, options = {}) {
  return ConditionalAction({}, { callstack: [] }, left, right, true_, false_, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/conditional/instantiate.mjs
function ConditionalOperation(context, state, left, right, true_, false_) {
  const extendsResult = Extends2(context, left, right);
  return result_exports.IsExtendsUnion(extendsResult) ? Union([InstantiateType(extendsResult.inferred, state, true_), InstantiateType(context, state, false_)]) : result_exports.IsExtendsTrue(extendsResult) ? InstantiateType(extendsResult.inferred, state, true_) : InstantiateType(context, state, false_);
}
function ConditionalAction(context, state, left, right, true_, false_, options) {
  const result = CanInstantiate([left, right]) ? memory_exports.Update(ConditionalOperation(context, state, left, right, true_, false_), {}, options) : ConditionalDeferred(left, right, true_, false_, options);
  return result;
}
function ConditionalInstantiate(context, state, left, right, true_, false_, options) {
  const instantiatedLeft = InstantiateType(context, state, left);
  const instantiatedRight = InstantiateType(context, state, right);
  return ConditionalAction(context, state, instantiatedLeft, instantiatedRight, true_, false_, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/action/constructor_parameters.mjs
function ConstructorParametersDeferred(type, options = {}) {
  return Deferred("ConstructorParameters", [type], options);
}
function ConstructorParameters(type, options = {}) {
  return ConstructorParametersAction(type, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/constructor_parameters/instantiate.mjs
function ConstructorParametersOperation(type) {
  const parameters = IsConstructor2(type) ? type["parameters"] : [];
  const instantiatedParameters = InstantiateElements({}, { callstack: [] }, parameters);
  const result = Tuple(instantiatedParameters);
  return result;
}
function ConstructorParametersAction(type, options) {
  const result = CanInstantiate([type]) ? memory_exports.Update(ConstructorParametersOperation(type), {}, options) : ConstructorParametersDeferred(type, options);
  return result;
}
function ConstructorParametersInstantiate(context, state, type, options) {
  const instantiatedType = InstantiateType(context, state, type);
  return ConstructorParametersAction(instantiatedType, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/action/exclude.mjs
function ExcludeDeferred(left, right, options = {}) {
  return Deferred("Exclude", [left, right], options);
}
function Exclude(left, right, options = {}) {
  return ExcludeAction(left, right, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/exclude/operation.mjs
function ExcludeUnionLeft(types, right) {
  return types.reduce((result, head) => {
    return [...result, ...ExcludeTypeLeft(head, right)];
  }, []);
}
function ExcludeTypeLeft(left, right) {
  const check = Extends2({}, left, right);
  const result = result_exports.IsExtendsTrueLike(check) ? [] : [left];
  return result;
}
function ExcludeOperation(left, right) {
  const remaining = IsEnum(left) ? ExcludeUnionLeft(EnumValuesToVariants(left.enum), right) : IsUnion(left) ? ExcludeUnionLeft(Flatten(left.anyOf), right) : ExcludeTypeLeft(left, right);
  const result = EvaluateUnion(remaining);
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/exclude/instantiate.mjs
function ExcludeAction(left, right, options) {
  const result = CanInstantiate([left, right]) ? memory_exports.Update(ExcludeOperation(left, right), {}, options) : ExcludeDeferred(left, right, options);
  return result;
}
function ExcludeInstantiate(context, state, left, right, options) {
  const instantiatedLeft = InstantiateType(context, state, left);
  const instantiatedRight = InstantiateType(context, state, right);
  return ExcludeAction(instantiatedLeft, instantiatedRight, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/action/extract.mjs
function ExtractDeferred(left, right, options = {}) {
  return Deferred("Extract", [left, right], options);
}
function Extract(left, right, options = {}) {
  return ExtractAction(left, right, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/extract/operation.mjs
function ExtractUnionLeft(types, right) {
  return types.reduce((result, head) => {
    return [...result, ...ExtractTypeLeft(head, right)];
  }, []);
}
function ExtractTypeLeft(left, right) {
  const check = Extends2({}, left, right);
  const result = result_exports.IsExtendsTrueLike(check) ? [left] : [];
  return result;
}
function ExtractOperation(left, right) {
  const remaining = IsEnum(left) ? ExtractUnionLeft(EnumValuesToVariants(left.enum), right) : IsUnion(left) ? ExtractUnionLeft(Flatten(left.anyOf), right) : ExtractTypeLeft(left, right);
  const result = EvaluateUnion(remaining);
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/extract/instantiate.mjs
function ExtractAction(left, right, options) {
  const result = CanInstantiate([left, right]) ? memory_exports.Update(ExtractOperation(left, right), {}, options) : ExtractDeferred(left, right, options);
  return result;
}
function ExtractInstantiate(context, state, left, right, options) {
  const instantiatedLeft = InstantiateType(context, state, left);
  const instantiatedRight = InstantiateType(context, state, right);
  return ExtractAction(instantiatedLeft, instantiatedRight, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/helpers/keys_to_indexer.mjs
function KeysToLiterals(keys) {
  return keys.reduce((result, left) => {
    return IsLiteralValue(left) ? [...result, Literal(left)] : result;
  }, []);
}
function KeysToIndexer(keys) {
  const literals = KeysToLiterals(keys);
  const result = Union(literals);
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/action/indexed.mjs
function IndexDeferred(type, indexer, options = {}) {
  return Deferred("Index", [type, indexer], options);
}
function Index(type, indexer_or_keys, options = {}) {
  const indexer = guard_exports.IsArray(indexer_or_keys) ? KeysToIndexer(indexer_or_keys) : indexer_or_keys;
  return IndexAction(type, indexer, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/object/from_cyclic.mjs
function FromCyclic(defs, ref) {
  const target = CyclicTarget(defs, ref);
  const result = FromType8(target);
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/object/from_intersect.mjs
function CollapseIntersectProperties(left, right) {
  const leftKeys = guard_exports.Keys(left).filter((key) => !guard_exports.HasPropertyKey(right, key));
  const rightKeys = guard_exports.Keys(right).filter((key) => !guard_exports.HasPropertyKey(left, key));
  const sharedKeys = guard_exports.Keys(left).filter((key) => guard_exports.HasPropertyKey(right, key));
  const leftProperties = leftKeys.reduce((result, key) => ({ ...result, [key]: left[key] }), {});
  const rightProperties = rightKeys.reduce((result, key) => ({ ...result, [key]: right[key] }), {});
  const sharedProperties = sharedKeys.reduce((result, key) => ({ ...result, [key]: EvaluateIntersect([left[key], right[key]]) }), {});
  const unique = memory_exports.Assign(leftProperties, rightProperties);
  const shared = memory_exports.Assign(unique, sharedProperties);
  return shared;
}
function FromIntersect(types) {
  return types.reduce((result, left) => {
    return CollapseIntersectProperties(result, FromType8(left));
  }, {});
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/object/from_object.mjs
function FromObject3(properties) {
  return properties;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/object/from_tuple.mjs
function FromTuple(types) {
  const object = TupleToObject(Tuple(types));
  const result = FromType8(object);
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/object/from_union.mjs
function CollapseUnionProperties(left, right) {
  const sharedKeys = guard_exports.Keys(left).filter((key) => key in right);
  const result = sharedKeys.reduce((result2, key) => {
    return { ...result2, [key]: EvaluateUnion([left[key], right[key]]) };
  }, {});
  return result;
}
function ReduceVariants(types, result) {
  return guard_exports.TakeLeft(types, (left, right) => ReduceVariants(right, CollapseUnionProperties(result, FromType8(left))), () => result);
}
function FromUnion3(types) {
  return guard_exports.TakeLeft(types, (left, right) => ReduceVariants(right, FromType8(left)), () => Unreachable());
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/object/from_type.mjs
function FromType8(type) {
  return IsCyclic(type) ? FromCyclic(type.$defs, type.$ref) : IsIntersect(type) ? FromIntersect(type.allOf) : IsUnion(type) ? FromUnion3(type.anyOf) : IsTuple(type) ? FromTuple(type.items) : IsObject2(type) ? FromObject3(type.properties) : {};
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/object/collapse.mjs
function CollapseToObject(type) {
  const properties = FromType8(type);
  const result = _Object_(properties);
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/helpers/keys.mjs
var integerKeyPattern = new RegExp("^(?:0|[1-9][0-9]*)$");
function ConvertToIntegerKey(value) {
  const normal = `${value}`;
  return integerKeyPattern.test(normal) ? parseInt(normal) : value;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/indexed/from_array.mjs
function NormalizeLiteral(value) {
  return Literal(ConvertToIntegerKey(value));
}
function NormalizeIndexerTypes(types) {
  return types.map((type) => NormalizeIndexer(type));
}
function NormalizeIndexer(type) {
  return IsIntersect(type) ? Intersect(NormalizeIndexerTypes(type.allOf)) : IsUnion(type) ? Union(NormalizeIndexerTypes(type.anyOf)) : IsLiteral(type) ? NormalizeLiteral(type.const) : type;
}
function FromArray3(type, indexer) {
  const normalizedIndexer = NormalizeIndexer(indexer);
  const check = Extends2({}, normalizedIndexer, Number2());
  const result = (
    // indexer
    result_exports.IsExtendsTrueLike(check) ? type : IsLiteral(indexer) && guard_exports.IsEqual(indexer.const, "length") ? Number2() : Never()
  );
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/indexable/from_cyclic.mjs
function FromCyclic2(defs, ref) {
  const target = CyclicTarget(defs, ref);
  const result = FromType9(target);
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/indexable/from_union.mjs
function FromUnion4(types) {
  return types.reduce((result, left) => {
    return [...result, ...FromType9(left)];
  }, []);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/indexable/from_enum.mjs
function FromEnum(values) {
  const variants = EnumValuesToVariants(values);
  const result = FromUnion4(variants);
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/indexable/from_intersect.mjs
function FromIntersect2(types) {
  const evaluated = EvaluateIntersect(types);
  const result = FromType9(evaluated);
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/indexable/from_literal.mjs
function FromLiteral4(value) {
  const result = [`${value}`];
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/indexable/from_template_literal.mjs
function FromTemplateLiteral2(pattern) {
  const decoded = TemplateLiteralDecode(pattern);
  const result = FromType9(decoded);
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/indexable/from_type.mjs
function FromType9(type) {
  return IsCyclic(type) ? FromCyclic2(type.$defs, type.$ref) : IsEnum(type) ? FromEnum(type.enum) : IsIntersect(type) ? FromIntersect2(type.allOf) : IsLiteral(type) ? FromLiteral4(type.const) : IsTemplateLiteral(type) ? FromTemplateLiteral2(type.pattern) : IsUnion(type) ? FromUnion4(type.anyOf) : [];
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/indexable/to_indexable_keys.mjs
function ToIndexableKeys(type) {
  const result = FromType9(type);
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/this/expand_this.mjs
function FromTypes5(properties, types) {
  return types.map((type) => FromType10(properties, type));
}
function FromType10(properties, type) {
  return IsArray2(type) ? _Array_(FromType10(properties, type.items)) : IsAsyncIterator2(type) ? AsyncIterator(FromType10(properties, type.iteratorItems)) : IsConstructor2(type) ? Constructor(FromTypes5(properties, type.parameters), FromType10(properties, type.instanceType)) : IsFunction2(type) ? _Function_(FromTypes5(properties, type.parameters), FromType10(properties, type.returnType)) : IsIterator2(type) ? Iterator(FromType10(properties, type.iteratorItems)) : IsPromise(type) ? _Promise_(FromType10(properties, type.item)) : IsTuple(type) ? Tuple(FromTypes5(properties, type.items)) : IsUnion(type) ? Union(FromTypes5(properties, type.anyOf)) : IsIntersect(type) ? Intersect(FromTypes5(properties, type.allOf)) : IsThis(type) ? _Object_(properties) : type;
}
function ExpandThis(properties, type) {
  const result = FromType10(properties, type);
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/indexed/from_object.mjs
function IndexProperty(properties, key) {
  const selectedType = key in properties ? properties[key] : Never();
  const result = ExpandThis(properties, selectedType);
  return result;
}
function IndexProperties(properties, keys) {
  return keys.reduce((result, left) => {
    return [...result, IndexProperty(properties, left)];
  }, []);
}
function FromIndexer(properties, indexer) {
  const keys = ToIndexableKeys(indexer);
  const variants = IndexProperties(properties, keys);
  const result = EvaluateUnion(variants);
  return result;
}
var NumericKeyPattern = new RegExp(IntegerKey);
function NumericKeys(keys) {
  const result = keys.filter((key) => NumericKeyPattern.test(key));
  return result;
}
function FromIndexerNumber(properties) {
  const keys = PropertyKeys(properties);
  const numericKeys = NumericKeys(keys);
  const variants = IndexProperties(properties, numericKeys);
  const result = EvaluateUnion(variants);
  return result;
}
function FromObject4(properties, indexer) {
  const result = IsNumber3(indexer) ? FromIndexerNumber(properties) : FromIndexer(properties, indexer);
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/indexed/array_indexer.mjs
function ConvertLiteral(value) {
  return Literal(ConvertToIntegerKey(value));
}
function ArrayIndexerTypes(types) {
  return types.map((type) => FormatArrayIndexer(type));
}
function FormatArrayIndexer(type) {
  return IsIntersect(type) ? Intersect(ArrayIndexerTypes(type.allOf)) : IsUnion(type) ? Union(ArrayIndexerTypes(type.anyOf)) : IsLiteral(type) ? ConvertLiteral(type.const) : type;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/indexed/from_tuple.mjs
function IndexElementsWithIndexer(types, indexer) {
  return types.reduceRight((result, right, index) => {
    const check = Extends2({}, Literal(index), indexer);
    return result_exports.IsExtendsTrueLike(check) ? [right, ...result] : result;
  }, []);
}
function FromTupleWithIndexer(types, indexer) {
  const formattedArrayIndexer = FormatArrayIndexer(indexer);
  const elements = IndexElementsWithIndexer(types, formattedArrayIndexer);
  return EvaluateUnionFast(elements);
}
function FromTupleWithoutIndexer(types) {
  return EvaluateUnionFast(types);
}
function FromTuple2(types, indexer) {
  return (
    // length (intrinsic)
    IsLiteral(indexer) && guard_exports.IsEqual(indexer.const, "length") ? Literal(types.length) : IsNumber3(indexer) || IsInteger2(indexer) ? FromTupleWithoutIndexer(types) : FromTupleWithIndexer(types, indexer)
  );
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/indexed/from_type.mjs
function FromType11(type, indexer) {
  return IsArray2(type) ? FromArray3(type.items, indexer) : IsObject2(type) ? FromObject4(type.properties, indexer) : IsTuple(type) ? FromTuple2(type.items, indexer) : Never();
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/indexed/instantiate.mjs
function NormalizeType(type) {
  const result = IsCyclic(type) || IsIntersect(type) || IsUnion(type) ? CollapseToObject(type) : type;
  return result;
}
function IndexAction(type, indexer, options) {
  const result = CanInstantiate([type, indexer]) ? memory_exports.Update(FromType11(NormalizeType(type), indexer), {}, options) : IndexDeferred(type, indexer, options);
  return result;
}
function IndexInstantiate(context, state, type, indexer, options) {
  const instantiatedType = InstantiateType(context, state, type);
  const instantiatedIndexer = InstantiateType(context, state, indexer);
  return IndexAction(instantiatedType, instantiatedIndexer, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/action/instance_type.mjs
function InstanceTypeDeferred(type, options = {}) {
  return Deferred("InstanceType", [type], options);
}
function InstanceType(type, options = {}) {
  return InstanceTypeAction(type, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/instance_type/instantiate.mjs
function InstanceTypeOperation(type) {
  return IsConstructor2(type) ? type["instanceType"] : Never();
}
function InstanceTypeAction(type, options) {
  const result = CanInstantiate([type]) ? memory_exports.Update(InstanceTypeOperation(type), {}, options) : InstanceTypeDeferred(type, options);
  return result;
}
function InstanceTypeInstantiate(context, state, type, options = {}) {
  const instantiatedType = InstantiateType(context, state, type);
  return InstanceTypeAction(instantiatedType, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/action/keyof.mjs
function KeyOfDeferred(type, options = {}) {
  return Deferred("KeyOf", [type], options);
}
function KeyOf2(type, options = {}) {
  return KeyOfAction(type, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/keyof/from_any.mjs
function FromAny() {
  return Union([Number2(), String2(), Symbol2()]);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/keyof/from_array.mjs
function FromArray4(_type) {
  return Number2();
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/keyof/from_object.mjs
function FromPropertyKeys(keys) {
  const result = keys.reduce((result2, left) => {
    return IsLiteralValue(left) ? [...result2, Literal(ConvertToIntegerKey(left))] : Unreachable();
  }, []);
  return result;
}
function FromObject5(properties) {
  const propertyKeys = guard_exports.Keys(properties);
  const variants = FromPropertyKeys(propertyKeys);
  const result = EvaluateUnionFast(variants);
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/keyof/from_record.mjs
function FromRecord(type) {
  return RecordKey(type);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/keyof/from_tuple.mjs
function FromTuple3(types) {
  const result = types.map((_, index) => Literal(index));
  return EvaluateUnionFast(result);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/keyof/from_type.mjs
function FromType12(type) {
  return IsAny(type) ? FromAny() : IsArray2(type) ? FromArray4(type.items) : IsObject2(type) ? FromObject5(type.properties) : IsRecord(type) ? FromRecord(type) : IsTuple(type) ? FromTuple3(type.items) : Never();
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/keyof/instantiate.mjs
function NormalizeType2(type) {
  const result = IsCyclic(type) || IsIntersect(type) || IsUnion(type) ? CollapseToObject(type) : type;
  return result;
}
function KeyOfAction(type, options) {
  return CanInstantiate([type]) ? memory_exports.Update(FromType12(NormalizeType2(type)), {}, options) : KeyOfDeferred(type, options);
}
function KeyOfInstantiate(context, state, type, options) {
  const instantiatedType = InstantiateType(context, state, type);
  return KeyOfAction(instantiatedType, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/action/mapped.mjs
function MappedDeferred(identifier, type, as, property, options = {}) {
  return Deferred("Mapped", [identifier, type, as, property], options);
}
function Mapped2(identifier, type, as, property, options = {}) {
  return MappedAction({}, { callstack: [] }, identifier, type, as, property, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/mapped/mapped_variants.mjs
function FromTemplateLiteral3(pattern) {
  const decoded = TemplateLiteralDecode(pattern);
  const result = FromType13(decoded);
  return result;
}
function FromUnion5(types) {
  return types.reduce((result, left) => {
    return [...result, ...FromType13(left)];
  }, []);
}
function FromLiteral5(value) {
  const result = guard_exports.IsNumber(value) ? [Literal(`${value}`)] : [Literal(value)];
  return result;
}
function FromType13(type) {
  const result = IsEnum(type) ? FromUnion5(EnumValuesToVariants(type.enum)) : IsLiteral(type) ? FromLiteral5(type.const) : IsTemplateLiteral(type) ? FromTemplateLiteral3(type.pattern) : IsUnion(type) ? FromUnion5(type.anyOf) : [type];
  return result;
}
function MappedVariants(type) {
  const result = FromType13(type);
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/mapped/mapped_operation.mjs
function CanonicalAs(instantiatedAs) {
  const result = IsTemplateLiteral(instantiatedAs) ? TemplateLiteralDecode(instantiatedAs.pattern) : instantiatedAs;
  return result;
}
function MappedVariant(context, state, identifier, variant, as, property) {
  const variantContext = memory_exports.Assign(context, { [identifier["name"]]: variant });
  const instantiatedAs = InstantiateType(variantContext, state, as);
  const canonicalAs = CanonicalAs(instantiatedAs);
  const instantiatedProperty = InstantiateType(variantContext, state, property);
  return IsLiteralNumber(canonicalAs) || IsLiteralString(canonicalAs) ? { [canonicalAs.const]: instantiatedProperty } : {};
}
function MappedProperties(context, state, identifier, variants, as, property) {
  return variants.reduce((result, left) => {
    return [...result, MappedVariant(context, state, identifier, left, as, property)];
  }, []);
}
function MappedObjects(properties) {
  return properties.reduce((result, left) => {
    return [...result, _Object_(left)];
  }, []);
}
function MappedOperation(context, state, identifier, type, as, property) {
  const variants = MappedVariants(type);
  const mappedProperties = MappedProperties(context, state, identifier, variants, as, property);
  const mappedObjects = MappedObjects(mappedProperties);
  const result = EvaluateIntersect(mappedObjects);
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/mapped/instantiate.mjs
function MappedAction(context, state, identifier, type, as, property, options) {
  const result = CanInstantiate([type]) ? memory_exports.Update(MappedOperation(context, state, identifier, type, as, property), {}, options) : MappedDeferred(identifier, type, as, property, options);
  return result;
}
function MappedInstantiate(context, state, identifier, type, as, property, options) {
  const instantiatedType = InstantiateType(context, state, type);
  return MappedAction(context, state, identifier, instantiatedType, as, property, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/module/instantiate.mjs
function InstantiateCyclics(context, cyclicKeys) {
  const keys = guard_exports.Keys(context).filter((key) => cyclicKeys.includes(key));
  return keys.reduce((result, key) => {
    return { ...result, [key]: InstantiateCyclic(context, key, context[key]) };
  }, {});
}
function InstantiateNonCyclics(context, cyclicKeys) {
  const keys = guard_exports.Keys(context).filter((key) => !cyclicKeys.includes(key));
  return keys.reduce((result, key) => {
    return { ...result, [key]: InstantiateType(context, { callstack: [] }, context[key]) };
  }, {});
}
function InstantiateModule(context, options) {
  const cyclicCandidates = CyclicCandidates(context);
  const instantiatedCyclics = InstantiateCyclics(context, cyclicCandidates);
  const instantiatedNonCyclics = InstantiateNonCyclics(context, cyclicCandidates);
  const instantiatedModule = { ...instantiatedCyclics, ...instantiatedNonCyclics };
  return memory_exports.Update(instantiatedModule, {}, options);
}
function ModuleInstantiate(context, _state, properties, options) {
  const moduleContext = memory_exports.Assign(context, properties);
  const instantiatedModule = InstantiateModule(moduleContext, options);
  return instantiatedModule;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/action/non_nullable.mjs
function NonNullableDeferred(type, options = {}) {
  return Deferred("NonNullable", [type], options);
}
function NonNullable(type, options = {}) {
  return NonNullableAction(type, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/non_nullable/instantiate.mjs
function NonNullableOperation(type) {
  const excluded = Union([Null(), Undefined()]);
  return ExcludeAction(type, excluded, {});
}
function NonNullableAction(type, options) {
  const result = CanInstantiate([type]) ? memory_exports.Update(NonNullableOperation(type), {}, options) : NonNullableDeferred(type, options);
  return result;
}
function NonNullableInstantiate(context, state, type, options) {
  const instantiatedType = InstantiateType(context, state, type);
  return NonNullableAction(instantiatedType, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/action/omit.mjs
function OmitDeferred(type, indexer, options = {}) {
  return Deferred("Omit", [type, indexer], options);
}
function Omit(type, indexer_or_keys, options = {}) {
  const indexer = guard_exports.IsArray(indexer_or_keys) ? KeysToIndexer(indexer_or_keys) : indexer_or_keys;
  return OmitAction(type, indexer, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/indexable/to_indexable.mjs
function ToIndexable(type) {
  const collapsed = CollapseToObject(type);
  const result = IsObject2(collapsed) ? collapsed.properties : Unreachable();
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/omit/from_type.mjs
function FromKeys(properties, keys) {
  const result = guard_exports.Keys(properties).reduce((result2, key) => {
    return keys.includes(key) ? result2 : { ...result2, [key]: properties[key] };
  }, {});
  return result;
}
function FromType14(type, indexer) {
  const indexable = ToIndexable(type);
  const indexableKeys = ToIndexableKeys(indexer);
  const omitted = FromKeys(indexable, indexableKeys);
  const result = _Object_(omitted);
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/omit/instantiate.mjs
function OmitAction(type, indexer, options) {
  const result = CanInstantiate([type, indexer]) ? memory_exports.Update(FromType14(type, indexer), {}, options) : OmitDeferred(type, indexer, options);
  return result;
}
function OmitInstantiate(context, state, type, indexer, options) {
  const instantiatedType = InstantiateType(context, state, type);
  const instantiatedIndexer = InstantiateType(context, state, indexer);
  return OmitAction(instantiatedType, instantiatedIndexer, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/action/options.mjs
function OptionsDeferred(type, options) {
  return Deferred("Options", [type, options], {});
}
function Options2(type, options) {
  return OptionsAction(type, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/options/instantiate.mjs
function OptionsAction(type, options) {
  const result = CanInstantiate([type]) ? memory_exports.Update(type, {}, options) : OptionsDeferred(type, options);
  return result;
}
function OptionsInstantiate(context, state, type, options) {
  const instaniatedType = InstantiateType(context, state, type);
  return OptionsAction(instaniatedType, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/action/parameters.mjs
function ParametersDeferred(type, options = {}) {
  return Deferred("Parameters", [type], options);
}
function Parameters(type, options = {}) {
  return ParametersAction(type, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/parameters/instantiate.mjs
function ParametersOperation(type) {
  const parameters = IsFunction2(type) ? type["parameters"] : [];
  const instantiatedParameters = InstantiateElements({}, { callstack: [] }, parameters);
  const result = Tuple(instantiatedParameters);
  return result;
}
function ParametersAction(type, options) {
  const result = CanInstantiate([type]) ? memory_exports.Update(ParametersOperation(type), {}, options) : ParametersDeferred(type, options);
  return result;
}
function ParametersInstantiate(context, state, type, options) {
  const instantiatedType = InstantiateType(context, state, type);
  return ParametersAction(instantiatedType, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/action/partial.mjs
function PartialDeferred(type, options = {}) {
  return Deferred("Partial", [type], options);
}
function Partial(type, options = {}) {
  return PartialAction(type, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/partial/from_cyclic.mjs
function FromCyclic3(defs, ref) {
  const target = CyclicTarget(defs, ref);
  const partial = FromType15(target);
  const result = Cyclic(memory_exports.Assign(defs, { [ref]: partial }), ref);
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/partial/from_intersect.mjs
function FromIntersect3(types) {
  const result = types.map((type) => FromType15(type));
  return EvaluateIntersect(result);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/partial/from_union.mjs
function FromUnion6(types) {
  const result = types.map((type) => FromType15(type));
  return Union(result);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/partial/from_object.mjs
function FromObject6(properties) {
  const mapped = guard_exports.Keys(properties).reduce((result2, left) => {
    return { ...result2, [left]: Optional(properties[left]) };
  }, {});
  const result = _Object_(mapped);
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/partial/from_type.mjs
function FromType15(type) {
  return IsCyclic(type) ? FromCyclic3(type.$defs, type.$ref) : IsIntersect(type) ? FromIntersect3(type.allOf) : IsUnion(type) ? FromUnion6(type.anyOf) : IsObject2(type) ? FromObject6(type.properties) : _Object_({});
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/partial/instantiate.mjs
function PartialAction(type, options) {
  const result = CanInstantiate([type]) ? memory_exports.Update(FromType15(type), {}, options) : PartialDeferred(type, options);
  return result;
}
function PartialInstantiate(context, state, type, options) {
  const instantiatedType = InstantiateType(context, state, type);
  return PartialAction(instantiatedType, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/action/pick.mjs
function PickDeferred(type, indexer, options = {}) {
  return Deferred("Pick", [type, indexer], options);
}
function Pick(type, indexer_or_keys, options = {}) {
  const indexer = guard_exports.IsArray(indexer_or_keys) ? KeysToIndexer(indexer_or_keys) : indexer_or_keys;
  return PickAction(type, indexer, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/pick/from_type.mjs
function FromKeys2(properties, keys) {
  const result = guard_exports.Keys(properties).reduce((result2, key) => {
    return keys.includes(key) ? memory_exports.Assign(result2, { [key]: properties[key] }) : result2;
  }, {});
  return result;
}
function FromType16(type, indexer) {
  const indexable = ToIndexable(type);
  const keys = ToIndexableKeys(indexer);
  const applied = FromKeys2(indexable, keys);
  const result = _Object_(applied);
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/pick/instantiate.mjs
function PickAction(type, indexer, options) {
  const result = CanInstantiate([type, indexer]) ? memory_exports.Update(FromType16(type, indexer), {}, options) : PickDeferred(type, indexer, options);
  return result;
}
function PickInstantiate(context, state, type, indexer, options) {
  const instantiatedType = InstantiateType(context, state, type);
  const instantiatedIndexer = InstantiateType(context, state, indexer);
  return PickAction(instantiatedType, instantiatedIndexer, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/action/readonly_object.mjs
function ReadonlyObjectDeferred(type, options = {}) {
  return Deferred("ReadonlyObject", [type], options);
}
function ReadonlyObject(type, options = {}) {
  return ReadonlyObjectAction(type, options);
}
var ReadonlyType = ReadonlyObject;

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/readonly_object/from_array.mjs
function FromArray5(type) {
  const result = Immutable(_Array_(type));
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/readonly_object/from_cyclic.mjs
function FromCyclic4(defs, ref) {
  const target = CyclicTarget(defs, ref);
  const partial = FromType17(target);
  const result = Cyclic(memory_exports.Assign(defs, { [ref]: partial }), ref);
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/readonly_object/from_intersect.mjs
function FromIntersect4(types) {
  const result = types.map((type) => FromType17(type));
  return EvaluateIntersect(result);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/readonly_object/from_object.mjs
function FromObject7(properties) {
  const mapped = guard_exports.Keys(properties).reduce((result2, left) => {
    return { ...result2, [left]: Readonly(properties[left]) };
  }, {});
  const result = _Object_(mapped);
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/readonly_object/from_tuple.mjs
function FromTuple4(types) {
  const result = Immutable(Tuple(types));
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/readonly_object/from_union.mjs
function FromUnion7(types) {
  const result = types.map((type) => FromType17(type));
  return Union(result);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/readonly_object/from_type.mjs
function FromType17(type) {
  return IsArray2(type) ? FromArray5(type.items) : IsCyclic(type) ? FromCyclic4(type.$defs, type.$ref) : IsIntersect(type) ? FromIntersect4(type.allOf) : IsObject2(type) ? FromObject7(type.properties) : IsTuple(type) ? FromTuple4(type.items) : IsUnion(type) ? FromUnion7(type.anyOf) : type;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/readonly_object/instantiate.mjs
function ReadonlyObjectAction(type, options) {
  const result = CanInstantiate([type]) ? memory_exports.Update(FromType17(type), {}, options) : ReadonlyObjectDeferred(type);
  return result;
}
function ReadonlyObjectInstantiate(context, state, type, options) {
  const instantiatedType = InstantiateType(context, state, type);
  return ReadonlyObjectAction(instantiatedType, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/ref/instantiate.mjs
function RefInstantiate(context, state, type, ref) {
  return ref in context ? CyclicCheck([ref], context, context[ref]) ? type : InstantiateType(context, state, context[ref]) : type;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/required/from_cyclic.mjs
function FromCyclic5(defs, ref) {
  const target = CyclicTarget(defs, ref);
  const partial = FromType18(target);
  const result = Cyclic(memory_exports.Assign(defs, { [ref]: partial }), ref);
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/required/from_intersect.mjs
function FromIntersect5(types) {
  const result = types.map((type) => FromType18(type));
  return EvaluateIntersect(result);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/required/from_union.mjs
function FromUnion8(types) {
  const result = types.map((type) => FromType18(type));
  return Union(result);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/required/from_object.mjs
function FromObject8(properties) {
  const mapped = guard_exports.Keys(properties).reduce((result2, left) => {
    return { ...result2, [left]: OptionalRemove(properties[left]) };
  }, {});
  const result = _Object_(mapped);
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/required/from_type.mjs
function FromType18(type) {
  return IsCyclic(type) ? FromCyclic5(type.$defs, type.$ref) : IsIntersect(type) ? FromIntersect5(type.allOf) : IsUnion(type) ? FromUnion8(type.anyOf) : IsObject2(type) ? FromObject8(type.properties) : _Object_({});
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/action/required.mjs
function RequiredDeferred(type, options = {}) {
  return Deferred("Required", [type], options);
}
function Required(type, options = {}) {
  return RequiredAction(type, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/required/instantiate.mjs
function RequiredAction(type, options) {
  const result = CanInstantiate([type]) ? memory_exports.Update(FromType18(type), {}, options) : RequiredDeferred(type, options);
  return result;
}
function RequiredInstantiate(context, state, type, options) {
  const instaniatedType = InstantiateType(context, state, type);
  return RequiredAction(instaniatedType, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/action/return_type.mjs
function ReturnTypeDeferred(type, options = {}) {
  return Deferred("ReturnType", [type], options);
}
function ReturnType(type, options = {}) {
  return ReturnTypeAction(type, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/return_type/instantiate.mjs
function ReturnTypeOperation(type) {
  return IsFunction2(type) ? type["returnType"] : Never();
}
function ReturnTypeAction(type, options) {
  const result = CanInstantiate([type]) ? memory_exports.Update(ReturnTypeOperation(type), {}, options) : ReturnTypeDeferred(type, options);
  return result;
}
function ReturnTypeInstantiate(context, state, type, options = {}) {
  const instantiatedType = InstantiateType(context, state, type);
  return ReturnTypeAction(instantiatedType, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/rest/spread.mjs
function SpreadElement(type) {
  const result = IsRest(type) ? IsTuple(type.items) ? RestSpread(type.items.items) : IsInfer(type.items) ? [type] : IsRef(type.items) ? [type] : [Never()] : [type];
  return result;
}
function RestSpread(types) {
  const result = types.reduce((result2, left) => {
    return [...result2, ...SpreadElement(left)];
  }, []);
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/instantiate.mjs
function CanInstantiate(types) {
  return guard_exports.TakeLeft(types, (left, right) => IsRef(left) ? false : CanInstantiate(right), () => true);
}
function ModifierActions(type, readonly, optional) {
  return IsReadonlyRemoveAction(type) ? ModifierActions(type.type, "remove", optional) : IsOptionalRemoveAction(type) ? ModifierActions(type.type, readonly, "remove") : IsReadonlyAddAction(type) ? ModifierActions(type.type, "add", optional) : IsOptionalAddAction(type) ? ModifierActions(type.type, readonly, "add") : [type, readonly, optional];
}
function ApplyReadonly2(action, type) {
  return guard_exports.IsEqual(action, "remove") ? ReadonlyRemove(type) : guard_exports.IsEqual(action, "add") ? ReadonlyAdd(type) : type;
}
function ApplyOptional2(action, type) {
  return guard_exports.IsEqual(action, "remove") ? OptionalRemove(type) : guard_exports.IsEqual(action, "add") ? OptionalAdd(type) : type;
}
function InstantiateProperties(context, state, properties) {
  return guard_exports.Keys(properties).reduce((result, key) => {
    return { ...result, [key]: InstantiateType(context, state, properties[key]) };
  }, {});
}
function InstantiateElements(context, state, types) {
  const elements = InstantiateTypes(context, state, types);
  const result = RestSpread(elements);
  return result;
}
function InstantiateTypes(context, state, types) {
  return types.map((type) => InstantiateType(context, state, type));
}
function InstantiateDeferred(context, state, action, parameters, options) {
  return guard_exports.IsEqual(action, "Awaited") ? AwaitedInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Capitalize") ? CapitalizeInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Conditional") ? ConditionalInstantiate(context, state, parameters[0], parameters[1], parameters[2], parameters[3], options) : guard_exports.IsEqual(action, "ConstructorParameters") ? ConstructorParametersInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Evaluate") ? EvaluateInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Exclude") ? ExcludeInstantiate(context, state, parameters[0], parameters[1], options) : guard_exports.IsEqual(action, "Extract") ? ExtractInstantiate(context, state, parameters[0], parameters[1], options) : guard_exports.IsEqual(action, "Index") ? IndexInstantiate(context, state, parameters[0], parameters[1], options) : guard_exports.IsEqual(action, "InstanceType") ? InstanceTypeInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Interface") ? InterfaceInstantiate(context, state, parameters[0], parameters[1], options) : guard_exports.IsEqual(action, "KeyOf") ? KeyOfInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Lowercase") ? LowercaseInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Mapped") ? MappedInstantiate(context, state, parameters[0], parameters[1], parameters[2], parameters[3], options) : guard_exports.IsEqual(action, "Module") ? ModuleInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "NonNullable") ? NonNullableInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Pick") ? PickInstantiate(context, state, parameters[0], parameters[1], options) : guard_exports.IsEqual(action, "Options") ? OptionsInstantiate(context, state, parameters[0], parameters[1]) : guard_exports.IsEqual(action, "Parameters") ? ParametersInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Partial") ? PartialInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Omit") ? OmitInstantiate(context, state, parameters[0], parameters[1], options) : guard_exports.IsEqual(action, "ReadonlyObject") ? ReadonlyObjectInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Record") ? RecordInstantiate(context, state, parameters[0], parameters[1], options) : guard_exports.IsEqual(action, "Required") ? RequiredInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "ReturnType") ? ReturnTypeInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "TemplateLiteral") ? TemplateLiteralInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Uncapitalize") ? UncapitalizeInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Uppercase") ? UppercaseInstantiate(context, state, parameters[0], options) : Deferred(action, parameters, options);
}
function InstantiateType(context, state, input) {
  const immutable = IsImmutable(input);
  const modifiers = ModifierActions(input, IsReadonly(input) ? "add" : "none", IsOptional(input) ? "add" : "none");
  const type = IsBase(modifiers[0]) ? modifiers[0].Clone() : modifiers[0];
  const instantiated = IsRef(type) ? RefInstantiate(context, state, type, type.$ref) : IsArray2(type) ? _Array_(InstantiateType(context, state, type.items), ArrayOptions(type)) : IsAsyncIterator2(type) ? AsyncIterator(InstantiateType(context, state, type.iteratorItems), AsyncIteratorOptions(type)) : IsCall(type) ? CallInstantiate(context, state, type.target, type.arguments) : IsConstructor2(type) ? Constructor(InstantiateTypes(context, state, type.parameters), InstantiateType(context, state, type.instanceType), ConstructorOptions(type)) : IsDeferred(type) ? InstantiateDeferred(context, state, type.action, type.parameters, type.options) : IsFunction2(type) ? _Function_(InstantiateTypes(context, state, type.parameters), InstantiateType(context, state, type.returnType), FunctionOptions(type)) : IsIntersect(type) ? Intersect(InstantiateTypes(context, state, type.allOf), IntersectOptions(type)) : IsIterator2(type) ? Iterator(InstantiateType(context, state, type.iteratorItems), IteratorOptions(type)) : IsObject2(type) ? _Object_(InstantiateProperties(context, state, type.properties), ObjectOptions(type)) : IsPromise(type) ? _Promise_(InstantiateType(context, state, type.item), PromiseOptions(type)) : IsRecord(type) ? RecordFromPattern(RecordPattern(type), InstantiateType(context, state, RecordValue(type))) : IsRest(type) ? Rest(InstantiateType(context, state, type.items)) : IsTuple(type) ? Tuple(InstantiateElements(context, state, type.items), TupleOptions(type)) : IsUnion(type) ? Union(InstantiateTypes(context, state, type.anyOf), UnionOptions(type)) : type;
  const withImmutable = immutable ? Immutable(instantiated) : instantiated;
  const withModifiers = ApplyReadonly2(modifiers[1], ApplyOptional2(modifiers[2], withImmutable));
  return withModifiers;
}
function Instantiate(context, type) {
  return InstantiateType(context, { callstack: [] }, type);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/engine/awaited/instantiate.mjs
function AwaitedOperation(type) {
  return IsPromise(type) ? AwaitedOperation(type.item) : type;
}
function AwaitedAction(type, options) {
  const result = CanInstantiate([type]) ? memory_exports.Update(AwaitedOperation(type), {}, options) : AwaitedDeferred(type, options);
  return result;
}
function AwaitedInstantiate(context, state, type, options) {
  const instantiatedType = InstantiateType(context, state, type);
  return AwaitedAction(instantiatedType, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/action/awaited.mjs
function AwaitedDeferred(type, options = {}) {
  return Deferred("Awaited", [type], options);
}
function Awaited(type, options = {}) {
  return AwaitedAction(type, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/action/evaluate.mjs
function EvaluateDeferred(type, options = {}) {
  return Deferred("Evaluate", [type], options);
}
function Evaluate(type, options = {}) {
  return EvaluateAction(type, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/action/module.mjs
function ModuleDeferred(context, options = {}) {
  return Deferred("Module", [context], options);
}
function Module2(context, options = {}) {
  return Instantiate({}, ModuleDeferred(context, options));
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/type/script/script.mjs
function Script2(...args) {
  const [context, input, options] = arguments_exports.Match(args, {
    2: (script, options2) => guard_exports.IsString(script) ? [{}, script, options2] : [script, options2, {}],
    3: (context2, script, options2) => [context2, script, options2],
    1: (script) => [{}, script, {}]
  });
  const result = Script(input);
  const parsed = guard_exports.IsArray(result) && guard_exports.IsEqual(result.length, 2) ? InstantiateType(context, { callstack: [] }, result[0]) : Never();
  return memory_exports.Update(parsed, {}, options);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/typebox.mjs
var typebox_exports = {};
__export(typebox_exports, {
  Any: () => Any,
  Array: () => _Array_,
  AsyncIterator: () => AsyncIterator,
  Awaited: () => Awaited,
  Base: () => Base,
  BigInt: () => BigInt2,
  Boolean: () => Boolean2,
  Call: () => Call,
  Capitalize: () => Capitalize,
  Codec: () => Codec,
  Conditional: () => Conditional,
  Constructor: () => Constructor,
  ConstructorParameters: () => ConstructorParameters,
  Cyclic: () => Cyclic,
  Decode: () => Decode,
  DecodeBuilder: () => DecodeBuilder,
  Encode: () => Encode,
  EncodeBuilder: () => EncodeBuilder,
  Enum: () => Enum,
  Evaluate: () => Evaluate,
  Exclude: () => Exclude,
  Extends: () => Extends2,
  ExtendsResult: () => result_exports,
  Extract: () => Extract,
  Function: () => _Function_,
  Generic: () => Generic,
  Identifier: () => Identifier,
  Immutable: () => Immutable,
  Index: () => Index,
  Infer: () => Infer,
  InstanceType: () => InstanceType,
  Instantiate: () => Instantiate,
  Integer: () => Integer,
  Interface: () => Interface,
  Intersect: () => Intersect,
  IsAny: () => IsAny,
  IsArray: () => IsArray2,
  IsAsyncIterator: () => IsAsyncIterator2,
  IsBase: () => IsBase,
  IsBigInt: () => IsBigInt2,
  IsBoolean: () => IsBoolean3,
  IsCall: () => IsCall,
  IsCodec: () => IsCodec,
  IsConstructor: () => IsConstructor2,
  IsCyclic: () => IsCyclic,
  IsEnum: () => IsEnum,
  IsFunction: () => IsFunction2,
  IsGeneric: () => IsGeneric,
  IsIdentifier: () => IsIdentifier,
  IsImmutable: () => IsImmutable,
  IsInfer: () => IsInfer,
  IsInteger: () => IsInteger2,
  IsIntersect: () => IsIntersect,
  IsIterator: () => IsIterator2,
  IsKind: () => IsKind,
  IsLiteral: () => IsLiteral,
  IsNever: () => IsNever,
  IsNull: () => IsNull2,
  IsNumber: () => IsNumber3,
  IsObject: () => IsObject2,
  IsOptional: () => IsOptional,
  IsParameter: () => IsParameter,
  IsPromise: () => IsPromise,
  IsReadonly: () => IsReadonly,
  IsRecord: () => IsRecord,
  IsRef: () => IsRef,
  IsRefine: () => IsRefine,
  IsRest: () => IsRest,
  IsSchema: () => IsSchema,
  IsString: () => IsString3,
  IsSymbol: () => IsSymbol2,
  IsTemplateLiteral: () => IsTemplateLiteral,
  IsThis: () => IsThis,
  IsTuple: () => IsTuple,
  IsUndefined: () => IsUndefined2,
  IsUnion: () => IsUnion,
  IsUnknown: () => IsUnknown,
  IsUnsafe: () => IsUnsafe,
  IsVoid: () => IsVoid,
  Iterator: () => Iterator,
  KeyOf: () => KeyOf2,
  Literal: () => Literal,
  Lowercase: () => Lowercase,
  Mapped: () => Mapped2,
  Module: () => Module2,
  Never: () => Never,
  NonNullable: () => NonNullable,
  Null: () => Null,
  Number: () => Number2,
  Object: () => _Object_,
  Omit: () => Omit,
  Optional: () => Optional,
  Options: () => Options2,
  Parameter: () => Parameter,
  Parameters: () => Parameters,
  Partial: () => Partial,
  Pick: () => Pick,
  Promise: () => _Promise_,
  Readonly: () => Readonly,
  ReadonlyObject: () => ReadonlyObject,
  ReadonlyType: () => ReadonlyType,
  Record: () => Record,
  RecordKey: () => RecordKey,
  RecordPattern: () => RecordPattern,
  RecordValue: () => RecordValue,
  Ref: () => Ref,
  Refine: () => Refine,
  Required: () => Required,
  Rest: () => Rest,
  ReturnType: () => ReturnType,
  Script: () => Script2,
  String: () => String2,
  Symbol: () => Symbol2,
  TemplateLiteral: () => TemplateLiteral2,
  This: () => This,
  Tuple: () => Tuple,
  Uncapitalize: () => Uncapitalize,
  Undefined: () => Undefined,
  Union: () => Union,
  Unknown: () => Unknown,
  Unsafe: () => Unsafe,
  Uppercase: () => Uppercase,
  Void: () => Void
});

// packages/contracts/dist/events.js
var strict = { additionalProperties: false };
var eventBase = {
  eventId: typebox_exports.String({ minLength: 1, maxLength: 128 }),
  sequence: typebox_exports.Integer({ minimum: 1 }),
  timestamp: typebox_exports.Integer({ minimum: 0 })
};
var SessionStateSchema = typebox_exports.Union([typebox_exports.Literal("idle"), typebox_exports.Literal("running")]);
var SessionMetadataSchema = typebox_exports.Object({
  adapter: typebox_exports.String({ minLength: 1, maxLength: 64 }),
  adapterVersion: typebox_exports.String({ minLength: 1, maxLength: 64 }),
  harnessSessionId: typebox_exports.Optional(typebox_exports.String({ minLength: 1, maxLength: 256 })),
  cwd: typebox_exports.String({ minLength: 1, maxLength: 4096 }),
  name: typebox_exports.Optional(typebox_exports.String({ minLength: 1, maxLength: 512 })),
  processId: typebox_exports.Integer({ minimum: 1 }),
  startedAt: typebox_exports.Integer({ minimum: 0 }),
  state: SessionStateSchema,
  acceptsTaskDelivery: typebox_exports.Boolean()
}, strict);
var UserMessageEvent = typebox_exports.Object({ ...eventBase, type: typebox_exports.Literal("message.user"), text: typebox_exports.String({ maxLength: 65536 }) }, strict);
var AssistantMessageEvent = typebox_exports.Object({
  ...eventBase,
  type: typebox_exports.Literal("message.assistant"),
  text: typebox_exports.String({ maxLength: 65536 }),
  stopStatus: typebox_exports.Union([typebox_exports.Literal("stop"), typebox_exports.Literal("length"), typebox_exports.Literal("toolUse"), typebox_exports.Literal("error"), typebox_exports.Literal("aborted")]),
  error: typebox_exports.Optional(typebox_exports.Boolean())
}, strict);
var ToolActivityEvent = typebox_exports.Object({
  ...eventBase,
  type: typebox_exports.Literal("tool.activity"),
  toolCallId: typebox_exports.String({ minLength: 1, maxLength: 256 }),
  toolName: typebox_exports.String({ minLength: 1, maxLength: 256 }),
  status: typebox_exports.Union([typebox_exports.Literal("running"), typebox_exports.Literal("succeeded"), typebox_exports.Literal("failed")]),
  startedAt: typebox_exports.Integer({ minimum: 0 }),
  endedAt: typebox_exports.Optional(typebox_exports.Integer({ minimum: 0 }))
}, strict);
var SessionStateEvent = typebox_exports.Object({ ...eventBase, type: typebox_exports.Literal("session.state"), state: SessionStateSchema }, strict);
var ActivitySummaryEvent = typebox_exports.Object({
  ...eventBase,
  type: typebox_exports.Literal("activity.summary"),
  summary: typebox_exports.String({ minLength: 1, maxLength: 240 }),
  safeForMonitor: typebox_exports.Literal(true)
}, strict);
var NormalizedEventSchema = typebox_exports.Union([UserMessageEvent, AssistantMessageEvent, ToolActivityEvent, SessionStateEvent, ActivitySummaryEvent]);
var SnapshotSchema = typebox_exports.Object({
  lastSequence: typebox_exports.Integer({ minimum: 0 }),
  events: typebox_exports.Array(NormalizedEventSchema, { maxItems: 1e4 })
}, strict);

// packages/contracts/dist/api.js
var strict2 = { additionalProperties: false };
var UuidSchema = typebox_exports.String({ pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$" });
var TaskCapabilitySchema = typebox_exports.String({ pattern: "^[0-9a-f]{64}$" });
var RegisterSessionRequestSchema = typebox_exports.Object({
  metadata: SessionMetadataSchema,
  snapshot: SnapshotSchema,
  launchToken: typebox_exports.Optional(TaskCapabilitySchema)
}, strict2);
var RegisterSessionResponseSchema = typebox_exports.Object({ sessionId: UuidSchema, leaseExpiresAt: typebox_exports.Integer(), taskCapability: TaskCapabilitySchema }, strict2);
var AppendEventsRequestSchema = typebox_exports.Object({ expectedSequence: typebox_exports.Integer({ minimum: 0 }), events: typebox_exports.Array(NormalizedEventSchema, { minItems: 1, maxItems: 100 }) }, strict2);
var SequenceResponseSchema = typebox_exports.Object({ acceptedSequence: typebox_exports.Integer({ minimum: 0 }) }, strict2);
var HeartbeatRequestSchema = typebox_exports.Object({ state: SessionStateSchema, lastActivityAt: typebox_exports.Integer({ minimum: 0 }), name: typebox_exports.Optional(typebox_exports.Union([typebox_exports.String({ minLength: 1, maxLength: 512 }), typebox_exports.Null()])) }, strict2);
var HeartbeatResponseSchema = typebox_exports.Object({ leaseExpiresAt: typebox_exports.Integer() }, strict2);
var ReplaceSnapshotRequestSchema = SnapshotSchema;
var QueryRequestSchema = typebox_exports.Object({
  query: typebox_exports.String({ minLength: 1, maxLength: 2e3 }),
  mode: typebox_exports.Optional(typebox_exports.Union([typebox_exports.Literal("overview"), typebox_exports.Literal("search")])),
  excludeSessionId: typebox_exports.Optional(UuidSchema),
  cwd: typebox_exports.Optional(typebox_exports.String({ maxLength: 4096 })),
  sessionIds: typebox_exports.Optional(typebox_exports.Array(UuidSchema, { maxItems: 50 })),
  maxSessions: typebox_exports.Optional(typebox_exports.Integer({ minimum: 1, maximum: 50 })),
  maxExcerptsPerSession: typebox_exports.Optional(typebox_exports.Integer({ minimum: 1, maximum: 10 })),
  maxCharacters: typebox_exports.Optional(typebox_exports.Integer({ minimum: 1e3, maximum: 4e4 }))
}, strict2);
var ExcerptSchema = typebox_exports.Object({ eventId: typebox_exports.String(), kind: typebox_exports.String(), text: typebox_exports.String(), timestamp: typebox_exports.Integer(), score: typebox_exports.Optional(typebox_exports.Number()) }, strict2);
var QuerySessionSchema = typebox_exports.Object({ sessionId: UuidSchema, metadata: SessionMetadataSchema, lastActivityAt: typebox_exports.Integer(), transcriptCompleteness: typebox_exports.Union([typebox_exports.Literal("complete"), typebox_exports.Literal("truncated")]), signals: typebox_exports.Array(typebox_exports.String()), excerpts: typebox_exports.Array(ExcerptSchema) }, strict2);
var QueryResponseSchema = typebox_exports.Object({ mode: typebox_exports.Union([typebox_exports.Literal("overview"), typebox_exports.Literal("search")]), sessions: typebox_exports.Array(QuerySessionSchema), truncated: typebox_exports.Boolean() }, strict2);
var HealthResponseSchema = typebox_exports.Object({ protocolVersion: typebox_exports.Literal(2), pid: typebox_exports.Integer(), startedAt: typebox_exports.Integer() }, strict2);
var ApiErrorSchema = typebox_exports.Object({ error: typebox_exports.Object({ code: typebox_exports.String(), message: typebox_exports.String() }, strict2) }, strict2);

// packages/contracts/dist/coordination.js
var A2A_VERSION = "1.0";
var A2A_CONTENT_TYPE = "application/a2a+json";
var LOCAL_COORDINATION_EXTENSION = "urn:agent-activity-hub:extension:local-coordination:v1";
var strict3 = { additionalProperties: false };
var ClaimDeliveryRequestSchema = typebox_exports.Object({ waitSeconds: typebox_exports.Integer({ minimum: 0, maximum: 30 }) }, strict3);
var SupportedPartSchema = typebox_exports.Union([typebox_exports.Object({ kind: typebox_exports.Literal("text"), text: typebox_exports.String({ maxLength: 65536 }), mediaType: typebox_exports.Literal("text/plain") }, strict3), typebox_exports.Object({ kind: typebox_exports.Literal("data"), data: typebox_exports.Any(), mediaType: typebox_exports.Literal("application/json") }, strict3)]);
var AdapterMessageSchema = typebox_exports.Object({ messageId: typebox_exports.String({ minLength: 1, maxLength: 128 }), parts: typebox_exports.Array(SupportedPartSchema, { minItems: 1, maxItems: 100 }) }, strict3);
var ClaimedDeliverySchema = typebox_exports.Object({ deliveryId: UuidSchema, taskId: typebox_exports.String({ minLength: 1, maxLength: 256 }), contextId: typebox_exports.String({ minLength: 1, maxLength: 256 }), sourceLabel: typebox_exports.String({ minLength: 1, maxLength: 512 }), message: AdapterMessageSchema, deadline: typebox_exports.String({ format: "date-time" }) }, strict3);
var RejectDeliveryRequestSchema = typebox_exports.Object({ code: typebox_exports.String({ minLength: 1, maxLength: 64 }), message: typebox_exports.Optional(typebox_exports.String({ maxLength: 2e3 })) }, strict3);
var ProgressTaskRequestSchema = typebox_exports.Object({ message: typebox_exports.Optional(AdapterMessageSchema) }, strict3);
var CompleteTaskRequestSchema = typebox_exports.Object({ deliveryId: UuidSchema, message: AdapterMessageSchema }, strict3);
var FailTaskRequestSchema = typebox_exports.Object({ deliveryId: UuidSchema, code: typebox_exports.String({ minLength: 1, maxLength: 64 }), message: typebox_exports.Optional(typebox_exports.String({ maxLength: 2e3 })) }, strict3);
var StateSchema = typebox_exports.Union([typebox_exports.Literal("submitted"), typebox_exports.Literal("working"), typebox_exports.Literal("completed"), typebox_exports.Literal("failed"), typebox_exports.Literal("canceled"), typebox_exports.Literal("rejected")]);
var TaskMutationResponseSchema = typebox_exports.Object({ taskId: typebox_exports.String(), state: StateSchema, cancellationRequested: typebox_exports.Boolean() }, strict3);

// packages/contracts/dist/monitor.js
var MONITOR_API_VERSION = "monitor/v1";
var MonitorStateSchema = typebox_exports.Union([
  typebox_exports.Literal("running"),
  typebox_exports.Literal("waiting"),
  typebox_exports.Literal("idle")
]);
var MonitorCompletenessSchema = typebox_exports.Union([
  typebox_exports.Literal("complete"),
  typebox_exports.Literal("unavailable"),
  typebox_exports.Literal("truncated")
]);
var MonitorSessionSummarySchema = typebox_exports.Object({
  monitorId: typebox_exports.String({ pattern: "^[0-9a-f]{32}$" }),
  displayName: typebox_exports.String({ minLength: 1, maxLength: 128 }),
  adapter: typebox_exports.String({ minLength: 1, maxLength: 64 }),
  workspace: typebox_exports.String({ minLength: 1, maxLength: 160 }),
  state: MonitorStateSchema,
  activitySummary: typebox_exports.String({ minLength: 1, maxLength: 240 }),
  activitySince: typebox_exports.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
  attentionReasons: typebox_exports.Array(typebox_exports.String({ minLength: 1, maxLength: 120 }), { maxItems: 8 }),
  activeToolCount: typebox_exports.Integer({ minimum: 0 }),
  activeTaskState: typebox_exports.Optional(typebox_exports.Union([typebox_exports.Literal("submitted"), typebox_exports.Literal("working")])),
  completeness: typebox_exports.Object({
    activity: MonitorCompletenessSchema,
    attention: MonitorCompletenessSchema,
    tools: MonitorCompletenessSchema,
    tasks: MonitorCompletenessSchema
  })
});
var MonitorSnapshotSchema = typebox_exports.Object({
  apiVersion: typebox_exports.Literal(MONITOR_API_VERSION),
  revision: typebox_exports.Integer({ minimum: 0 }),
  generatedAt: typebox_exports.Integer({ minimum: 0 }),
  daemonId: typebox_exports.String({ minLength: 1 }),
  startedAt: typebox_exports.Integer({ minimum: 0 }),
  totalSessions: typebox_exports.Integer({ minimum: 0 }),
  truncated: typebox_exports.Boolean(),
  sessions: typebox_exports.Array(MonitorSessionSummarySchema, { maxItems: 500 })
});
var MonitorToolDetailSchema = typebox_exports.Object({
  toolCallId: typebox_exports.String({ minLength: 1, maxLength: 256 }),
  toolName: typebox_exports.String({ minLength: 1, maxLength: 256 }),
  status: typebox_exports.Union([
    typebox_exports.Literal("running"),
    typebox_exports.Literal("succeeded"),
    typebox_exports.Literal("failed")
  ]),
  startedAt: typebox_exports.Integer({ minimum: 0 }),
  endedAt: typebox_exports.Optional(typebox_exports.Integer({ minimum: 0 }))
});
var MonitorTaskDetailSchema = typebox_exports.Object({
  taskId: typebox_exports.String({ minLength: 1 }),
  role: typebox_exports.Union([typebox_exports.Literal("source"), typebox_exports.Literal("target")]),
  state: typebox_exports.Union([
    typebox_exports.Literal("submitted"),
    typebox_exports.Literal("working"),
    typebox_exports.Literal("completed"),
    typebox_exports.Literal("failed"),
    typebox_exports.Literal("canceled"),
    typebox_exports.Literal("rejected")
  ]),
  createdAt: typebox_exports.Integer({ minimum: 0 }),
  updatedAt: typebox_exports.Integer({ minimum: 0 })
});
var MonitorTimelineEntrySchema = typebox_exports.Object({
  timestamp: typebox_exports.Integer({ minimum: 0 }),
  category: typebox_exports.String({ minLength: 1, maxLength: 64 }),
  label: typebox_exports.Optional(typebox_exports.String({ minLength: 1, maxLength: 256 }))
});
var MonitorSessionDetailSchema = typebox_exports.Object({
  apiVersion: typebox_exports.Literal(MONITOR_API_VERSION),
  monitorId: typebox_exports.String({ pattern: "^[0-9a-f]{32}$" }),
  displayName: typebox_exports.String({ minLength: 1, maxLength: 128 }),
  adapter: typebox_exports.String({ minLength: 1, maxLength: 64 }),
  adapterVersion: typebox_exports.String({ minLength: 1, maxLength: 64 }),
  cwd: typebox_exports.String({ minLength: 1, maxLength: 4096 }),
  workspace: typebox_exports.String({ minLength: 1, maxLength: 160 }),
  state: MonitorStateSchema,
  activitySummary: typebox_exports.String({ minLength: 1, maxLength: 240 }),
  startedAt: typebox_exports.Integer({ minimum: 0 }),
  lastActivityAt: typebox_exports.Integer({ minimum: 0 }),
  attentionReasons: typebox_exports.Array(typebox_exports.String({ minLength: 1, maxLength: 120 }), { maxItems: 8 }),
  tools: typebox_exports.Array(MonitorToolDetailSchema, { maxItems: 50 }),
  tasks: typebox_exports.Array(MonitorTaskDetailSchema, { maxItems: 50 }),
  timeline: typebox_exports.Array(MonitorTimelineEntrySchema, { maxItems: 100 }),
  completeness: typebox_exports.Object({
    activity: MonitorCompletenessSchema,
    attention: MonitorCompletenessSchema,
    tools: MonitorCompletenessSchema,
    tasks: MonitorCompletenessSchema
  })
});
var MonitorDiscoveryRecordSchema = typebox_exports.Object({
  endpoint: typebox_exports.String({ minLength: 1 }),
  apiVersion: typebox_exports.Literal(MONITOR_API_VERSION),
  daemonId: typebox_exports.String({ minLength: 1 }),
  startedAt: typebox_exports.Integer({ minimum: 0 }),
  capability: typebox_exports.String({ pattern: "^[0-9a-f]{64}$" })
});

// packages/contracts/dist/index.js
var PROTOCOL_VERSION = 2;

// packages/hub/src/schema.ts
import { DatabaseSync } from "node:sqlite";
function databaseSizeBytes(database) {
  const pages = database.prepare("PRAGMA page_count").get();
  const pageSize = database.prepare("PRAGMA page_size").get();
  return pages.page_count * pageSize.page_size;
}
function createDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      metadata_json TEXT NOT NULL,
      state TEXT NOT NULL,
      latest_sequence INTEGER NOT NULL,
      last_activity_at INTEGER NOT NULL,
      lease_expires_at INTEGER NOT NULL,
      completeness TEXT NOT NULL DEFAULT 'complete',
      text_bytes INTEGER NOT NULL DEFAULT 0,
      task_capability_hash BLOB NOT NULL UNIQUE
    );
  `);
  database.exec(`
    CREATE TABLE events (
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      event_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      kind TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      searchable_text TEXT,
      text_bytes INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (session_id, event_id),
      UNIQUE (session_id, sequence)
    );
  `);
  database.exec(`
    CREATE VIRTUAL TABLE event_search USING fts5(
      session_id UNINDEXED,
      event_id UNINDEXED,
      body
    );
  `);
  database.exec("CREATE INDEX events_session_sequence ON events(session_id, sequence)");
  database.exec(`
    CREATE TABLE a2a_tasks (
      id TEXT PRIMARY KEY, instance_id TEXT NOT NULL, context_id TEXT NOT NULL,
      source_session_id TEXT NOT NULL, target_kind TEXT NOT NULL CHECK (target_kind IN ('session', 'worker')),
      target_selector_json TEXT NOT NULL, target_session_id TEXT,
      state TEXT NOT NULL CHECK (state IN ('submitted', 'working', 'completed', 'failed', 'canceled', 'rejected')),
      cancellation_requested INTEGER NOT NULL DEFAULT 0, source_closed INTEGER NOT NULL DEFAULT 0,
      deadline_at INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      terminal_code TEXT, content_bytes INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE a2a_messages (
      task_id TEXT NOT NULL REFERENCES a2a_tasks(id) ON DELETE CASCADE,
      message_id TEXT NOT NULL, sequence INTEGER NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('source', 'target')), parts_json TEXT NOT NULL,
      extensions_json TEXT NOT NULL, created_at INTEGER NOT NULL, content_bytes INTEGER NOT NULL,
      PRIMARY KEY (task_id, message_id), UNIQUE (task_id, sequence)
    );
    CREATE TABLE a2a_deliveries (
      id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES a2a_tasks(id) ON DELETE CASCADE,
      message_id TEXT NOT NULL, target_session_id TEXT NOT NULL, sequence INTEGER NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('queued', 'claimed', 'accepted', 'rejected', 'resolved')),
      claimed_at INTEGER, acknowledged_at INTEGER, UNIQUE (target_session_id, sequence)
    );
    CREATE INDEX a2a_tasks_source_updated ON a2a_tasks(source_session_id, updated_at DESC, id DESC);
    CREATE INDEX a2a_deliveries_target_queue ON a2a_deliveries(target_session_id, state, sequence);
    CREATE UNIQUE INDEX a2a_one_active_claim_per_target ON a2a_deliveries(target_session_id) WHERE state IN ('claimed', 'accepted');
    CREATE TABLE worker_launches (
      task_id TEXT PRIMARY KEY REFERENCES a2a_tasks(id) ON DELETE CASCADE, provider TEXT NOT NULL,
      launch_id TEXT, token_hash BLOB NOT NULL UNIQUE,
      state TEXT NOT NULL CHECK (state IN ('starting', 'started', 'bound', 'failed', 'canceled')),
      deadline_at INTEGER NOT NULL, bound_session_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE INDEX worker_launches_deadline ON worker_launches(state, deadline_at);
  `);
  return database;
}

// packages/hub/src/store.ts
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

// packages/hub/src/errors.ts
var STATUS_BY_CODE = {
  NOT_FOUND: 404,
  SEQUENCE_GAP: 409,
  LIMIT_EXCEEDED: 413,
  INVALID_EVENT_SEQUENCE: 400
};
var HubError = class extends Error {
  code;
  status;
  constructor(code, message) {
    super(message);
    this.code = code;
    this.status = STATUS_BY_CODE[code];
  }
};
function isHubError(error) {
  return error instanceof HubError;
}

// packages/hub/src/clock.ts
var SystemClock = class {
  now() {
    return Date.now();
  }
};

// packages/hub/src/store.ts
var LEASE_MS = 45e3;
var MAX_SESSION_TEXT_BYTES = 10485760;
var MAX_DATABASE_BYTES = 268435456;
function capabilityDigest(token) {
  return createHash("sha256").update(token, "utf8").digest();
}
function createTaskCapability() {
  const token = randomBytes(32).toString("hex");
  return { token, digest: capabilityDigest(token) };
}
var HubStore = class {
  database;
  clock;
  leaseMs;
  ownsDatabase;
  inTransaction = false;
  onProjectionChanged;
  constructor(options) {
    this.clock = options?.clock ?? new SystemClock();
    this.ownsDatabase = options?.database === void 0;
    this.database = options?.database ?? createDatabase();
    this.leaseMs = options?.leaseMs ?? LEASE_MS;
    this.onProjectionChanged = options?.onProjectionChanged;
  }
  register(request) {
    validateSnapshot(request.snapshot);
    const sessionId = randomUUID();
    const now = this.clock.now();
    const leaseExpiresAt = now + this.leaseMs;
    const metadataJson = JSON.stringify(request.metadata);
    const lastActivityAt = deriveLastActivity(request.snapshot, request.metadata.startedAt);
    const capability = createTaskCapability();
    this.begin();
    try {
      const textBytes = computeTextBytes(request.snapshot.events);
      if (textBytes > MAX_SESSION_TEXT_BYTES) {
        throw new HubError("LIMIT_EXCEEDED", "Session text budget exceeded");
      }
      this.database.prepare(`
        INSERT INTO sessions (id, metadata_json, state, latest_sequence, last_activity_at, lease_expires_at, completeness, text_bytes, task_capability_hash)
        VALUES (?, ?, ?, ?, ?, ?, 'complete', ?, ?)
      `).run(
        sessionId,
        metadataJson,
        request.metadata.state,
        request.snapshot.lastSequence,
        lastActivityAt,
        leaseExpiresAt,
        textBytes,
        capability.digest
      );
      this.insertEvents(sessionId, request.snapshot.events);
      this.enforceLimits(sessionId);
      this.commit();
      this.onProjectionChanged?.();
      return { sessionId, leaseExpiresAt, taskCapability: capability.token };
    } catch (error) {
      this.rollback();
      if (error instanceof HubError && error.code === "LIMIT_EXCEEDED") {
        safeMarkTruncated(this, sessionId);
      }
      throw error;
    }
  }
  appendEvents(sessionId, request) {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new HubError("NOT_FOUND", `Session ${sessionId} not found`);
    }
    if (request.expectedSequence > session.latestSequence) {
      throw new HubError("SEQUENCE_GAP", "Append sequence gap detected");
    }
    if (request.expectedSequence < session.latestSequence) {
      ensureIdempotentBatch(this.database, sessionId, request.events);
      return { acceptedSequence: session.latestSequence };
    }
    validateAppendBatch(request.events, session.latestSequence);
    const now = this.clock.now();
    const leaseExpiresAt = now + this.leaseMs;
    this.begin();
    try {
      const { addedTextBytes, lastEventTimestamp } = this.insertEvents(sessionId, request.events);
      const newSequence = request.events.at(-1).sequence;
      const lastActivityAt = Math.max(session.lastActivityAt, lastEventTimestamp ?? session.lastActivityAt);
      const updatedState = latestState(request.events) ?? session.metadata.state;
      this.database.prepare(`
        UPDATE sessions
        SET latest_sequence = ?, last_activity_at = ?, lease_expires_at = ?, text_bytes = text_bytes + ?, metadata_json = json_set(metadata_json, '$.state', ?), state = ?
        WHERE id = ?
      `).run(newSequence, lastActivityAt, leaseExpiresAt, addedTextBytes, updatedState, updatedState, sessionId);
      this.enforceLimits(sessionId);
      this.commit();
      this.onProjectionChanged?.();
      return { acceptedSequence: newSequence };
    } catch (error) {
      this.rollback();
      if (error instanceof HubError && error.code === "LIMIT_EXCEEDED") {
        safeMarkTruncated(this, sessionId);
      }
      throw error;
    }
  }
  heartbeat(sessionId, request) {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new HubError("NOT_FOUND", `Session ${sessionId} not found`);
    }
    const now = this.clock.now();
    const leaseExpiresAt = now + this.leaseMs;
    const metadata = { ...session.metadata, state: request.state };
    if (request.name !== void 0) {
      if (request.name === null) {
        delete metadata.name;
      } else {
        metadata.name = request.name;
      }
    }
    const lastActivityAt = Math.max(session.lastActivityAt, request.lastActivityAt);
    const projectionChanged = request.state !== session.state || lastActivityAt !== session.lastActivityAt || metadata.name !== session.metadata.name;
    this.begin();
    try {
      this.database.prepare(`
        UPDATE sessions
        SET state = ?, last_activity_at = ?, lease_expires_at = ?, metadata_json = ?
        WHERE id = ?
      `).run(request.state, lastActivityAt, leaseExpiresAt, JSON.stringify(metadata), sessionId);
      this.commit();
      if (projectionChanged) this.onProjectionChanged?.();
      return { leaseExpiresAt };
    } catch (error) {
      this.rollback();
      throw error;
    }
  }
  replaceSnapshot(sessionId, snapshot) {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new HubError("NOT_FOUND", `Session ${sessionId} not found`);
    }
    validateSnapshot(snapshot);
    const textBytes = computeTextBytes(snapshot.events);
    if (textBytes > MAX_SESSION_TEXT_BYTES) {
      this.markTruncated(sessionId);
      throw new HubError("LIMIT_EXCEEDED", "Session text budget exceeded");
    }
    const leaseExpiresAt = this.clock.now() + this.leaseMs;
    this.begin();
    try {
      this.database.prepare("DELETE FROM events WHERE session_id = ?").run(sessionId);
      this.database.prepare("DELETE FROM event_search WHERE session_id = ?").run(sessionId);
      const { lastEventTimestamp } = this.insertEvents(sessionId, snapshot.events);
      const lastActivityAt = lastEventTimestamp ?? session.lastActivityAt;
      this.database.prepare(`
        UPDATE sessions
        SET latest_sequence = ?, last_activity_at = ?, text_bytes = ?, completeness = 'complete', lease_expires_at = ?
        WHERE id = ?
      `).run(snapshot.lastSequence, lastActivityAt, textBytes, leaseExpiresAt, sessionId);
      this.enforceLimits(sessionId);
      this.commit();
      this.onProjectionChanged?.();
      return { acceptedSequence: snapshot.lastSequence };
    } catch (error) {
      this.rollback();
      if (error instanceof HubError && error.code === "LIMIT_EXCEEDED") {
        safeMarkTruncated(this, sessionId);
      }
      throw error;
    }
  }
  markTruncated(sessionId) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare("UPDATE sessions SET completeness = 'truncated' WHERE id = ?").run(sessionId);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
  deleteSession(sessionId) {
    this.begin();
    try {
      this.database.prepare("DELETE FROM event_search WHERE session_id = ?").run(sessionId);
      const result = this.database.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
      this.commit();
      if (result.changes > 0) this.onProjectionChanged?.();
      return result.changes > 0;
    } catch (error) {
      this.rollback();
      throw error;
    }
  }
  expireLeases() {
    const now = this.clock.now();
    this.begin();
    try {
      const rows = this.database.prepare("SELECT id FROM sessions WHERE lease_expires_at <= ?").all(now);
      const expiredIds = rows.map((row) => row.id);
      for (const row of rows) {
        this.database.prepare("DELETE FROM event_search WHERE session_id = ?").run(row.id);
        this.database.prepare("DELETE FROM sessions WHERE id = ?").run(row.id);
      }
      this.commit();
      if (expiredIds.length > 0) this.onProjectionChanged?.();
      return expiredIds;
    } catch (error) {
      this.rollback();
      throw error;
    }
  }
  getSession(sessionId) {
    const row = this.database.prepare(`
      SELECT id, metadata_json, state, latest_sequence, last_activity_at, lease_expires_at, completeness, text_bytes
      FROM sessions WHERE id = ?
    `).get(sessionId);
    if (!row) {
      return void 0;
    }
    return {
      id: row.id,
      metadata: JSON.parse(row.metadata_json),
      state: row.state,
      latestSequence: row.latest_sequence,
      lastActivityAt: row.last_activity_at,
      leaseExpiresAt: row.lease_expires_at,
      completeness: row.completeness,
      textBytes: row.text_bytes
    };
  }
  authenticateTaskCapability(token) {
    if (!/^[0-9a-f]{64}$/.test(token)) return void 0;
    const candidate = capabilityDigest(token);
    const rows = this.database.prepare("SELECT id, task_capability_hash FROM sessions").all();
    for (const row of rows) {
      const stored = Buffer.from(row.task_capability_hash);
      if (stored.length === candidate.length && timingSafeEqual(stored, candidate)) {
        return this.getSession(row.id);
      }
    }
    return void 0;
  }
  countSessions() {
    const row = this.database.prepare("SELECT COUNT(*) as count FROM sessions").get();
    return row.count;
  }
  countSearchRows(sessionId) {
    const row = this.database.prepare("SELECT COUNT(*) as count FROM event_search WHERE session_id = ?").get(sessionId);
    return row.count;
  }
  listSessionRows(filters) {
    const clauses = [];
    const params = [];
    if (filters.excludeSessionId !== void 0) {
      clauses.push("id != ?");
      params.push(filters.excludeSessionId);
    }
    if (filters.cwd !== void 0) {
      clauses.push("json_extract(metadata_json, '$.cwd') = ?");
      params.push(filters.cwd);
    }
    if (filters.sessionIds && filters.sessionIds.length > 0) {
      clauses.push(`id IN (${filters.sessionIds.map(() => "?").join(",")})`);
      params.push(...filters.sessionIds);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.database.prepare(`
      SELECT id, metadata_json, state, latest_sequence, last_activity_at, lease_expires_at, completeness, text_bytes
      FROM sessions
      ${where}
      ORDER BY last_activity_at DESC
      LIMIT ?
    `).all(...params, filters.limit);
    return rows.map((row) => ({
      id: row.id,
      metadata: JSON.parse(row.metadata_json),
      state: row.state,
      latestSequence: row.latest_sequence,
      lastActivityAt: row.last_activity_at,
      leaseExpiresAt: row.lease_expires_at,
      completeness: row.completeness,
      textBytes: row.text_bytes
    }));
  }
  recentEvents(sessionId, limit) {
    const rows = this.database.prepare(`
      SELECT event_id, sequence, timestamp, kind, payload_json
      FROM events
      WHERE session_id = ?
      ORDER BY sequence DESC
      LIMIT ?
    `).all(sessionId, limit);
    return rows.reverse().map((row) => ({
      eventId: row.event_id,
      sequence: row.sequence,
      timestamp: row.timestamp,
      kind: row.kind,
      payload: JSON.parse(row.payload_json)
    }));
  }
  searchEvents(sessionId, ftsQuery, limit) {
    if (!ftsQuery) {
      return [];
    }
    const rows = this.database.prepare(`
      SELECT e.event_id, e.kind, e.timestamp, snippet(event_search, 2, '[', ']', '\u2026', 24) AS excerpt, bm25(event_search) AS score
      FROM event_search
      JOIN events e ON e.session_id = event_search.session_id AND e.event_id = event_search.event_id
      WHERE event_search.session_id = ? AND event_search MATCH ?
      ORDER BY score ASC, e.timestamp DESC
      LIMIT ?
    `).all(sessionId, ftsQuery, limit);
    return rows.map((row) => ({
      eventId: row.event_id,
      kind: row.kind,
      text: row.excerpt,
      timestamp: row.timestamp,
      score: row.score
    }));
  }
  latestToolStates(sessionId) {
    const rows = this.database.prepare(`
      SELECT payload_json
      FROM events
      WHERE session_id = ? AND kind = 'tool.activity'
      ORDER BY sequence DESC
    `).all(sessionId);
    const seen = /* @__PURE__ */ new Map();
    for (const row of rows) {
      const payload = JSON.parse(row.payload_json);
      if (payload.type !== "tool.activity") continue;
      if (seen.has(payload.toolCallId)) continue;
      seen.set(payload.toolCallId, {
        toolCallId: payload.toolCallId,
        toolName: payload.toolName,
        status: payload.status
      });
    }
    return Array.from(seen.values());
  }
  latestActivitySummary(sessionId) {
    const row = this.database.prepare(`
      SELECT payload_json FROM events
      WHERE session_id = ? AND kind = 'activity.summary'
      ORDER BY sequence DESC LIMIT 1
    `).get(sessionId);
    if (!row) return void 0;
    const payload = JSON.parse(row.payload_json);
    return payload.type === "activity.summary" ? payload : void 0;
  }
  monitorToolStates(sessionId, limit) {
    const rows = this.database.prepare(`
      SELECT payload_json FROM events
      WHERE session_id = ? AND kind = 'tool.activity'
      ORDER BY sequence DESC
    `).all(sessionId);
    const seen = /* @__PURE__ */ new Map();
    for (const row of rows) {
      const payload = JSON.parse(row.payload_json);
      if (payload.type !== "tool.activity") continue;
      if (seen.has(payload.toolCallId)) continue;
      seen.set(payload.toolCallId, {
        toolCallId: payload.toolCallId,
        toolName: payload.toolName,
        status: payload.status,
        startedAt: payload.startedAt,
        ...payload.endedAt !== void 0 ? { endedAt: payload.endedAt } : {}
      });
      if (seen.size >= limit) break;
    }
    return Array.from(seen.values());
  }
  close() {
    if (this.ownsDatabase) this.database.close();
  }
  begin() {
    if (this.inTransaction) {
      throw new Error("Nested transactions are not supported");
    }
    this.database.exec("BEGIN IMMEDIATE");
    this.inTransaction = true;
  }
  commit() {
    if (this.inTransaction) {
      this.database.exec("COMMIT");
      this.inTransaction = false;
    }
  }
  rollback() {
    if (this.inTransaction) {
      this.database.exec("ROLLBACK");
      this.inTransaction = false;
    }
  }
  insertEvents(sessionId, events) {
    let addedTextBytes = 0;
    let lastEventTimestamp;
    const insertSearchStmt = this.database.prepare(`
      INSERT INTO event_search (session_id, event_id, body)
      VALUES (?, ?, ?)
    `);
    const insertEventStmt = this.database.prepare(`
      INSERT INTO events (session_id, event_id, sequence, timestamp, kind, payload_json, searchable_text, text_bytes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const event of events) {
      const searchableText = extractSearchableText(event);
      const textBytes = searchableText === void 0 ? 0 : utf8Length(searchableText);
      if (searchableText !== void 0) {
        addedTextBytes += textBytes;
        insertSearchStmt.run(sessionId, event.eventId, searchableText);
      }
      insertEventStmt.run(
        sessionId,
        event.eventId,
        event.sequence,
        event.timestamp,
        event.type,
        JSON.stringify(event),
        searchableText ?? null,
        textBytes
      );
      lastEventTimestamp = event.timestamp;
    }
    return { addedTextBytes, lastEventTimestamp };
  }
  enforceLimits(sessionId) {
    const sessionRow = this.database.prepare("SELECT text_bytes FROM sessions WHERE id = ?").get(sessionId);
    if (sessionRow && sessionRow.text_bytes > MAX_SESSION_TEXT_BYTES) {
      throw new HubError("LIMIT_EXCEEDED", "Session text budget exceeded");
    }
    if (databaseSizeBytes(this.database) > MAX_DATABASE_BYTES) {
      throw new HubError("LIMIT_EXCEEDED", "Hub database budget exceeded");
    }
  }
};
function validateSnapshot(snapshot) {
  if (snapshot.events.length === 0) {
    if (snapshot.lastSequence !== 0) {
      throw new HubError("INVALID_EVENT_SEQUENCE", "Snapshot lastSequence must be zero when no events");
    }
    return;
  }
  if (snapshot.events[0]?.sequence !== 1) {
    throw new HubError("INVALID_EVENT_SEQUENCE", "Snapshot must start at sequence 1");
  }
  const ids = /* @__PURE__ */ new Set();
  for (let index = 0; index < snapshot.events.length; index += 1) {
    const expectedSequence = index + 1;
    const event = snapshot.events[index];
    if (event.sequence !== expectedSequence) {
      throw new HubError("INVALID_EVENT_SEQUENCE", "Snapshot events must be contiguous");
    }
    if (ids.has(event.eventId)) {
      throw new HubError("INVALID_EVENT_SEQUENCE", "Duplicate eventId in snapshot");
    }
    ids.add(event.eventId);
  }
  if (snapshot.lastSequence !== snapshot.events.length) {
    throw new HubError("INVALID_EVENT_SEQUENCE", "Snapshot lastSequence mismatch");
  }
}
function validateAppendBatch(events, latestSequence) {
  if (!events.length) {
    throw new HubError("INVALID_EVENT_SEQUENCE", "Append batch must contain events");
  }
  if (events[0].sequence !== latestSequence + 1) {
    throw new HubError("SEQUENCE_GAP", "Append batch must start at next sequence");
  }
  for (let index = 1; index < events.length; index += 1) {
    if (events[index].sequence !== events[index - 1].sequence + 1) {
      throw new HubError("SEQUENCE_GAP", "Append batch must be contiguous");
    }
  }
}
function ensureIdempotentBatch(database, sessionId, events) {
  for (const event of events) {
    const row = database.prepare(`
      SELECT payload_json, sequence
      FROM events WHERE session_id = ? AND event_id = ?
    `).get(sessionId, event.eventId);
    if (!row) {
      throw new HubError("SEQUENCE_GAP", "Append retry missing persisted event");
    }
    if (row.sequence !== event.sequence) {
      throw new HubError("SEQUENCE_GAP", "Append retry sequence mismatch");
    }
    if (row.payload_json !== JSON.stringify(event)) {
      throw new HubError("SEQUENCE_GAP", "Append retry payload mismatch");
    }
  }
}
function latestState(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.type === "session.state") {
      return event.state;
    }
  }
  return void 0;
}
function computeTextBytes(events) {
  return events.reduce((total, event) => {
    const text = extractSearchableText(event);
    return total + (text ? utf8Length(text) : 0);
  }, 0);
}
function extractSearchableText(event) {
  if (event.type === "message.user" || event.type === "message.assistant") {
    return event.text;
  }
  return void 0;
}
function utf8Length(text) {
  return Buffer.byteLength(text, "utf8");
}
function deriveLastActivity(snapshot, startedAt) {
  if (snapshot.events.length) {
    return snapshot.events.at(-1).timestamp;
  }
  return startedAt;
}
function safeMarkTruncated(store, sessionId) {
  try {
    store.markTruncated(sessionId);
  } catch {
  }
}

// packages/hub/src/http.ts
import http from "node:http";

// node_modules/.pnpm/@a2a-js+sdk@1.0.0/node_modules/@a2a-js/sdk/dist/index.js
var TaskState = /* @__PURE__ */ ((TaskState2) => {
  TaskState2[TaskState2["TASK_STATE_UNSPECIFIED"] = 0] = "TASK_STATE_UNSPECIFIED";
  TaskState2[TaskState2["TASK_STATE_SUBMITTED"] = 1] = "TASK_STATE_SUBMITTED";
  TaskState2[TaskState2["TASK_STATE_WORKING"] = 2] = "TASK_STATE_WORKING";
  TaskState2[TaskState2["TASK_STATE_COMPLETED"] = 3] = "TASK_STATE_COMPLETED";
  TaskState2[TaskState2["TASK_STATE_FAILED"] = 4] = "TASK_STATE_FAILED";
  TaskState2[TaskState2["TASK_STATE_CANCELED"] = 5] = "TASK_STATE_CANCELED";
  TaskState2[TaskState2["TASK_STATE_INPUT_REQUIRED"] = 6] = "TASK_STATE_INPUT_REQUIRED";
  TaskState2[TaskState2["TASK_STATE_REJECTED"] = 7] = "TASK_STATE_REJECTED";
  TaskState2[TaskState2["TASK_STATE_AUTH_REQUIRED"] = 8] = "TASK_STATE_AUTH_REQUIRED";
  TaskState2[TaskState2["UNRECOGNIZED"] = -1] = "UNRECOGNIZED";
  return TaskState2;
})(TaskState || {});
function taskStateFromJSON(object) {
  switch (object) {
    case 0:
    case "TASK_STATE_UNSPECIFIED":
      return 0;
    case 1:
    case "TASK_STATE_SUBMITTED":
      return 1;
    case 2:
    case "TASK_STATE_WORKING":
      return 2;
    case 3:
    case "TASK_STATE_COMPLETED":
      return 3;
    case 4:
    case "TASK_STATE_FAILED":
      return 4;
    case 5:
    case "TASK_STATE_CANCELED":
      return 5;
    case 6:
    case "TASK_STATE_INPUT_REQUIRED":
      return 6;
    case 7:
    case "TASK_STATE_REJECTED":
      return 7;
    case 8:
    case "TASK_STATE_AUTH_REQUIRED":
      return 8;
    case -1:
    case "UNRECOGNIZED":
    default:
      return -1;
  }
}
function taskStateToJSON(object) {
  switch (object) {
    case 0:
      return "TASK_STATE_UNSPECIFIED";
    case 1:
      return "TASK_STATE_SUBMITTED";
    case 2:
      return "TASK_STATE_WORKING";
    case 3:
      return "TASK_STATE_COMPLETED";
    case 4:
      return "TASK_STATE_FAILED";
    case 5:
      return "TASK_STATE_CANCELED";
    case 6:
      return "TASK_STATE_INPUT_REQUIRED";
    case 7:
      return "TASK_STATE_REJECTED";
    case 8:
      return "TASK_STATE_AUTH_REQUIRED";
    case -1:
    default:
      return "UNRECOGNIZED";
  }
}
var Role = /* @__PURE__ */ ((Role2) => {
  Role2[Role2["ROLE_UNSPECIFIED"] = 0] = "ROLE_UNSPECIFIED";
  Role2[Role2["ROLE_USER"] = 1] = "ROLE_USER";
  Role2[Role2["ROLE_AGENT"] = 2] = "ROLE_AGENT";
  Role2[Role2["UNRECOGNIZED"] = -1] = "UNRECOGNIZED";
  return Role2;
})(Role || {});
function roleFromJSON(object) {
  switch (object) {
    case 0:
    case "ROLE_UNSPECIFIED":
      return 0;
    case 1:
    case "ROLE_USER":
      return 1;
    case 2:
    case "ROLE_AGENT":
      return 2;
    case -1:
    case "UNRECOGNIZED":
    default:
      return -1;
  }
}
function roleToJSON(object) {
  switch (object) {
    case 0:
      return "ROLE_UNSPECIFIED";
    case 1:
      return "ROLE_USER";
    case 2:
      return "ROLE_AGENT";
    case -1:
    default:
      return "UNRECOGNIZED";
  }
}
var SendMessageConfiguration = {
  fromJSON(object) {
    return {
      acceptedOutputModes: globalThis.Array.isArray(object?.acceptedOutputModes) ? object.acceptedOutputModes.map((e) => globalThis.String(e)) : globalThis.Array.isArray(object?.accepted_output_modes) ? object.accepted_output_modes.map(
        (e) => globalThis.String(e)
      ) : [],
      taskPushNotificationConfig: isSet(object.taskPushNotificationConfig) ? TaskPushNotificationConfig.fromJSON(object.taskPushNotificationConfig) : isSet(object.task_push_notification_config) ? TaskPushNotificationConfig.fromJSON(object.task_push_notification_config) : void 0,
      historyLength: isSet(object.historyLength) ? globalThis.Number(object.historyLength) : isSet(object.history_length) ? globalThis.Number(object.history_length) : void 0,
      returnImmediately: isSet(object.returnImmediately) ? globalThis.Boolean(object.returnImmediately) : isSet(object.return_immediately) ? globalThis.Boolean(object.return_immediately) : false
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.acceptedOutputModes?.length) {
      obj.acceptedOutputModes = message.acceptedOutputModes;
    }
    if (message.taskPushNotificationConfig !== void 0) {
      obj.taskPushNotificationConfig = TaskPushNotificationConfig.toJSON(message.taskPushNotificationConfig);
    }
    if (message.historyLength !== void 0) {
      obj.historyLength = Math.round(message.historyLength);
    }
    if (message.returnImmediately !== false) {
      obj.returnImmediately = message.returnImmediately;
    }
    return obj;
  }
};
var Task = {
  fromJSON(object) {
    return {
      id: isSet(object.id) ? globalThis.String(object.id) : "",
      contextId: isSet(object.contextId) ? globalThis.String(object.contextId) : isSet(object.context_id) ? globalThis.String(object.context_id) : "",
      status: isSet(object.status) ? TaskStatus.fromJSON(object.status) : void 0,
      artifacts: globalThis.Array.isArray(object?.artifacts) ? object.artifacts.map((e) => Artifact.fromJSON(e)) : [],
      history: globalThis.Array.isArray(object?.history) ? object.history.map((e) => Message.fromJSON(e)) : [],
      metadata: isObject(object.metadata) ? object.metadata : void 0
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.id !== "") {
      obj.id = message.id;
    }
    if (message.contextId !== "") {
      obj.contextId = message.contextId;
    }
    if (message.status !== void 0) {
      obj.status = TaskStatus.toJSON(message.status);
    }
    if (message.artifacts?.length) {
      obj.artifacts = message.artifacts.map((e) => Artifact.toJSON(e));
    }
    if (message.history?.length) {
      obj.history = message.history.map((e) => Message.toJSON(e));
    }
    if (message.metadata !== void 0) {
      obj.metadata = message.metadata;
    }
    return obj;
  }
};
var TaskStatus = {
  fromJSON(object) {
    return {
      state: isSet(object.state) ? taskStateFromJSON(object.state) : 0,
      message: isSet(object.message) ? Message.fromJSON(object.message) : void 0,
      timestamp: isSet(object.timestamp) ? globalThis.String(object.timestamp) : void 0
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.state !== 0) {
      obj.state = taskStateToJSON(message.state);
    }
    if (message.message !== void 0) {
      obj.message = Message.toJSON(message.message);
    }
    if (message.timestamp !== void 0) {
      obj.timestamp = message.timestamp;
    }
    return obj;
  }
};
var Part = {
  fromJSON(object) {
    return {
      content: isSet(object.text) ? { $case: "text", value: globalThis.String(object.text) } : isSet(object.raw) ? { $case: "raw", value: Buffer.from(bytesFromBase64(object.raw)) } : isSet(object.url) ? { $case: "url", value: globalThis.String(object.url) } : isSet(object.data) ? { $case: "data", value: object.data } : void 0,
      metadata: isObject(object.metadata) ? object.metadata : void 0,
      filename: isSet(object.filename) ? globalThis.String(object.filename) : "",
      mediaType: isSet(object.mediaType) ? globalThis.String(object.mediaType) : isSet(object.media_type) ? globalThis.String(object.media_type) : ""
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.content?.$case === "text") {
      obj.text = message.content.value;
    } else if (message.content?.$case === "raw") {
      obj.raw = base64FromBytes(message.content.value);
    } else if (message.content?.$case === "url") {
      obj.url = message.content.value;
    } else if (message.content?.$case === "data") {
      obj.data = message.content.value;
    }
    if (message.metadata !== void 0) {
      obj.metadata = message.metadata;
    }
    if (message.filename !== "") {
      obj.filename = message.filename;
    }
    if (message.mediaType !== "") {
      obj.mediaType = message.mediaType;
    }
    return obj;
  }
};
var Message = {
  fromJSON(object) {
    return {
      messageId: isSet(object.messageId) ? globalThis.String(object.messageId) : isSet(object.message_id) ? globalThis.String(object.message_id) : "",
      contextId: isSet(object.contextId) ? globalThis.String(object.contextId) : isSet(object.context_id) ? globalThis.String(object.context_id) : "",
      taskId: isSet(object.taskId) ? globalThis.String(object.taskId) : isSet(object.task_id) ? globalThis.String(object.task_id) : "",
      role: isSet(object.role) ? roleFromJSON(object.role) : 0,
      parts: globalThis.Array.isArray(object?.parts) ? object.parts.map((e) => Part.fromJSON(e)) : [],
      metadata: isObject(object.metadata) ? object.metadata : void 0,
      extensions: globalThis.Array.isArray(object?.extensions) ? object.extensions.map((e) => globalThis.String(e)) : [],
      referenceTaskIds: globalThis.Array.isArray(object?.referenceTaskIds) ? object.referenceTaskIds.map((e) => globalThis.String(e)) : globalThis.Array.isArray(object?.reference_task_ids) ? object.reference_task_ids.map((e) => globalThis.String(e)) : []
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.messageId !== "") {
      obj.messageId = message.messageId;
    }
    if (message.contextId !== "") {
      obj.contextId = message.contextId;
    }
    if (message.taskId !== "") {
      obj.taskId = message.taskId;
    }
    if (message.role !== 0) {
      obj.role = roleToJSON(message.role);
    }
    if (message.parts?.length) {
      obj.parts = message.parts.map((e) => Part.toJSON(e));
    }
    if (message.metadata !== void 0) {
      obj.metadata = message.metadata;
    }
    if (message.extensions?.length) {
      obj.extensions = message.extensions;
    }
    if (message.referenceTaskIds?.length) {
      obj.referenceTaskIds = message.referenceTaskIds;
    }
    return obj;
  }
};
var Artifact = {
  fromJSON(object) {
    return {
      artifactId: isSet(object.artifactId) ? globalThis.String(object.artifactId) : isSet(object.artifact_id) ? globalThis.String(object.artifact_id) : "",
      name: isSet(object.name) ? globalThis.String(object.name) : "",
      description: isSet(object.description) ? globalThis.String(object.description) : "",
      parts: globalThis.Array.isArray(object?.parts) ? object.parts.map((e) => Part.fromJSON(e)) : [],
      metadata: isObject(object.metadata) ? object.metadata : void 0,
      extensions: globalThis.Array.isArray(object?.extensions) ? object.extensions.map((e) => globalThis.String(e)) : []
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.artifactId !== "") {
      obj.artifactId = message.artifactId;
    }
    if (message.name !== "") {
      obj.name = message.name;
    }
    if (message.description !== "") {
      obj.description = message.description;
    }
    if (message.parts?.length) {
      obj.parts = message.parts.map((e) => Part.toJSON(e));
    }
    if (message.metadata !== void 0) {
      obj.metadata = message.metadata;
    }
    if (message.extensions?.length) {
      obj.extensions = message.extensions;
    }
    return obj;
  }
};
var AuthenticationInfo = {
  fromJSON(object) {
    return {
      scheme: isSet(object.scheme) ? globalThis.String(object.scheme) : "",
      credentials: isSet(object.credentials) ? globalThis.String(object.credentials) : ""
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.scheme !== "") {
      obj.scheme = message.scheme;
    }
    if (message.credentials !== "") {
      obj.credentials = message.credentials;
    }
    return obj;
  }
};
var AgentInterface = {
  fromJSON(object) {
    return {
      url: isSet(object.url) ? globalThis.String(object.url) : "",
      protocolBinding: isSet(object.protocolBinding) ? globalThis.String(object.protocolBinding) : isSet(object.protocol_binding) ? globalThis.String(object.protocol_binding) : "",
      tenant: isSet(object.tenant) ? globalThis.String(object.tenant) : "",
      protocolVersion: isSet(object.protocolVersion) ? globalThis.String(object.protocolVersion) : isSet(object.protocol_version) ? globalThis.String(object.protocol_version) : ""
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.url !== "") {
      obj.url = message.url;
    }
    if (message.protocolBinding !== "") {
      obj.protocolBinding = message.protocolBinding;
    }
    if (message.tenant !== "") {
      obj.tenant = message.tenant;
    }
    if (message.protocolVersion !== "") {
      obj.protocolVersion = message.protocolVersion;
    }
    return obj;
  }
};
var AgentCard = {
  fromJSON(object) {
    return {
      name: isSet(object.name) ? globalThis.String(object.name) : "",
      description: isSet(object.description) ? globalThis.String(object.description) : "",
      supportedInterfaces: globalThis.Array.isArray(object?.supportedInterfaces) ? object.supportedInterfaces.map((e) => AgentInterface.fromJSON(e)) : globalThis.Array.isArray(object?.supported_interfaces) ? object.supported_interfaces.map((e) => AgentInterface.fromJSON(e)) : [],
      provider: isSet(object.provider) ? AgentProvider.fromJSON(object.provider) : void 0,
      version: isSet(object.version) ? globalThis.String(object.version) : "",
      documentationUrl: isSet(object.documentationUrl) ? globalThis.String(object.documentationUrl) : isSet(object.documentation_url) ? globalThis.String(object.documentation_url) : void 0,
      capabilities: isSet(object.capabilities) ? AgentCapabilities.fromJSON(object.capabilities) : void 0,
      securitySchemes: isObject(object.securitySchemes) ? globalThis.Object.entries(object.securitySchemes).reduce(
        (acc, [key, value]) => {
          acc[key] = SecurityScheme.fromJSON(value);
          return acc;
        },
        {}
      ) : isObject(object.security_schemes) ? globalThis.Object.entries(object.security_schemes).reduce(
        (acc, [key, value]) => {
          acc[key] = SecurityScheme.fromJSON(value);
          return acc;
        },
        {}
      ) : {},
      securityRequirements: globalThis.Array.isArray(object?.securityRequirements) ? object.securityRequirements.map((e) => SecurityRequirement.fromJSON(e)) : globalThis.Array.isArray(object?.security_requirements) ? object.security_requirements.map((e) => SecurityRequirement.fromJSON(e)) : [],
      defaultInputModes: globalThis.Array.isArray(object?.defaultInputModes) ? object.defaultInputModes.map((e) => globalThis.String(e)) : globalThis.Array.isArray(object?.default_input_modes) ? object.default_input_modes.map((e) => globalThis.String(e)) : [],
      defaultOutputModes: globalThis.Array.isArray(object?.defaultOutputModes) ? object.defaultOutputModes.map((e) => globalThis.String(e)) : globalThis.Array.isArray(object?.default_output_modes) ? object.default_output_modes.map((e) => globalThis.String(e)) : [],
      skills: globalThis.Array.isArray(object?.skills) ? object.skills.map((e) => AgentSkill.fromJSON(e)) : [],
      signatures: globalThis.Array.isArray(object?.signatures) ? object.signatures.map((e) => AgentCardSignature.fromJSON(e)) : [],
      iconUrl: isSet(object.iconUrl) ? globalThis.String(object.iconUrl) : isSet(object.icon_url) ? globalThis.String(object.icon_url) : void 0
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.name !== "") {
      obj.name = message.name;
    }
    if (message.description !== "") {
      obj.description = message.description;
    }
    if (message.supportedInterfaces?.length) {
      obj.supportedInterfaces = message.supportedInterfaces.map((e) => AgentInterface.toJSON(e));
    }
    if (message.provider !== void 0) {
      obj.provider = AgentProvider.toJSON(message.provider);
    }
    if (message.version !== "") {
      obj.version = message.version;
    }
    if (message.documentationUrl !== void 0) {
      obj.documentationUrl = message.documentationUrl;
    }
    if (message.capabilities !== void 0) {
      obj.capabilities = AgentCapabilities.toJSON(message.capabilities);
    }
    if (message.securitySchemes) {
      const entries = globalThis.Object.entries(message.securitySchemes);
      if (entries.length > 0) {
        obj.securitySchemes = {};
        entries.forEach(([k, v]) => {
          obj.securitySchemes[k] = SecurityScheme.toJSON(v);
        });
      }
    }
    if (message.securityRequirements?.length) {
      obj.securityRequirements = message.securityRequirements.map((e) => SecurityRequirement.toJSON(e));
    }
    if (message.defaultInputModes?.length) {
      obj.defaultInputModes = message.defaultInputModes;
    }
    if (message.defaultOutputModes?.length) {
      obj.defaultOutputModes = message.defaultOutputModes;
    }
    if (message.skills?.length) {
      obj.skills = message.skills.map((e) => AgentSkill.toJSON(e));
    }
    if (message.signatures?.length) {
      obj.signatures = message.signatures.map((e) => AgentCardSignature.toJSON(e));
    }
    if (message.iconUrl !== void 0) {
      obj.iconUrl = message.iconUrl;
    }
    return obj;
  }
};
var AgentProvider = {
  fromJSON(object) {
    return {
      url: isSet(object.url) ? globalThis.String(object.url) : "",
      organization: isSet(object.organization) ? globalThis.String(object.organization) : ""
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.url !== "") {
      obj.url = message.url;
    }
    if (message.organization !== "") {
      obj.organization = message.organization;
    }
    return obj;
  }
};
var AgentCapabilities = {
  fromJSON(object) {
    return {
      streaming: isSet(object.streaming) ? globalThis.Boolean(object.streaming) : void 0,
      pushNotifications: isSet(object.pushNotifications) ? globalThis.Boolean(object.pushNotifications) : isSet(object.push_notifications) ? globalThis.Boolean(object.push_notifications) : void 0,
      extensions: globalThis.Array.isArray(object?.extensions) ? object.extensions.map((e) => AgentExtension.fromJSON(e)) : [],
      extendedAgentCard: isSet(object.extendedAgentCard) ? globalThis.Boolean(object.extendedAgentCard) : isSet(object.extended_agent_card) ? globalThis.Boolean(object.extended_agent_card) : void 0
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.streaming !== void 0) {
      obj.streaming = message.streaming;
    }
    if (message.pushNotifications !== void 0) {
      obj.pushNotifications = message.pushNotifications;
    }
    if (message.extensions?.length) {
      obj.extensions = message.extensions.map((e) => AgentExtension.toJSON(e));
    }
    if (message.extendedAgentCard !== void 0) {
      obj.extendedAgentCard = message.extendedAgentCard;
    }
    return obj;
  }
};
var AgentExtension = {
  fromJSON(object) {
    return {
      uri: isSet(object.uri) ? globalThis.String(object.uri) : "",
      description: isSet(object.description) ? globalThis.String(object.description) : "",
      required: isSet(object.required) ? globalThis.Boolean(object.required) : false,
      params: isObject(object.params) ? object.params : void 0
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.uri !== "") {
      obj.uri = message.uri;
    }
    if (message.description !== "") {
      obj.description = message.description;
    }
    if (message.required !== false) {
      obj.required = message.required;
    }
    if (message.params !== void 0) {
      obj.params = message.params;
    }
    return obj;
  }
};
var AgentSkill = {
  fromJSON(object) {
    return {
      id: isSet(object.id) ? globalThis.String(object.id) : "",
      name: isSet(object.name) ? globalThis.String(object.name) : "",
      description: isSet(object.description) ? globalThis.String(object.description) : "",
      tags: globalThis.Array.isArray(object?.tags) ? object.tags.map((e) => globalThis.String(e)) : [],
      examples: globalThis.Array.isArray(object?.examples) ? object.examples.map((e) => globalThis.String(e)) : [],
      inputModes: globalThis.Array.isArray(object?.inputModes) ? object.inputModes.map((e) => globalThis.String(e)) : globalThis.Array.isArray(object?.input_modes) ? object.input_modes.map((e) => globalThis.String(e)) : [],
      outputModes: globalThis.Array.isArray(object?.outputModes) ? object.outputModes.map((e) => globalThis.String(e)) : globalThis.Array.isArray(object?.output_modes) ? object.output_modes.map((e) => globalThis.String(e)) : [],
      securityRequirements: globalThis.Array.isArray(object?.securityRequirements) ? object.securityRequirements.map((e) => SecurityRequirement.fromJSON(e)) : globalThis.Array.isArray(object?.security_requirements) ? object.security_requirements.map((e) => SecurityRequirement.fromJSON(e)) : []
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.id !== "") {
      obj.id = message.id;
    }
    if (message.name !== "") {
      obj.name = message.name;
    }
    if (message.description !== "") {
      obj.description = message.description;
    }
    if (message.tags?.length) {
      obj.tags = message.tags;
    }
    if (message.examples?.length) {
      obj.examples = message.examples;
    }
    if (message.inputModes?.length) {
      obj.inputModes = message.inputModes;
    }
    if (message.outputModes?.length) {
      obj.outputModes = message.outputModes;
    }
    if (message.securityRequirements?.length) {
      obj.securityRequirements = message.securityRequirements.map((e) => SecurityRequirement.toJSON(e));
    }
    return obj;
  }
};
var AgentCardSignature = {
  fromJSON(object) {
    return {
      protected: isSet(object.protected) ? globalThis.String(object.protected) : "",
      signature: isSet(object.signature) ? globalThis.String(object.signature) : "",
      header: isObject(object.header) ? object.header : void 0
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.protected !== "") {
      obj.protected = message.protected;
    }
    if (message.signature !== "") {
      obj.signature = message.signature;
    }
    if (message.header !== void 0) {
      obj.header = message.header;
    }
    return obj;
  }
};
var TaskPushNotificationConfig = {
  fromJSON(object) {
    return {
      tenant: isSet(object.tenant) ? globalThis.String(object.tenant) : "",
      id: isSet(object.id) ? globalThis.String(object.id) : "",
      taskId: isSet(object.taskId) ? globalThis.String(object.taskId) : isSet(object.task_id) ? globalThis.String(object.task_id) : "",
      url: isSet(object.url) ? globalThis.String(object.url) : "",
      token: isSet(object.token) ? globalThis.String(object.token) : "",
      authentication: isSet(object.authentication) ? AuthenticationInfo.fromJSON(object.authentication) : void 0
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.tenant !== "") {
      obj.tenant = message.tenant;
    }
    if (message.id !== "") {
      obj.id = message.id;
    }
    if (message.taskId !== "") {
      obj.taskId = message.taskId;
    }
    if (message.url !== "") {
      obj.url = message.url;
    }
    if (message.token !== "") {
      obj.token = message.token;
    }
    if (message.authentication !== void 0) {
      obj.authentication = AuthenticationInfo.toJSON(message.authentication);
    }
    return obj;
  }
};
var StringList = {
  fromJSON(object) {
    return { list: globalThis.Array.isArray(object?.list) ? object.list.map((e) => globalThis.String(e)) : [] };
  },
  toJSON(message) {
    const obj = {};
    if (message.list?.length) {
      obj.list = message.list;
    }
    return obj;
  }
};
var SecurityRequirement = {
  fromJSON(object) {
    return {
      schemes: isObject(object.schemes) ? globalThis.Object.entries(object.schemes).reduce(
        (acc, [key, value]) => {
          acc[key] = StringList.fromJSON(value);
          return acc;
        },
        {}
      ) : {}
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.schemes) {
      const entries = globalThis.Object.entries(message.schemes);
      if (entries.length > 0) {
        obj.schemes = {};
        entries.forEach(([k, v]) => {
          obj.schemes[k] = StringList.toJSON(v);
        });
      }
    }
    return obj;
  }
};
var SecurityScheme = {
  fromJSON(object) {
    return {
      scheme: isSet(object.apiKeySecurityScheme) ? { $case: "apiKeySecurityScheme", value: APIKeySecurityScheme.fromJSON(object.apiKeySecurityScheme) } : isSet(object.api_key_security_scheme) ? { $case: "apiKeySecurityScheme", value: APIKeySecurityScheme.fromJSON(object.api_key_security_scheme) } : isSet(object.httpAuthSecurityScheme) ? { $case: "httpAuthSecurityScheme", value: HTTPAuthSecurityScheme.fromJSON(object.httpAuthSecurityScheme) } : isSet(object.http_auth_security_scheme) ? { $case: "httpAuthSecurityScheme", value: HTTPAuthSecurityScheme.fromJSON(object.http_auth_security_scheme) } : isSet(object.oauth2SecurityScheme) ? { $case: "oauth2SecurityScheme", value: OAuth2SecurityScheme.fromJSON(object.oauth2SecurityScheme) } : isSet(object.oauth2_security_scheme) ? { $case: "oauth2SecurityScheme", value: OAuth2SecurityScheme.fromJSON(object.oauth2_security_scheme) } : isSet(object.openIdConnectSecurityScheme) ? {
        $case: "openIdConnectSecurityScheme",
        value: OpenIdConnectSecurityScheme.fromJSON(object.openIdConnectSecurityScheme)
      } : isSet(object.open_id_connect_security_scheme) ? {
        $case: "openIdConnectSecurityScheme",
        value: OpenIdConnectSecurityScheme.fromJSON(object.open_id_connect_security_scheme)
      } : isSet(object.mtlsSecurityScheme) ? { $case: "mtlsSecurityScheme", value: MutualTlsSecurityScheme.fromJSON(object.mtlsSecurityScheme) } : isSet(object.mtls_security_scheme) ? { $case: "mtlsSecurityScheme", value: MutualTlsSecurityScheme.fromJSON(object.mtls_security_scheme) } : void 0
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.scheme?.$case === "apiKeySecurityScheme") {
      obj.apiKeySecurityScheme = APIKeySecurityScheme.toJSON(message.scheme.value);
    } else if (message.scheme?.$case === "httpAuthSecurityScheme") {
      obj.httpAuthSecurityScheme = HTTPAuthSecurityScheme.toJSON(message.scheme.value);
    } else if (message.scheme?.$case === "oauth2SecurityScheme") {
      obj.oauth2SecurityScheme = OAuth2SecurityScheme.toJSON(message.scheme.value);
    } else if (message.scheme?.$case === "openIdConnectSecurityScheme") {
      obj.openIdConnectSecurityScheme = OpenIdConnectSecurityScheme.toJSON(message.scheme.value);
    } else if (message.scheme?.$case === "mtlsSecurityScheme") {
      obj.mtlsSecurityScheme = MutualTlsSecurityScheme.toJSON(message.scheme.value);
    }
    return obj;
  }
};
var APIKeySecurityScheme = {
  fromJSON(object) {
    return {
      description: isSet(object.description) ? globalThis.String(object.description) : "",
      location: isSet(object.location) ? globalThis.String(object.location) : "",
      name: isSet(object.name) ? globalThis.String(object.name) : ""
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.description !== "") {
      obj.description = message.description;
    }
    if (message.location !== "") {
      obj.location = message.location;
    }
    if (message.name !== "") {
      obj.name = message.name;
    }
    return obj;
  }
};
var HTTPAuthSecurityScheme = {
  fromJSON(object) {
    return {
      description: isSet(object.description) ? globalThis.String(object.description) : "",
      scheme: isSet(object.scheme) ? globalThis.String(object.scheme) : "",
      bearerFormat: isSet(object.bearerFormat) ? globalThis.String(object.bearerFormat) : isSet(object.bearer_format) ? globalThis.String(object.bearer_format) : ""
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.description !== "") {
      obj.description = message.description;
    }
    if (message.scheme !== "") {
      obj.scheme = message.scheme;
    }
    if (message.bearerFormat !== "") {
      obj.bearerFormat = message.bearerFormat;
    }
    return obj;
  }
};
var OAuth2SecurityScheme = {
  fromJSON(object) {
    return {
      description: isSet(object.description) ? globalThis.String(object.description) : "",
      flows: isSet(object.flows) ? OAuthFlows.fromJSON(object.flows) : void 0,
      oauth2MetadataUrl: isSet(object.oauth2MetadataUrl) ? globalThis.String(object.oauth2MetadataUrl) : isSet(object.oauth2_metadata_url) ? globalThis.String(object.oauth2_metadata_url) : ""
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.description !== "") {
      obj.description = message.description;
    }
    if (message.flows !== void 0) {
      obj.flows = OAuthFlows.toJSON(message.flows);
    }
    if (message.oauth2MetadataUrl !== "") {
      obj.oauth2MetadataUrl = message.oauth2MetadataUrl;
    }
    return obj;
  }
};
var OpenIdConnectSecurityScheme = {
  fromJSON(object) {
    return {
      description: isSet(object.description) ? globalThis.String(object.description) : "",
      openIdConnectUrl: isSet(object.openIdConnectUrl) ? globalThis.String(object.openIdConnectUrl) : isSet(object.open_id_connect_url) ? globalThis.String(object.open_id_connect_url) : ""
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.description !== "") {
      obj.description = message.description;
    }
    if (message.openIdConnectUrl !== "") {
      obj.openIdConnectUrl = message.openIdConnectUrl;
    }
    return obj;
  }
};
var MutualTlsSecurityScheme = {
  fromJSON(object) {
    return { description: isSet(object.description) ? globalThis.String(object.description) : "" };
  },
  toJSON(message) {
    const obj = {};
    if (message.description !== "") {
      obj.description = message.description;
    }
    return obj;
  }
};
var OAuthFlows = {
  fromJSON(object) {
    return {
      flow: isSet(object.authorizationCode) ? { $case: "authorizationCode", value: AuthorizationCodeOAuthFlow.fromJSON(object.authorizationCode) } : isSet(object.authorization_code) ? { $case: "authorizationCode", value: AuthorizationCodeOAuthFlow.fromJSON(object.authorization_code) } : isSet(object.clientCredentials) ? { $case: "clientCredentials", value: ClientCredentialsOAuthFlow.fromJSON(object.clientCredentials) } : isSet(object.client_credentials) ? { $case: "clientCredentials", value: ClientCredentialsOAuthFlow.fromJSON(object.client_credentials) } : isSet(object.implicit) ? { $case: "implicit", value: ImplicitOAuthFlow.fromJSON(object.implicit) } : isSet(object.password) ? { $case: "password", value: PasswordOAuthFlow.fromJSON(object.password) } : isSet(object.deviceCode) ? { $case: "deviceCode", value: DeviceCodeOAuthFlow.fromJSON(object.deviceCode) } : isSet(object.device_code) ? { $case: "deviceCode", value: DeviceCodeOAuthFlow.fromJSON(object.device_code) } : void 0
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.flow?.$case === "authorizationCode") {
      obj.authorizationCode = AuthorizationCodeOAuthFlow.toJSON(message.flow.value);
    } else if (message.flow?.$case === "clientCredentials") {
      obj.clientCredentials = ClientCredentialsOAuthFlow.toJSON(message.flow.value);
    } else if (message.flow?.$case === "implicit") {
      obj.implicit = ImplicitOAuthFlow.toJSON(message.flow.value);
    } else if (message.flow?.$case === "password") {
      obj.password = PasswordOAuthFlow.toJSON(message.flow.value);
    } else if (message.flow?.$case === "deviceCode") {
      obj.deviceCode = DeviceCodeOAuthFlow.toJSON(message.flow.value);
    }
    return obj;
  }
};
var AuthorizationCodeOAuthFlow = {
  fromJSON(object) {
    return {
      authorizationUrl: isSet(object.authorizationUrl) ? globalThis.String(object.authorizationUrl) : isSet(object.authorization_url) ? globalThis.String(object.authorization_url) : "",
      tokenUrl: isSet(object.tokenUrl) ? globalThis.String(object.tokenUrl) : isSet(object.token_url) ? globalThis.String(object.token_url) : "",
      refreshUrl: isSet(object.refreshUrl) ? globalThis.String(object.refreshUrl) : isSet(object.refresh_url) ? globalThis.String(object.refresh_url) : "",
      scopes: isObject(object.scopes) ? globalThis.Object.entries(object.scopes).reduce(
        (acc, [key, value]) => {
          acc[key] = globalThis.String(value);
          return acc;
        },
        {}
      ) : {},
      pkceRequired: isSet(object.pkceRequired) ? globalThis.Boolean(object.pkceRequired) : isSet(object.pkce_required) ? globalThis.Boolean(object.pkce_required) : false
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.authorizationUrl !== "") {
      obj.authorizationUrl = message.authorizationUrl;
    }
    if (message.tokenUrl !== "") {
      obj.tokenUrl = message.tokenUrl;
    }
    if (message.refreshUrl !== "") {
      obj.refreshUrl = message.refreshUrl;
    }
    if (message.scopes) {
      const entries = globalThis.Object.entries(message.scopes);
      if (entries.length > 0) {
        obj.scopes = {};
        entries.forEach(([k, v]) => {
          obj.scopes[k] = v;
        });
      }
    }
    if (message.pkceRequired !== false) {
      obj.pkceRequired = message.pkceRequired;
    }
    return obj;
  }
};
var ClientCredentialsOAuthFlow = {
  fromJSON(object) {
    return {
      tokenUrl: isSet(object.tokenUrl) ? globalThis.String(object.tokenUrl) : isSet(object.token_url) ? globalThis.String(object.token_url) : "",
      refreshUrl: isSet(object.refreshUrl) ? globalThis.String(object.refreshUrl) : isSet(object.refresh_url) ? globalThis.String(object.refresh_url) : "",
      scopes: isObject(object.scopes) ? globalThis.Object.entries(object.scopes).reduce(
        (acc, [key, value]) => {
          acc[key] = globalThis.String(value);
          return acc;
        },
        {}
      ) : {}
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.tokenUrl !== "") {
      obj.tokenUrl = message.tokenUrl;
    }
    if (message.refreshUrl !== "") {
      obj.refreshUrl = message.refreshUrl;
    }
    if (message.scopes) {
      const entries = globalThis.Object.entries(message.scopes);
      if (entries.length > 0) {
        obj.scopes = {};
        entries.forEach(([k, v]) => {
          obj.scopes[k] = v;
        });
      }
    }
    return obj;
  }
};
var ImplicitOAuthFlow = {
  fromJSON(object) {
    return {
      authorizationUrl: isSet(object.authorizationUrl) ? globalThis.String(object.authorizationUrl) : isSet(object.authorization_url) ? globalThis.String(object.authorization_url) : "",
      refreshUrl: isSet(object.refreshUrl) ? globalThis.String(object.refreshUrl) : isSet(object.refresh_url) ? globalThis.String(object.refresh_url) : "",
      scopes: isObject(object.scopes) ? globalThis.Object.entries(object.scopes).reduce(
        (acc, [key, value]) => {
          acc[key] = globalThis.String(value);
          return acc;
        },
        {}
      ) : {}
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.authorizationUrl !== "") {
      obj.authorizationUrl = message.authorizationUrl;
    }
    if (message.refreshUrl !== "") {
      obj.refreshUrl = message.refreshUrl;
    }
    if (message.scopes) {
      const entries = globalThis.Object.entries(message.scopes);
      if (entries.length > 0) {
        obj.scopes = {};
        entries.forEach(([k, v]) => {
          obj.scopes[k] = v;
        });
      }
    }
    return obj;
  }
};
var PasswordOAuthFlow = {
  fromJSON(object) {
    return {
      tokenUrl: isSet(object.tokenUrl) ? globalThis.String(object.tokenUrl) : isSet(object.token_url) ? globalThis.String(object.token_url) : "",
      refreshUrl: isSet(object.refreshUrl) ? globalThis.String(object.refreshUrl) : isSet(object.refresh_url) ? globalThis.String(object.refresh_url) : "",
      scopes: isObject(object.scopes) ? globalThis.Object.entries(object.scopes).reduce(
        (acc, [key, value]) => {
          acc[key] = globalThis.String(value);
          return acc;
        },
        {}
      ) : {}
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.tokenUrl !== "") {
      obj.tokenUrl = message.tokenUrl;
    }
    if (message.refreshUrl !== "") {
      obj.refreshUrl = message.refreshUrl;
    }
    if (message.scopes) {
      const entries = globalThis.Object.entries(message.scopes);
      if (entries.length > 0) {
        obj.scopes = {};
        entries.forEach(([k, v]) => {
          obj.scopes[k] = v;
        });
      }
    }
    return obj;
  }
};
var DeviceCodeOAuthFlow = {
  fromJSON(object) {
    return {
      deviceAuthorizationUrl: isSet(object.deviceAuthorizationUrl) ? globalThis.String(object.deviceAuthorizationUrl) : isSet(object.device_authorization_url) ? globalThis.String(object.device_authorization_url) : "",
      tokenUrl: isSet(object.tokenUrl) ? globalThis.String(object.tokenUrl) : isSet(object.token_url) ? globalThis.String(object.token_url) : "",
      refreshUrl: isSet(object.refreshUrl) ? globalThis.String(object.refreshUrl) : isSet(object.refresh_url) ? globalThis.String(object.refresh_url) : "",
      scopes: isObject(object.scopes) ? globalThis.Object.entries(object.scopes).reduce(
        (acc, [key, value]) => {
          acc[key] = globalThis.String(value);
          return acc;
        },
        {}
      ) : {}
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.deviceAuthorizationUrl !== "") {
      obj.deviceAuthorizationUrl = message.deviceAuthorizationUrl;
    }
    if (message.tokenUrl !== "") {
      obj.tokenUrl = message.tokenUrl;
    }
    if (message.refreshUrl !== "") {
      obj.refreshUrl = message.refreshUrl;
    }
    if (message.scopes) {
      const entries = globalThis.Object.entries(message.scopes);
      if (entries.length > 0) {
        obj.scopes = {};
        entries.forEach(([k, v]) => {
          obj.scopes[k] = v;
        });
      }
    }
    return obj;
  }
};
var SendMessageRequest = {
  fromJSON(object) {
    return {
      tenant: isSet(object.tenant) ? globalThis.String(object.tenant) : "",
      message: isSet(object.message) ? Message.fromJSON(object.message) : void 0,
      configuration: isSet(object.configuration) ? SendMessageConfiguration.fromJSON(object.configuration) : void 0,
      metadata: isObject(object.metadata) ? object.metadata : void 0
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.tenant !== "") {
      obj.tenant = message.tenant;
    }
    if (message.message !== void 0) {
      obj.message = Message.toJSON(message.message);
    }
    if (message.configuration !== void 0) {
      obj.configuration = SendMessageConfiguration.toJSON(message.configuration);
    }
    if (message.metadata !== void 0) {
      obj.metadata = message.metadata;
    }
    return obj;
  }
};
var SendMessageResponse = {
  fromJSON(object) {
    return {
      payload: isSet(object.task) ? { $case: "task", value: Task.fromJSON(object.task) } : isSet(object.message) ? { $case: "message", value: Message.fromJSON(object.message) } : void 0
    };
  },
  toJSON(message) {
    const obj = {};
    if (message.payload?.$case === "task") {
      obj.task = Task.toJSON(message.payload.value);
    } else if (message.payload?.$case === "message") {
      obj.message = Message.toJSON(message.payload.value);
    }
    return obj;
  }
};
function bytesFromBase64(b64) {
  return Uint8Array.from(globalThis.Buffer.from(b64, "base64"));
}
function base64FromBytes(arr) {
  return globalThis.Buffer.from(arr).toString("base64");
}
function isObject(value) {
  return typeof value === "object" && value !== null;
}
function isSet(value) {
  return value !== null && value !== void 0;
}
var DEFAULT_MAX_SSE_EVENT_SIZE_BYTES = 4 * 1024 * 1024;

// packages/hub/src/query.ts
var DEFAULT_OVERVIEW_SESSIONS = 10;
var DEFAULT_SEARCH_SESSIONS = 5;
var ABSOLUTE_MAX_SESSIONS = 50;
var DEFAULT_OVERVIEW_EXCERPTS = 1;
var DEFAULT_SEARCH_EXCERPTS = 2;
var ABSOLUTE_MAX_EXCERPTS = 10;
var DEFAULT_OVERVIEW_CHARACTERS = 6e3;
var DEFAULT_SEARCH_CHARACTERS = 8e3;
var MAX_OVERVIEW_EXCERPT_CHARACTERS = 300;
var MAX_SEARCH_EXCERPT_CHARACTERS = 800;
var MIN_CHARACTERS = 1e3;
var ABSOLUTE_MAX_CHARACTERS = 4e4;
var INACTIVITY_WINDOW_MS = 5 * 60 * 1e3;
var STOP_WORDS = /* @__PURE__ */ new Set([
  "what",
  "which",
  "session",
  "sessions",
  "going",
  "attention",
  "other",
  "needs",
  "need",
  "does",
  "anything",
  "any",
  "status",
  "currently",
  "my",
  "me",
  "our",
  "we",
  "please",
  "tell",
  "s",
  "re",
  "in",
  "up",
  "about",
  "now",
  "today",
  "this",
  "that",
  "the",
  "work",
  "working",
  "doing",
  "happening",
  "with",
  "is",
  "are",
  "was",
  "be",
  "and",
  "of",
  "to",
  "from",
  "on",
  "for",
  "how"
]);
function resolveQueryMode(query, explicit) {
  if (explicit) {
    return explicit;
  }
  return tokenize(query).length === 0 ? "overview" : "search";
}
function queryActiveSessions(store, request, now) {
  const mode = resolveQueryMode(request.query, request.mode);
  const defaultSessions = mode === "overview" ? DEFAULT_OVERVIEW_SESSIONS : DEFAULT_SEARCH_SESSIONS;
  const maxSessions = clamp(request.maxSessions ?? defaultSessions, 1, ABSOLUTE_MAX_SESSIONS);
  const defaultExcerpts = mode === "overview" ? DEFAULT_OVERVIEW_EXCERPTS : DEFAULT_SEARCH_EXCERPTS;
  const defaultCharacters = mode === "overview" ? DEFAULT_OVERVIEW_CHARACTERS : DEFAULT_SEARCH_CHARACTERS;
  const maxExcerptsPerSession = clamp(request.maxExcerptsPerSession ?? defaultExcerpts, 1, ABSOLUTE_MAX_EXCERPTS);
  const maxCharacters = clamp(request.maxCharacters ?? defaultCharacters, MIN_CHARACTERS, ABSOLUTE_MAX_CHARACTERS);
  const candidateLimit = request.sessionIds ? request.sessionIds.length : store.countSessions();
  const filters = { limit: candidateLimit };
  if (request.excludeSessionId !== void 0) {
    filters.excludeSessionId = request.excludeSessionId;
  }
  if (request.cwd !== void 0) {
    filters.cwd = request.cwd;
  }
  if (request.sessionIds && request.sessionIds.length > 0) {
    filters.sessionIds = request.sessionIds;
  }
  const rows = store.listSessionRows(filters);
  const tokens = tokenize(request.query);
  const ftsQuery = mode === "search" ? buildFtsQuery(tokens) : void 0;
  const projections = [];
  for (const row of rows) {
    const projectionOptions = {
      mode,
      now,
      maxExcerpts: maxExcerptsPerSession
    };
    if (ftsQuery !== void 0) {
      projectionOptions.ftsQuery = ftsQuery;
    }
    const projection = buildSessionProjection(store, row, projectionOptions);
    if (projection) {
      projections.push(projection);
    }
  }
  const ordered = (mode === "search" ? sortSearchProjections(projections) : sortOverviewProjections(projections)).slice(0, maxSessions);
  const response = { mode, sessions: [], truncated: false };
  for (const projection of ordered) {
    const base = { ...projection.base, excerpts: [] };
    if (!fitsWithNewSession(response, base, maxCharacters)) {
      response.truncated = true;
      break;
    }
    response.sessions.push(base);
    const index = response.sessions.length - 1;
    for (const excerpt of projection.excerptCandidates) {
      if (response.sessions[index].excerpts.length >= projection.maxExcerpts) {
        break;
      }
      const nextSession = {
        ...response.sessions[index],
        excerpts: [...response.sessions[index].excerpts, excerpt]
      };
      if (!fitsWithReplacedSession(response, index, nextSession, maxCharacters)) {
        response.truncated = true;
        return response;
      }
      response.sessions[index] = nextSession;
    }
  }
  if (!fitsBudget(response, maxCharacters)) {
    response.truncated = true;
    while (!fitsBudget(response, maxCharacters) && response.sessions.length) {
      response.sessions.pop();
    }
  }
  return response;
}
function fitsBudget(response, maxCharacters) {
  return JSON.stringify(response).length <= maxCharacters;
}
function buildSessionProjection(store, row, options) {
  const recentEvents = store.recentEvents(row.id, options.maxExcerpts * 4);
  const toolStates = store.latestToolStates(row.id);
  const { signals, severity } = computeSignals(row, recentEvents, toolStates, options.now);
  const base = {
    sessionId: row.id,
    metadata: row.metadata,
    lastActivityAt: row.lastActivityAt,
    transcriptCompleteness: row.completeness,
    signals
  };
  if (options.mode === "search") {
    const searchHits = store.searchEvents(row.id, options.ftsQuery, options.maxExcerpts);
    if (!searchHits.length) {
      return void 0;
    }
    const excerptCandidates = buildSearchExcerpts(searchHits, options.maxExcerpts);
    return {
      base,
      excerptCandidates,
      severity,
      lastActivityAt: row.lastActivityAt,
      searchScore: searchHits[0].score,
      maxExcerpts: options.maxExcerpts
    };
  }
  const overviewExcerpts = buildOverviewExcerpts(recentEvents, toolStates, options.maxExcerpts);
  return {
    base,
    excerptCandidates: overviewExcerpts,
    severity,
    lastActivityAt: row.lastActivityAt,
    maxExcerpts: options.maxExcerpts
  };
}
function buildOverviewExcerpts(events, toolStates, limit) {
  const userEvents = events.filter((event) => event.payload.type === "message.user");
  const assistantEvents = events.filter((event) => event.payload.type === "message.assistant");
  const messageEvents = userEvents.length > 0 ? userEvents : assistantEvents.slice(-1);
  const selected = messageEvents.slice(-limit).map((event) => ({
    eventId: event.eventId,
    kind: event.payload.type,
    text: truncateText(event.payload.type === "message.assistant" || event.payload.type === "message.user" ? event.payload.text : "", MAX_OVERVIEW_EXCERPT_CHARACTERS),
    timestamp: event.timestamp
  }));
  if (selected.length) {
    return selected;
  }
  if (toolStates.length) {
    const fallbackTimestamp = events.at(-1)?.timestamp ?? Date.now();
    return toolStates.slice(0, limit).map((tool) => ({
      eventId: `${tool.toolCallId}:${tool.status}`,
      kind: "tool.activity",
      text: `Tool ${tool.toolName} ${tool.status}`,
      timestamp: fallbackTimestamp
    }));
  }
  return [];
}
function buildSearchExcerpts(searchHits, limit) {
  return searchHits.slice(0, limit).map((hit) => ({
    eventId: hit.eventId,
    kind: hit.kind,
    text: truncateText(hit.text, MAX_SEARCH_EXCERPT_CHARACTERS),
    timestamp: hit.timestamp,
    score: hit.score
  }));
}
function truncateText(text, maxCharacters) {
  if (text.length <= maxCharacters) return text;
  return `${text.slice(0, maxCharacters - 1)}\u2026`;
}
function computeSignals(row, events, toolStates, now) {
  const signals = [];
  let severity = 2;
  const assistantEvent = [...events].reverse().find((event) => event.payload.type === "message.assistant");
  if (assistantEvent && assistantEvent.payload.type === "message.assistant" && assistantEvent.payload.stopStatus === "error") {
    signals.push("assistant_error");
    severity = 0;
  }
  for (const tool of toolStates) {
    if (tool.status === "failed") {
      signals.push(`tool_failed:${tool.toolName}`);
      severity = 0;
    } else if (tool.status === "running") {
      signals.push(`tool_running:${tool.toolName}`);
      severity = Math.min(severity, 1);
    }
  }
  if (now - row.lastActivityAt > INACTIVITY_WINDOW_MS) {
    signals.push("inactive");
  }
  if (row.completeness === "truncated") {
    signals.push("transcript_truncated");
  }
  return { signals, severity };
}
function sortOverviewProjections(projections) {
  return projections.sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity - b.severity;
    }
    return b.lastActivityAt - a.lastActivityAt;
  });
}
function sortSearchProjections(projections) {
  return projections.filter((projection) => projection.searchScore !== void 0).sort((a, b) => {
    if (a.searchScore !== b.searchScore) {
      return a.searchScore - b.searchScore;
    }
    return b.lastActivityAt - a.lastActivityAt;
  });
}
function fitsWithNewSession(response, session, maxCharacters) {
  const candidate = { ...response, sessions: [...response.sessions, session] };
  return fitsBudget(candidate, maxCharacters);
}
function fitsWithReplacedSession(response, index, session, maxCharacters) {
  const sessions = response.sessions.slice();
  sessions[index] = session;
  return fitsBudget({ ...response, sessions }, maxCharacters);
}
function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
function tokenize(query) {
  return (query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((token) => !STOP_WORDS.has(token));
}
function buildFtsQuery(tokens) {
  if (!tokens.length) {
    return void 0;
  }
  return tokens.map((token) => `"${token}"*`).join(" OR ");
}

// packages/hub/src/coordination/agent-card.ts
function buildCoordinatorAgentCard(baseUrl, providers) {
  const security = [{ schemes: { sessionBearer: { list: [] } } }];
  const skills = [{ id: "route-active-session", name: "Route work to an active local agent session", description: "Queues an attributed task for one explicitly selected delivery-capable local session.", tags: ["local", "session", "delegation"], examples: ["Ask session <id> to inspect the failing test"], inputModes: ["text/plain", "application/json"], outputModes: ["text/plain", "application/json"], securityRequirements: security }];
  if (providers.length) skills.push({ id: "start-managed-worker", name: "Start a managed local agent worker", description: "Starts a worker through one explicitly named installed provider.", tags: ["local", "worker", "delegation"], examples: ["Start a worker in /workspace/repo to run tests"], inputModes: ["text/plain", "application/json"], outputModes: ["text/plain", "application/json"], securityRequirements: security });
  return { name: "Local Agent Coordinator", description: "Routes ephemeral tasks to explicitly selected local agent sessions or managed workers.", supportedInterfaces: [{ url: baseUrl, protocolBinding: "HTTP+JSON", tenant: "", protocolVersion: A2A_VERSION }], provider: void 0, version: "0.1.0", capabilities: { streaming: false, pushNotifications: false, extendedAgentCard: false, extensions: [{ uri: LOCAL_COORDINATION_EXTENSION, description: "Selects one local session or managed-worker target.", required: true, params: void 0 }] }, securitySchemes: { sessionBearer: { scheme: { $case: "httpAuthSecurityScheme", value: { description: "Ephemeral per-session task capability", scheme: "Bearer", bearerFormat: "opaque-256-bit" } } } }, securityRequirements: security, defaultInputModes: ["text/plain", "application/json"], defaultOutputModes: ["text/plain", "application/json"], skills, signatures: [] };
}

// packages/hub/src/coordination/errors.ts
var CoordinationError = class extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = "CoordinationError";
  }
};

// packages/hub/src/coordination/content.ts
var MAX_PART_BYTES = 65536;
var MAX_TASK_CONTENT_BYTES = 1048576;
function partBytes(part) {
  return Buffer.byteLength(part.kind === "text" ? part.text : JSON.stringify(part.data), "utf8");
}
function validateMessage(message) {
  if (!message.messageId || message.messageId.length > 128 || message.parts.length === 0 || message.parts.length > 100) {
    throw new CoordinationError("UNSUPPORTED_CONTENT", "Message shape is invalid", 400);
  }
  let total = 0;
  for (const part of message.parts) {
    if (part.kind === "text" && part.mediaType !== "text/plain" || part.kind === "data" && (part.mediaType !== "application/json" || !isJsonValue(part.data))) {
      throw new CoordinationError("UNSUPPORTED_CONTENT", "Message content is unsupported", 400);
    }
    const size = partBytes(part);
    if (size > MAX_PART_BYTES) throw new CoordinationError("TASK_CONTENT_LIMIT", "A message part exceeds 64 KiB", 413);
    total += size;
  }
  return total;
}
function isJsonValue(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return typeof value === "object" && Object.values(value).every(isJsonValue);
}

// packages/hub/src/coordination/a2a-mapper.ts
function parseA2ASendMessage(req, extensions) {
  const m = req.message;
  if (!m || m.role !== Role.ROLE_USER || !m.messageId) throw new CoordinationError("UNSUPPORTED_CONTENT", "Message is invalid", 400);
  if (!extensions.includes(LOCAL_COORDINATION_EXTENSION) || !m.extensions.includes(LOCAL_COORDINATION_EXTENSION)) throw new CoordinationError("INVALID_ROUTING_EXTENSION", "Required coordination extension is missing", 400);
  let target;
  const parts = [];
  for (const p of m.parts) {
    if (p.content?.$case === "data" && p.content.value?.kind === "coordination.target") {
      if (target) throw new CoordinationError("INVALID_ROUTING_EXTENSION", "Exactly one target is required", 400);
      target = p.content.value.target;
      continue;
    }
    if (p.content?.$case === "text") parts.push({ kind: "text", text: p.content.value, mediaType: "text/plain" });
    else if (p.content?.$case === "data" && isJsonValue(p.content.value)) parts.push({ kind: "data", data: p.content.value, mediaType: "application/json" });
    else throw new CoordinationError("UNSUPPORTED_CONTENT", "Content type is unsupported", 400);
  }
  if (!m.taskId && !target) throw new CoordinationError("INVALID_ROUTING_EXTENSION", "Exactly one target is required", 400);
  const message = { messageId: m.messageId, role: "source", parts, extensions: m.extensions };
  validateMessage(message);
  const deadlineText = req.metadata?.[LOCAL_COORDINATION_EXTENSION]?.deadline;
  const deadlineAt = typeof deadlineText === "string" ? Date.parse(deadlineText) : void 0;
  if (deadlineText !== void 0 && !Number.isFinite(deadlineAt)) throw new CoordinationError("UNSUPPORTED_CONTENT", "Deadline must be ISO 8601", 400);
  return { ...m.taskId ? { taskId: m.taskId } : {}, ...m.contextId ? { contextId: m.contextId } : {}, ...target ? { target } : {}, message, returnImmediately: req.configuration?.returnImmediately ?? false, ...req.configuration?.historyLength !== void 0 ? { historyLength: req.configuration.historyLength } : {}, ...deadlineAt !== void 0 ? { deadlineAt } : {} };
}
var states = { submitted: TaskState.TASK_STATE_SUBMITTED, working: TaskState.TASK_STATE_WORKING, completed: TaskState.TASK_STATE_COMPLETED, failed: TaskState.TASK_STATE_FAILED, canceled: TaskState.TASK_STATE_CANCELED, rejected: TaskState.TASK_STATE_REJECTED };
function wireMessage(task, m) {
  return { messageId: m.messageId, contextId: task.contextId, taskId: task.id, role: m.role === "source" ? Role.ROLE_USER : Role.ROLE_AGENT, parts: m.parts.map((p) => ({ content: p.kind === "text" ? { $case: "text", value: p.text } : { $case: "data", value: p.data }, metadata: void 0, filename: "", mediaType: p.mediaType })), metadata: void 0, extensions: m.extensions, referenceTaskIds: [] };
}
function toA2ATask(task, history, historyLength) {
  const selected = historyLength === void 0 ? history : history.slice(-historyLength), messages = selected.map((m) => wireMessage(task, m));
  const latest = [...history].reverse().find((m) => m.role === "target");
  const terminalMessages = { TARGET_REJECTED: "Target cannot accept delegated work", TARGET_UNAVAILABLE: "Target became unavailable", DELIVERY_LOST: "Delivery was lost", DEADLINE_EXCEEDED: "Task deadline exceeded", WORKER_PROVIDER_NOT_FOUND: "Worker provider is unavailable", WORKER_START_FAILED: "Worker could not be started" };
  const statusMessage = latest ? wireMessage(task, latest) : task.terminalCode ? wireMessage(task, { messageId: `status-${task.id}`, role: "target", parts: [{ kind: "text", text: terminalMessages[task.terminalCode] ?? "Task failed", mediaType: "text/plain" }], extensions: [] }) : void 0;
  return { id: task.id, contextId: task.contextId, status: { state: states[task.state], message: statusMessage, timestamp: new Date(task.updatedAt).toISOString() }, artifacts: [], history: messages, metadata: { cancellationRequested: task.cancellationRequested, deadline: new Date(task.deadlineAt).toISOString(), ...task.terminalCode ? { terminalCode: task.terminalCode } : {} } };
}
function parseA2AListFilters(url) {
  const number = (name, min, max, def) => {
    const raw = url.searchParams.get(name);
    if (raw === null) return def;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min || n > max) throw new CoordinationError("UNSUPPORTED_CONTENT", `${name} is invalid`, 400);
    return n;
  };
  const after = url.searchParams.get("statusTimestampAfter"), status = url.searchParams.get("status");
  let state;
  if (status) {
    const map = { [TaskState.TASK_STATE_SUBMITTED]: "submitted", [TaskState.TASK_STATE_WORKING]: "working", [TaskState.TASK_STATE_COMPLETED]: "completed", [TaskState.TASK_STATE_FAILED]: "failed", [TaskState.TASK_STATE_CANCELED]: "canceled", [TaskState.TASK_STATE_REJECTED]: "rejected" };
    state = map[taskStateFromJSON(status)];
    if (!state) throw new CoordinationError("UNSUPPORTED_CONTENT", "status is invalid", 400);
  }
  const timestamp = after === null ? void 0 : Date.parse(after);
  if (after !== null && !Number.isFinite(timestamp)) throw new CoordinationError("UNSUPPORTED_CONTENT", "statusTimestampAfter must be ISO 8601", 400);
  return { ...url.searchParams.get("contextId") ? { contextId: url.searchParams.get("contextId") } : {}, ...state ? { state } : {}, pageSize: number("pageSize", 1, 100, 50), ...url.searchParams.get("pageToken") ? { pageToken: url.searchParams.get("pageToken") } : {}, ...number("historyLength", 0, 100) !== void 0 ? { historyLength: number("historyLength", 0, 100) } : {}, ...timestamp !== void 0 ? { statusTimestampAfter: timestamp } : {} };
}
function toA2AError(e, metadata) {
  let status = e.status, name = "INVALID_ARGUMENT", reason = e.code;
  if (e.code === "TASK_NOT_FOUND") {
    status = 404;
    name = "NOT_FOUND";
  } else if (e.code === "TASK_NOT_CANCELABLE") name = "FAILED_PRECONDITION";
  else if (e.code === "INVALID_ROUTING_EXTENSION") {
    name = "FAILED_PRECONDITION";
    reason = "EXTENSION_SUPPORT_REQUIRED";
  } else if (["TASK_CONTENT_LIMIT", "TASK_COUNT_LIMIT", "DATABASE_LIMIT"].includes(e.code)) {
    name = "RESOURCE_EXHAUSTED";
    reason = "RESOURCE_LIMIT";
  } else if (e.code === "UNSUPPORTED_CONTENT") reason = "CONTENT_TYPE_NOT_SUPPORTED";
  return { status, body: { error: { code: status, status: name, message: e.message, details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason, domain: "a2a-protocol.org", ...metadata ? { metadata } : {} }] } } };
}

// packages/hub/src/http-utils.ts
import { timingSafeEqual as timingSafeEqual2 } from "node:crypto";

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/_guard.mjs
function IsGuardInterface(value) {
  return guard_exports.IsObject(value) && guard_exports.HasPropertyKey(value, "check") && guard_exports.HasPropertyKey(value, "errors") && guard_exports.IsFunction(value.check) && guard_exports.IsFunction(value.errors);
}
function IsGuard2(value) {
  return guard_exports.HasPropertyKey(value, "~guard") && IsGuardInterface(value["~guard"]);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/_refine.mjs
function IsRefine2(value) {
  return guard_exports.HasPropertyKey(value, "~refine") && guard_exports.IsArray(value["~refine"]) && guard_exports.Every(value["~refine"], 0, (value2) => guard_exports.IsObject(value2) && guard_exports.HasPropertyKey(value2, "check") && guard_exports.HasPropertyKey(value2, "error") && guard_exports.IsFunction(value2.check) && guard_exports.IsFunction(value2.error));
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/schema.mjs
function IsSchemaObject(value) {
  return guard_exports.IsObject(value) && !guard_exports.IsArray(value);
}
function IsBooleanSchema(value) {
  return guard_exports.IsBoolean(value);
}
function IsSchema2(value) {
  return IsSchemaObject(value) || IsBooleanSchema(value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/additionalItems.mjs
function IsAdditionalItems(schema) {
  return guard_exports.HasPropertyKey(schema, "additionalItems") && IsSchema2(schema.additionalItems);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/additionalProperties.mjs
function IsAdditionalProperties(schema) {
  return guard_exports.HasPropertyKey(schema, "additionalProperties") && IsSchema2(schema.additionalProperties);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/allOf.mjs
function IsAllOf(schema) {
  return guard_exports.HasPropertyKey(schema, "allOf") && guard_exports.IsArray(schema.allOf) && schema.allOf.every((value) => IsSchema2(value));
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/anchor.mjs
function IsAnchor(schema) {
  return guard_exports.HasPropertyKey(schema, "$anchor") && guard_exports.IsString(schema.$anchor);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/anyOf.mjs
function IsAnyOf(schema) {
  return guard_exports.HasPropertyKey(schema, "anyOf") && guard_exports.IsArray(schema.anyOf) && schema.anyOf.every((value) => IsSchema2(value));
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/const.mjs
function IsConst(value) {
  return guard_exports.HasPropertyKey(value, "const");
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/contains.mjs
function IsContains(schema) {
  return guard_exports.HasPropertyKey(schema, "contains") && IsSchema2(schema.contains);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/default.mjs
function IsDefault(schema) {
  return guard_exports.HasPropertyKey(schema, "default");
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/dependencies.mjs
function IsDependencies(schema) {
  return guard_exports.HasPropertyKey(schema, "dependencies") && guard_exports.IsObject(schema.dependencies) && Object.values(schema.dependencies).every((value) => IsSchema2(value) || guard_exports.IsArray(value) && value.every((value2) => guard_exports.IsString(value2)));
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/dependentRequired.mjs
function IsDependentRequired(schema) {
  return guard_exports.HasPropertyKey(schema, "dependentRequired") && guard_exports.IsObject(schema.dependentRequired) && Object.values(schema.dependentRequired).every((value) => guard_exports.IsArray(value) && value.every((value2) => guard_exports.IsString(value2)));
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/dependentSchemas.mjs
function IsDependentSchemas(schema) {
  return guard_exports.HasPropertyKey(schema, "dependentSchemas") && guard_exports.IsObject(schema.dependentSchemas) && Object.values(schema.dependentSchemas).every((value) => IsSchema2(value));
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/dynamicAnchor.mjs
function IsDynamicAnchor(schema) {
  return guard_exports.HasPropertyKey(schema, "$dynamicAnchor") && guard_exports.IsString(schema.$dynamicAnchor);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/dynamicRef.mjs
function IsDynamicRef(schema) {
  return guard_exports.HasPropertyKey(schema, "$dynamicRef") && guard_exports.IsString(schema.$dynamicRef);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/else.mjs
function IsElse(schema) {
  return guard_exports.HasPropertyKey(schema, "else") && IsSchema2(schema.else);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/enum.mjs
function IsEnum2(schema) {
  return guard_exports.HasPropertyKey(schema, "enum") && guard_exports.IsArray(schema.enum);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/exclusiveMaximum.mjs
function IsExclusiveMaximum(schema) {
  return guard_exports.HasPropertyKey(schema, "exclusiveMaximum") && (guard_exports.IsNumber(schema.exclusiveMaximum) || guard_exports.IsBigInt(schema.exclusiveMaximum));
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/exclusiveMinimum.mjs
function IsExclusiveMinimum(schema) {
  return guard_exports.HasPropertyKey(schema, "exclusiveMinimum") && (guard_exports.IsNumber(schema.exclusiveMinimum) || guard_exports.IsBigInt(schema.exclusiveMinimum));
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/format.mjs
function IsFormat(schema) {
  return guard_exports.HasPropertyKey(schema, "format") && guard_exports.IsString(schema.format);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/id.mjs
function IsId(schema) {
  return guard_exports.HasPropertyKey(schema, "$id") && guard_exports.IsString(schema.$id);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/if.mjs
function IsIf(schema) {
  return guard_exports.HasPropertyKey(schema, "if") && IsSchema2(schema.if);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/items.mjs
function IsItems(schema) {
  return guard_exports.HasPropertyKey(schema, "items") && (IsSchema2(schema.items) || guard_exports.IsArray(schema.items) && schema.items.every((value) => {
    return IsSchema2(value);
  }));
}
function IsItemsSized(schema) {
  return IsItems(schema) && guard_exports.IsArray(schema.items);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/maximum.mjs
function IsMaximum(schema) {
  return guard_exports.HasPropertyKey(schema, "maximum") && (guard_exports.IsNumber(schema.maximum) || guard_exports.IsBigInt(schema.maximum));
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/maxContains.mjs
function IsMaxContains(schema) {
  return guard_exports.HasPropertyKey(schema, "maxContains") && guard_exports.IsNumber(schema.maxContains);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/maxItems.mjs
function IsMaxItems(schema) {
  return guard_exports.HasPropertyKey(schema, "maxItems") && guard_exports.IsNumber(schema.maxItems);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/maxLength.mjs
function IsMaxLength3(schema) {
  return guard_exports.HasPropertyKey(schema, "maxLength") && guard_exports.IsNumber(schema.maxLength);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/maxProperties.mjs
function IsMaxProperties(schema) {
  return guard_exports.HasPropertyKey(schema, "maxProperties") && guard_exports.IsNumber(schema.maxProperties);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/minimum.mjs
function IsMinimum(schema) {
  return guard_exports.HasPropertyKey(schema, "minimum") && (guard_exports.IsNumber(schema.minimum) || guard_exports.IsBigInt(schema.minimum));
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/minContains.mjs
function IsMinContains(schema) {
  return guard_exports.HasPropertyKey(schema, "minContains") && guard_exports.IsNumber(schema.minContains);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/minItems.mjs
function IsMinItems(schema) {
  return guard_exports.HasPropertyKey(schema, "minItems") && guard_exports.IsNumber(schema.minItems);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/minLength.mjs
function IsMinLength3(schema) {
  return guard_exports.HasPropertyKey(schema, "minLength") && guard_exports.IsNumber(schema.minLength);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/minProperties.mjs
function IsMinProperties(schema) {
  return guard_exports.HasPropertyKey(schema, "minProperties") && guard_exports.IsNumber(schema.minProperties);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/multipleOf.mjs
function IsMultipleOf2(schema) {
  return guard_exports.HasPropertyKey(schema, "multipleOf") && (guard_exports.IsNumber(schema.multipleOf) || guard_exports.IsBigInt(schema.multipleOf));
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/not.mjs
function IsNot(schema) {
  return guard_exports.HasPropertyKey(schema, "not") && IsSchema2(schema.not);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/oneOf.mjs
function IsOneOf(schema) {
  return guard_exports.HasPropertyKey(schema, "oneOf") && guard_exports.IsArray(schema.oneOf) && schema.oneOf.every((value) => IsSchema2(value));
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/pattern.mjs
function IsPattern(schema) {
  return guard_exports.HasPropertyKey(schema, "pattern") && (guard_exports.IsString(schema.pattern) || schema.pattern instanceof RegExp);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/patternProperties.mjs
function IsPatternProperties(schema) {
  return guard_exports.HasPropertyKey(schema, "patternProperties") && guard_exports.IsObject(schema.patternProperties) && Object.values(schema.patternProperties).every((value) => IsSchema2(value));
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/prefixItems.mjs
function IsPrefixItems(schema) {
  return guard_exports.HasPropertyKey(schema, "prefixItems") && guard_exports.IsArray(schema.prefixItems) && schema.prefixItems.every((schema2) => IsSchema2(schema2));
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/properties.mjs
function IsProperties(schema) {
  return guard_exports.HasPropertyKey(schema, "properties") && guard_exports.IsObject(schema.properties) && Object.values(schema.properties).every((value) => IsSchema2(value));
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/propertyNames.mjs
function IsPropertyNames(schema) {
  return guard_exports.HasPropertyKey(schema, "propertyNames") && (guard_exports.IsObject(schema.propertyNames) || IsSchema2(schema.propertyNames));
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/recursiveAnchor.mjs
function IsRecursiveAnchor(schema) {
  return guard_exports.HasPropertyKey(schema, "$recursiveAnchor") && guard_exports.IsBoolean(schema.$recursiveAnchor);
}
function IsRecursiveAnchorTrue(schema) {
  return IsRecursiveAnchor(schema) && guard_exports.IsEqual(schema.$recursiveAnchor, true);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/recursiveRef.mjs
function IsRecursiveRef(schema) {
  return guard_exports.HasPropertyKey(schema, "$recursiveRef") && guard_exports.IsString(schema.$recursiveRef);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/ref.mjs
function IsRef2(schema) {
  return guard_exports.HasPropertyKey(schema, "$ref") && guard_exports.IsString(schema.$ref);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/required.mjs
function IsRequired(schema) {
  return guard_exports.HasPropertyKey(schema, "required") && guard_exports.IsArray(schema.required) && schema.required.every((value) => guard_exports.IsString(value));
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/then.mjs
function IsThen(schema) {
  return guard_exports.HasPropertyKey(schema, "then") && IsSchema2(schema.then);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/type.mjs
function IsType(schema) {
  return guard_exports.HasPropertyKey(schema, "type") && (guard_exports.IsString(schema.type) || guard_exports.IsArray(schema.type) && schema.type.every((value) => guard_exports.IsString(value)));
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/uniqueItems.mjs
function IsUniqueItems(schema) {
  return guard_exports.HasPropertyKey(schema, "uniqueItems") && guard_exports.IsBoolean(schema.uniqueItems);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/unevaluatedItems.mjs
function IsUnevaluatedItems(schema) {
  return guard_exports.HasPropertyKey(schema, "unevaluatedItems") && IsSchema2(schema.unevaluatedItems);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/types/unevaluatedProperties.mjs
function IsUnevaluatedProperties(schema) {
  return guard_exports.HasPropertyKey(schema, "unevaluatedProperties") && IsSchema2(schema.unevaluatedProperties);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/_context.mjs
var CheckContext = class {
  constructor() {
    const indices = /* @__PURE__ */ new Set();
    const keys = /* @__PURE__ */ new Set();
    this.stack = [{ indices, keys }];
  }
  // ----------------------------------------------------------------
  // Stack
  // ----------------------------------------------------------------
  Push() {
    const indices = /* @__PURE__ */ new Set();
    const keys = /* @__PURE__ */ new Set();
    this.stack.push({ indices, keys });
    return true;
  }
  Pop() {
    this.stack.pop();
    return true;
  }
  // ----------------------------------------------------------------
  // Top
  // ----------------------------------------------------------------
  AddIndex(index) {
    this.GetIndices().add(index);
    return true;
  }
  AddKey(key) {
    this.GetKeys().add(key);
    return true;
  }
  GetIndices() {
    const top = this.stack[this.stack.length - 1];
    return top.indices;
  }
  GetKeys() {
    const top = this.stack[this.stack.length - 1];
    return top.keys;
  }
  Merge(results) {
    for (const context of results) {
      context.GetIndices().forEach((value) => this.GetIndices().add(value));
      context.GetKeys().forEach((value) => this.GetKeys().add(value));
    }
    return true;
  }
};
var ErrorContext = class extends CheckContext {
  constructor(callback) {
    super();
    this.callback = callback;
  }
  AddError(error) {
    this.callback(error);
    return false;
  }
};
var AccumulatedErrorContext = class extends ErrorContext {
  constructor() {
    super((error) => this.errors.push(error));
    this.errors = [];
  }
  AddError(error) {
    this.errors.push(error);
    return false;
  }
  GetErrors() {
    return this.errors;
  }
};

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/_guard.mjs
function CheckGuard(_stack, _context, schema, value) {
  return schema["~guard"].check(value);
}
function ErrorGuard(_stack, context, schemaPath, instancePath, schema, value) {
  return schema["~guard"].check(value) || context.AddError({
    keyword: "~guard",
    schemaPath,
    instancePath,
    params: { errors: schema["~guard"].errors(value) }
  });
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/_refine.mjs
function CheckRefine(_stack, _context, schema, value) {
  return guard_exports.Every(schema["~refine"], 0, (refinement, _) => refinement.check(value));
}
function ErrorRefine(_stack, context, schemaPath, instancePath, schema, value) {
  return guard_exports.EveryAll(schema["~refine"], 0, (refinement, index) => {
    return refinement.check(value) || context.AddError({
      keyword: "~refine",
      schemaPath,
      instancePath,
      params: { index, message: refinement.error(value) }
    });
  });
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/additionalItems.mjs
function IsValid(schema) {
  return IsItems(schema) && guard_exports.IsArray(schema.items);
}
function CheckAdditionalItems(stack, context, schema, value) {
  if (!IsValid(schema))
    return true;
  const isAdditionalItems = value.every((item, index) => {
    return guard_exports.IsLessThan(index, schema.items.length) || CheckSchemaPushStack(stack, context, schema.additionalItems, item) && context.AddIndex(index);
  });
  return isAdditionalItems;
}
function ErrorAdditionalItems(stack, context, schemaPath, instancePath, schema, value) {
  if (!IsValid(schema))
    return true;
  const isAdditionalItems = value.every((item, index) => {
    const nextSchemaPath = `${schemaPath}/additionalItems`;
    const nextInstancePath = `${instancePath}/${index}`;
    return guard_exports.IsLessThan(index, schema.items.length) || ErrorSchemaPushStack(stack, context, nextSchemaPath, nextInstancePath, schema.additionalItems, item) && context.AddIndex(index);
  });
  return isAdditionalItems;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/additionalProperties.mjs
function GetPropertyKeyAsPattern(key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return `^${escaped}$`;
}
function GetPropertiesPattern(schema) {
  const patterns = [];
  if (IsPatternProperties(schema))
    patterns.push(...guard_exports.Keys(schema.patternProperties));
  if (IsProperties(schema))
    patterns.push(...guard_exports.Keys(schema.properties).map(GetPropertyKeyAsPattern));
  return guard_exports.IsEqual(patterns.length, 0) ? "(?!)" : `(${patterns.join("|")})`;
}
function CheckAdditionalProperties(stack, context, schema, value) {
  const regexp = new RegExp(GetPropertiesPattern(schema));
  const isAdditionalProperties = guard_exports.Every(guard_exports.Keys(value), 0, (key, _index) => {
    return regexp.test(key) || CheckSchemaPushStack(stack, context, schema.additionalProperties, value[key]) && context.AddKey(key);
  });
  return isAdditionalProperties;
}
function ErrorAdditionalProperties(stack, context, schemaPath, instancePath, schema, value) {
  const regexp = new RegExp(GetPropertiesPattern(schema));
  const additionalProperties = [];
  const isAdditionalProperties = guard_exports.EveryAll(guard_exports.Keys(value), 0, (key, _index) => {
    const nextSchemaPath = `${schemaPath}/additionalProperties`;
    const nextInstancePath = `${instancePath}/${key}`;
    const nextContext = new AccumulatedErrorContext();
    const isAdditionalProperty = regexp.test(key) || ErrorSchemaPushStack(stack, nextContext, nextSchemaPath, nextInstancePath, schema.additionalProperties, value[key]) && context.AddKey(key);
    if (!isAdditionalProperty)
      additionalProperties.push(key);
    return isAdditionalProperty;
  });
  return isAdditionalProperties || context.AddError({
    keyword: "additionalProperties",
    schemaPath,
    instancePath,
    params: { additionalProperties }
  });
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/allOf.mjs
function CheckAllOf(stack, context, schema, value) {
  const results = schema.allOf.reduce((result, schema2) => {
    const nextContext = new CheckContext();
    return CheckSchema(stack, nextContext, schema2, value) ? [...result, nextContext] : result;
  }, []);
  return guard_exports.IsEqual(results.length, schema.allOf.length) && context.Merge(results);
}
function ErrorAllOf(stack, context, schemaPath, instancePath, schema, value) {
  const failedContexts = [];
  const results = schema.allOf.reduce((result, schema2, index) => {
    const nextSchemaPath = `${schemaPath}/allOf/${index}`;
    const nextContext = new AccumulatedErrorContext();
    const isSchema = ErrorSchema(stack, nextContext, nextSchemaPath, instancePath, schema2, value);
    if (!isSchema)
      failedContexts.push(nextContext);
    return isSchema ? [...result, nextContext] : result;
  }, []);
  const isAllOf = guard_exports.IsEqual(results.length, schema.allOf.length) && context.Merge(results);
  if (!isAllOf)
    failedContexts.forEach((failed) => failed.GetErrors().forEach((error) => context.AddError(error)));
  return isAllOf;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/anyOf.mjs
function CheckAnyOf(stack, context, schema, value) {
  const results = schema.anyOf.reduce((result, schema2) => {
    const nextContext = new CheckContext();
    return CheckSchema(stack, nextContext, schema2, value) ? [...result, nextContext] : result;
  }, []);
  return guard_exports.IsGreaterThan(results.length, 0) && context.Merge(results);
}
function ErrorAnyOf(stack, context, schemaPath, instancePath, schema, value) {
  const failedContexts = [];
  const results = schema.anyOf.reduce((result, schema2, index) => {
    const nextContext = new AccumulatedErrorContext();
    const nextSchemaPath = `${schemaPath}/anyOf/${index}`;
    const isSchema = ErrorSchema(stack, nextContext, nextSchemaPath, instancePath, schema2, value);
    if (!isSchema)
      failedContexts.push(nextContext);
    return isSchema ? [...result, nextContext] : result;
  }, []);
  const isAnyOf = guard_exports.IsGreaterThan(results.length, 0) && context.Merge(results);
  if (!isAnyOf)
    failedContexts.forEach((failed) => failed.GetErrors().forEach((error) => context.AddError(error)));
  return isAnyOf || context.AddError({
    keyword: "anyOf",
    schemaPath,
    instancePath,
    params: {}
  });
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/boolean.mjs
function CheckBooleanSchema(_stack, _context, schema, _value) {
  return schema;
}
function ErrorBooleanSchema(stack, context, schemaPath, instancePath, schema, value) {
  return CheckBooleanSchema(stack, context, schema, value) || context.AddError({
    keyword: "boolean",
    schemaPath,
    instancePath,
    params: {}
  });
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/const.mjs
function CheckConst(_stack, _context, schema, value) {
  return guard_exports.IsValueLike(schema.const) ? guard_exports.IsEqual(value, schema.const) : guard_exports.IsDeepEqual(value, schema.const);
}
function ErrorConst(stack, context, schemaPath, instancePath, schema, value) {
  return CheckConst(stack, context, schema, value) || context.AddError({
    keyword: "const",
    schemaPath,
    instancePath,
    params: { allowedValue: schema.const }
  });
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/contains.mjs
function IsValid2(schema) {
  return !(IsMinContains(schema) && guard_exports.IsEqual(schema.minContains, 0));
}
function CheckContains(stack, context, schema, value) {
  if (!IsValid2(schema))
    return true;
  return !guard_exports.IsEqual(value.length, 0) && value.some((item) => CheckSchema(stack, context, schema.contains, item));
}
function ErrorContains(stack, context, schemaPath, instancePath, schema, value) {
  return CheckContains(stack, context, schema, value) || context.AddError({
    keyword: "contains",
    schemaPath,
    instancePath,
    params: { minContains: 1 }
  });
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/dependencies.mjs
function CheckDependencies(stack, context, schema, value) {
  const isLength = guard_exports.IsEqual(guard_exports.Keys(value).length, 0);
  const isEvery = guard_exports.Every(guard_exports.Entries(schema.dependencies), 0, ([key, schema2]) => {
    return !guard_exports.HasPropertyKey(value, key) || (guard_exports.IsArray(schema2) ? schema2.every((key2) => guard_exports.HasPropertyKey(value, key2)) : CheckSchema(stack, context, schema2, value));
  });
  return isLength || isEvery;
}
function ErrorDependencies(stack, context, schemaPath, instancePath, schema, value) {
  const isLength = guard_exports.IsEqual(guard_exports.Keys(value).length, 0);
  const isEvery = guard_exports.EveryAll(guard_exports.Entries(schema.dependencies), 0, ([key, schema2]) => {
    const nextSchemaPath = `${schemaPath}/dependencies/${key}`;
    return !guard_exports.HasPropertyKey(value, key) || (guard_exports.IsArray(schema2) ? schema2.every((dependency) => guard_exports.HasPropertyKey(value, dependency) || context.AddError({
      keyword: "dependencies",
      schemaPath,
      instancePath,
      params: { property: key, dependencies: schema2 }
    })) : ErrorSchema(stack, context, nextSchemaPath, instancePath, schema2, value));
  });
  return isLength || isEvery;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/dependentRequired.mjs
function CheckDependentRequired(_stack, _context, schema, value) {
  const isLength = guard_exports.IsEqual(guard_exports.Keys(value).length, 0);
  const isEvery = guard_exports.Every(guard_exports.Entries(schema.dependentRequired), 0, ([key, keys]) => {
    return !guard_exports.HasPropertyKey(value, key) || keys.every((key2) => guard_exports.HasPropertyKey(value, key2));
  });
  return isLength || isEvery;
}
function ErrorDependentRequired(_stack, context, schemaPath, instancePath, schema, value) {
  const isLength = guard_exports.IsEqual(guard_exports.Keys(value).length, 0);
  const isEveryEntry = guard_exports.EveryAll(guard_exports.Entries(schema.dependentRequired), 0, ([key, keys]) => {
    return !guard_exports.HasPropertyKey(value, key) || guard_exports.EveryAll(keys, 0, (dependency) => guard_exports.HasPropertyKey(value, dependency) || context.AddError({
      keyword: "dependentRequired",
      schemaPath,
      instancePath,
      params: { property: key, dependencies: keys }
    }));
  });
  return isLength || isEveryEntry;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/dependentSchemas.mjs
function CheckDependentSchemas(stack, context, schema, value) {
  const isLength = guard_exports.IsEqual(guard_exports.Keys(value).length, 0);
  const isEvery = guard_exports.Every(guard_exports.Entries(schema.dependentSchemas), 0, ([key, schema2]) => {
    return !guard_exports.HasPropertyKey(value, key) || CheckSchema(stack, context, schema2, value);
  });
  return isLength || isEvery;
}
function ErrorDependentSchemas(stack, context, schemaPath, instancePath, schema, value) {
  const isLength = guard_exports.IsEqual(guard_exports.Keys(value).length, 0);
  const isEvery = guard_exports.EveryAll(guard_exports.Entries(schema.dependentSchemas), 0, ([key, schema2]) => {
    const nextSchemaPath = `${schemaPath}/dependentSchemas/${key}`;
    return !guard_exports.HasPropertyKey(value, key) || ErrorSchema(stack, context, nextSchemaPath, instancePath, schema2, value);
  });
  return isLength || isEvery;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/dynamicRef.mjs
function CheckDynamicRef(stack, context, schema, value) {
  const target = stack.DynamicRef(schema) ?? false;
  return IsSchema2(target) && CheckSchema(stack, context, target, value);
}
function ErrorDynamicRef(stack, context, _schemaPath, instancePath, schema, value) {
  const target = stack.DynamicRef(schema) ?? false;
  return IsSchema2(target) && ErrorSchema(stack, context, "#", instancePath, target, value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/enum.mjs
function CheckEnum(_stack, _context, schema, value) {
  return schema.enum.some((option) => guard_exports.IsValueLike(option) ? guard_exports.IsEqual(value, option) : guard_exports.IsDeepEqual(value, option));
}
function ErrorEnum(stack, context, schemaPath, instancePath, schema, value) {
  return CheckEnum(stack, context, schema, value) || context.AddError({
    keyword: "enum",
    schemaPath,
    instancePath,
    params: { allowedValues: schema.enum }
  });
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/exclusiveMaximum.mjs
function CheckExclusiveMaximum(_stack, _context, schema, value) {
  return guard_exports.IsLessThan(value, schema.exclusiveMaximum);
}
function ErrorExclusiveMaximum(stack, context, schemaPath, instancePath, schema, value) {
  return CheckExclusiveMaximum(stack, context, schema, value) || context.AddError({
    keyword: "exclusiveMaximum",
    schemaPath,
    instancePath,
    params: { comparison: "<", limit: schema.exclusiveMaximum }
  });
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/exclusiveMinimum.mjs
function CheckExclusiveMinimum(_stack, _context, schema, value) {
  return guard_exports.IsGreaterThan(value, schema.exclusiveMinimum);
}
function ErrorExclusiveMinimum(stack, context, schemaPath, instancePath, schema, value) {
  return CheckExclusiveMinimum(stack, context, schema, value) || context.AddError({
    keyword: "exclusiveMinimum",
    schemaPath,
    instancePath,
    params: { comparison: ">", limit: schema.exclusiveMinimum }
  });
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/format/format.mjs
var format_exports = {};
__export(format_exports, {
  Clear: () => Clear,
  Entries: () => Entries2,
  Get: () => Get3,
  Has: () => Has,
  IsDate: () => IsDate2,
  IsDateTime: () => IsDateTime,
  IsDuration: () => IsDuration,
  IsEmail: () => IsEmail,
  IsHostname: () => IsHostname,
  IsIPv4: () => IsIPv4,
  IsIPv6: () => IsIPv6,
  IsIdnEmail: () => IsIdnEmail,
  IsIdnHostname: () => IsIdnHostname,
  IsIri: () => IsIri,
  IsIriReference: () => IsIriReference,
  IsJsonPointer: () => IsJsonPointer,
  IsJsonPointerUriFragment: () => IsJsonPointerUriFragment,
  IsRegex: () => IsRegex,
  IsRelativeJsonPointer: () => IsRelativeJsonPointer,
  IsTime: () => IsTime,
  IsUri: () => IsUri,
  IsUriReference: () => IsUriReference,
  IsUriTemplate: () => IsUriTemplate,
  IsUrl: () => IsUrl,
  IsUuid: () => IsUuid,
  Reset: () => Reset2,
  Set: () => Set3,
  Test: () => Test
});

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/format/date.mjs
var DAYS = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
var DATE = /^(\d\d\d\d)-(\d\d)-(\d\d)$/;
function IsLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
function IsDate2(value) {
  const matches = DATE.exec(value);
  if (!matches)
    return false;
  const year = +matches[1];
  const month = +matches[2];
  const day = +matches[3];
  return month >= 1 && month <= 12 && day >= 1 && day <= (month === 2 && IsLeapYear(year) ? 29 : DAYS[month]);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/format/time.mjs
var TIME = /^(\d\d):(\d\d):(\d\d(?:\.\d+)?)(?:Z|([+-])(\d\d):(\d\d))?$/i;
function IsTime(value, strictTimeZone = true) {
  const matches = TIME.exec(value);
  if (!matches)
    return false;
  const hr = +matches[1];
  const min = +matches[2];
  const sec = +matches[3];
  const tzSign = matches[4] === "-" ? -1 : 1;
  const tzH = +(matches[5] || 0);
  const tzM = +(matches[6] || 0);
  if (tzH > 23 || tzM > 59)
    return false;
  if (strictTimeZone && !matches[4] && value.toLowerCase().indexOf("z") === -1) {
    return false;
  }
  if (hr <= 23 && min <= 59 && sec < 60)
    return true;
  const utcMin = min - tzM * tzSign;
  const utcHr = hr - tzH * tzSign - (utcMin < 0 ? 1 : 0);
  return (utcHr === 23 || utcHr === -1) && (utcMin === 59 || utcMin === -1) && sec < 61;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/format/date_time.mjs
function IsDateTime(value, strictTimeZone = true) {
  const dateTime = value.split(/T/i);
  return dateTime.length === 2 && IsDate2(dateTime[0]) && IsTime(dateTime[1], strictTimeZone);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/format/duration.mjs
var Duration = /^P((\d+Y(\d+M(\d+D)?)?|\d+M(\d+D)?|\d+D)(T(\d+H(\d+M(\d+S)?)?|\d+M(\d+S)?|\d+S))?|T(\d+H(\d+M(\d+S)?)?|\d+M(\d+S)?|\d+S)|\d+W)$/;
function IsDuration(value) {
  return Duration.test(value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/format/email.mjs
var Email = /^(?!.*\.\.)[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i;
function IsEmail(value) {
  return Email.test(value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/format/_puny.mjs
var PUNYCODE_BASE = 36;
var PUNYCODE_TMIN = 1;
var PUNYCODE_TMAX = 26;
var PUNYCODE_SKEW = 38;
var PUNYCODE_DAMP = 700;
var PUNYCODE_INITIAL_BIAS = 72;
var PUNYCODE_INITIAL_N = 128;
function Adapt(delta, numPoints, firstTime) {
  delta = firstTime ? Math.floor(delta / PUNYCODE_DAMP) : delta >> 1;
  delta += Math.floor(delta / numPoints);
  let k = 0;
  while (delta > (PUNYCODE_BASE - PUNYCODE_TMIN) * PUNYCODE_TMAX >> 1) {
    delta = Math.floor(delta / (PUNYCODE_BASE - PUNYCODE_TMIN));
    k += PUNYCODE_BASE;
  }
  return k + Math.floor((PUNYCODE_BASE - PUNYCODE_TMIN + 1) * delta / (delta + PUNYCODE_SKEW));
}
function Decode2(value) {
  const output = [];
  let n = PUNYCODE_INITIAL_N;
  let i = 0;
  let bias = PUNYCODE_INITIAL_BIAS;
  const delimIdx = value.lastIndexOf("-");
  if (delimIdx > 0) {
    for (let j = 0; j < delimIdx; j++) {
      const cp = value.charCodeAt(j);
      if (cp >= 128)
        throw new Error("Invalid punycode: non-basic before delimiter");
      output.push(cp);
    }
  }
  let inIdx = delimIdx < 0 ? 0 : delimIdx + 1;
  while (inIdx < value.length) {
    const oldi = i;
    let w = 1;
    let k = PUNYCODE_BASE;
    while (true) {
      if (inIdx >= value.length)
        throw new Error("Invalid punycode: unexpected end of input");
      const ch = value.charCodeAt(inIdx++);
      let digit;
      if (ch >= 97 && ch <= 122)
        digit = ch - 97;
      else if (ch >= 48 && ch <= 57)
        digit = ch - 48 + 26;
      else if (ch >= 65 && ch <= 90)
        digit = ch - 65;
      else
        throw new Error("Invalid punycode: bad digit character");
      i += digit * w;
      const t = k <= bias ? PUNYCODE_TMIN : k >= bias + PUNYCODE_TMAX ? PUNYCODE_TMAX : k - bias;
      if (digit < t)
        break;
      w *= PUNYCODE_BASE - t;
      k += PUNYCODE_BASE;
    }
    const outLen = output.length + 1;
    bias = Adapt(i - oldi, outLen, oldi === 0);
    n += Math.floor(i / outLen);
    i %= outLen;
    output.splice(i, 0, n);
    i++;
  }
  return globalThis.String.fromCodePoint(...output);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/format/_idna.mjs
function IsNonspacingMark(cp) {
  return new RegExp("\\p{Mn}", "u").test(String.fromCodePoint(cp));
}
function IsSpacingCombiningMark(cp) {
  return new RegExp("\\p{Mc}", "u").test(String.fromCodePoint(cp));
}
function IsEnclosingMark(cp) {
  return new RegExp("\\p{Me}", "u").test(String.fromCodePoint(cp));
}
function IsCombiningMark2(cp) {
  return IsNonspacingMark(cp) || IsSpacingCombiningMark(cp) || IsEnclosingMark(cp);
}
var RFC5892_DISALLOWED = /* @__PURE__ */ new Set([
  1600,
  // ARABIC TATWEEL
  2042,
  // NKO LAJANYALAN
  12334,
  // HANGUL SINGLE DOT TONE MARK
  12335,
  // HANGUL DOUBLE DOT TONE MARK
  12337,
  // VERTICAL KANA REPEAT MARK
  12338,
  // VERTICAL KANA REPEAT WITH VOICED ITERATION MARK
  12339,
  // VERTICAL KANA REPEAT MARK UPPER HALF
  12340,
  // VERTICAL KANA REPEAT WITH VOICED ITERATION MARK UPPER HALF
  12341,
  // VERTICAL KANA REPEAT MARK LOWER HALF
  12347
  // VERTICAL IDEOGRAPHIC ITERATION MARK
]);
var VIRAMA_CPS = /* @__PURE__ */ new Set([
  2381,
  2509,
  2637,
  2765,
  2893,
  3021,
  3149,
  3277,
  3387,
  3388,
  3405,
  3530,
  6980,
  7082,
  7083,
  43456,
  69702,
  69759,
  69817,
  69939,
  69940,
  70080,
  70197,
  70477,
  70722,
  70850,
  71103,
  71231,
  71350,
  72767,
  73028,
  73029
]);
function IsGreek(cp) {
  return new RegExp("\\p{Script=Greek}", "u").test(String.fromCodePoint(cp));
}
function IsHebrew(cp) {
  return new RegExp("\\p{Script=Hebrew}", "u").test(String.fromCodePoint(cp));
}
function IsHiragana(cp) {
  return new RegExp("\\p{Script=Hiragana}", "u").test(String.fromCodePoint(cp));
}
function IsKatakana(cp) {
  return new RegExp("\\p{Script=Katakana}", "u").test(String.fromCodePoint(cp));
}
function IsHan(cp) {
  return new RegExp("\\p{Script=Han}", "u").test(String.fromCodePoint(cp));
}
function IsArabicIndicDigit(cp) {
  return cp >= 1632 && cp <= 1641;
}
function IsExtendedArabicIndicDigit(cp) {
  return cp >= 1776 && cp <= 1785;
}
function IsVirama(cp) {
  return VIRAMA_CPS.has(cp);
}
function IsUnicodeLabel(value) {
  if (value.length === 0)
    return false;
  const cps = [...value].map((c) => c.codePointAt(0));
  const len = cps.length;
  if (cps[0] === 45 || cps[len - 1] === 45)
    return false;
  if (len >= 4 && cps[2] === 45 && cps[3] === 45)
    return false;
  if (IsCombiningMark2(cps[0]))
    return false;
  let hasJapanese = false;
  let hasArabicIndic = false;
  let hasExtendedArabicIndic = false;
  for (let i = 0; i < len; i++) {
    const cp = cps[i];
    if (RFC5892_DISALLOWED.has(cp))
      return false;
    if (IsHiragana(cp) || IsKatakana(cp) || IsHan(cp))
      hasJapanese = true;
    if (IsArabicIndicDigit(cp))
      hasArabicIndic = true;
    if (IsExtendedArabicIndicDigit(cp))
      hasExtendedArabicIndic = true;
    const prev = cps[i - 1], next = cps[i + 1];
    switch (cp) {
      case 183:
        if (prev !== 108 || next !== 108)
          return false;
        break;
      // MIDDLE DOT (Catalan)
      case 885:
        if (next === void 0 || !IsGreek(next))
          return false;
        break;
      // Greek KERAIA
      case 1523:
      case 1524:
        if (prev === void 0 || !IsHebrew(prev))
          return false;
        break;
      // Hebrew GERESH
      case 8205:
        if (prev === void 0 || !IsVirama(prev))
          return false;
        break;
      // ZWJ
      case 12539:
        break;
    }
  }
  if (value.includes("\u30FB") && !hasJapanese)
    return false;
  if (hasArabicIndic && hasExtendedArabicIndic)
    return false;
  return true;
}
function IsAsciiLabel(value) {
  if (value.charCodeAt(0) === 45 || value.charCodeAt(value.length - 1) === 45)
    return false;
  if (value.length >= 4 && value.charCodeAt(2) === 45 && value.charCodeAt(3) === 45)
    return false;
  for (let i = 0; i < value.length; i++) {
    const ch = value.charCodeAt(i);
    if (!(ch >= 97 && ch <= 122 || // a-z
    ch >= 65 && ch <= 90 || // A-Z
    ch >= 48 && ch <= 57 || // 0-9
    ch === 45))
      return false;
  }
  return true;
}
function IsPuny(value) {
  return value.toLowerCase().startsWith("xn--");
}
function IsPunyLabel(value) {
  try {
    return IsUnicodeLabel(Decode2(value.slice(4)));
  } catch {
    return false;
  }
}
function IsIdnLabel(value) {
  if (value.length === 0 || value.length > 63)
    return false;
  return IsPuny(value) ? IsPunyLabel(value) : IsUnicodeLabel(value);
}
function IsLabel(value) {
  if (value.length === 0 || value.length > 63)
    return false;
  return IsPuny(value) ? IsPunyLabel(value) : IsAsciiLabel(value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/format/hostname.mjs
function IsHostname(value) {
  if (value.length === 0 || value.length > 253)
    return false;
  if (value.charCodeAt(value.length - 1) === 46)
    return false;
  for (const label of value.split(".")) {
    if (!IsLabel(label))
      return false;
  }
  return true;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/format/idn_email.mjs
var IdnEmail = /^(?!.*\.\.)[\p{L}\p{N}!#$%&'*+/=?^_`{|}~-]+(?:\.[\p{L}\p{N}!#$%&'*+/=?^_`{|}~-]+)*@[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?(?:\.[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?)*$/iu;
function IsIdnEmail(value) {
  return IdnEmail.test(value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/format/idn_hostname.mjs
function IsIdnHostname(value) {
  if (value.length === 0 || value.includes(" "))
    return false;
  const canonical = value.normalize("NFC").replace(/[\u002E\u3002\uFF0E\uFF61]/g, ".");
  if (canonical.length > 253)
    return false;
  for (const label of canonical.split(".")) {
    if (!IsIdnLabel(label))
      return false;
  }
  return true;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/format/ipv4.mjs
function IsIPv4Internal(value, start2, end) {
  let dots = 0;
  let num = 0;
  let digits = 0;
  let leading = 0;
  for (let i = start2; i < end; i++) {
    const ch = value.charCodeAt(i);
    if (ch === 46) {
      if (digits === 0 || num > 255 || leading === 48 && digits > 1)
        return false;
      dots++;
      num = 0;
      digits = 0;
      leading = 0;
    } else if (ch >= 48 && ch <= 57) {
      if (digits === 0)
        leading = ch;
      num = num * 10 + (ch - 48);
      digits++;
    } else {
      return false;
    }
  }
  return dots === 3 && digits > 0 && num <= 255 && !(leading === 48 && digits > 1);
}
function IsIPv4(value) {
  return IsIPv4Internal(value, 0, value.length);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/format/ipv6.mjs
function InRange(ch) {
  return ch >= 48 && ch <= 57 || // 0-9
  ch >= 65 && ch <= 70 || // A-F
  ch >= 97 && ch <= 102;
}
function IsIPv6(value) {
  const length = value.length;
  if (length === 0)
    return false;
  let groups = 0;
  let compressed = false;
  let i = 0;
  if (value.charCodeAt(0) === 58 && value.charCodeAt(1) === 58) {
    if (length === 2)
      return true;
    compressed = true;
    i = 2;
  }
  while (i < length) {
    let digits = 0;
    const start2 = i;
    while (i < length && InRange(value.charCodeAt(i))) {
      i++;
      digits++;
    }
    if (digits === 0)
      return false;
    const next = value.charCodeAt(i);
    if (next === 46) {
      if (!IsIPv4Internal(value, start2, length))
        return false;
      groups += 2;
      i = length;
      break;
    }
    if (digits > 4)
      return false;
    groups++;
    if (i === length)
      break;
    if (next !== 58)
      return false;
    i++;
    if (value.charCodeAt(i) === 58) {
      if (compressed)
        return false;
      if (value.charCodeAt(i + 1) === 58)
        return false;
      compressed = true;
      i++;
      if (i === length)
        break;
    }
  }
  return compressed ? groups <= 7 : groups === 8;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/format/iri_reference.mjs
function TryUrl(value) {
  try {
    new URL(value, "http://example.com");
    return true;
  } catch {
    return false;
  }
}
function IsIriReference(value) {
  if (value.includes(" ")) {
    return false;
  }
  if (value.includes("\\")) {
    return false;
  }
  if (/[\x00-\x1F\x7F]/.test(value)) {
    return false;
  }
  if (/%(?![0-9a-fA-F]{2})/.test(value)) {
    return false;
  }
  if (value === "") {
    return true;
  }
  const colonIndex = value.indexOf(":");
  const hasValidSchemePrefix = colonIndex > 0 && // Colon must not be at the very beginning (e.g., ":foo")
  /^[a-zA-Z][a-zA-Z0-9+\-.]*$/.test(value.substring(0, colonIndex));
  if (hasValidSchemePrefix) {
    return TryUrl(value);
  } else {
    const looksLikeMalformedSchemeAndAuthority = value.match(/^([a-zA-Z][a-zA-Z0-9+\-.]*)(\/\/)/);
    if (looksLikeMalformedSchemeAndAuthority && colonIndex === -1) {
      return false;
    }
    return TryUrl(value);
  }
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/format/iri.mjs
function IsIri(value) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/format/json_pointer_uri_fragment.mjs
var JsonPointerUriFragment = /^#(?:\/(?:[a-z0-9_\-.!$&'()*+,;:=@]|%[0-9a-f]{2}|~0|~1)*)*$/i;
function IsJsonPointerUriFragment(value) {
  return JsonPointerUriFragment.test(value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/format/json_pointer.mjs
var JsonPointer = /^(?:\/(?:[^~/]|~0|~1)*)*$/;
function IsJsonPointer(value) {
  return JsonPointer.test(value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/format/regex.mjs
function IsRegex(value) {
  if (value.length === 0) {
    return false;
  }
  try {
    new RegExp(value);
    return true;
  } catch {
    return false;
  }
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/format/relative_json_pointer.mjs
var RelativeJsonPointer = /^(?:0|[1-9][0-9]*)(?:#|(?:\/(?:[^~/]|~0|~1)*)*)$/;
function IsRelativeJsonPointer(value) {
  return RelativeJsonPointer.test(value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/format/uri_reference.mjs
var UriReference = /^(?!.*[^\x00-\x7F])(?!.*\\)(?:(?:[a-z][a-z0-9+\-.]*:)?(?:\/\/[^\s[\]{}<>^`|]*)?|[^\s[\]{}<>^`|]*)(?:\?[^\s[\]{}<>^`|]*)?(?:#[^\s[\]{}<>^`|]*)?$/i;
function IsUriReference(value) {
  return UriReference.test(value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/format/uri_template.mjs
var UriTemplate = /^(?:(?:[^\x00-\x20"'<>%\\^`{|}]|%[0-9a-f]{2})|\{[+#./;?&=,!@|]?(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?(?:,(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?)*\})*$/i;
function IsUriTemplate(value) {
  return UriTemplate.test(value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/format/uri.mjs
function IsAlpha(ch) {
  return ch >= 97 && ch <= 122 || ch >= 65 && ch <= 90;
}
function IsAlphaNumeric(ch) {
  return IsAlpha(ch) || ch >= 48 && ch <= 57;
}
function IsHex(ch) {
  return ch >= 48 && ch <= 57 || // 0-9
  ch >= 65 && ch <= 70 || // A-F
  ch >= 97 && ch <= 102;
}
function IsSchemeChar(ch) {
  return IsAlphaNumeric(ch) || ch === 43 || ch === 45 || ch === 46;
}
function IsUnreserved(ch) {
  return IsAlphaNumeric(ch) || ch === 45 || ch === 46 || // '-', '.'
  ch === 95 || ch === 126;
}
function IsSubDelim(ch) {
  return ch === 33 || ch === 36 || ch === 38 || ch === 39 || ch === 40 || ch === 41 || ch === 42 || ch === 43 || ch === 44 || ch === 59 || ch === 61;
}
function IsPchar(ch) {
  return IsUnreserved(ch) || IsSubDelim(ch) || ch === 58 || ch === 64;
}
function IsUri(value) {
  const length = value.length;
  if (length === 0)
    return false;
  if (!IsAlpha(value.charCodeAt(0)))
    return false;
  let i = 1;
  while (i < length) {
    const ch = value.charCodeAt(i);
    if (ch === 58)
      break;
    if (!IsSchemeChar(ch))
      return false;
    i++;
  }
  if (value.charCodeAt(i) !== 58)
    return false;
  i++;
  if (value.charCodeAt(i) === 47 && value.charCodeAt(i + 1) === 47) {
    i += 2;
    const authorityStart = i;
    let atPos = -1;
    for (let j = i; j < length; j++) {
      const ch = value.charCodeAt(j);
      if (ch === 64) {
        atPos = j;
        break;
      }
      if (ch === 47 || ch === 63 || ch === 35)
        break;
    }
    if (atPos !== -1) {
      for (let j = authorityStart; j < atPos; j++) {
        const ch = value.charCodeAt(j);
        if (ch === 91 || ch === 93)
          return false;
        if (ch === 37) {
          if (j + 2 >= atPos || !IsHex(value.charCodeAt(j + 1)) || !IsHex(value.charCodeAt(j + 2)))
            return false;
          j += 2;
        } else if (!IsUnreserved(ch) && !IsSubDelim(ch) && ch !== 58)
          return false;
      }
      i = atPos + 1;
    }
    if (value.charCodeAt(i) === 91) {
      i++;
      while (i < length && value.charCodeAt(i) !== 93)
        i++;
      if (value.charCodeAt(i) !== 93)
        return false;
      i++;
    } else {
      while (i < length) {
        const ch = value.charCodeAt(i);
        if (ch === 47 || ch === 63 || ch === 35 || ch === 58)
          break;
        if (ch < 128 && !IsUnreserved(ch) && !IsSubDelim(ch))
          return false;
        i++;
      }
    }
    if (value.charCodeAt(i) === 58) {
      i++;
      while (i < length) {
        const ch = value.charCodeAt(i);
        if (ch === 47 || ch === 63 || ch === 35)
          break;
        if (ch < 48 || ch > 57)
          return false;
        i++;
      }
    }
  }
  while (i < length) {
    const ch = value.charCodeAt(i);
    if (ch === 37) {
      if (i + 2 >= length || !IsHex(value.charCodeAt(i + 1)) || !IsHex(value.charCodeAt(i + 2)))
        return false;
      i += 2;
    } else if (ch > 127) {
      return false;
    } else if (!(IsPchar(ch) || ch === 47 || ch === 63 || ch === 35)) {
      return false;
    }
    i++;
  }
  return true;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/format/url.mjs
var Url = /^(?:https?|ftp):\/\/(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z0-9\u{00a1}-\u{ffff}]+-)*[a-z0-9\u{00a1}-\u{ffff}]+)(?:\.(?:[a-z0-9\u{00a1}-\u{ffff}]+-)*[a-z0-9\u{00a1}-\u{ffff}]+)*(?:\.(?:[a-z\u{00a1}-\u{ffff}]{2,})))(?::\d{2,5})?(?:\/[^\s]*)?$/iu;
function IsUrl(value) {
  return Url.test(value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/format/uuid.mjs
var Uuid = /^(?:urn:uuid:)?[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
function IsUuid(value) {
  return Uuid.test(value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/format/_registry.mjs
var formats = /* @__PURE__ */ new Map();
function Clear() {
  formats.clear();
}
function Entries2() {
  return [...formats.entries()];
}
function Set3(format, check) {
  formats.set(format, check);
}
function Has(format) {
  return formats.has(format);
}
function Get3(format) {
  return formats.get(format);
}
function Test(format, value) {
  return formats.get(format)?.(value) ?? true;
}
function Reset2() {
  Clear();
  formats.set("date-time", IsDateTime);
  formats.set("date", IsDate2);
  formats.set("duration", IsDuration);
  formats.set("email", IsEmail);
  formats.set("hostname", IsHostname);
  formats.set("idn-email", IsIdnEmail);
  formats.set("idn-hostname", IsIdnHostname);
  formats.set("ipv4", IsIPv4);
  formats.set("ipv6", IsIPv6);
  formats.set("iri-reference", IsIriReference);
  formats.set("iri", IsIri);
  formats.set("json-pointer-uri-fragment", IsJsonPointerUriFragment);
  formats.set("json-pointer", IsJsonPointer);
  formats.set("regex", IsRegex);
  formats.set("relative-json-pointer", IsRelativeJsonPointer);
  formats.set("time", IsTime);
  formats.set("uri-reference", IsUriReference);
  formats.set("uri-template", IsUriTemplate);
  formats.set("uri", IsUri);
  formats.set("url", IsUrl);
  formats.set("uuid", IsUuid);
}
Reset2();

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/format.mjs
function CheckFormat(_stack, _context, schema, value) {
  return format_exports.Test(schema.format, value);
}
function ErrorFormat(stack, context, schemaPath, instancePath, schema, value) {
  return CheckFormat(stack, context, schema, value) || context.AddError({
    keyword: "format",
    schemaPath,
    instancePath,
    params: { format: schema.format }
  });
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/if.mjs
function CheckIf(stack, context, schema, value) {
  const thenSchema = IsThen(schema) ? schema.then : true;
  const elseSchema = IsElse(schema) ? schema.else : true;
  return CheckSchema(stack, context, schema.if, value) ? CheckSchema(stack, context, thenSchema, value) : CheckSchema(stack, context, elseSchema, value);
}
function ErrorIf(stack, context, schemaPath, instancePath, schema, value) {
  const thenSchema = IsThen(schema) ? schema.then : true;
  const elseSchema = IsElse(schema) ? schema.else : true;
  const trueContext = new AccumulatedErrorContext();
  const isIf = ErrorSchema(stack, trueContext, `${schemaPath}/if`, instancePath, schema.if, value) ? ErrorSchema(stack, trueContext, `${schemaPath}/then`, instancePath, thenSchema, value) || context.AddError({
    keyword: "if",
    schemaPath,
    instancePath,
    params: { failingKeyword: "then" }
  }) : ErrorSchema(stack, context, `${schemaPath}/else`, instancePath, elseSchema, value) || context.AddError({
    keyword: "if",
    schemaPath,
    instancePath,
    params: { failingKeyword: "else" }
  });
  if (isIf)
    context.Merge([trueContext]);
  return isIf;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/items.mjs
function CheckItemsSized(stack, context, schema, value) {
  return guard_exports.Every(schema.items, 0, (schema2, index) => {
    return guard_exports.IsLessEqualThan(value.length, index) || CheckSchemaPushStack(stack, context, schema2, value[index]) && context.AddIndex(index);
  });
}
function ErrorItemsSized(stack, context, schemaPath, instancePath, schema, value) {
  return guard_exports.EveryAll(schema.items, 0, (schema2, index) => {
    const nextSchemaPath = `${schemaPath}/items/${index}`;
    const nextInstancePath = `${instancePath}/${index}`;
    return guard_exports.IsLessEqualThan(value.length, index) || ErrorSchemaPushStack(stack, context, nextSchemaPath, nextInstancePath, schema2, value[index]) && context.AddIndex(index);
  });
}
function CheckItemsUnsized(stack, context, schema, value) {
  const offset = IsPrefixItems(schema) ? schema.prefixItems.length : 0;
  return guard_exports.Every(value, offset, (element, index) => {
    return CheckSchemaPushStack(stack, context, schema.items, element) && context.AddIndex(index);
  });
}
function ErrorItemsUnsized(stack, context, schemaPath, instancePath, schema, value) {
  const offset = IsPrefixItems(schema) ? schema.prefixItems.length : 0;
  return guard_exports.EveryAll(value, offset, (element, index) => {
    const nextSchemaPath = `${schemaPath}/items`;
    const nextInstancePath = `${instancePath}/${index}`;
    return ErrorSchemaPushStack(stack, context, nextSchemaPath, nextInstancePath, schema.items, element) && context.AddIndex(index);
  });
}
function CheckItems(stack, context, schema, value) {
  return IsItemsSized(schema) ? CheckItemsSized(stack, context, schema, value) : CheckItemsUnsized(stack, context, schema, value);
}
function ErrorItems(stack, context, schemaPath, instancePath, schema, value) {
  return IsItemsSized(schema) ? ErrorItemsSized(stack, context, schemaPath, instancePath, schema, value) : ErrorItemsUnsized(stack, context, schemaPath, instancePath, schema, value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/maxContains.mjs
function IsValid3(schema) {
  return IsContains(schema);
}
function CheckMaxContains(stack, context, schema, value) {
  if (!IsValid3(schema))
    return true;
  const count = value.reduce((result, item) => CheckSchema(stack, context, schema.contains, item) ? ++result : result, 0);
  return guard_exports.IsLessEqualThan(count, schema.maxContains);
}
function ErrorMaxContains(stack, context, schemaPath, instancePath, schema, value) {
  const minContains = IsMinContains(schema) ? schema.minContains : 1;
  return CheckMaxContains(stack, context, schema, value) || context.AddError({
    keyword: "contains",
    schemaPath,
    instancePath,
    params: { minContains, maxContains: schema.maxContains }
  });
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/maximum.mjs
function CheckMaximum(_stack, _context, schema, value) {
  return guard_exports.IsLessEqualThan(value, schema.maximum);
}
function ErrorMaximum(stack, context, schemaPath, instancePath, schema, value) {
  return CheckMaximum(stack, context, schema, value) || context.AddError({
    keyword: "maximum",
    schemaPath,
    instancePath,
    params: { comparison: "<=", limit: schema.maximum }
  });
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/maxItems.mjs
function CheckMaxItems(_stack, _context, schema, value) {
  return guard_exports.IsLessEqualThan(value.length, schema.maxItems);
}
function ErrorMaxItems(stack, context, schemaPath, instancePath, schema, value) {
  return CheckMaxItems(stack, context, schema, value) || context.AddError({
    keyword: "maxItems",
    schemaPath,
    instancePath,
    params: { limit: schema.maxItems }
  });
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/maxLength.mjs
function CheckMaxLength(_stack, _context, schema, value) {
  return guard_exports.IsMaxLength(value, schema.maxLength);
}
function ErrorMaxLength(stack, context, schemaPath, instancePath, schema, value) {
  return CheckMaxLength(stack, context, schema, value) || context.AddError({
    keyword: "maxLength",
    schemaPath,
    instancePath,
    params: { limit: schema.maxLength }
  });
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/maxProperties.mjs
function CheckMaxProperties(_stack, _context, schema, value) {
  return guard_exports.IsLessEqualThan(guard_exports.Keys(value).length, schema.maxProperties);
}
function ErrorMaxProperties(stack, context, schemaPath, instancePath, schema, value) {
  return CheckMaxProperties(stack, context, schema, value) || context.AddError({
    keyword: "maxProperties",
    schemaPath,
    instancePath,
    params: { limit: schema.maxProperties }
  });
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/minContains.mjs
function IsValid4(schema) {
  return IsContains(schema);
}
function CheckMinContains(stack, context, schema, value) {
  if (!IsValid4(schema))
    return true;
  const count = value.reduce((result, item) => CheckSchema(stack, context, schema.contains, item) ? ++result : result, 0);
  return guard_exports.IsGreaterEqualThan(count, schema.minContains);
}
function ErrorMinContains(stack, context, schemaPath, instancePath, schema, value) {
  return CheckMinContains(stack, context, schema, value) || context.AddError({
    keyword: "contains",
    schemaPath,
    instancePath,
    params: { minContains: schema.minContains }
  });
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/minimum.mjs
function CheckMinimum(_stack, _context, schema, value) {
  return guard_exports.IsGreaterEqualThan(value, schema.minimum);
}
function ErrorMinimum(stack, context, schemaPath, instancePath, schema, value) {
  return CheckMinimum(stack, context, schema, value) || context.AddError({
    keyword: "minimum",
    schemaPath,
    instancePath,
    params: { comparison: ">=", limit: schema.minimum }
  });
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/minItems.mjs
function CheckMinItems(_stack, _context, schema, value) {
  return guard_exports.IsGreaterEqualThan(value.length, schema.minItems);
}
function ErrorMinItems(stack, context, schemaPath, instancePath, schema, value) {
  return CheckMinItems(stack, context, schema, value) || context.AddError({
    keyword: "minItems",
    schemaPath,
    instancePath,
    params: { limit: schema.minItems }
  });
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/minLength.mjs
function CheckMinLength(_stack, _context, schema, value) {
  return guard_exports.IsMinLength(value, schema.minLength);
}
function ErrorMinLength(stack, context, schemaPath, instancePath, schema, value) {
  return CheckMinLength(stack, context, schema, value) || context.AddError({
    keyword: "minLength",
    schemaPath,
    instancePath,
    params: { limit: schema.minLength }
  });
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/minProperties.mjs
function CheckMinProperties(_stack, _context, schema, value) {
  return guard_exports.IsGreaterEqualThan(guard_exports.Keys(value).length, schema.minProperties);
}
function ErrorMinProperties(stack, context, schemaPath, instancePath, schema, value) {
  return CheckMinProperties(stack, context, schema, value) || context.AddError({
    keyword: "minProperties",
    schemaPath,
    instancePath,
    params: { limit: schema.minProperties }
  });
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/multipleOf.mjs
function CheckMultipleOf(_stack, _context, schema, value) {
  return guard_exports.IsMultipleOf(value, schema.multipleOf);
}
function ErrorMultipleOf(stack, context, schemaPath, instancePath, schema, value) {
  return CheckMultipleOf(stack, context, schema, value) || context.AddError({
    keyword: "multipleOf",
    schemaPath,
    instancePath,
    params: { multipleOf: schema.multipleOf }
  });
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/not.mjs
function CheckNot(stack, context, schema, value) {
  const nextContext = new CheckContext();
  const isSchema = !CheckSchema(stack, nextContext, schema.not, value);
  const isNot = isSchema && context.Merge([nextContext]);
  return isNot;
}
function ErrorNot(stack, context, schemaPath, instancePath, schema, value) {
  return CheckNot(stack, context, schema, value) || context.AddError({
    keyword: "not",
    schemaPath,
    instancePath,
    params: {}
  });
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/oneOf.mjs
function CheckOneOf(stack, context, schema, value) {
  const passedContexts = schema.oneOf.reduce((result, schema2) => {
    const nextContext = new CheckContext();
    return CheckSchema(stack, nextContext, schema2, value) ? [...result, nextContext] : result;
  }, []);
  return guard_exports.IsEqual(passedContexts.length, 1) && context.Merge(passedContexts);
}
function ErrorOneOf(stack, context, schemaPath, instancePath, schema, value) {
  const failedContexts = [];
  const passingSchemas = [];
  const passedContexts = schema.oneOf.reduce((result, schema2, index) => {
    const nextContext = new AccumulatedErrorContext();
    const nextSchemaPath = `${schemaPath}/oneOf/${index}`;
    const isSchema = ErrorSchema(stack, nextContext, nextSchemaPath, instancePath, schema2, value);
    if (isSchema)
      passingSchemas.push(index);
    if (!isSchema)
      failedContexts.push(nextContext);
    return isSchema ? [...result, nextContext] : result;
  }, []);
  const isOneOf = guard_exports.IsEqual(passedContexts.length, 1) && context.Merge(passedContexts);
  if (!isOneOf && guard_exports.IsEqual(passingSchemas.length, 0))
    failedContexts.forEach((failed) => failed.GetErrors().forEach((error) => context.AddError(error)));
  return isOneOf || context.AddError({
    keyword: "oneOf",
    schemaPath,
    instancePath,
    params: { passingSchemas }
  });
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/pattern.mjs
function CheckPattern(_stack, _context, schema, value) {
  const regexp = guard_exports.IsString(schema.pattern) ? new RegExp(schema.pattern, "u") : schema.pattern;
  return regexp.test(value);
}
function ErrorPattern(stack, context, schemaPath, instancePath, schema, value) {
  return CheckPattern(stack, context, schema, value) || context.AddError({
    keyword: "pattern",
    schemaPath,
    instancePath,
    params: { pattern: schema.pattern }
  });
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/patternProperties.mjs
function CheckPatternProperties(stack, context, schema, value) {
  return guard_exports.Every(guard_exports.Entries(schema.patternProperties), 0, ([pattern, schema2]) => {
    const regexp = new RegExp(pattern, "u");
    return guard_exports.Every(guard_exports.Entries(value), 0, ([key, prop]) => {
      return !regexp.test(key) || CheckSchemaPushStack(stack, context, schema2, prop) && context.AddKey(key);
    });
  });
}
function ErrorPatternProperties(stack, context, schemaPath, instancePath, schema, value) {
  return guard_exports.EveryAll(guard_exports.Entries(schema.patternProperties), 0, ([pattern, schema2]) => {
    const nextSchemaPath = `${schemaPath}/patternProperties/${pattern}`;
    const regexp = new RegExp(pattern, "u");
    return guard_exports.EveryAll(guard_exports.Entries(value), 0, ([key, value2]) => {
      const nextInstancePath = `${instancePath}/${key}`;
      const notKey = !regexp.test(key);
      return notKey || ErrorSchemaPushStack(stack, context, nextSchemaPath, nextInstancePath, schema2, value2) && context.AddKey(key);
    });
  });
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/prefixItems.mjs
function CheckPrefixItems(stack, context, schema, value) {
  return guard_exports.IsEqual(value.length, 0) || guard_exports.Every(schema.prefixItems, 0, (schema2, index) => {
    return guard_exports.IsLessEqualThan(value.length, index) || CheckSchemaPushStack(stack, context, schema2, value[index]) && context.AddIndex(index);
  });
}
function ErrorPrefixItems(stack, context, schemaPath, instancePath, schema, value) {
  return guard_exports.IsEqual(value.length, 0) || guard_exports.EveryAll(schema.prefixItems, 0, (schema2, index) => {
    const nextSchemaPath = `${schemaPath}/prefixItems/${index}`;
    const nextInstancePath = `${instancePath}/${index}`;
    return guard_exports.IsLessEqualThan(value.length, index) || ErrorSchemaPushStack(stack, context, nextSchemaPath, nextInstancePath, schema2, value[index]) && context.AddIndex(index);
  });
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/_exact_optional.mjs
function IsExactOptional(required, key) {
  return required.includes(key) || settings_exports.Get().exactOptionalPropertyTypes;
}
function InexactOptionalCheck(value, key) {
  return guard_exports.IsUndefined(value[key]);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/properties.mjs
function CheckProperties(stack, context, schema, value) {
  const required = IsRequired(schema) ? schema.required : [];
  const isProperties = guard_exports.Every(guard_exports.Entries(schema.properties), 0, ([key, schema2]) => {
    const isProperty = !guard_exports.HasPropertyKey(value, key) || CheckSchemaPushStack(stack, context, schema2, value[key]) && context.AddKey(key);
    return IsExactOptional(required, key) ? isProperty : InexactOptionalCheck(value, key) || isProperty;
  });
  return isProperties;
}
function ErrorProperties(stack, context, schemaPath, instancePath, schema, value) {
  const required = IsRequired(schema) ? schema.required : [];
  const isProperties = guard_exports.EveryAll(guard_exports.Entries(schema.properties), 0, ([key, schema2]) => {
    const nextSchemaPath = `${schemaPath}/properties/${key}`;
    const nextInstancePath = `${instancePath}/${key}`;
    const isProperty = () => !guard_exports.HasPropertyKey(value, key) || ErrorSchemaPushStack(stack, context, nextSchemaPath, nextInstancePath, schema2, value[key]) && context.AddKey(key);
    return IsExactOptional(required, key) ? isProperty() : InexactOptionalCheck(value, key) || isProperty();
  });
  return isProperties;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/propertyNames.mjs
function CheckPropertyNames(stack, context, schema, value) {
  return guard_exports.Every(guard_exports.Keys(value), 0, (key, _index) => CheckSchema(stack, context, schema.propertyNames, key));
}
function ErrorPropertyNames(stack, context, schemaPath, instancePath, schema, value) {
  const propertyNames = [];
  const isPropertyNames = guard_exports.EveryAll(guard_exports.Keys(value), 0, (key, _index) => {
    const nextInstancePath = `${instancePath}/${key}`;
    const nextSchemaPath = `${schemaPath}/propertyNames`;
    const nextContext = new AccumulatedErrorContext();
    const isPropertyName = ErrorSchema(stack, nextContext, nextSchemaPath, nextInstancePath, schema.propertyNames, key);
    if (!isPropertyName)
      propertyNames.push(key);
    return isPropertyName;
  });
  return isPropertyNames || context.AddError({
    keyword: "propertyNames",
    schemaPath,
    instancePath,
    params: { propertyNames }
  });
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/recursiveRef.mjs
function CheckRecursiveRef(stack, context, schema, value) {
  const target = stack.RecursiveRef(schema) ?? false;
  return IsSchema2(target) && CheckSchema(stack, context, target, value);
}
function ErrorRecursiveRef(stack, context, _schemaPath, instancePath, schema, value) {
  const target = stack.RecursiveRef(schema) ?? false;
  return IsSchema2(target) && ErrorSchema(stack, context, "#", instancePath, target, value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/ref.mjs
function CheckRef(stack, context, schema, value) {
  const target = stack.Ref(schema) ?? false;
  const nextContext = new CheckContext();
  const result = IsSchema2(target) && CheckSchema(stack, nextContext, target, value);
  if (result)
    context.Merge([nextContext]);
  return result;
}
function ErrorRef(stack, context, _schemaPath, instancePath, schema, value) {
  const target = stack.Ref(schema) ?? false;
  const nextContext = new AccumulatedErrorContext();
  const result = IsSchema2(target) && ErrorSchema(stack, nextContext, "#", instancePath, target, value);
  if (result)
    context.Merge([nextContext]);
  if (!result)
    nextContext.GetErrors().forEach((error) => context.AddError(error));
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/required.mjs
function CheckRequired(_stack, _context, schema, value) {
  return guard_exports.Every(schema.required, 0, (key) => guard_exports.HasPropertyKey(value, key));
}
function ErrorRequired(_stack, context, schemaPath, instancePath, schema, value) {
  const requiredProperties = [];
  const isRequired = guard_exports.EveryAll(schema.required, 0, (key) => {
    const hasKey = guard_exports.HasPropertyKey(value, key);
    if (!hasKey)
      requiredProperties.push(key);
    return hasKey;
  });
  return isRequired || context.AddError({
    keyword: "required",
    schemaPath,
    instancePath,
    params: { requiredProperties }
  });
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/type.mjs
function CheckTypeName(_stack, _context, type, _schema, value) {
  return (
    // jsonschema
    guard_exports.IsEqual(type, "object") ? guard_exports.IsObjectNotArray(value) : guard_exports.IsEqual(type, "array") ? guard_exports.IsArray(value) : guard_exports.IsEqual(type, "boolean") ? guard_exports.IsBoolean(value) : guard_exports.IsEqual(type, "integer") ? guard_exports.IsInteger(value) : guard_exports.IsEqual(type, "number") ? guard_exports.IsNumber(value) : guard_exports.IsEqual(type, "null") ? guard_exports.IsNull(value) : guard_exports.IsEqual(type, "string") ? guard_exports.IsString(value) : (
      // xschema
      guard_exports.IsEqual(type, "asyncIterator") ? guard_exports.IsAsyncIterator(value) : guard_exports.IsEqual(type, "bigint") ? guard_exports.IsBigInt(value) : guard_exports.IsEqual(type, "constructor") ? guard_exports.IsConstructor(value) : guard_exports.IsEqual(type, "function") ? guard_exports.IsFunction(value) : guard_exports.IsEqual(type, "iterator") ? guard_exports.IsIterator(value) : guard_exports.IsEqual(type, "symbol") ? guard_exports.IsSymbol(value) : guard_exports.IsEqual(type, "undefined") ? guard_exports.IsUndefined(value) : guard_exports.IsEqual(type, "void") ? guard_exports.IsUndefined(value) : true
    )
  );
}
function CheckTypeNames(stack, context, types, schema, value) {
  return types.some((type) => CheckTypeName(stack, context, type, schema, value));
}
function CheckType(stack, context, schema, value) {
  return guard_exports.IsArray(schema.type) ? CheckTypeNames(stack, context, schema.type, schema, value) : CheckTypeName(stack, context, schema.type, schema, value);
}
function ErrorType(stack, context, schemaPath, instancePath, schema, value) {
  const isType = guard_exports.IsArray(schema.type) ? CheckTypeNames(stack, context, schema.type, schema, value) : CheckTypeName(stack, context, schema.type, schema, value);
  return isType || context.AddError({
    keyword: "type",
    schemaPath,
    instancePath,
    params: { type: schema.type }
  });
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/unevaluatedItems.mjs
function CheckUnevaluatedItems(stack, context, schema, value) {
  const indices = context.GetIndices();
  return guard_exports.Every(value, 0, (item, index) => {
    return (indices.has(index) || CheckSchema(stack, context, schema.unevaluatedItems, item)) && context.AddIndex(index);
  });
}
function ErrorUnevaluatedItems(stack, context, schemaPath, instancePath, schema, value) {
  const indices = context.GetIndices();
  const unevaluatedItems = [];
  const isUnevaluatedItems = guard_exports.EveryAll(value, 0, (item, index) => {
    const nextContext = new AccumulatedErrorContext();
    const isEvaluatedItem = (indices.has(index) || ErrorSchema(stack, nextContext, schemaPath, instancePath, schema.unevaluatedItems, item)) && context.AddIndex(index);
    if (!isEvaluatedItem)
      unevaluatedItems.push(index);
    return isEvaluatedItem;
  });
  return isUnevaluatedItems || context.AddError({
    keyword: "unevaluatedItems",
    schemaPath,
    instancePath,
    params: { unevaluatedItems }
  });
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/unevaluatedProperties.mjs
function CheckUnevaluatedProperties(stack, context, schema, value) {
  const keys = context.GetKeys();
  return guard_exports.Every(guard_exports.Entries(value), 0, ([key, prop]) => {
    return keys.has(key) || CheckSchema(stack, context, schema.unevaluatedProperties, prop) && context.AddKey(key);
  });
}
function ErrorUnevaluatedProperties(stack, context, schemaPath, instancePath, schema, value) {
  const keys = context.GetKeys();
  const unevaluatedProperties = [];
  const isUnevaluatedProperties = guard_exports.EveryAll(guard_exports.Entries(value), 0, ([key, prop]) => {
    const nextContext = new AccumulatedErrorContext();
    const isEvaluatedProperty = keys.has(key) || ErrorSchema(stack, nextContext, schemaPath, instancePath, schema.unevaluatedProperties, prop) && context.AddKey(key);
    if (!isEvaluatedProperty)
      unevaluatedProperties.push(key);
    return isEvaluatedProperty;
  });
  return isUnevaluatedProperties || context.AddError({
    keyword: "unevaluatedProperties",
    schemaPath,
    instancePath,
    params: { unevaluatedProperties }
  });
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/uniqueItems.mjs
function IsValid5(schema) {
  return !guard_exports.IsEqual(schema.uniqueItems, false);
}
function CheckUniqueItems(_stack, _context, schema, value) {
  if (!IsValid5(schema))
    return true;
  const set = new Set(value.map(hash_exports.Hash)).size;
  const isLength = value.length;
  return guard_exports.IsEqual(set, isLength);
}
function ErrorUniqueItems(_stack, context, schemaPath, instancePath, schema, value) {
  if (!IsValid5(schema))
    return true;
  const set = /* @__PURE__ */ new Set();
  const duplicateItems = value.reduce((result, value2, index) => {
    const hash = hash_exports.Hash(value2);
    if (set.has(hash))
      return [...result, index];
    set.add(hash);
    return result;
  }, []);
  const isUniqueItems = guard_exports.IsEqual(duplicateItems.length, 0);
  return isUniqueItems || context.AddError({
    keyword: "uniqueItems",
    schemaPath,
    instancePath,
    params: { duplicateItems }
  });
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/schema.mjs
function CheckSchemaPushStack(stack, context, schema, value) {
  return context.Push() && CheckSchema(stack, context, schema, value) && context.Pop();
}
function CheckSchema(stack, context, schema, value) {
  stack.Push(schema);
  const result = IsBooleanSchema(schema) ? CheckBooleanSchema(stack, context, schema, value) : (!IsType(schema) || CheckType(stack, context, schema, value)) && (!(guard_exports.IsObject(value) && !guard_exports.IsArray(value)) || (!IsRequired(schema) || CheckRequired(stack, context, schema, value)) && (!IsAdditionalProperties(schema) || CheckAdditionalProperties(stack, context, schema, value)) && (!IsDependencies(schema) || CheckDependencies(stack, context, schema, value)) && (!IsDependentRequired(schema) || CheckDependentRequired(stack, context, schema, value)) && (!IsDependentSchemas(schema) || CheckDependentSchemas(stack, context, schema, value)) && (!IsPatternProperties(schema) || CheckPatternProperties(stack, context, schema, value)) && (!IsProperties(schema) || CheckProperties(stack, context, schema, value)) && (!IsPropertyNames(schema) || CheckPropertyNames(stack, context, schema, value)) && (!IsMinProperties(schema) || CheckMinProperties(stack, context, schema, value)) && (!IsMaxProperties(schema) || CheckMaxProperties(stack, context, schema, value))) && (!guard_exports.IsArray(value) || (!IsAdditionalItems(schema) || CheckAdditionalItems(stack, context, schema, value)) && (!IsContains(schema) || CheckContains(stack, context, schema, value)) && (!IsItems(schema) || CheckItems(stack, context, schema, value)) && (!IsMaxContains(schema) || CheckMaxContains(stack, context, schema, value)) && (!IsMaxItems(schema) || CheckMaxItems(stack, context, schema, value)) && (!IsMinContains(schema) || CheckMinContains(stack, context, schema, value)) && (!IsMinItems(schema) || CheckMinItems(stack, context, schema, value)) && (!IsPrefixItems(schema) || CheckPrefixItems(stack, context, schema, value)) && (!IsUniqueItems(schema) || CheckUniqueItems(stack, context, schema, value))) && (!guard_exports.IsString(value) || (!IsMaxLength3(schema) || CheckMaxLength(stack, context, schema, value)) && (!IsMinLength3(schema) || CheckMinLength(stack, context, schema, value)) && (!IsFormat(schema) || CheckFormat(stack, context, schema, value)) && (!IsPattern(schema) || CheckPattern(stack, context, schema, value))) && (!(guard_exports.IsNumber(value) || guard_exports.IsBigInt(value)) || (!IsExclusiveMaximum(schema) || CheckExclusiveMaximum(stack, context, schema, value)) && (!IsExclusiveMinimum(schema) || CheckExclusiveMinimum(stack, context, schema, value)) && (!IsMaximum(schema) || CheckMaximum(stack, context, schema, value)) && (!IsMinimum(schema) || CheckMinimum(stack, context, schema, value)) && (!IsMultipleOf2(schema) || CheckMultipleOf(stack, context, schema, value))) && (!IsRef2(schema) || CheckRef(stack, context, schema, value)) && (!IsRecursiveRef(schema) || CheckRecursiveRef(stack, context, schema, value)) && (!IsDynamicRef(schema) || CheckDynamicRef(stack, context, schema, value)) && (!IsGuard2(schema) || CheckGuard(stack, context, schema, value)) && (!IsConst(schema) || CheckConst(stack, context, schema, value)) && (!IsEnum2(schema) || CheckEnum(stack, context, schema, value)) && (!IsIf(schema) || CheckIf(stack, context, schema, value)) && (!IsNot(schema) || CheckNot(stack, context, schema, value)) && (!IsAllOf(schema) || CheckAllOf(stack, context, schema, value)) && (!IsAnyOf(schema) || CheckAnyOf(stack, context, schema, value)) && (!IsOneOf(schema) || CheckOneOf(stack, context, schema, value)) && (!IsUnevaluatedItems(schema) || (!guard_exports.IsArray(value) || CheckUnevaluatedItems(stack, context, schema, value))) && (!IsUnevaluatedProperties(schema) || (!guard_exports.IsObject(value) || CheckUnevaluatedProperties(stack, context, schema, value))) && (!IsRefine2(schema) || CheckRefine(stack, context, schema, value));
  stack.Pop(schema);
  return result;
}
function ErrorSchemaPushStack(stack, context, schemaPath, instancePath, schema, value) {
  return context.Push() && ErrorSchema(stack, context, schemaPath, instancePath, schema, value) && context.Pop();
}
function ErrorSchema(stack, context, schemaPath, instancePath, schema, value) {
  stack.Push(schema);
  const result = IsBooleanSchema(schema) ? ErrorBooleanSchema(stack, context, schemaPath, instancePath, schema, value) : !!(+(!IsType(schema) || ErrorType(stack, context, schemaPath, instancePath, schema, value)) & +(!(guard_exports.IsObject(value) && !guard_exports.IsArray(value)) || !!(+(!IsRequired(schema) || ErrorRequired(stack, context, schemaPath, instancePath, schema, value)) & +(!IsAdditionalProperties(schema) || ErrorAdditionalProperties(stack, context, schemaPath, instancePath, schema, value)) & +(!IsDependencies(schema) || ErrorDependencies(stack, context, schemaPath, instancePath, schema, value)) & +(!IsDependentRequired(schema) || ErrorDependentRequired(stack, context, schemaPath, instancePath, schema, value)) & +(!IsDependentSchemas(schema) || ErrorDependentSchemas(stack, context, schemaPath, instancePath, schema, value)) & +(!IsPatternProperties(schema) || ErrorPatternProperties(stack, context, schemaPath, instancePath, schema, value)) & +(!IsProperties(schema) || ErrorProperties(stack, context, schemaPath, instancePath, schema, value)) & +(!IsPropertyNames(schema) || ErrorPropertyNames(stack, context, schemaPath, instancePath, schema, value)) & +(!IsMinProperties(schema) || ErrorMinProperties(stack, context, schemaPath, instancePath, schema, value)) & +(!IsMaxProperties(schema) || ErrorMaxProperties(stack, context, schemaPath, instancePath, schema, value)))) & +(!guard_exports.IsArray(value) || !!(+(!IsAdditionalItems(schema) || ErrorAdditionalItems(stack, context, schemaPath, instancePath, schema, value)) & +(!IsContains(schema) || ErrorContains(stack, context, schemaPath, instancePath, schema, value)) & +(!IsItems(schema) || ErrorItems(stack, context, schemaPath, instancePath, schema, value)) & +(!IsMaxContains(schema) || ErrorMaxContains(stack, context, schemaPath, instancePath, schema, value)) & +(!IsMaxItems(schema) || ErrorMaxItems(stack, context, schemaPath, instancePath, schema, value)) & +(!IsMinContains(schema) || ErrorMinContains(stack, context, schemaPath, instancePath, schema, value)) & +(!IsMinItems(schema) || ErrorMinItems(stack, context, schemaPath, instancePath, schema, value)) & +(!IsPrefixItems(schema) || ErrorPrefixItems(stack, context, schemaPath, instancePath, schema, value)) & +(!IsUniqueItems(schema) || ErrorUniqueItems(stack, context, schemaPath, instancePath, schema, value)))) & +(!guard_exports.IsString(value) || !!(+(!IsMaxLength3(schema) || ErrorMaxLength(stack, context, schemaPath, instancePath, schema, value)) & +(!IsMinLength3(schema) || ErrorMinLength(stack, context, schemaPath, instancePath, schema, value)) & +(!IsFormat(schema) || ErrorFormat(stack, context, schemaPath, instancePath, schema, value)) & +(!IsPattern(schema) || ErrorPattern(stack, context, schemaPath, instancePath, schema, value)))) & +(!(guard_exports.IsNumber(value) || guard_exports.IsBigInt(value)) || !!(+(!IsExclusiveMaximum(schema) || ErrorExclusiveMaximum(stack, context, schemaPath, instancePath, schema, value)) & +(!IsExclusiveMinimum(schema) || ErrorExclusiveMinimum(stack, context, schemaPath, instancePath, schema, value)) & +(!IsMaximum(schema) || ErrorMaximum(stack, context, schemaPath, instancePath, schema, value)) & +(!IsMinimum(schema) || ErrorMinimum(stack, context, schemaPath, instancePath, schema, value)) & +(!IsMultipleOf2(schema) || ErrorMultipleOf(stack, context, schemaPath, instancePath, schema, value)))) & +(!IsRef2(schema) || ErrorRef(stack, context, schemaPath, instancePath, schema, value)) & +(!IsRecursiveRef(schema) || ErrorRecursiveRef(stack, context, schemaPath, instancePath, schema, value)) & +(!IsDynamicRef(schema) || ErrorDynamicRef(stack, context, schemaPath, instancePath, schema, value)) & +(!IsGuard2(schema) || ErrorGuard(stack, context, schemaPath, instancePath, schema, value)) & +(!IsConst(schema) || ErrorConst(stack, context, schemaPath, instancePath, schema, value)) & +(!IsEnum2(schema) || ErrorEnum(stack, context, schemaPath, instancePath, schema, value)) & +(!IsIf(schema) || ErrorIf(stack, context, schemaPath, instancePath, schema, value)) & +(!IsNot(schema) || ErrorNot(stack, context, schemaPath, instancePath, schema, value)) & +(!IsAllOf(schema) || ErrorAllOf(stack, context, schemaPath, instancePath, schema, value)) & +(!IsAnyOf(schema) || ErrorAnyOf(stack, context, schemaPath, instancePath, schema, value)) & +(!IsOneOf(schema) || ErrorOneOf(stack, context, schemaPath, instancePath, schema, value)) & +(!IsUnevaluatedItems(schema) || (!guard_exports.IsArray(value) || ErrorUnevaluatedItems(stack, context, schemaPath, instancePath, schema, value))) & +(!IsUnevaluatedProperties(schema) || (!guard_exports.IsObject(value) || ErrorUnevaluatedProperties(stack, context, schemaPath, instancePath, schema, value)))) && (!IsRefine2(schema) || ErrorRefine(stack, context, schemaPath, instancePath, schema, value));
  stack.Pop(schema);
  return result;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/resolve/resolve.mjs
var resolve_exports = {};
__export(resolve_exports, {
  DynamicRef: () => DynamicRef,
  Ref: () => Ref2
});

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/pointer/pointer.mjs
var pointer_exports = {};
__export(pointer_exports, {
  Delete: () => Delete,
  Get: () => Get4,
  Has: () => Has2,
  Indices: () => Indices,
  Set: () => Set4
});
function AssertNotRoot(indices) {
  if (indices.length === 0)
    throw Error("Cannot set root");
}
function AssertCanSet(value) {
  if (!guard_exports.IsObject(value))
    throw Error("Cannot set value");
}
function AssertIndex(index) {
  if (guard_exports.IsUnsafePropertyKey(index))
    throw Error("Pointer contains unsafe property key");
}
function AssertIndices(indices) {
  for (const index of indices)
    AssertIndex(index);
}
function IsNumericIndex(index) {
  return /^(0|[1-9]\d*)$/.test(index);
}
function TakeIndexRight(indices) {
  return [
    indices.slice(0, indices.length - 1),
    indices.slice(indices.length - 1)[0]
  ];
}
function HasIndex(index, value) {
  return guard_exports.IsObject(value) && guard_exports.HasPropertyKey(value, index);
}
function GetIndex(index, value) {
  return guard_exports.IsObject(value) && !guard_exports.IsUnsafePropertyKey(index) ? value[index] : void 0;
}
function GetIndices(indices, value) {
  return indices.reduce((value2, index) => GetIndex(index, value2), value);
}
function Indices(pointer) {
  if (guard_exports.IsEqual(pointer.length, 0))
    return [];
  const indices = pointer.split("/").map((index) => index.replace(/~1/g, "/").replace(/~0/g, "~"));
  return indices.length > 0 && indices[0] === "" ? indices.slice(1) : indices;
}
function Has2(value, pointer) {
  let current = value;
  return Indices(pointer).every((index) => {
    if (!HasIndex(index, current))
      return false;
    current = current[index];
    return true;
  });
}
function Get4(value, pointer) {
  const indices = Indices(pointer);
  return GetIndices(indices, value);
}
function Set4(value, pointer, next) {
  const indices = Indices(pointer);
  AssertNotRoot(indices);
  AssertIndices(indices);
  const [head, index] = TakeIndexRight(indices);
  const parent = GetIndices(head, value);
  AssertCanSet(parent);
  parent[index] = next;
  return value;
}
function Delete(value, pointer) {
  const indices = Indices(pointer);
  AssertNotRoot(indices);
  AssertIndices(indices);
  const [head, index] = TakeIndexRight(indices);
  const parent = GetIndices(head, value);
  AssertCanSet(parent);
  if (guard_exports.IsArray(parent) && IsNumericIndex(index)) {
    parent.splice(+index, 1);
  } else {
    delete parent[index];
  }
  return value;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/resolve/ref.mjs
function MatchId(schema, base, ref) {
  if (schema.$id === ref.hash)
    return schema;
  const absoluteId = new URL(schema.$id, base.href);
  const absoluteRef = new URL(ref.href, base.href);
  if (guard_exports.IsEqual(absoluteId.pathname, absoluteRef.pathname)) {
    return ref.hash.startsWith("#") ? MatchHash(schema, base, ref) : schema;
  }
  return void 0;
}
function MatchAnchor(schema, base, ref) {
  const absoluteAnchor = new URL(`#${schema.$anchor}`, base.href);
  const absoluteRef = new URL(ref.href, base.href);
  return guard_exports.IsEqual(absoluteAnchor.href, absoluteRef.href) ? schema : void 0;
}
function MatchDynamicAnchor(schema, base, ref) {
  const absoluteAnchor = new URL(`#${schema.$dynamicAnchor}`, base.href);
  const absoluteRef = new URL(ref.href, base.href);
  return guard_exports.IsEqual(absoluteAnchor.href, absoluteRef.href) ? schema : void 0;
}
function MatchHash(schema, _base, ref) {
  if (ref.href.endsWith("#"))
    return schema;
  if (!ref.hash.startsWith("#"))
    return void 0;
  const fragment = decodeURIComponent(ref.hash.slice(1));
  if (!fragment.startsWith("/"))
    return void 0;
  return pointer_exports.Get(schema, fragment);
}
function Match4(schema, base, ref) {
  if (IsId(schema)) {
    const result = MatchId(schema, base, ref);
    if (!guard_exports.IsUndefined(result))
      return result;
  }
  if (IsAnchor(schema)) {
    const result = MatchAnchor(schema, base, ref);
    if (!guard_exports.IsUndefined(result))
      return result;
  }
  if (IsDynamicAnchor(schema)) {
    const result = MatchDynamicAnchor(schema, base, ref);
    if (!guard_exports.IsUndefined(result))
      return result;
  }
  return MatchHash(schema, base, ref);
}
function FromArray6(schema, base, ref) {
  return schema.reduce((result, item) => {
    const match = FromValue3(item, base, ref);
    return !guard_exports.IsUndefined(match) ? match : result;
  }, void 0);
}
function FromObject9(schema, base, ref) {
  return guard_exports.Keys(schema).reduce((result, key) => {
    const match = FromValue3(schema[key], base, ref);
    return !guard_exports.IsUndefined(match) ? match : result;
  }, void 0);
}
function FromValue3(schema, base, ref) {
  const nextBase = IsSchemaObject(schema) && IsId(schema) ? new URL(schema.$id, base.href) : base;
  if (IsSchemaObject(schema)) {
    const result = Match4(schema, nextBase, ref);
    if (!guard_exports.IsUndefined(result))
      return result;
  }
  if (guard_exports.IsArray(schema))
    return FromArray6(schema, nextBase, ref);
  if (guard_exports.IsObject(schema))
    return FromObject9(schema, nextBase, ref);
  return void 0;
}
function Ref2(schema, ref) {
  const defaultBase = new URL("http://unknown/");
  const initialBase = IsId(schema) ? new URL(schema.$id, defaultBase.href) : defaultBase;
  const initialRef = new URL(ref, initialBase.href);
  return FromValue3(schema, initialBase, initialRef);
}
function DynamicRef(root, base, dynamicRef, dynamicAnchors) {
  const fragmentTarget = dynamicRef.$dynamicRef.startsWith("#") ? Ref2(base, dynamicRef.$dynamicRef) : Ref2(root, dynamicRef.$dynamicRef);
  if (guard_exports.IsUndefined(fragmentTarget))
    return void 0;
  if (!IsSchemaObject(fragmentTarget) || !IsDynamicAnchor(fragmentTarget))
    return fragmentTarget;
  const fragment = new URL(dynamicRef.$dynamicRef, "http://unknown/").hash;
  if (fragment.startsWith("#/"))
    return fragmentTarget;
  const anchorTarget = dynamicAnchors.find((anchor) => anchor.$dynamicAnchor === fragmentTarget.$dynamicAnchor);
  return anchorTarget ?? fragmentTarget;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/engine/_stack.mjs
var __classPrivateFieldGet = function(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _Stack_instances;
var _Stack_PushResourceAnchors;
var _Stack_PopResourceAnchors;
var _Stack_FromContext;
var _Stack_FromRef;
var Stack = class {
  constructor(context, schema) {
    _Stack_instances.add(this);
    this.context = context;
    this.schema = schema;
    this.ids = [];
    this.anchors = [];
    this.recursiveAnchors = [];
    this.dynamicAnchors = [];
  }
  // ----------------------------------------------------------------
  // Base
  // ----------------------------------------------------------------
  BaseURL() {
    return this.ids.reduce((result, schema) => new URL(schema.$id, result), new URL("http://unknown"));
  }
  Base() {
    return this.ids[this.ids.length - 1] ?? this.schema;
  }
  // ----------------------------------------------------------------
  // Stack
  // ----------------------------------------------------------------
  Push(schema) {
    if (!IsSchemaObject(schema))
      return;
    if (IsId(schema)) {
      this.ids.push(schema);
      __classPrivateFieldGet(this, _Stack_instances, "m", _Stack_PushResourceAnchors).call(this, schema);
    }
    if (IsAnchor(schema))
      this.anchors.push(schema);
    if (IsRecursiveAnchorTrue(schema))
      this.recursiveAnchors.push(schema);
    if (IsDynamicAnchor(schema))
      this.dynamicAnchors.push(schema);
  }
  Pop(schema) {
    if (!IsSchemaObject(schema))
      return;
    if (IsId(schema)) {
      this.ids.pop();
      __classPrivateFieldGet(this, _Stack_instances, "m", _Stack_PopResourceAnchors).call(this, schema);
    }
    if (IsAnchor(schema))
      this.anchors.pop();
    if (IsRecursiveAnchorTrue(schema))
      this.recursiveAnchors.pop();
    if (IsDynamicAnchor(schema))
      this.dynamicAnchors.pop();
  }
  Ref(ref) {
    return __classPrivateFieldGet(this, _Stack_instances, "m", _Stack_FromContext).call(this, ref) ?? __classPrivateFieldGet(this, _Stack_instances, "m", _Stack_FromRef).call(this, ref);
  }
  // ----------------------------------------------------------------
  // RecursiveRef
  // ----------------------------------------------------------------
  RecursiveRef(recursiveRef) {
    return IsRecursiveAnchorTrue(this.Base()) ? resolve_exports.Ref(this.recursiveAnchors[0], recursiveRef.$recursiveRef) : resolve_exports.Ref(this.Base(), recursiveRef.$recursiveRef);
  }
  // ----------------------------------------------------------------
  // DynamicRef
  // ----------------------------------------------------------------
  DynamicRef(dynamicRef) {
    const root = this.schema;
    return resolve_exports.DynamicRef(root, this.Base(), dynamicRef, this.dynamicAnchors);
  }
};
_Stack_instances = /* @__PURE__ */ new WeakSet(), _Stack_PushResourceAnchors = function _Stack_PushResourceAnchors2(schema, isRoot = true) {
  if (!IsSchemaObject(schema))
    return;
  const current = schema;
  if (!isRoot && IsId(current))
    return;
  if (!isRoot && IsDynamicAnchor(current))
    this.dynamicAnchors.push(current);
  for (const key of guard_exports.Keys(current))
    __classPrivateFieldGet(this, _Stack_instances, "m", _Stack_PushResourceAnchors2).call(this, current[key], false);
}, _Stack_PopResourceAnchors = function _Stack_PopResourceAnchors2(schema, isRoot = true) {
  if (!IsSchemaObject(schema))
    return;
  const current = schema;
  if (!isRoot && IsId(current))
    return;
  if (!isRoot && IsDynamicAnchor(current))
    this.dynamicAnchors.pop();
  for (const key of guard_exports.Keys(current))
    __classPrivateFieldGet(this, _Stack_instances, "m", _Stack_PopResourceAnchors2).call(this, current[key], false);
}, _Stack_FromContext = function _Stack_FromContext2(ref) {
  return guard_exports.HasPropertyKey(this.context, ref.$ref) ? this.context[ref.$ref] : void 0;
}, _Stack_FromRef = function _Stack_FromRef2(ref) {
  const root = this.schema;
  return !ref.$ref.startsWith("#") ? resolve_exports.Ref(root, ref.$ref) : resolve_exports.Ref(this.Base(), ref.$ref);
};

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/errors.mjs
function Errors(...args) {
  const [context, schema, value] = arguments_exports.Match(args, {
    3: (context2, schema2, value2) => [context2, schema2, value2],
    2: (schema2, value2) => [{}, schema2, value2]
  });
  const settings2 = settings_exports.Get();
  const locale2 = Get2();
  const errors = [];
  const stack = new Stack(context, schema);
  const errorContext = new ErrorContext((error) => {
    if (guard_exports.IsGreaterEqualThan(errors.length, settings2.maxErrors))
      return;
    return errors.push({ ...error, message: locale2(error) });
  });
  const result = ErrorSchema(stack, errorContext, "#", "", schema, value);
  return [result, errors];
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/schema/check.mjs
function Check(...args) {
  const [context, schema, value] = arguments_exports.Match(args, {
    3: (context2, schema2, value2) => [context2, schema2, value2],
    2: (schema2, value2) => [{}, schema2, value2]
  });
  const stack = new Stack(context, schema);
  const checkContext = new CheckContext();
  return CheckSchema(stack, checkContext, schema, value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/check/check.mjs
function Check2(...args) {
  const [context, type, value] = arguments_exports.Match(args, {
    3: (context2, type2, value2) => [context2, type2, value2],
    2: (type2, value2) => [{}, type2, value2]
  });
  return Check(context, type, value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/errors/errors.mjs
function Errors2(...args) {
  const [context, type, value] = arguments_exports.Match(args, {
    3: (context2, type2, value2) => [context2, type2, value2],
    2: (type2, value2) => [{}, type2, value2]
  });
  const [_, errors] = Errors(context, type, value);
  return errors;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/assert/assert.mjs
var AssertError = class extends Error {
  constructor(source, value, errors) {
    super(source);
    Object.defineProperty(this, "cause", {
      value: { source, errors, value },
      writable: false,
      configurable: false,
      enumerable: false
    });
  }
};

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/clean/from_array.mjs
function FromArray7(context, type, value) {
  if (!guard_exports.IsArray(value))
    return value;
  return value.map((value2) => FromType19(context, type.items, value2));
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/clean/from_base.mjs
function FromBase(_context, type, value) {
  return type.Clean(value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/clean/from_cyclic.mjs
function FromCyclic6(context, type, value) {
  return FromType19({ ...context, ...type.$defs }, Ref(type.$ref), value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/clean/from_intersect.mjs
function EvaluateIntersection(context, type) {
  const additionalProperties = guard_exports.HasPropertyKey(type, "unevaluatedProperties") ? { additionalProperties: type.unevaluatedProperties } : {};
  const instantiated = Instantiate(context, type);
  const evaluated = Evaluate(instantiated);
  return IsObject2(evaluated) ? Options2(evaluated, additionalProperties) : evaluated;
}
function FromIntersect6(context, type, value) {
  const evaluated = EvaluateIntersection(context, type);
  return FromType19(context, evaluated, value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/clean/additional.mjs
function GetAdditionalProperties(type) {
  const additionalProperties = guard_exports.HasPropertyKey(type, "additionalProperties") ? type.additionalProperties : void 0;
  return additionalProperties;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/clean/from_object.mjs
function FromObject10(context, type, value) {
  if (!guard_exports.IsObject(value) || guard_exports.IsArray(value))
    return value;
  const additionalProperties = GetAdditionalProperties(type);
  for (const key of guard_exports.Keys(value)) {
    if (guard_exports.HasPropertyKey(type.properties, key)) {
      value[key] = FromType19(context, type.properties[key], value[key]);
      continue;
    }
    const unknownCheck = (
      // 1. additionalProperties: true
      guard_exports.IsBoolean(additionalProperties) && guard_exports.IsEqual(additionalProperties, true) || IsSchema(additionalProperties) && Check2(context, additionalProperties, value[key])
    );
    if (unknownCheck) {
      value[key] = FromType19(context, additionalProperties, value[key]);
      continue;
    }
    delete value[key];
  }
  return value;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/clean/from_record.mjs
function FromRecord2(context, type, value) {
  if (!guard_exports.IsObject(value))
    return value;
  const additionalProperties = GetAdditionalProperties(type);
  const [recordPattern, recordValue] = [new RegExp(RecordPattern(type)), RecordValue(type)];
  for (const key of guard_exports.Keys(value)) {
    if (recordPattern.test(key)) {
      value[key] = FromType19(context, recordValue, value[key]);
      continue;
    }
    const unknownCheck = (
      // 1. additionalProperties: true
      guard_exports.IsBoolean(additionalProperties) && guard_exports.IsEqual(additionalProperties, true) || IsSchema(additionalProperties) && Check2(context, additionalProperties, value[key])
    );
    if (unknownCheck) {
      value[key] = FromType19(context, additionalProperties, value[key]);
      continue;
    }
    delete value[key];
  }
  return value;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/clean/from_ref.mjs
function FromRef5(context, type, value) {
  return guard_exports.HasPropertyKey(context, type.$ref) ? FromType19(context, context[type.$ref], value) : value;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/clean/from_tuple.mjs
function FromTuple5(context, schema, value) {
  if (!guard_exports.IsArray(value))
    return value;
  const length = Math.min(value.length, schema.items.length);
  for (let index = 0; index < length; index++) {
    value[index] = FromType19(context, schema.items[index], value[index]);
  }
  return guard_exports.IsGreaterThan(value.length, length) ? value.slice(0, length) : value;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/clone/clone.mjs
function FromClassInstance(value) {
  return value;
}
function FromObjectInstance(value) {
  const result = {};
  for (const key of guard_exports.Keys(value)) {
    if (guard_exports.IsUnsafePropertyKey(key))
      continue;
    result[key] = Clone2(value[key]);
  }
  for (const key of guard_exports.Symbols(value)) {
    result[key] = Clone2(value[key]);
  }
  return result;
}
function FromObject11(value) {
  return guard_exports.IsClassInstance(value) ? FromClassInstance(value) : FromObjectInstance(value);
}
function FromArray8(value) {
  return value.map((element) => Clone2(element));
}
function FromTypedArray(value) {
  return value.slice();
}
function FromMap(value) {
  return new Map(Clone2([...value.entries()]));
}
function FromSet(value) {
  return new Set(Clone2([...value.values()]));
}
function FromValue4(value) {
  return value;
}
function Clone2(value) {
  return globals_exports.IsTypeArray(value) ? FromTypedArray(value) : globals_exports.IsMap(value) ? FromMap(value) : globals_exports.IsSet(value) ? FromSet(value) : guard_exports.IsArray(value) ? FromArray8(value) : guard_exports.IsObject(value) ? FromObject11(value) : FromValue4(value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/shared/union_priority_sort.mjs
function DeterministicCompare(left, right) {
  return JSON.stringify(left).localeCompare(JSON.stringify(right));
}
function UnionPrioritySort(types, order = 1) {
  return types.sort((left, right) => {
    const result = Compare(left, right);
    return (guard_exports.IsEqual(result, "disjoint") ? DeterministicCompare(left, right) : guard_exports.IsEqual(result, "right-inside") ? 1 : guard_exports.IsEqual(result, "left-inside") ? -1 : DeterministicCompare(left, right)) * order;
  });
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/clean/from_union.mjs
function FromUnion9(context, type, value) {
  for (const schema of UnionPrioritySort(type.anyOf)) {
    const clean = FromType19(context, schema, Clone2(value));
    if (Check2(context, schema, clean))
      return clean;
  }
  return value;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/clean/from_type.mjs
function FromType19(context, type, value) {
  return IsArray2(type) ? FromArray7(context, type, value) : IsBase(type) ? FromBase(context, type, value) : IsCyclic(type) ? FromCyclic6(context, type, value) : IsIntersect(type) ? FromIntersect6(context, type, value) : IsObject2(type) ? FromObject10(context, type, value) : IsRecord(type) ? FromRecord2(context, type, value) : IsRef(type) ? FromRef5(context, type, value) : IsTuple(type) ? FromTuple5(context, type, value) : IsUnion(type) ? FromUnion9(context, type, value) : value;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/clean/clean.mjs
function Clean(...args) {
  const [context, type, value] = arguments_exports.Match(args, {
    3: (context2, type2, value2) => [context2, type2, value2],
    2: (type2, value2) => [{}, type2, value2]
  });
  return FromType19(context, type, value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/convert/try/try.mjs
var try_exports = {};
__export(try_exports, {
  Fail: () => Fail,
  IsOk: () => IsOk,
  Ok: () => Ok,
  TryArray: () => TryArray,
  TryBigInt: () => TryBigInt,
  TryBoolean: () => TryBoolean,
  TryNull: () => TryNull,
  TryNumber: () => TryNumber,
  TryString: () => TryString,
  TryUndefined: () => TryUndefined
});

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/convert/try/try_result.mjs
function IsOk(value) {
  return guard_exports.IsObject(value) && guard_exports.HasPropertyKey(value, "value");
}
function Ok(value) {
  return { value };
}
function Fail() {
  return void 0;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/convert/try/try_array.mjs
function TryArray(value) {
  return guard_exports.IsArray(value) ? Ok(value) : Ok([value]);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/convert/try/try_bigint.mjs
function FromBoolean2(value) {
  return guard_exports.IsEqual(value, true) ? Ok(BigInt(1)) : Ok(BigInt(0));
}
var bigintPattern = /^-?(0|[1-9]\d*)n$/;
var decimalPattern = /^-?(0|[1-9]\d*)\.\d+$/;
var integerPattern = /^-?(0|[1-9]\d*)$/;
function IsStringBigIntLike(value) {
  return bigintPattern.test(value);
}
function IsStringDecimalLike(value) {
  return decimalPattern.test(value);
}
function IsStringIntegerLike(value) {
  return integerPattern.test(value);
}
function FromString2(value) {
  const lowercase = value.toLowerCase();
  return IsStringBigIntLike(value) ? Ok(BigInt(value.slice(0, value.length - 1))) : IsStringDecimalLike(value) ? Ok(BigInt(value.split(".")[0])) : IsStringIntegerLike(value) ? Ok(BigInt(value)) : guard_exports.IsEqual(lowercase, "false") ? Ok(BigInt(0)) : guard_exports.IsEqual(lowercase, "true") ? Ok(BigInt(1)) : Fail();
}
function TryBigInt(value) {
  return guard_exports.IsBigInt(value) ? Ok(value) : guard_exports.IsBoolean(value) ? FromBoolean2(value) : guard_exports.IsNumber(value) ? Ok(BigInt(Math.trunc(value))) : guard_exports.IsNull(value) ? Ok(BigInt(0)) : guard_exports.IsString(value) ? FromString2(value) : guard_exports.IsUndefined(value) ? Ok(BigInt(0)) : Fail();
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/convert/try/try_boolean.mjs
function FromBigInt2(value) {
  return guard_exports.IsEqual(value, BigInt(0)) ? Ok(false) : guard_exports.IsEqual(value, BigInt(1)) ? Ok(true) : Fail();
}
function FromNumber2(value) {
  return guard_exports.IsEqual(value, 0) ? Ok(false) : guard_exports.IsEqual(value, 1) ? Ok(true) : Fail();
}
function FromString3(value) {
  return guard_exports.IsEqual(value.toLowerCase(), "false") ? Ok(false) : guard_exports.IsEqual(value.toLowerCase(), "true") ? Ok(true) : guard_exports.IsEqual(value, "0") ? Ok(false) : guard_exports.IsEqual(value, "1") ? Ok(true) : Fail();
}
function TryBoolean(value) {
  return guard_exports.IsBigInt(value) ? FromBigInt2(value) : guard_exports.IsBoolean(value) ? Ok(value) : guard_exports.IsNumber(value) ? FromNumber2(value) : guard_exports.IsNull(value) ? Ok(false) : guard_exports.IsString(value) ? FromString3(value) : guard_exports.IsUndefined(value) ? Ok(false) : Fail();
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/convert/try/try_null.mjs
function FromBigInt3(value) {
  return guard_exports.IsEqual(value, BigInt(0)) ? Ok(null) : Fail();
}
function FromBoolean3(value) {
  return guard_exports.IsEqual(value, false) ? Ok(null) : Fail();
}
function FromNumber3(value) {
  return guard_exports.IsEqual(value, 0) ? Ok(null) : Fail();
}
function FromString4(value) {
  const lowercase = value.toLowerCase();
  const predicate = guard_exports.IsEqual(lowercase, "undefined") || guard_exports.IsEqual(lowercase, "null") || guard_exports.IsEqual(value, "") || guard_exports.IsEqual(value, "0");
  return predicate ? Ok(null) : Fail();
}
function TryNull(value) {
  return guard_exports.IsBigInt(value) ? FromBigInt3(value) : guard_exports.IsBoolean(value) ? FromBoolean3(value) : guard_exports.IsNumber(value) ? FromNumber3(value) : guard_exports.IsNull(value) ? Ok(null) : guard_exports.IsString(value) ? FromString4(value) : guard_exports.IsUndefined(value) ? Ok(null) : Fail();
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/convert/try/try_number.mjs
var maxBigInt = BigInt(Number.MAX_SAFE_INTEGER);
var minBigInt = BigInt(Number.MIN_SAFE_INTEGER);
function FromBigInt4(value) {
  return value <= maxBigInt && value >= minBigInt ? Ok(Number(value)) : Fail();
}
function FromBoolean4(value) {
  return Ok(value ? 1 : 0);
}
function FromString5(value) {
  const coerced = +value;
  if (guard_exports.IsNumber(coerced))
    return Ok(coerced);
  const lowercase = value.toLowerCase();
  if (guard_exports.IsEqual(lowercase, "false"))
    return Ok(0);
  if (guard_exports.IsEqual(lowercase, "true"))
    return Ok(1);
  const result = TryBigInt(value);
  if (IsOk(result))
    return result.value <= maxBigInt && result.value >= minBigInt ? Ok(Number(result.value)) : Fail();
  return Fail();
}
function TryNumber(value) {
  return guard_exports.IsBigInt(value) ? FromBigInt4(value) : guard_exports.IsBoolean(value) ? FromBoolean4(value) : guard_exports.IsNumber(value) ? Ok(value) : guard_exports.IsNull(value) ? Ok(0) : guard_exports.IsString(value) ? FromString5(value) : guard_exports.IsUndefined(value) ? Ok(0) : Fail();
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/convert/try/try_string.mjs
function TryString(value) {
  return guard_exports.IsBigInt(value) ? Ok(value.toString()) : guard_exports.IsBoolean(value) ? Ok(value.toString()) : guard_exports.IsNumber(value) ? Ok(value.toString()) : guard_exports.IsNull(value) ? Ok("null") : guard_exports.IsString(value) ? Ok(value) : guard_exports.IsUndefined(value) ? Ok("") : Fail();
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/convert/try/try_undefined.mjs
function FromBigInt5(value) {
  return guard_exports.IsEqual(value, BigInt(0)) ? Ok(void 0) : Fail();
}
function FromBoolean5(value) {
  return guard_exports.IsEqual(value, false) ? Ok(void 0) : Fail();
}
function FromNumber4(value) {
  return guard_exports.IsEqual(value, 0) ? Ok(void 0) : Fail();
}
function FromString6(value) {
  const lowercase = value.toLowerCase();
  const predicate = guard_exports.IsEqual(lowercase, "undefined") || guard_exports.IsEqual(lowercase, "null") || guard_exports.IsEqual(value, "") || guard_exports.IsEqual(value, "0");
  return predicate ? Ok(void 0) : Fail();
}
function TryUndefined(value) {
  return guard_exports.IsBigInt(value) ? FromBigInt5(value) : guard_exports.IsBoolean(value) ? FromBoolean5(value) : guard_exports.IsNumber(value) ? FromNumber4(value) : guard_exports.IsNull(value) ? Ok(void 0) : guard_exports.IsString(value) ? FromString6(value) : guard_exports.IsUndefined(value) ? Ok(value) : Fail();
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/convert/from_array.mjs
function FromArray9(context, type, value) {
  const result = try_exports.TryArray(value);
  return result.value.map((value2) => FromType20(context, type.items, value2));
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/convert/from_base.mjs
function FromBase2(_context, type, value) {
  return type.Convert(value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/convert/from_bigint.mjs
function FromBigInt6(_context, _type, value) {
  const result = try_exports.TryBigInt(value);
  return try_exports.IsOk(result) ? result.value : value;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/convert/from_boolean.mjs
function FromBoolean6(_context, _type, value) {
  const result = try_exports.TryBoolean(value);
  return try_exports.IsOk(result) ? result.value : value;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/convert/from_cyclic.mjs
function FromCyclic7(context, type, value) {
  return FromType20({ ...context, ...type.$defs }, Ref(type.$ref), value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/convert/from_union.mjs
function FromUnion10(context, type, value) {
  const matched = type.anyOf.some((type2) => Check2(context, type2, value));
  if (matched)
    return value;
  const candidates = type.anyOf.map((type2) => FromType20(context, type2, Clone2(value)));
  const selected = candidates.find((value2) => Check2(context, type, value2));
  return guard_exports.IsUndefined(selected) ? value : selected;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/convert/from_enum.mjs
function FromEnum2(context, type, value) {
  const union = EnumToUnion(type);
  return FromUnion10(context, union, value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/convert/from_integer.mjs
function FromInteger(_context, _type, value) {
  const result = try_exports.TryNumber(value);
  return try_exports.IsOk(result) ? Math.trunc(result.value) : value;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/convert/from_intersect.mjs
function FromIntersect7(context, type, value) {
  const instantiated = Instantiate(context, type);
  const evaluated = Evaluate(instantiated);
  return FromType20(context, evaluated, value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/convert/from_literal.mjs
function FromLiteralBigInt(_context, type, value) {
  const result = try_exports.TryBigInt(value);
  return try_exports.IsOk(result) && guard_exports.IsEqual(type.const, result.value) ? result.value : value;
}
function FromLiteralBoolean(_context, type, value) {
  const result = try_exports.TryBoolean(value);
  return try_exports.IsOk(result) && guard_exports.IsEqual(type.const, result.value) ? result.value : value;
}
function FromLiteralNumber(_context, type, value) {
  const result = try_exports.TryNumber(value);
  return try_exports.IsOk(result) && guard_exports.IsEqual(type.const, result.value) ? result.value : value;
}
function FromLiteralString(_context, type, value) {
  const result = try_exports.TryString(value);
  return try_exports.IsOk(result) && guard_exports.IsEqual(type.const, result.value) ? result.value : value;
}
function FromLiteral6(context, type, value) {
  if (guard_exports.IsEqual(type.const, value))
    return value;
  return IsLiteralBigInt(type) ? FromLiteralBigInt(context, type, value) : IsLiteralBoolean(type) ? FromLiteralBoolean(context, type, value) : IsLiteralNumber(type) ? FromLiteralNumber(context, type, value) : IsLiteralString(type) ? FromLiteralString(context, type, value) : Unreachable();
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/convert/from_null.mjs
function FromNull2(_context, _type, value) {
  const result = try_exports.TryNull(value);
  return try_exports.IsOk(result) ? result.value : value;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/convert/from_number.mjs
function FromNumber5(_context, _type, value) {
  const result = try_exports.TryNumber(value);
  return try_exports.IsOk(result) ? result.value : value;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/convert/from_additional.mjs
function FromAdditionalProperties(context, entries, additionalProperties, value) {
  const keys = guard_exports.Keys(value);
  for (const [regexp, _] of entries) {
    for (const key of keys) {
      if (!regexp.test(key)) {
        value[key] = FromType20(context, additionalProperties, value[key]);
      }
    }
  }
  return value;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/shared/optional_undefined.mjs
function IsOptionalUndefined(property, key, value) {
  return IsOptional(property) && guard_exports.IsUndefined(value[key]);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/convert/from_object.mjs
function FromProperties4(context, type, value) {
  const entries = guard_exports.EntriesRegExp(type.properties);
  const keys = guard_exports.Keys(value);
  for (const [regexp, property] of entries) {
    for (const key of keys) {
      if (!regexp.test(key) || IsOptionalUndefined(property, key, value))
        continue;
      value[key] = FromType20(context, property, value[key]);
    }
  }
  return guard_exports.HasPropertyKey(type, "additionalProperties") && guard_exports.IsObject(type.additionalProperties) ? FromAdditionalProperties(context, entries, type.additionalProperties, value) : value;
}
function FromObject12(context, type, value) {
  return guard_exports.IsObjectNotArray(value) ? FromProperties4(context, type, value) : value;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/convert/from_record.mjs
function FromPatternProperties(context, type, value) {
  const entries = guard_exports.EntriesRegExp(type.patternProperties);
  const keys = guard_exports.Keys(value);
  for (const [regexp, schema] of entries) {
    for (const key of keys) {
      if (regexp.test(key)) {
        value[key] = FromType20(context, schema, value[key]);
      }
    }
  }
  return guard_exports.HasPropertyKey(type, "additionalProperties") && guard_exports.IsObject(type.additionalProperties) ? FromAdditionalProperties(context, entries, type.additionalProperties, value) : value;
}
function FromRecord3(context, type, value) {
  return guard_exports.IsObjectNotArray(value) ? FromPatternProperties(context, type, value) : value;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/convert/from_ref.mjs
function FromRef6(context, type, value) {
  return guard_exports.HasPropertyKey(context, type.$ref) ? FromType20(context, context[type.$ref], value) : value;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/convert/from_string.mjs
function FromString7(_context, _type, value) {
  const result = try_exports.TryString(value);
  return try_exports.IsOk(result) ? result.value : value;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/convert/from_template_literal.mjs
function FromTemplateLiteral4(context, type, value) {
  const decoded = TemplateLiteralDecode(type.pattern);
  return FromType20(context, decoded, value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/convert/from_tuple.mjs
function FromTuple6(context, type, value) {
  if (!guard_exports.IsArray(value))
    return value;
  for (let index = 0; index < Math.min(type.items.length, value.length); index++) {
    value[index] = FromType20(context, type.items[index], value[index]);
  }
  return value;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/convert/from_undefined.mjs
function FromUndefined2(_context, _type, value) {
  const result = try_exports.TryUndefined(value);
  return try_exports.IsOk(result) ? result.value : value;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/convert/from_void.mjs
function FromVoid(_context, _type, value) {
  const result = try_exports.TryUndefined(value);
  return try_exports.IsOk(result) ? void 0 : value;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/convert/from_type.mjs
function FromType20(context, type, value) {
  return IsArray2(type) ? FromArray9(context, type, value) : IsBase(type) ? FromBase2(context, type, value) : IsBigInt2(type) ? FromBigInt6(context, type, value) : IsBoolean3(type) ? FromBoolean6(context, type, value) : IsCyclic(type) ? FromCyclic7(context, type, value) : IsEnum(type) ? FromEnum2(context, type, value) : IsInteger2(type) ? FromInteger(context, type, value) : IsIntersect(type) ? FromIntersect7(context, type, value) : IsLiteral(type) ? FromLiteral6(context, type, value) : IsNull2(type) ? FromNull2(context, type, value) : IsNumber3(type) ? FromNumber5(context, type, value) : IsObject2(type) ? FromObject12(context, type, value) : IsRecord(type) ? FromRecord3(context, type, value) : IsRef(type) ? FromRef6(context, type, value) : IsString3(type) ? FromString7(context, type, value) : IsTemplateLiteral(type) ? FromTemplateLiteral4(context, type, value) : IsTuple(type) ? FromTuple6(context, type, value) : IsUndefined2(type) ? FromUndefined2(context, type, value) : IsUnion(type) ? FromUnion10(context, type, value) : IsVoid(type) ? FromVoid(context, type, value) : value;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/convert/convert.mjs
function Convert(...args) {
  const [context, type, value] = arguments_exports.Match(args, {
    3: (context2, type2, value2) => [context2, type2, value2],
    2: (type2, value2) => [{}, type2, value2]
  });
  return FromType20(context, type, value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/default/from_array.mjs
function FromArray10(context, type, value) {
  if (!guard_exports.IsArray(value))
    return value;
  for (let i = 0; i < value.length; i++) {
    value[i] = FromType21(context, type.items, value[i]);
  }
  return value;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/default/from_base.mjs
function FromBase3(context, type, value) {
  return type.Default(value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/default/from_cyclic.mjs
function FromCyclic8(context, type, value) {
  return FromType21({ ...context, ...type.$defs }, Ref(type.$ref), value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/default/from_default.mjs
function FromDefault(type, value) {
  if (!guard_exports.IsUndefined(value))
    return value;
  return guard_exports.IsFunction(type.default) ? type.default() : Clone2(type.default);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/default/from_intersect.mjs
function FromIntersect8(context, type, value) {
  const instantiated = Instantiate(context, type);
  const evaluated = Evaluate(instantiated);
  return FromType21(context, evaluated, value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/default/from_object.mjs
function FromObject13(context, type, value) {
  if (!guard_exports.IsObject(value))
    return value;
  const knownPropertyKeys = guard_exports.Keys(type.properties);
  for (const key of knownPropertyKeys) {
    const propertyValue = FromType21(context, type.properties[key], value[key]);
    const isUnassignableUndefined = guard_exports.IsUndefined(propertyValue) && (IsOptional(type.properties[key]) || !guard_exports.HasPropertyKey(type.properties[key], "default"));
    if (isUnassignableUndefined)
      continue;
    value[key] = FromType21(context, type.properties[key], value[key]);
  }
  if (!IsAdditionalProperties(type) || guard_exports.IsBoolean(type.additionalProperties))
    return value;
  for (const key of guard_exports.Keys(value)) {
    if (knownPropertyKeys.includes(key))
      continue;
    value[key] = FromType21(context, type.additionalProperties, value[key]);
  }
  return value;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/default/from_record.mjs
function FromRecord4(context, type, value) {
  if (!guard_exports.IsObject(value))
    return value;
  const [recordKey, recordValue] = [new RegExp(RecordPattern(type)), RecordValue(type)];
  for (const key of guard_exports.Keys(value)) {
    if (!(recordKey.test(key) && IsDefault(recordValue)))
      continue;
    value[key] = FromType21(context, recordValue, value[key]);
  }
  if (!IsAdditionalProperties(type))
    return value;
  for (const key of guard_exports.Keys(value)) {
    if (recordKey.test(key))
      continue;
    value[key] = FromType21(context, type.additionalProperties, value[key]);
  }
  return value;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/default/from_ref.mjs
function FromRef7(context, type, value) {
  return guard_exports.HasPropertyKey(context, type.$ref) ? FromType21(context, context[type.$ref], value) : value;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/default/from_tuple.mjs
function FromTuple7(context, schema, value) {
  if (!guard_exports.IsArray(value))
    return value;
  const [items, max] = [schema.items, Math.max(schema.items.length, value.length)];
  for (let i = 0; i < max; i++) {
    if (i < items.length)
      value[i] = FromType21(context, items[i], value[i]);
  }
  return value;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/default/from_union.mjs
function FromUnion11(context, schema, value) {
  for (const inner of schema.anyOf) {
    const result = FromType21(context, inner, Clone2(value));
    if (Check2(context, inner, result)) {
      return result;
    }
  }
  return value;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/default/from_type.mjs
function FromType21(context, type, value) {
  const defaulted = IsDefault(type) ? FromDefault(type, value) : value;
  return IsArray2(type) ? FromArray10(context, type, defaulted) : IsBase(type) ? FromBase3(context, type, defaulted) : IsCyclic(type) ? FromCyclic8(context, type, defaulted) : IsIntersect(type) ? FromIntersect8(context, type, defaulted) : IsObject2(type) ? FromObject13(context, type, defaulted) : IsRecord(type) ? FromRecord4(context, type, defaulted) : IsRef(type) ? FromRef7(context, type, defaulted) : IsTuple(type) ? FromTuple7(context, type, defaulted) : IsUnion(type) ? FromUnion11(context, type, defaulted) : defaulted;
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/default/default.mjs
function Default(...args) {
  const [context, type, value] = arguments_exports.Match(args, {
    3: (context2, type2, value2) => [context2, type2, value2],
    2: (type2, value2) => [{}, type2, value2]
  });
  return FromType21(context, type, value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/pipeline/pipeline.mjs
function Pipeline(pipeline) {
  return (...args) => {
    const [context, type, value] = arguments_exports.Match(args, {
      3: (context2, type2, value2) => [context2, type2, value2],
      2: (type2, value2) => [{}, type2, value2]
    });
    return pipeline.reduce((result, func) => func(context, type, result), value);
  };
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/codec/callback.mjs
function Decode3(_context, type, value) {
  return type["~codec"].decode(value);
}
function Encode2(_context, type, value) {
  return type["~codec"].encode(value);
}
function Callback(direction, context, type, value) {
  if (!IsCodec(type))
    return value;
  return guard_exports.IsEqual(direction, "Decode") ? Decode3(context, type, value) : Encode2(context, type, value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/codec/from_array.mjs
function Decode4(direction, context, type, value) {
  if (!guard_exports.IsArray(value))
    return Unreachable();
  for (let i = 0; i < value.length; i++) {
    value[i] = FromType22(direction, context, type.items, value[i]);
  }
  return Callback(direction, context, type, value);
}
function Encode3(direction, context, type, value) {
  const exterior = Callback(direction, context, type, value);
  if (!guard_exports.IsArray(exterior))
    return exterior;
  for (let i = 0; i < exterior.length; i++) {
    exterior[i] = FromType22(direction, context, type.items, exterior[i]);
  }
  return exterior;
}
function FromArray11(direction, context, type, value) {
  return guard_exports.IsEqual(direction, "Decode") ? Decode4(direction, context, type, value) : Encode3(direction, context, type, value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/codec/from_cyclic.mjs
function FromCyclic9(direction, context, type, value) {
  value = FromType22(direction, { ...context, ...type.$defs }, Ref(type.$ref), value);
  return Callback(direction, context, type, value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/codec/from_intersect.mjs
function MergeInteriors(interiors) {
  return interiors.reduce((results, interior) => ({ ...results, ...interior }), {});
}
function NonMatchingInterior(value, interiors) {
  for (const interior of interiors)
    if (!guard_exports.IsDeepEqual(value, interior))
      return interior;
  return value;
}
function Decode5(direction, context, type, value) {
  if (guard_exports.IsEqual(type.allOf.length, 0))
    return Callback(direction, context, type, value);
  const interiors = type.allOf.map((schema) => FromType22(direction, context, schema, Clean(schema, Clone2(value))));
  const structural = interiors.every((result) => guard_exports.IsObject(result));
  const exterior = structural ? MergeInteriors(interiors) : NonMatchingInterior(value, interiors);
  return Callback(direction, context, type, exterior);
}
function Encode4(direction, context, type, value) {
  if (guard_exports.IsEqual(type.allOf.length, 0))
    return Callback(direction, context, type, value);
  const exterior = Callback(direction, context, type, value);
  const interiors = type.allOf.map((schema) => FromType22(direction, context, schema, Clean(schema, Clone2(exterior))));
  const structural = interiors.every((result) => guard_exports.IsObject(result));
  if (structural)
    return MergeInteriors(interiors);
  return NonMatchingInterior(exterior, interiors);
}
function FromIntersect9(direction, context, type, value) {
  return guard_exports.IsEqual(direction, "Decode") ? Decode5(direction, context, type, value) : Encode4(direction, context, type, value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/codec/from_object.mjs
function Decode6(direction, context, type, value) {
  if (!guard_exports.IsObjectNotArray(value))
    return Unreachable();
  for (const key of guard_exports.Keys(type.properties)) {
    if (!guard_exports.HasPropertyKey(value, key) || IsOptionalUndefined(type.properties[key], key, value))
      continue;
    value[key] = FromType22(direction, context, type.properties[key], value[key]);
  }
  return Callback(direction, context, type, value);
}
function Encode5(direction, context, type, value) {
  const exterior = Callback(direction, context, type, value);
  if (!guard_exports.IsObjectNotArray(exterior))
    return exterior;
  for (const key of guard_exports.Keys(type.properties)) {
    if (!guard_exports.HasPropertyKey(exterior, key) || IsOptionalUndefined(type.properties[key], key, exterior))
      continue;
    exterior[key] = FromType22(direction, context, type.properties[key], exterior[key]);
  }
  return exterior;
}
function FromObject14(direction, context, type, value) {
  return guard_exports.IsEqual(direction, "Decode") ? Decode6(direction, context, type, value) : Encode5(direction, context, type, value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/codec/from_record.mjs
function Decode7(direction, context, type, value) {
  if (!guard_exports.IsObjectNotArray(value))
    return Unreachable();
  const regexp = new RegExp(RecordPattern(type));
  for (const key of guard_exports.Keys(value)) {
    if (!regexp.test(key))
      Unreachable();
    value[key] = FromType22(direction, context, RecordValue(type), value[key]);
  }
  return Callback(direction, context, type, value);
}
function Encode6(direction, context, type, value) {
  const exterior = Callback(direction, context, type, value);
  if (!guard_exports.IsObjectNotArray(exterior))
    return exterior;
  const regexp = new RegExp(RecordPattern(type));
  for (const key of guard_exports.Keys(exterior)) {
    if (!regexp.test(key))
      continue;
    exterior[key] = FromType22(direction, context, RecordValue(type), exterior[key]);
  }
  return exterior;
}
function FromRecord5(direction, context, type, value) {
  return guard_exports.IsEqual(direction, "Decode") ? Decode7(direction, context, type, value) : Encode6(direction, context, type, value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/codec/from_ref.mjs
function ResolveRef(direction, context, type, value) {
  return guard_exports.HasPropertyKey(context, type.$ref) ? FromType22(direction, context, context[type.$ref], value) : value;
}
function FromRef8(direction, context, type, value) {
  return guard_exports.IsEqual(direction, "Decode") ? Callback(direction, context, type, ResolveRef(direction, context, type, value)) : ResolveRef(direction, context, type, Callback(direction, context, type, value));
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/codec/from_tuple.mjs
function Decode8(direction, context, type, value) {
  if (!guard_exports.IsArray(value))
    return Unreachable();
  for (let i = 0; i < Math.min(type.items.length, value.length); i++) {
    value[i] = FromType22(direction, context, type.items[i], value[i]);
  }
  return Callback(direction, context, type, value);
}
function Encode7(direction, context, type, value) {
  const exterior = Callback(direction, context, type, value);
  if (!guard_exports.IsArray(exterior))
    return value;
  for (let i = 0; i < Math.min(type.items.length, exterior.length); i++) {
    exterior[i] = FromType22(direction, context, type.items[i], exterior[i]);
  }
  return exterior;
}
function FromTuple8(direction, context, type, value) {
  return guard_exports.IsEqual(direction, "Decode") ? Decode8(direction, context, type, value) : Encode7(direction, context, type, value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/codec/from_union.mjs
function Decode9(direction, context, type, value) {
  for (const schema of UnionPrioritySort(type.anyOf, 1)) {
    if (!Check2(context, schema, value))
      continue;
    const variant = FromType22(direction, context, schema, value);
    return Callback(direction, context, type, variant);
  }
  return value;
}
function Encode8(direction, context, type, value) {
  const exterior = Callback(direction, context, type, value);
  for (const schema of UnionPrioritySort(type.anyOf, -1)) {
    const variant = FromType22(direction, context, schema, Clone2(exterior));
    if (!Check2(context, schema, variant))
      continue;
    return variant;
  }
  return exterior;
}
function FromUnion12(direction, context, type, value) {
  return guard_exports.IsEqual(direction, "Decode") ? Decode9(direction, context, type, value) : Encode8(direction, context, type, value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/codec/from_type.mjs
function FromType22(direction, context, type, value) {
  return IsArray2(type) ? FromArray11(direction, context, type, value) : IsCyclic(type) ? FromCyclic9(direction, context, type, value) : IsIntersect(type) ? FromIntersect9(direction, context, type, value) : IsObject2(type) ? FromObject14(direction, context, type, value) : IsRecord(type) ? FromRecord5(direction, context, type, value) : IsRef(type) ? FromRef8(direction, context, type, value) : IsTuple(type) ? FromTuple8(direction, context, type, value) : IsUnion(type) ? FromUnion12(direction, context, type, value) : Callback(direction, context, type, value);
}

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/codec/decode.mjs
var DecodeError = class extends AssertError {
  constructor(value, errors) {
    super("Decode", value, errors);
  }
};
function Assert(context, type, value) {
  if (!Check2(context, type, value))
    throw new DecodeError(value, Errors2(context, type, value));
  return value;
}
function DecodeUnsafe(context, type, value) {
  return FromType22("Decode", context, type, value);
}
var Decoder = Pipeline([
  (_context, _type, value) => Clone2(value),
  (context, type, value) => Default(context, type, value),
  (context, type, value) => Convert(context, type, value),
  (context, type, value) => Clean(context, type, value),
  (context, type, value) => Assert(context, type, value),
  (context, type, value) => DecodeUnsafe(context, type, value)
]);

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/codec/encode.mjs
var EncodeError = class extends AssertError {
  constructor(value, errors) {
    super("Encode", value, errors);
  }
};
function Assert2(context, type, value) {
  if (!Check2(context, type, value))
    throw new EncodeError(value, Errors2(context, type, value));
  return value;
}
function EncodeUnsafe(context, type, value) {
  return FromType22("Encode", context, type, value);
}
var Encoder = Pipeline([
  (_context, _type, value) => Clone2(value),
  (context, type, value) => EncodeUnsafe(context, type, value),
  (context, type, value) => Default(context, type, value),
  (context, type, value) => Convert(context, type, value),
  (context, type, value) => Clean(context, type, value),
  (context, type, value) => Assert2(context, type, value)
]);

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/parse/parse.mjs
var ParseError2 = class extends AssertError {
  constructor(value, errors) {
    super("Parse", value, errors);
  }
};
function Assert3(context, type, value) {
  if (!Check2(context, type, value))
    throw new ParseError2(value, Errors2(context, type, value));
  return value;
}
var Parser = Pipeline([
  (_context, _type, value) => Clone2(value),
  (context, type, value) => Default(context, type, value),
  (context, type, value) => Convert(context, type, value),
  (context, type, value) => Clean(context, type, value),
  (context, type, value) => Assert3(context, type, value)
]);

// node_modules/.pnpm/typebox@1.1.38/node_modules/typebox/build/value/delta/edit.mjs
var Insert = _Object_({
  type: Literal("insert"),
  path: String2(),
  value: Unknown()
});
var Update2 = Object({
  type: Literal("update"),
  path: String2(),
  value: Unknown()
});
var Delete2 = _Object_({
  type: Literal("delete"),
  path: String2()
});
var Edit = Union([Insert, Update2, Delete2]);

// packages/hub/src/http-utils.ts
var HttpError = class extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
};
var MAX_BODY_BYTES = 1048576;
async function readJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const raw of req) {
    const c = Buffer.from(raw);
    total += c.length;
    if (total > MAX_BODY_BYTES) throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Request body too large");
    chunks.push(c);
  }
  if (!total) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "INVALID_JSON", "Request body must be valid JSON");
  }
}
function validateBody(schema, value) {
  if (!Check2(schema, value)) throw new HttpError(400, "INVALID_REQUEST", "Request body failed validation");
}
function sendJson(res, status, payload, contentType = "application/json") {
  res.statusCode = status;
  res.setHeader("content-type", contentType);
  res.end(JSON.stringify(payload));
}
function bearerToken(req) {
  const h = req.headers.authorization;
  return typeof h === "string" && h.startsWith("Bearer ") ? h.slice(7) : void 0;
}
function authenticateRoot(req, expected) {
  const token = Buffer.from(`Bearer ${bearerToken(req) ?? ""}`);
  if (token.length !== expected.length || !timingSafeEqual2(token, expected)) throw new HttpError(401, "UNAUTHORIZED", "Invalid bearer token");
}
function safePathname(url) {
  try {
    return new URL(url ?? "/", "http://127.0.0.1").pathname;
  } catch {
    return "/";
  }
}
function safeLogPath(method, url) {
  const p = safePathname(url);
  if (/^\/tasks\/[^/]+(?::cancel)?$/.test(p)) return p.endsWith(":cancel") ? "/tasks/:taskId:cancel" : "/tasks/:taskId";
  if (/^\/v2\/sessions\/[^/]+\/tasks\/[^/]+/.test(p)) return "/v2/sessions/:sessionId/tasks/:taskId";
  if (/^\/v2\/sessions\/[^/]+/.test(p)) return "/v2/sessions/:sessionId";
  return ["/v2/health", "/v2/sessions", "/v2/query", "/message:send", "/tasks", "/.well-known/agent-card.json"].includes(p) ? p : "/unmatched";
}

// packages/hub/src/monitor-http.ts
import { createHash as createHash2, timingSafeEqual as timingSafeEqual3 } from "node:crypto";
function authenticateMonitor(req, expected) {
  const token = bearerToken(req);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) {
    throw new HttpError(401, "UNAUTHORIZED", "Invalid monitor capability");
  }
  const candidate = createHash2("sha256").update(token, "utf8").digest();
  if (candidate.length !== expected.length || !timingSafeEqual3(candidate, expected)) {
    throw new HttpError(401, "UNAUTHORIZED", "Invalid monitor capability");
  }
}
async function handleMonitorRequest(req, res, context) {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (!url.pathname.startsWith("/monitor/")) return false;
  authenticateMonitor(req, context.capabilityDigest);
  if (req.method !== "GET") {
    throw new HttpError(405, "METHOD_NOT_ALLOWED", "Monitor endpoints accept only GET requests");
  }
  if (url.pathname === "/monitor/v1/snapshot") {
    return handleSnapshot(url, res, context);
  }
  const detailMatch = url.pathname.match(/^\/monitor\/v1\/sessions\/([^/]+)$/);
  if (detailMatch) {
    return handleDetail(detailMatch[1], res, context);
  }
  throw new HttpError(404, "NOT_FOUND", "Monitor route not found");
}
async function handleSnapshot(url, res, context) {
  const afterParam = url.searchParams.get("after");
  const waitParam = url.searchParams.get("wait");
  let after;
  if (afterParam !== null) {
    after = Number(afterParam);
    if (!Number.isSafeInteger(after) || after < 0) {
      throw new HttpError(400, "INVALID_PARAMETER", "Parameter 'after' must be a non-negative integer");
    }
  }
  let waitMs = 0;
  if (waitParam !== null) {
    waitMs = Number(waitParam);
    if (!Number.isSafeInteger(waitMs) || waitMs < 0) {
      throw new HttpError(400, "INVALID_PARAMETER", "Parameter 'wait' must be a non-negative integer");
    }
    waitMs = Math.min(waitMs, 3e4);
  }
  if (after !== void 0 && after === context.revision.current() && waitMs > 0) {
    await context.revision.waitForChange(after, waitMs, context.signal);
  }
  sendJson(res, 200, context.projection.snapshot());
  return true;
}
function handleDetail(monitorId, res, context) {
  let decoded;
  try {
    decoded = decodeURIComponent(monitorId);
  } catch {
    throw new HttpError(404, "NOT_FOUND", "Session not found");
  }
  if (!/^[0-9a-f]{32}$/.test(decoded)) {
    throw new HttpError(404, "NOT_FOUND", "Session not found");
  }
  const detail = context.projection.detail(decoded);
  if (!detail) {
    throw new HttpError(404, "NOT_FOUND", "Session not found");
  }
  sendJson(res, 200, detail);
  return true;
}

// packages/hub/src/http.ts
var CLAIM_DISCONNECT_GRACE_MS = 25;
async function createHubServer(options) {
  const clock = options.clock ?? new SystemClock(), root = Buffer.from(`Bearer ${options.token}`), startedAt = clock.now();
  let baseUrl = "";
  const sessions = options.sessions ?? { registerSession: (r) => options.store.register(r), deleteSession: (id) => options.store.deleteSession(id) };
  const activeRequests = /* @__PURE__ */ new Set();
  const server = http.createServer(async (req, res) => {
    const start2 = clock.now();
    let code;
    const connection = new AbortController(), abort = () => connection.abort();
    activeRequests.add(connection);
    req.once("aborted", abort);
    res.once("close", abort);
    try {
      if (options.monitor && await handleMonitorRequest(req, res, { ...options.monitor, signal: connection.signal })) return;
      if (options.coordination && options.router && options.providers && await handleA2ARequestInternal(req, res, { baseUrl, registry: options.store, coordination: options.coordination, providers: options.providers, signal: connection.signal })) return;
      if (options.router && await handleAdapterRequestInternal(req, res, options.store, options.router, connection.signal)) return;
      if (await handleHubRequestInternal(req, res, { root, store: options.store, sessions, clock, startedAt })) return;
      throw new HttpError(404, "NOT_FOUND", "Route not found");
    } catch (e) {
      if (res.destroyed) return;
      code = handleError(res, e);
    } finally {
      activeRequests.delete(connection);
      req.removeListener("aborted", abort);
      res.removeListener("close", abort);
      const entry = { method: req.method ?? "GET", path: safeLogPath(req.method ?? "GET", req.url), status: res.statusCode || 500, durationMs: clock.now() - start2 };
      if (code) entry.errorCode = code;
      options.logger?.(entry);
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Failed to determine hub server address");
  baseUrl = `http://127.0.0.1:${address.port}`;
  return { url: baseUrl, port: address.port, close: () => new Promise((resolve, reject) => {
    for (const request of activeRequests) request.abort();
    server.close((e) => e ? reject(e) : resolve());
    server.closeAllConnections();
  }) };
}
async function handleHubRequestInternal(req, res, c) {
  const u = new URL(req.url ?? "/", "http://localhost");
  if (!u.pathname.startsWith("/v2/")) return false;
  authenticateRoot(req, c.root);
  if (req.method === "GET" && u.pathname === "/v2/health") {
    sendJson(res, 200, { protocolVersion: PROTOCOL_VERSION, pid: process.pid, startedAt: c.startedAt });
    return true;
  }
  if (req.method === "POST" && u.pathname === "/v2/sessions") {
    const b = await readJsonBody(req);
    validateBody(RegisterSessionRequestSchema, b);
    sendJson(res, 200, c.sessions.registerSession(b));
    return true;
  }
  let m = u.pathname.match(/^\/v2\/sessions\/([^/]+)\/events$/);
  if (req.method === "POST" && m) {
    const b = await readJsonBody(req);
    validateBody(AppendEventsRequestSchema, b);
    sendJson(res, 200, c.store.appendEvents(m[1], b));
    return true;
  }
  m = u.pathname.match(/^\/v2\/sessions\/([^/]+)\/heartbeat$/);
  if (req.method === "POST" && m) {
    const b = await readJsonBody(req);
    validateBody(HeartbeatRequestSchema, b);
    sendJson(res, 200, c.store.heartbeat(m[1], b));
    return true;
  }
  m = u.pathname.match(/^\/v2\/sessions\/([^/]+)\/snapshot$/);
  if (req.method === "PUT" && m) {
    const b = await readJsonBody(req);
    validateBody(ReplaceSnapshotRequestSchema, b);
    sendJson(res, 200, c.store.replaceSnapshot(m[1], b));
    return true;
  }
  m = u.pathname.match(/^\/v2\/sessions\/([^/]+)$/);
  if (req.method === "DELETE" && m) {
    c.sessions.deleteSession(m[1]);
    res.statusCode = 204;
    res.end();
    return true;
  }
  if (req.method === "POST" && u.pathname === "/v2/query") {
    const b = await readJsonBody(req);
    validateBody(QueryRequestSchema, b);
    sendJson(res, 200, queryActiveSessions(c.store, b, c.clock.now()));
    return true;
  }
  return false;
}
function scoped(req, registry) {
  const token = bearerToken(req), session = token ? registry.authenticateTaskCapability(token) : void 0;
  if (!session) throw new HttpError(401, "UNAUTHORIZED", "Invalid session capability");
  return session;
}
async function handleA2ARequestInternal(req, res, c) {
  const u = new URL(req.url ?? "/", "http://localhost");
  if (req.method === "GET" && u.pathname === "/.well-known/agent-card.json") {
    sendJson(res, 200, AgentCard.toJSON(buildCoordinatorAgentCard(c.baseUrl, c.providers.names())), A2A_CONTENT_TYPE);
    return true;
  }
  const unsupported = u.pathname === "/message:stream" || u.pathname === "/extendedAgentCard" || u.pathname.includes("pushNotificationConfigs") || u.pathname.endsWith(":subscribe");
  const isRoute = unsupported || u.pathname === "/message:send" || u.pathname === "/tasks" || /^\/tasks\/[^/]+(?::cancel)?$/.test(u.pathname);
  if (!isRoute) return false;
  if (req.headers["a2a-version"] !== A2A_VERSION) throw new A2AWireError(400, "VERSION_NOT_SUPPORTED", "A2A version is not supported");
  const source = scoped(req, c.registry);
  if (unsupported) throw new A2AWireError(400, "UNSUPPORTED_OPERATION", "Operation is not supported");
  if (req.method === "POST" && u.pathname === "/message:send") {
    if (![A2A_CONTENT_TYPE, "application/json"].some((type) => (req.headers["content-type"] ?? "").includes(type))) throw new CoordinationError("UNSUPPORTED_CONTENT", "Content type is unsupported", 400);
    const parsed = parseA2ASendMessage(SendMessageRequest.fromJSON(await readJsonBody(req)), String(req.headers["a2a-extensions"] ?? "").split(",").map((x) => x.trim()));
    let task;
    if (parsed.taskId) task = c.coordination.appendMessage(source.id, parsed.taskId, parsed.message);
    else if (parsed.target?.type === "session") task = c.coordination.createExistingSessionTask(source.id, { targetSessionId: parsed.target.sessionId, ...parsed.contextId ? { contextId: parsed.contextId } : {}, ...parsed.deadlineAt ? { deadlineAt: parsed.deadlineAt } : {}, message: parsed.message });
    else if (parsed.target?.type === "worker") task = c.coordination.createWorkerTask(source.id, { provider: parsed.target.provider, cwd: parsed.target.cwd, options: parsed.target.options, ...parsed.contextId ? { contextId: parsed.contextId } : {}, ...parsed.deadlineAt ? { deadlineAt: parsed.deadlineAt } : {}, message: parsed.message });
    else throw new CoordinationError("INVALID_ROUTING_EXTENSION", "Target is required", 400);
    if (!parsed.returnImmediately) task = await c.coordination.waitForTerminal(source.id, task.id, c.signal);
    if (c.signal?.aborted || res.destroyed) return true;
    const wire = toA2ATask(task, c.coordination.coordinationMessages(task.id), parsed.historyLength);
    sendJson(res, 200, SendMessageResponse.toJSON({ payload: { $case: "task", value: wire } }), A2A_CONTENT_TYPE);
    return true;
  }
  if (req.method === "GET" && u.pathname === "/tasks") {
    const f = parseA2AListFilters(u), page = c.coordination.listTasks(source.id, f);
    sendJson(res, 200, { tasks: page.tasks.map((t) => Task.toJSON(toA2ATask(t, c.coordination.coordinationMessages(t.id), f.historyLength))), nextPageToken: page.nextPageToken ?? "", pageSize: page.pageSize, totalSize: page.totalSize }, A2A_CONTENT_TYPE);
    return true;
  }
  const match = u.pathname.match(/^\/tasks\/([^/]+?)(:cancel)?$/);
  if (match) {
    const id = decodeURIComponent(match[1]);
    if (req.method === "POST" && match[2]) {
      const t = c.coordination.cancelTask(source.id, id);
      sendJson(res, 200, Task.toJSON(toA2ATask(t, c.coordination.coordinationMessages(id))), A2A_CONTENT_TYPE);
      return true;
    }
    if (req.method === "GET" && !match[2]) {
      const t = c.coordination.getTask(source.id, id);
      if (!t) throw new TaskLookupError(id, c.coordination.taskNotFoundMetadata(id));
      const h = u.searchParams.has("historyLength") ? Number(u.searchParams.get("historyLength")) : void 0;
      if (h !== void 0 && (!Number.isInteger(h) || h < 0 || h > 100)) throw new CoordinationError("UNSUPPORTED_CONTENT", "historyLength is invalid", 400);
      sendJson(res, 200, Task.toJSON(toA2ATask(t, c.coordination.coordinationMessages(id), h)), A2A_CONTENT_TYPE);
      return true;
    }
  }
  return false;
}
async function handleAdapterRequestInternal(req, res, registry, router, requestSignal) {
  const u = new URL(req.url ?? "/", "http://localhost"), m = u.pathname.match(/^\/v2\/sessions\/([^/]+)\/(.+)$/);
  if (!m || !/deliveries|tasks/.test(m[2])) return false;
  const session = scoped(req, registry);
  if (session.id !== m[1]) throw new HttpError(404, "NOT_FOUND", "Resource not found");
  const tail = m[2];
  let b = {};
  if (tail === "deliveries:claim") {
    const connection = new AbortController(), abort = () => connection.abort();
    const claimSignal = requestSignal ? AbortSignal.any([connection.signal, requestSignal]) : connection.signal;
    let claimedDeliveryId, handedOff = false;
    req.once("aborted", abort);
    res.once("close", abort);
    try {
      if (req.method === "POST") b = await readJsonBody(req);
      validateBody(ClaimDeliveryRequestSchema, b);
      if (claimSignal.aborted || res.destroyed) return true;
      const d = await router.claim(session.id, b.waitSeconds, claimSignal);
      if (d) await new Promise((resolve) => setTimeout(resolve, CLAIM_DISCONNECT_GRACE_MS));
      if (!d) {
        if (!claimSignal.aborted && !res.destroyed) {
          res.statusCode = 204;
          res.end();
        }
        return true;
      }
      if (claimSignal.aborted || res.destroyed) {
        router.abandon(session.id, d.delivery.id);
        return true;
      }
      claimedDeliveryId = d.delivery.id;
      handedOff = await sendClaimResponse(res, { deliveryId: d.delivery.id, taskId: d.task.id, contextId: d.task.contextId, sourceLabel: d.sourceLabel, message: { messageId: d.message.messageId, parts: d.message.parts }, deadline: new Date(d.task.deadlineAt).toISOString() });
      return true;
    } catch (e) {
      if (claimSignal.aborted || res.destroyed) return true;
      throw e;
    } finally {
      if (claimedDeliveryId && !handedOff) router.abandon(session.id, claimedDeliveryId);
      req.removeListener("aborted", abort);
      res.removeListener("close", abort);
    }
  }
  if (req.method === "POST") b = await readJsonBody(req);
  let x = tail.match(/^deliveries\/([^/]+):(accept|reject)$/);
  if (x) {
    const r = x[2] === "accept" ? router.accept(session.id, x[1]) : (validateBody(RejectDeliveryRequestSchema, b), router.reject(session.id, x[1], b.code));
    sendMutation(res, r);
    return true;
  }
  x = tail.match(/^tasks\/([^/]+):(progress|complete|fail|acknowledge-canceled)$/);
  if (x) {
    let r;
    if (x[2] === "progress") {
      validateBody(ProgressTaskRequestSchema, b);
      r = router.progress(session.id, x[1], b.message ? adapterMessage(b.message) : void 0);
    } else if (x[2] === "complete") {
      validateBody(CompleteTaskRequestSchema, b);
      r = router.complete(session.id, b.deliveryId, adapterMessage(b.message));
    } else if (x[2] === "fail") {
      validateBody(FailTaskRequestSchema, b);
      r = router.fail(session.id, b.deliveryId, b.code, b.message ? { messageId: `failure-${Date.now()}`, role: "target", parts: [{ kind: "text", text: b.message, mediaType: "text/plain" }], extensions: [] } : void 0);
    } else r = router.acknowledgeCanceled(session.id, x[1]);
    sendMutation(res, r);
    return true;
  }
  return false;
}
function sendClaimResponse(res, payload) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (handedOff) => {
      if (settled) return;
      settled = true;
      res.removeListener("finish", finish);
      res.removeListener("close", close);
      resolve(handedOff);
    };
    const finish = () => done(true), close = () => done(false);
    res.once("finish", finish);
    res.once("close", close);
    try {
      sendJson(res, 200, payload);
    } catch (e) {
      res.removeListener("finish", finish);
      res.removeListener("close", close);
      reject(e);
    }
  });
}
function adapterMessage(m) {
  return { messageId: m.messageId, role: "target", parts: m.parts, extensions: [] };
}
function sendMutation(res, r) {
  sendJson(res, 200, { taskId: r.task.id, state: r.task.state, cancellationRequested: r.cancellationRequested });
}
var A2AWireError = class extends Error {
  constructor(status, reason, message) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
};
var TaskLookupError = class extends CoordinationError {
  constructor(taskId, metadata) {
    super("TASK_NOT_FOUND", "Task not found", 404);
    this.taskId = taskId;
    this.metadata = metadata;
  }
};
function handleError(res, e) {
  if (e instanceof A2AWireError) {
    sendJson(res, e.status, { error: { code: e.status, status: "FAILED_PRECONDITION", message: e.message, details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: e.reason, domain: "a2a-protocol.org" }] } }, A2A_CONTENT_TYPE);
    return e.reason;
  }
  if (e instanceof CoordinationError) {
    const projected = toA2AError(e, e instanceof TaskLookupError ? e.metadata : void 0);
    sendJson(res, projected.status, projected.body, A2A_CONTENT_TYPE);
    return e.code;
  }
  if (e instanceof HttpError) {
    sendJson(res, e.status, { error: { code: e.code, message: e.message } });
    return e.code;
  }
  if (isHubError(e)) {
    sendJson(res, e.status, { error: { code: e.code, message: e.message } });
    return e.code;
  }
  sendJson(res, 500, { error: { code: "INTERNAL_ERROR", message: "Internal hub error" } });
  return "INTERNAL_ERROR";
}

// packages/hub/src/discovery.ts
import { randomBytes as randomBytes2 } from "node:crypto";
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
var publishedRecords = /* @__PURE__ */ new Map();
async function writeDiscoveryFile(path, record) {
  const directory = dirname(path);
  await fs.mkdir(directory, { recursive: true, mode: 448 });
  if (process.platform !== "win32") await fs.chmod(directory, 448);
  const tempPath = join(directory, `.tmp-${randomBytes2(8).toString("hex")}`);
  const handle = await fs.open(tempPath, "w", 384);
  try {
    await handle.writeFile(JSON.stringify(record), "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await fs.rename(tempPath, path);
  } catch (error) {
    await fs.rm(tempPath, { force: true });
    throw error;
  }
  publishedRecords.set(path, record);
}
async function ownsDiscoveryFile(path, expected) {
  try {
    const current = JSON.parse(await fs.readFile(path, "utf8"));
    return sameRecord(current, expected);
  } catch {
    return false;
  }
}
async function removeDiscoveryFile(path) {
  const expected = publishedRecords.get(path);
  try {
    const contents = await fs.readFile(path, "utf8");
    const current = JSON.parse(contents);
    if (!expected || !sameRecord(current, expected)) return;
    await fs.unlink(path);
  } catch (error) {
    if (!(error instanceof Error) || error.code !== "ENOENT") {
      throw error;
    }
  } finally {
    publishedRecords.delete(path);
  }
}
function sameRecord(current, expected) {
  return current.pid === expected.pid && current.token === expected.token && current.protocolVersion === expected.protocolVersion && current.startedAt === expected.startedAt;
}

// packages/hub/src/ownership.ts
import { execFile } from "node:child_process";
import { randomBytes as randomBytes3 } from "node:crypto";
import { promises as fs2 } from "node:fs";
import { dirname as dirname2, join as join2 } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
var DEFAULT_ACQUIRE_TIMEOUT_MS = 4e3;
var DEFAULT_STALE_MS = 500;
var DEFAULT_POLL_MS = 25;
var DEFAULT_TAKEOVER_GRACE_MS = 150;
var OWNER_FILE = "owner.json";
async function acquireDaemonOwnership(options) {
  const now = options.now ?? Date.now;
  const wait = options.wait ?? ((ms) => delay(ms));
  const deadline = now() + (options.acquireTimeoutMs ?? DEFAULT_ACQUIRE_TIMEOUT_MS);
  const staleMs = options.staleMs ?? DEFAULT_STALE_MS;
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const takeoverGraceMs = options.takeoverGraceMs ?? DEFAULT_TAKEOVER_GRACE_MS;
  const isProcessAlive = options.isProcessAlive ?? defaultIsProcessAlive;
  const getProcessBirthIdentity = options.getProcessBirthIdentity ?? defaultProcessBirthIdentity;
  const directory = `${options.discoveryFile}.owner`;
  const pid = options.pid ?? process.pid;
  const identity = {
    pid,
    startedAt: options.startedAt ?? now(),
    nonce: (options.randomSource ?? randomBytes3)(24).toString("hex"),
    processBirthIdentity: normalizeProcessBirthIdentity(await getProcessBirthIdentity(pid))
  };
  let replacedStaleOwner = false;
  let acquired = false;
  const candidate = `${directory}.candidate-${identity.nonce}`;
  await fs2.mkdir(dirname2(directory), { recursive: true, mode: 448 });
  await fs2.mkdir(candidate, { mode: 448 });
  try {
    await writeOwnerRecord(candidate, { ...identity, refreshedAt: now() });
    while (now() < deadline) {
      try {
        await fs2.rename(candidate, directory);
        acquired = true;
        if (replacedStaleOwner && takeoverGraceMs > 0) await wait(takeoverGraceMs);
        return createOwnership(directory, identity);
      } catch (error) {
        if (!isRetryableFilesystemRace(error)) throw error;
      }
      const current = await readOwnerRecord(directory).catch((error) => {
        if (isRetryableFilesystemRace(error)) return void 0;
        throw error;
      });
      const timestamp = current?.refreshedAt ?? await directoryTimestamp(directory);
      const stale = timestamp !== void 0 && now() - timestamp > staleMs;
      if (stale && current && await recordedProcessIsDefinitelyGone(
        current,
        isProcessAlive,
        getProcessBirthIdentity
      )) {
        const quarantine = `${directory}.stale-${identity.nonce}`;
        try {
          await fs2.rename(directory, quarantine);
          await fs2.rm(quarantine, { recursive: true, force: true });
          replacedStaleOwner = true;
          continue;
        } catch (error) {
          if (!isRetryableFilesystemRace(error)) throw error;
        }
      }
      await wait(Math.min(pollMs, Math.max(1, deadline - now())));
    }
    throw new Error("Hub daemon ownership could not be acquired before the startup deadline.");
  } finally {
    if (!acquired) await fs2.rm(candidate, { recursive: true, force: true }).catch(() => void 0);
  }
}
function createOwnership(directory, identity) {
  let released = false;
  let operation = Promise.resolve();
  const serialized = (work) => {
    const result = operation.then(work, work);
    operation = result.then(() => void 0, () => void 0);
    return result;
  };
  return {
    directory,
    identity,
    refresh() {
      return serialized(async () => {
        if (released) return false;
        return sameIdentity(await readOwnerRecord(directory), identity);
      });
    },
    release() {
      return serialized(async () => {
        if (released) return;
        released = true;
        const current = await readOwnerRecord(directory);
        if (!sameIdentity(current, identity)) return;
        await retireDirectory(directory, identity.nonce);
      });
    }
  };
}
async function retireDirectory(directory, nonce) {
  const retired = `${directory}.released-${nonce}`;
  try {
    await fs2.rename(directory, retired);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  await fs2.rm(retired, { recursive: true, force: true });
}
async function writeOwnerRecord(directory, record) {
  const path = join2(directory, OWNER_FILE);
  const temp = join2(directory, `.owner-${record.nonce}.tmp`);
  const handle = await fs2.open(temp, "wx", 384);
  try {
    await handle.writeFile(JSON.stringify(record), "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await fs2.rename(temp, path);
  } catch (error) {
    await fs2.rm(temp, { force: true });
    throw error;
  }
}
async function readOwnerRecord(directory) {
  try {
    const value = JSON.parse(await fs2.readFile(join2(directory, OWNER_FILE), "utf8"));
    if (Number.isSafeInteger(value.pid) && (value.pid ?? 0) > 0 && Number.isSafeInteger(value.startedAt) && (value.startedAt ?? -1) >= 0 && typeof value.nonce === "string" && value.nonce.length > 0 && (value.processBirthIdentity === void 0 || value.processBirthIdentity === null || typeof value.processBirthIdentity === "string" && value.processBirthIdentity.length > 0) && Number.isFinite(value.refreshedAt)) {
      return {
        ...value,
        processBirthIdentity: normalizeProcessBirthIdentity(value.processBirthIdentity)
      };
    }
  } catch (error) {
    if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
  }
  return void 0;
}
async function directoryTimestamp(directory) {
  try {
    return (await fs2.stat(directory)).mtimeMs;
  } catch (error) {
    if (error.code === "ENOENT") return void 0;
    if (isRetryableWindowsRace(error)) return void 0;
    throw error;
  }
}
function sameIdentity(current, expected) {
  return current?.pid === expected.pid && current.startedAt === expected.startedAt && current.nonce === expected.nonce && current.processBirthIdentity === expected.processBirthIdentity;
}
async function recordedProcessIsDefinitelyGone(identity, isProcessAlive, getProcessBirthIdentity) {
  if (!await isProcessAlive(identity)) return true;
  if (identity.processBirthIdentity === null) return false;
  try {
    const current = normalizeProcessBirthIdentity(await getProcessBirthIdentity(identity.pid));
    return current !== null && current !== identity.processBirthIdentity;
  } catch {
    return false;
  }
}
function normalizeProcessBirthIdentity(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}
function defaultIsProcessAlive(identity) {
  try {
    process.kill(identity.pid, 0);
    return true;
  } catch (error) {
    const code = error.code;
    return code !== "ESRCH";
  }
}
async function defaultProcessBirthIdentity(pid) {
  if (process.platform === "linux") {
    try {
      const [stat, bootId] = await Promise.all([
        fs2.readFile(`/proc/${pid}/stat`, "utf8"),
        fs2.readFile("/proc/sys/kernel/random/boot_id", "utf8")
      ]);
      const commandEnd = stat.lastIndexOf(")");
      if (commandEnd < 0) return void 0;
      const fields = stat.slice(commandEnd + 1).trim().split(/\s+/);
      const startTicks = fields[19];
      const boot = bootId.trim();
      if (!boot || !startTicks || !/^\d+$/.test(startTicks)) return void 0;
      return `linux:${boot}:${startTicks}`;
    } catch {
      return void 0;
    }
  }
  if (process.platform === "darwin") {
    const started = await execFileText("ps", ["-p", String(pid), "-o", "lstart="]);
    const normalized = started?.trim().replace(/\s+/g, " ");
    return normalized ? `darwin:${normalized}` : void 0;
  }
  if (process.platform === "win32") {
    const started = await execFileText("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `$p = Get-Process -Id ${pid} -ErrorAction Stop; $p.StartTime.ToUniversalTime().Ticks`
    ]);
    const ticks = started?.trim();
    return ticks && /^\d+$/.test(ticks) ? `win32:${ticks}` : void 0;
  }
  return void 0;
}
function execFileText(file, args) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: 1e3, windowsHide: true }, (error, stdout) => {
      resolve(error ? void 0 : stdout);
    });
  });
}
function isRetryableWindowsRace(error) {
  if (process.platform !== "win32") return false;
  const code = error.code;
  return code === "EPERM" || code === "EACCES" || code === "EBUSY";
}
function isRetryableFilesystemRace(error) {
  const code = error.code;
  return code === "ENOENT" || code === "EEXIST" || code === "ENOTEMPTY" || isRetryableWindowsRace(error);
}

// packages/hub/src/coordination/task-store.ts
import { createHash as createHash3, randomBytes as randomBytes4, randomUUID as randomUUID2, timingSafeEqual as timingSafeEqual4 } from "node:crypto";
var terminal = /* @__PURE__ */ new Set(["completed", "failed", "canceled", "rejected"]);
var digest = (token) => createHash3("sha256").update(token, "utf8").digest();
var TaskStore = class {
  instanceId;
  database;
  clock;
  maxDatabaseBytes;
  ownsDatabase;
  onProjectionChanged;
  constructor(options) {
    if (!options.database) throw new Error("TaskStore requires the shared in-memory database");
    this.database = options.database;
    this.clock = options.clock;
    this.instanceId = options.instanceId;
    this.maxDatabaseBytes = options.maxDatabaseBytes ?? MAX_DATABASE_BYTES;
    this.ownsDatabase = false;
    this.onProjectionChanged = options?.onProjectionChanged;
  }
  isTaskFromCurrentInstance(id) {
    return id.startsWith(`${this.instanceId}:`);
  }
  createExistingTask(input) {
    const taskId = `${this.instanceId}:${randomUUID2()}`, deliveryId = randomUUID2(), now = this.clock.now(), bytes = validateMessage(input.message);
    return this.tx(() => {
      this.enforceCreation(input.sourceSessionId, bytes);
      this.insertTask(taskId, input, "session", { type: "session", sessionId: input.targetSessionId }, input.targetSessionId, bytes, now);
      this.insertMessage(taskId, input.message, 1, bytes, now);
      const seq = this.nextDeliverySequence(input.targetSessionId);
      this.database.prepare("INSERT INTO a2a_deliveries(id,task_id,message_id,target_session_id,sequence,state) VALUES(?,?,?,?,?,'queued')").run(deliveryId, taskId, input.message.messageId, input.targetSessionId, seq);
      this.enforceDatabase();
      return { task: this.getTask(taskId), delivery: this.delivery(deliveryId) };
    });
  }
  createRejectedTask(input, code) {
    const id = `${this.instanceId}:${randomUUID2()}`, now = this.clock.now(), bytes = validateMessage(input.message);
    return this.tx(() => {
      this.enforceCreation(input.sourceSessionId, bytes);
      this.insertTask(id, input, "session", { type: "session", sessionId: input.targetSessionId }, void 0, bytes, now, "rejected", code);
      this.insertMessage(id, input.message, 1, bytes, now);
      this.enforceDatabase();
      return this.getTask(id);
    });
  }
  createWorkerTask(input) {
    const id = `${this.instanceId}:${randomUUID2()}`, token = randomBytes4(32).toString("hex"), now = this.clock.now(), bytes = validateMessage(input.message);
    return this.tx(() => {
      this.enforceCreation(input.sourceSessionId, bytes);
      this.insertTask(id, input, "worker", { type: "worker", provider: input.provider, cwd: input.cwd, options: input.options }, void 0, bytes, now);
      this.insertMessage(id, input.message, 1, bytes, now);
      this.database.prepare("INSERT INTO worker_launches(task_id,provider,token_hash,state,deadline_at,created_at,updated_at) VALUES(?,?,?,'starting',?,?,?)").run(id, input.provider, digest(token), input.deadlineAt, now, now);
      this.enforceDatabase();
      return { task: this.getTask(id), launchToken: token };
    });
  }
  appendSourceMessage(taskId, message) {
    return this.tx(() => {
      const task = this.getTask(taskId);
      if (!task || terminal.has(task.state)) throw new CoordinationError("TASK_NOT_FOUND", "Task not found", 404);
      const bytes = validateMessage(message);
      if (task.contentBytes + bytes > MAX_TASK_CONTENT_BYTES) throw new CoordinationError("TASK_CONTENT_LIMIT", "Task content exceeds one MiB", 413);
      if (!task.targetSessionId) throw new CoordinationError("TARGET_UNAVAILABLE", "Target is unavailable", 400);
      const mseq = this.nextMessageSequence(taskId);
      this.insertMessage(taskId, message, mseq, bytes, this.clock.now());
      const id = randomUUID2(), dseq = this.nextDeliverySequence(task.targetSessionId);
      this.database.prepare("INSERT INTO a2a_deliveries(id,task_id,message_id,target_session_id,sequence,state) VALUES(?,?,?,?,?,'queued')").run(id, taskId, message.messageId, task.targetSessionId, dseq);
      this.database.prepare("UPDATE a2a_tasks SET content_bytes=content_bytes+?,updated_at=? WHERE id=?").run(bytes, this.clock.now(), taskId);
      this.enforceDatabase();
      return this.delivery(id);
    });
  }
  getTask(id) {
    const row = this.database.prepare("SELECT * FROM a2a_tasks WHERE id=?").get(id);
    return row ? this.mapTask(row) : void 0;
  }
  listTasks(source, filters = {}) {
    const size = filters.pageSize ?? 50, clauses = ["source_session_id = ?"], params = [source];
    if (filters.contextId) {
      clauses.push("context_id = ?");
      params.push(filters.contextId);
    }
    if (filters.state) {
      clauses.push("state = ?");
      params.push(filters.state);
    }
    if (filters.statusTimestampAfter !== void 0) {
      clauses.push("updated_at > ?");
      params.push(filters.statusTimestampAfter);
    }
    if (filters.pageToken) {
      let t;
      try {
        t = JSON.parse(Buffer.from(filters.pageToken, "base64url").toString());
      } catch {
        throw new CoordinationError("UNSUPPORTED_CONTENT", "Malformed page token", 400);
      }
      if (!Number.isFinite(t.updatedAt) || typeof t.id !== "string") throw new CoordinationError("UNSUPPORTED_CONTENT", "Malformed page token", 400);
      clauses.push("(updated_at < ? OR (updated_at = ? AND id < ?))");
      params.push(t.updatedAt, t.updatedAt, t.id);
    }
    const where = clauses.join(" AND ");
    const rows = this.database.prepare(`SELECT * FROM a2a_tasks WHERE ${where} ORDER BY updated_at DESC,id DESC LIMIT ?`).all(...params, size + 1);
    const total = this.database.prepare(`SELECT COUNT(*) count FROM a2a_tasks WHERE ${where}`).get(...params).count;
    const page = rows.slice(0, size), last = page.at(-1);
    return { tasks: page.map((r) => this.mapTask(r)), pageSize: size, totalSize: total, ...rows.length > size && last ? { nextPageToken: Buffer.from(JSON.stringify({ updatedAt: last.updated_at, id: last.id })).toString("base64url") } : {} };
  }
  listMessages(id, historyLength) {
    const rows = this.database.prepare("SELECT role,parts_json,extensions_json,message_id FROM a2a_messages WHERE task_id=? ORDER BY sequence").all(id);
    const mapped = rows.map((r) => ({ messageId: r.message_id, role: r.role, parts: JSON.parse(r.parts_json), extensions: JSON.parse(r.extensions_json) }));
    return historyLength === void 0 ? mapped : mapped.slice(-historyLength);
  }
  listDeliveries(id) {
    return this.database.prepare("SELECT * FROM a2a_deliveries WHERE task_id=? ORDER BY sequence").all(id).map((r) => this.mapDelivery(r));
  }
  countTasks() {
    return this.database.prepare("SELECT COUNT(*) count FROM a2a_tasks").get().count;
  }
  listTasksForSession(sessionId, limit) {
    const rows = this.database.prepare(`SELECT id,source_session_id,target_session_id,state,created_at,updated_at FROM a2a_tasks WHERE source_session_id=? OR target_session_id=? ORDER BY updated_at DESC,id DESC LIMIT ?`).all(sessionId, sessionId, limit);
    return rows.map((r) => ({ id: r.id, role: r.source_session_id === sessionId ? "source" : "target", state: r.state, createdAt: r.created_at, updatedAt: r.updated_at }));
  }
  countActiveTasks(source) {
    const states2 = "('submitted','working')";
    const row = source ? this.database.prepare(`SELECT COUNT(*) count FROM a2a_tasks WHERE state IN ${states2} AND source_session_id=?`).get(source) : this.database.prepare(`SELECT COUNT(*) count FROM a2a_tasks WHERE state IN ${states2}`).get();
    return row.count;
  }
  claimNext(target, now) {
    return this.tx(() => {
      const active = this.database.prepare("SELECT 1 ok FROM a2a_deliveries WHERE target_session_id=? AND state IN ('claimed','accepted')").get(target);
      if (active) return void 0;
      const row = this.database.prepare("SELECT d.id FROM a2a_deliveries d JOIN a2a_tasks t ON t.id=d.task_id WHERE d.target_session_id=? AND d.state='queued' AND t.state IN ('submitted','working') AND t.cancellation_requested=0 AND t.deadline_at>? ORDER BY d.sequence LIMIT 1").get(target, now);
      if (!row) return void 0;
      this.database.prepare("UPDATE a2a_deliveries SET state='claimed',claimed_at=? WHERE id=?").run(now, row.id);
      const d = this.delivery(row.id);
      this.database.prepare("UPDATE a2a_tasks SET state='working',updated_at=? WHERE id=? AND state='submitted'").run(now, d.taskId);
      const message = this.message(d.taskId, d.messageId);
      return { task: this.getTask(d.taskId), delivery: d, message, sourceLabel: "agent session" };
    });
  }
  abandonDelivery(target, id, now) {
    return this.tx(() => {
      const d = this.delivery(id);
      if (!d || d.targetSessionId !== target || d.state !== "claimed") return void 0;
      const task = this.getTask(d.taskId);
      if (!task) return void 0;
      if (task.deadlineAt <= now) {
        this.database.prepare("UPDATE a2a_deliveries SET state='resolved' WHERE id=? AND state='claimed'").run(id);
        this.terminalTask(task.id, "failed", "DEADLINE_EXCEEDED", now);
        this.deleteIfSourceClosed(task.id);
        return task.id;
      }
      if (task.cancellationRequested) {
        this.database.prepare("UPDATE a2a_deliveries SET state='resolved' WHERE id=? AND state='claimed'").run(id);
        this.terminalTask(task.id, "canceled", void 0, now);
        this.deleteIfSourceClosed(task.id);
        return task.id;
      }
      this.database.prepare("UPDATE a2a_deliveries SET state='queued',claimed_at=NULL WHERE id=? AND state='claimed'").run(id);
      this.database.prepare("UPDATE a2a_tasks SET state='submitted',updated_at=? WHERE id=? AND state='working' AND NOT EXISTS (SELECT 1 FROM a2a_deliveries WHERE task_id=? AND id<>? AND state IN ('accepted','rejected','resolved'))").run(now, task.id, task.id, id);
      return task.id;
    });
  }
  acceptDelivery(target, id, now) {
    return this.mutateDelivery(target, id, now, (d) => this.database.prepare("UPDATE a2a_deliveries SET state='accepted',acknowledged_at=? WHERE id=?").run(now, d.id));
  }
  rejectDelivery(target, id, code, now) {
    return this.mutateDelivery(target, id, now, (d) => {
      this.database.prepare("UPDATE a2a_deliveries SET state='rejected',acknowledged_at=? WHERE id=?").run(now, d.id);
      this.terminalTask(d.taskId, "rejected", code, now);
    });
  }
  appendTargetMessage(taskId, message) {
    this.tx(() => {
      this.addTargetMessage(taskId, message);
      this.enforceDatabase();
    });
  }
  resolveDelivery(target, id, now) {
    this.mutateDelivery(target, id, now, (d) => this.database.prepare("UPDATE a2a_deliveries SET state='resolved',acknowledged_at=? WHERE id=?").run(now, d.id));
  }
  completeDelivery(target, id, message, now) {
    return this.mutateDelivery(target, id, now, (d) => {
      const task = this.getTask(d.taskId);
      if (terminal.has(task.state)) return;
      this.addTargetMessage(d.taskId, message);
      this.database.prepare("UPDATE a2a_deliveries SET state='resolved',acknowledged_at=? WHERE id=?").run(now, id);
      const queued = this.database.prepare("SELECT 1 ok FROM a2a_deliveries WHERE task_id=? AND state='queued'").get(d.taskId);
      if (!queued) this.terminalTask(d.taskId, "completed", void 0, now);
    });
  }
  failDelivery(target, id, code, message, now) {
    return this.mutateDelivery(target, id, now, (d) => {
      const task = this.getTask(d.taskId);
      if (terminal.has(task.state)) return;
      if (message) this.addTargetMessage(d.taskId, message);
      this.database.prepare("UPDATE a2a_deliveries SET state='resolved',acknowledged_at=? WHERE id=?").run(now, id);
      this.terminalTask(d.taskId, "failed", code, now);
    });
  }
  requestCancellation(source, id, now) {
    return this.tx(() => {
      const task = this.getTask(id);
      if (!task || task.sourceSessionId !== source) throw new CoordinationError("TASK_NOT_FOUND", "Task not found", 404);
      if (terminal.has(task.state)) throw new CoordinationError("TASK_NOT_CANCELABLE", "Task is not cancelable", 400);
      const claimed = this.database.prepare("SELECT 1 ok FROM a2a_deliveries WHERE task_id=? AND state IN ('claimed','accepted')").get(id);
      if (claimed) this.database.prepare("UPDATE a2a_tasks SET cancellation_requested=1,updated_at=? WHERE id=?").run(now, id);
      else {
        this.database.prepare("UPDATE a2a_deliveries SET state='resolved' WHERE task_id=? AND state='queued'").run(id);
        this.terminalTask(id, "canceled", void 0, now);
      }
      return this.getTask(id);
    });
  }
  acknowledgeCanceled(target, id, now) {
    return this.tx(() => {
      const task = this.getTask(id);
      if (!task || task.targetSessionId !== target) throw new CoordinationError("TASK_NOT_FOUND", "Task not found", 404);
      if (!terminal.has(task.state) && task.cancellationRequested) this.terminalTask(id, "canceled", void 0, now);
      this.database.prepare("UPDATE a2a_deliveries SET state='resolved',acknowledged_at=? WHERE task_id=? AND target_session_id=? AND state IN ('claimed','accepted')").run(now, id, target);
      const updated = this.getTask(id);
      return { task: updated, cancellationRequested: updated.cancellationRequested };
    });
  }
  expireDeadlines(now) {
    return this.tx(() => {
      const rows = this.database.prepare("SELECT id FROM a2a_tasks WHERE state IN ('submitted','working') AND deadline_at<=?").all(now);
      for (const r of rows) {
        this.database.prepare("UPDATE a2a_deliveries SET state='resolved' WHERE task_id=? AND state IN ('queued','claimed','accepted')").run(r.id);
        this.terminalTask(r.id, "failed", "DEADLINE_EXCEEDED", now);
      }
      return rows.map((r) => r.id);
    });
  }
  closeSourceSession(id, now) {
    return this.tx(() => {
      const rows = this.database.prepare("SELECT id,state FROM a2a_tasks WHERE source_session_id=?").all(id);
      const affected = [];
      for (const r of rows) {
        if (terminal.has(r.state)) {
          this.database.prepare("DELETE FROM a2a_tasks WHERE id=?").run(r.id);
          continue;
        }
        this.database.prepare("UPDATE a2a_tasks SET source_closed=1,updated_at=? WHERE id=?").run(now, r.id);
        const claimed = this.database.prepare("SELECT 1 FROM a2a_deliveries WHERE task_id=? AND state IN ('claimed','accepted')").get(r.id);
        if (claimed) this.database.prepare("UPDATE a2a_tasks SET cancellation_requested=1 WHERE id=?").run(r.id);
        else {
          this.database.prepare("UPDATE a2a_deliveries SET state='resolved' WHERE task_id=?").run(r.id);
          this.terminalTask(r.id, "canceled", void 0, now);
          this.database.prepare("DELETE FROM a2a_tasks WHERE id=?").run(r.id);
        }
        affected.push(r.id);
      }
      return affected;
    });
  }
  closeTargetSession(id, now) {
    return this.tx(() => {
      const rows = this.database.prepare("SELECT DISTINCT task_id,state FROM a2a_deliveries WHERE target_session_id=? AND state IN ('queued','claimed','accepted')").all(id);
      for (const r of rows) {
        this.database.prepare("UPDATE a2a_deliveries SET state='resolved' WHERE task_id=? AND target_session_id=?").run(r.task_id, id);
        this.terminalTask(r.task_id, "failed", r.state === "queued" ? "TARGET_UNAVAILABLE" : "DELIVERY_LOST", now);
        this.deleteIfSourceClosed(r.task_id);
      }
      return rows.map((r) => r.task_id);
    });
  }
  countRetainedTasks() {
    return this.countTasks();
  }
  recordWorkerStarted(id, launchId) {
    this.tx(() => {
      this.database.prepare("UPDATE worker_launches SET launch_id=?,state='started',updated_at=? WHERE task_id=? AND state='starting'").run(launchId, this.clock.now(), id);
    });
  }
  recordWorkerStartFailed(id, code) {
    this.tx(() => {
      this.database.prepare("UPDATE worker_launches SET state='failed',updated_at=? WHERE task_id=? AND state IN ('starting','started')").run(this.clock.now(), id);
      this.terminalTask(id, "failed", code, this.clock.now());
      this.deleteIfSourceClosed(id);
    });
  }
  bindWorkerSession(token, session) {
    return this.tx(() => {
      if (!/^[0-9a-f]{64}$/.test(token)) throw new CoordinationError("LAUNCH_TOKEN_INVALID", "Launch token is invalid or expired", 401);
      const candidate = digest(token), rows = this.database.prepare("SELECT task_id,token_hash FROM worker_launches WHERE state IN ('starting','started')").all();
      const row = rows.find((r) => {
        const stored = Buffer.from(r.token_hash);
        return stored.length === candidate.length && timingSafeEqual4(stored, candidate);
      });
      if (!row) throw new CoordinationError("LAUNCH_TOKEN_INVALID", "Launch token is invalid or expired", 401);
      const task = this.getTask(row.task_id);
      this.database.prepare("UPDATE worker_launches SET state='bound',bound_session_id=?,updated_at=? WHERE task_id=?").run(session, this.clock.now(), task.id);
      this.database.prepare("UPDATE a2a_tasks SET target_session_id=?,updated_at=? WHERE id=?").run(session, this.clock.now(), task.id);
      const first = this.listMessages(task.id)[0];
      this.database.prepare("INSERT INTO a2a_deliveries(id,task_id,message_id,target_session_id,sequence,state) VALUES(?,?,?,?,?,'queued')").run(randomUUID2(), task.id, first.messageId, session, this.nextDeliverySequence(session));
      return this.getTask(task.id);
    });
  }
  listExpiredWorkerLaunches(now) {
    return this.database.prepare("SELECT task_id,provider,launch_id,state,deadline_at,bound_session_id FROM worker_launches WHERE state IN ('starting','started') AND deadline_at<=?").all(now).map((r) => ({ taskId: r.task_id, provider: r.provider, state: r.state, deadlineAt: r.deadline_at, ...r.launch_id ? { launchId: r.launch_id } : {}, ...r.bound_session_id ? { boundSessionId: r.bound_session_id } : {} }));
  }
  getWorkerLaunch(taskId) {
    const r = this.database.prepare("SELECT task_id,provider,launch_id,state,deadline_at,bound_session_id FROM worker_launches WHERE task_id=?").get(taskId);
    return r ? { taskId: r.task_id, provider: r.provider, state: r.state, deadlineAt: r.deadline_at, ...r.launch_id ? { launchId: r.launch_id } : {}, ...r.bound_session_id ? { boundSessionId: r.bound_session_id } : {} } : void 0;
  }
  close() {
    if (this.ownsDatabase) this.database.close();
  }
  tx(fn) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const v = fn();
      this.database.exec("COMMIT");
      this.onProjectionChanged?.();
      return v;
    } catch (e) {
      this.database.exec("ROLLBACK");
      throw e;
    }
  }
  enforceCreation(source, bytes) {
    if (bytes > MAX_TASK_CONTENT_BYTES) throw new CoordinationError("TASK_CONTENT_LIMIT", "Task content exceeds one MiB", 413);
    if (this.countActiveTasks(source) >= 50 || this.countActiveTasks() >= 500) throw new CoordinationError("TASK_COUNT_LIMIT", "Active task limit exceeded", 429);
  }
  enforceDatabase() {
    if (databaseSizeBytes(this.database) > this.maxDatabaseBytes) throw new CoordinationError("DATABASE_LIMIT", "Coordination database budget exceeded", 429);
  }
  insertTask(id, input, kind, target, targetSession, bytes, now, state = "submitted", code) {
    this.database.prepare("INSERT INTO a2a_tasks(id,instance_id,context_id,source_session_id,target_kind,target_selector_json,target_session_id,state,deadline_at,created_at,updated_at,terminal_code,content_bytes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id, this.instanceId, input.contextId, input.sourceSessionId, kind, JSON.stringify(target), targetSession ?? null, state, input.deadlineAt, now, now, code ?? null, bytes);
  }
  insertMessage(id, m, seq, bytes, now) {
    this.database.prepare("INSERT INTO a2a_messages(task_id,message_id,sequence,role,parts_json,extensions_json,created_at,content_bytes) VALUES(?,?,?,?,?,?,?,?)").run(id, m.messageId, seq, m.role, JSON.stringify(m.parts), JSON.stringify(m.extensions), now, bytes);
  }
  nextMessageSequence(id) {
    return this.database.prepare("SELECT COALESCE(MAX(sequence),0)+1 n FROM a2a_messages WHERE task_id=?").get(id).n;
  }
  nextDeliverySequence(target) {
    return this.database.prepare("SELECT COALESCE(MAX(sequence),0)+1 n FROM a2a_deliveries WHERE target_session_id=?").get(target).n;
  }
  delivery(id) {
    const r = this.database.prepare("SELECT * FROM a2a_deliveries WHERE id=?").get(id);
    return r ? this.mapDelivery(r) : void 0;
  }
  message(task, id) {
    return this.listMessages(task).find((m) => m.messageId === id);
  }
  mapDelivery(r) {
    return { id: r.id, taskId: r.task_id, messageId: r.message_id, targetSessionId: r.target_session_id, sequence: r.sequence, state: r.state, ...r.claimed_at !== null ? { claimedAt: r.claimed_at } : {}, ...r.acknowledged_at !== null ? { acknowledgedAt: r.acknowledged_at } : {} };
  }
  mapTask(r) {
    return { id: r.id, instanceId: r.instance_id, contextId: r.context_id, sourceSessionId: r.source_session_id, target: JSON.parse(r.target_selector_json), ...r.target_session_id ? { targetSessionId: r.target_session_id } : {}, state: r.state, cancellationRequested: Boolean(r.cancellation_requested), sourceClosed: Boolean(r.source_closed), deadlineAt: r.deadline_at, createdAt: r.created_at, updatedAt: r.updated_at, ...r.terminal_code ? { terminalCode: r.terminal_code } : {}, contentBytes: r.content_bytes };
  }
  addTargetMessage(id, m) {
    const task = this.getTask(id);
    if (!task || terminal.has(task.state)) return;
    const bytes = validateMessage(m);
    if (task.contentBytes + bytes > MAX_TASK_CONTENT_BYTES) throw new CoordinationError("TASK_CONTENT_LIMIT", "Task content exceeds one MiB", 413);
    this.insertMessage(id, { ...m, role: "target" }, this.nextMessageSequence(id), bytes, this.clock.now());
    this.database.prepare("UPDATE a2a_tasks SET content_bytes=content_bytes+?,updated_at=? WHERE id=?").run(bytes, this.clock.now(), id);
  }
  mutateDelivery(target, id, now, fn) {
    return this.tx(() => {
      const d = this.delivery(id);
      if (!d || d.targetSessionId !== target) throw new CoordinationError("DELIVERY_NOT_FOUND", "Delivery not found", 404);
      const existing = this.getTask(d.taskId);
      if (!["claimed", "accepted"].includes(d.state)) {
        if (existing && terminal.has(existing.state)) return { task: existing, cancellationRequested: existing.cancellationRequested };
        throw new CoordinationError("DELIVERY_NOT_FOUND", "Delivery not found", 404);
      }
      fn(d);
      const task = this.getTask(d.taskId);
      this.deleteIfSourceClosed(task.id);
      const current = this.getTask(task.id) ?? task;
      return { task: current, cancellationRequested: current.cancellationRequested };
    });
  }
  terminalTask(id, state, code, now) {
    this.database.prepare("UPDATE a2a_tasks SET state=?,terminal_code=?,updated_at=? WHERE id=? AND state IN ('submitted','working')").run(state, code ?? null, now, id);
  }
  deleteIfSourceClosed(id) {
    const t = this.getTask(id);
    if (t?.sourceClosed && terminal.has(t.state)) this.database.prepare("DELETE FROM a2a_tasks WHERE id=?").run(id);
  }
};

// packages/hub/src/coordination/notifier.ts
var ChangeNotifier = class {
  generations = /* @__PURE__ */ new Map();
  waiters = /* @__PURE__ */ new Map();
  generation(key) {
    return this.generations.get(key) ?? 0;
  }
  notify(key) {
    this.generations.set(key, this.generation(key) + 1);
    for (const wake of this.waiters.get(key) ?? []) wake();
    this.waiters.delete(key);
  }
  async wait(key, observed, timeoutMs, signal) {
    if (this.generation(key) !== observed || timeoutMs <= 0 || signal?.aborted) return;
    await new Promise((resolve) => {
      const set = this.waiters.get(key) ?? /* @__PURE__ */ new Set();
      let timer;
      const done = () => {
        if (timer) clearTimeout(timer);
        set.delete(done);
        signal?.removeEventListener("abort", done);
        resolve();
      };
      set.add(done);
      this.waiters.set(key, set);
      timer = setTimeout(done, timeoutMs);
      timer.unref?.();
      signal?.addEventListener("abort", done, { once: true });
    });
  }
  close() {
    for (const key of [...this.waiters.keys()]) this.notify(key);
  }
};

// packages/hub/src/coordination/delivery-router.ts
var DeliveryRouter = class {
  registry;
  tasks;
  clock;
  notifier;
  constructor(o) {
    this.registry = o.registry;
    this.tasks = o.tasks;
    this.clock = o.clock;
    this.notifier = o.notifier ?? new ChangeNotifier();
  }
  async claim(target, waitSeconds, signal) {
    if (!Number.isInteger(waitSeconds) || waitSeconds < 0 || waitSeconds > 30) throw new CoordinationError("UNSUPPORTED_CONTENT", "waitSeconds must be from 0 through 30", 400);
    const deadline = this.clock.now() + waitSeconds * 1e3;
    while (!signal?.aborted) {
      const session = this.registry.getSession(target);
      if (!session || !session.metadata.acceptsTaskDelivery || session.state !== "idle") return void 0;
      const generation = this.notifier.generation(target), claimed = this.tasks.claimNext(target, this.clock.now());
      if (claimed) {
        const source = this.registry.getSession(claimed.task.sourceSessionId);
        claimed.sourceLabel = source?.metadata.name ?? `${source?.metadata.adapter ?? "agent"} session`;
        return claimed;
      }
      const remaining = deadline - this.clock.now();
      if (remaining <= 0) return void 0;
      await this.notifier.wait(target, generation, remaining, signal);
    }
    return void 0;
  }
  abandon(t, d) {
    const taskId = this.tasks.abandonDelivery(t, d, this.clock.now());
    if (!taskId) return false;
    this.notifier.notify(t);
    this.notifier.notify(taskId);
    return true;
  }
  accept(t, d) {
    return this.after(t, this.tasks.acceptDelivery(t, d, this.clock.now()));
  }
  reject(t, d, c) {
    return this.after(t, this.tasks.rejectDelivery(t, d, c, this.clock.now()));
  }
  progress(t, id, m) {
    const task = this.tasks.getTask(id);
    if (!task || task.targetSessionId !== t) throw new CoordinationError("TASK_NOT_FOUND", "Task not found", 404);
    if (m) this.tasks.appendTargetMessage(id, { ...m, role: "target" });
    const updated = this.tasks.getTask(id);
    this.notifyTask(id);
    return { task: updated, cancellationRequested: updated.cancellationRequested };
  }
  complete(t, d, m) {
    return this.after(t, this.tasks.completeDelivery(t, d, { ...m, role: "target" }, this.clock.now()));
  }
  fail(t, d, c, m) {
    return this.after(t, this.tasks.failDelivery(t, d, c, m ? { ...m, role: "target" } : void 0, this.clock.now()));
  }
  acknowledgeCanceled(t, id) {
    return this.after(t, this.tasks.acknowledgeCanceled(t, id, this.clock.now()));
  }
  notifyTarget(id) {
    this.notifier.notify(id);
  }
  notifyTask(id) {
    this.notifier.notify(id);
  }
  close() {
    this.notifier.close();
  }
  after(target, r) {
    this.notifier.notify(target);
    this.notifier.notify(r.task.id);
    return r;
  }
};

// packages/hub/src/coordination/task-service.ts
import { isAbsolute } from "node:path";
import { randomUUID as randomUUID3 } from "node:crypto";

// packages/hub/src/coordination/worker-providers.ts
var WorkerProviderCatalog = class {
  providers;
  constructor(providers = []) {
    for (const provider of providers) if (!/^[a-z0-9_-]{1,64}$/.test(provider.name)) throw new Error("Invalid worker provider name");
    this.providers = new Map(providers.map((provider) => [provider.name, provider]));
    if (this.providers.size !== providers.length) throw new Error("Duplicate worker provider name");
  }
  names() {
    return [...this.providers.keys()].sort();
  }
  async start(name, request) {
    const provider = this.providers.get(name);
    if (!provider) throw new CoordinationError("WORKER_PROVIDER_NOT_FOUND", "Worker provider is unavailable", 400);
    return provider.start(request);
  }
  async cancel(name, launchId) {
    const provider = this.providers.get(name);
    if (provider) await provider.cancel(launchId);
  }
};

// packages/hub/src/coordination/task-service.ts
var DEFAULT = 30 * 6e4;
var MAX = 2 * 60 * 6e4;
var terminal2 = /* @__PURE__ */ new Set(["completed", "failed", "canceled", "rejected"]);
var CoordinationService = class {
  registry;
  tasks;
  router;
  providers;
  clock;
  notifier;
  constructor(o) {
    this.registry = o.registry;
    this.tasks = o.tasks;
    this.router = o.router;
    this.providers = o.providers ?? new WorkerProviderCatalog();
    this.clock = o.clock;
    this.notifier = o.notifier ?? new ChangeNotifier();
  }
  createExistingSessionTask(source, input) {
    this.requireSource(source);
    const deadlineAt = this.deadline(input.deadlineAt), contextId = input.contextId || randomUUID3(), target = this.registry.getSession(input.targetSessionId);
    const data = { sourceSessionId: source, targetSessionId: input.targetSessionId, contextId, deadlineAt, message: { ...input.message, role: "source" } };
    const task = !target || !target.metadata.acceptsTaskDelivery ? this.tasks.createRejectedTask(data, "TARGET_REJECTED") : this.tasks.createExistingTask(data).task;
    if (task.targetSessionId) this.router?.notifyTarget(task.targetSessionId);
    return task;
  }
  createWorkerTask(source, input) {
    this.requireSource(source);
    if (!/^[a-z0-9_-]{1,64}$/.test(input.provider) || !isAbsolute(input.cwd) || input.cwd.length > 4096 || Buffer.byteLength(JSON.stringify(input.options)) > 16384) throw new CoordinationError("UNSUPPORTED_CONTENT", "Worker target is invalid", 400);
    const made = this.tasks.createWorkerTask({ sourceSessionId: source, provider: input.provider, cwd: input.cwd, options: input.options, contextId: input.contextId || randomUUID3(), deadlineAt: this.deadline(input.deadlineAt), message: { ...input.message, role: "source" } });
    void (async () => {
      try {
        const r = await this.providers.start(input.provider, { taskId: made.task.id, launchToken: made.launchToken, cwd: input.cwd, options: input.options, deadlineAt: made.task.deadlineAt });
        this.tasks.recordWorkerStarted(made.task.id, r.launchId);
      } catch (e) {
        this.tasks.recordWorkerStartFailed(made.task.id, e instanceof CoordinationError && e.code === "WORKER_PROVIDER_NOT_FOUND" ? e.code : "WORKER_START_FAILED");
        this.notifier.notify(made.task.id);
      }
    })().catch(() => void 0);
    return made.task;
  }
  bindWorkerSession(token, session) {
    const target = this.registry.getSession(session);
    if (!target?.metadata.acceptsTaskDelivery) throw new CoordinationError("LAUNCH_TOKEN_INVALID", "Launch token is invalid or expired", 401);
    const task = this.tasks.bindWorkerSession(token, session);
    this.router?.notifyTarget(session);
    return task;
  }
  appendMessage(source, id, m) {
    const task = this.owned(source, id);
    this.tasks.appendSourceMessage(task.id, { ...m, role: "source" });
    if (task.targetSessionId) this.router?.notifyTarget(task.targetSessionId);
    return this.tasks.getTask(id);
  }
  getTask(source, id) {
    const t = this.tasks.getTask(id);
    return t?.sourceSessionId === source ? t : void 0;
  }
  listTasks(source, f) {
    return this.tasks.listTasks(source, f);
  }
  coordinationMessages(id, historyLength) {
    return this.tasks.listMessages(id, historyLength);
  }
  cancelTask(source, id) {
    this.owned(source, id);
    const task = this.tasks.requestCancellation(source, id, this.clock.now());
    this.notifier.notify(id);
    if (task.targetSessionId) this.router?.notifyTarget(task.targetSessionId);
    const launch = this.tasks.getWorkerLaunch(id);
    if (task.cancellationRequested && launch?.launchId) void this.providers.cancel(launch.provider, launch.launchId).catch(() => void 0);
    return task;
  }
  async waitForTerminal(source, id, signal) {
    while (true) {
      const t = this.owned(source, id);
      if (terminal2.has(t.state) || signal?.aborted) return t;
      const g = this.notifier.generation(id);
      await this.notifier.wait(id, g, 3e4, signal);
    }
  }
  onSessionClosed(id) {
    for (const task of [...this.tasks.closeSourceSession(id, this.clock.now()), ...this.tasks.closeTargetSession(id, this.clock.now())]) this.notifier.notify(task);
  }
  expireDeadlines() {
    const ids = this.tasks.expireDeadlines(this.clock.now());
    ids.forEach((id) => this.notifier.notify(id));
    return ids;
  }
  expireWorkerLaunches() {
    const rows = this.tasks.listExpiredWorkerLaunches(this.clock.now());
    for (const r of rows) {
      this.tasks.recordWorkerStartFailed(r.taskId, "WORKER_START_FAILED");
      if (r.launchId) void this.providers.cancel(r.provider, r.launchId).catch(() => void 0);
      this.notifier.notify(r.taskId);
    }
    return rows.map((r) => r.taskId);
  }
  countRetainedTasks() {
    return this.tasks.countRetainedTasks();
  }
  taskNotFoundMetadata(id) {
    const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
    return new RegExp(`^${uuid}:${uuid}$`).test(id) && !this.tasks.isTaskFromCurrentInstance(id) ? { reason: "coordinator_restarted" } : void 0;
  }
  close() {
    this.notifier.close();
    this.tasks.close();
  }
  requireSource(id) {
    if (!this.registry.getSession(id)) throw new CoordinationError("TASK_NOT_FOUND", "Source session not found", 404);
  }
  owned(s, id) {
    const t = this.getTask(s, id);
    if (!t) throw new CoordinationError("TASK_NOT_FOUND", "Task not found", 404);
    return t;
  }
  deadline(value) {
    const now = this.clock.now(), d = value ?? now + DEFAULT;
    if (d <= now || d > now + MAX) throw new CoordinationError("DEADLINE_EXCEEDED", "Task deadline is outside the allowed range", 400);
    return d;
  }
};

// packages/hub/src/monitor-identity.ts
import { createHmac } from "node:crypto";
var MonitorIdentity = class {
  constructor(key) {
    this.key = key;
  }
  forSession(sessionId) {
    return createHmac("sha256", this.key).update(sessionId).digest("hex").slice(0, 32);
  }
  resolve(monitorId, sessionIds) {
    return sessionIds.find((id) => this.forSession(id) === monitorId);
  }
};

// packages/hub/src/monitor-projection.ts
import { basename } from "node:path";
var MAX_MONITOR_SESSIONS = 500;
var MAX_MONITOR_TOOLS = 50;
var MAX_MONITOR_TASKS = 50;
var MAX_MONITOR_TIMELINE = 100;
var MonitorProjection = class {
  options;
  constructor(options) {
    this.options = options;
  }
  snapshot() {
    const sessions = this.options.hub.listSessionRows({ limit: MAX_MONITOR_SESSIONS + 1 });
    const totalSessions = this.options.hub.countSessions();
    const truncated = totalSessions > MAX_MONITOR_SESSIONS;
    const bounded = sessions.slice(0, MAX_MONITOR_SESSIONS);
    const summaries = bounded.map((session) => this.projectSummary(session));
    summaries.sort((a, b) => {
      const aAttention = a.attentionReasons.length > 0 ? 0 : 1;
      const bAttention = b.attentionReasons.length > 0 ? 0 : 1;
      if (aAttention !== bAttention) return aAttention - bAttention;
      const stateOrder = { running: 0, waiting: 1, idle: 2 };
      const aState = stateOrder[a.state];
      const bState = stateOrder[b.state];
      if (aState !== bState) return aState - bState;
      if (a.activitySince !== b.activitySince) return b.activitySince - a.activitySince;
      return a.monitorId.localeCompare(b.monitorId);
    });
    return {
      apiVersion: MONITOR_API_VERSION,
      revision: this.options.revision(),
      generatedAt: this.options.clock.now(),
      daemonId: this.options.daemonId,
      startedAt: this.options.startedAt,
      totalSessions,
      truncated,
      sessions: summaries
    };
  }
  detail(monitorId) {
    const sessions = this.options.hub.listSessionRows({ limit: MAX_MONITOR_SESSIONS });
    const sessionIds = sessions.map((s) => s.id);
    const sessionId = this.options.identity.resolve(monitorId, sessionIds);
    if (!sessionId) return void 0;
    const session = this.options.hub.getSession(sessionId);
    if (!session) return void 0;
    const summary = this.options.hub.latestActivitySummary(sessionId);
    const allTools = this.options.hub.monitorToolStates(sessionId, MAX_MONITOR_TOOLS + 1);
    const toolsTruncated = allTools.length > MAX_MONITOR_TOOLS;
    const tools = allTools.slice(0, MAX_MONITOR_TOOLS);
    const allTasks = this.options.tasks.listTasksForSession(sessionId, MAX_MONITOR_TASKS + 1);
    const tasksTruncated = allTasks.length > MAX_MONITOR_TASKS;
    const tasks = allTasks.slice(0, MAX_MONITOR_TASKS);
    const state = this.deriveState(session, tasks);
    const attentionReasons = this.deriveAttention(session, tools);
    const activitySummary = this.deriveActivitySummary(summary, session, tools, tasks);
    const timeline = this.buildTimeline(session, summary, tools);
    return {
      apiVersion: MONITOR_API_VERSION,
      monitorId,
      displayName: boundString(session.metadata.name ?? workspaceFor(session.metadata.cwd), 128),
      adapter: boundString(session.metadata.adapter, 64),
      adapterVersion: boundString(session.metadata.adapterVersion, 64),
      cwd: boundString(session.metadata.cwd, 4096),
      workspace: boundString(workspaceFor(session.metadata.cwd), 160),
      state,
      activitySummary,
      startedAt: session.metadata.startedAt,
      lastActivityAt: session.lastActivityAt,
      attentionReasons,
      tools: tools.map((t) => ({
        toolCallId: t.toolCallId,
        toolName: t.toolName,
        status: t.status,
        startedAt: t.startedAt,
        ...t.endedAt !== void 0 ? { endedAt: t.endedAt } : {}
      })),
      tasks: tasks.map((t) => ({
        taskId: t.id,
        role: t.role,
        state: t.state,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt
      })),
      timeline,
      completeness: {
        activity: summary ? "complete" : "unavailable",
        attention: attentionReasons.length <= 8 ? "complete" : "truncated",
        tools: toolsTruncated ? "truncated" : "complete",
        tasks: tasksTruncated ? "truncated" : "complete"
      }
    };
  }
  projectSummary(session) {
    const summary = this.options.hub.latestActivitySummary(session.id);
    const allTools = this.options.hub.monitorToolStates(session.id, MAX_MONITOR_TOOLS + 1);
    const tools = allTools.slice(0, MAX_MONITOR_TOOLS);
    const allTasks = this.options.tasks.listTasksForSession(session.id, MAX_MONITOR_TASKS + 1);
    const tasks = allTasks.slice(0, MAX_MONITOR_TASKS);
    const state = this.deriveState(session, tasks);
    const attentionReasons = this.deriveAttention(session, tools);
    const activitySummary = this.deriveActivitySummary(summary, session, tools, tasks);
    const activeTask = tasks.find(
      (t) => t.role === "target" && (t.state === "submitted" || t.state === "working")
    );
    return {
      monitorId: this.options.identity.forSession(session.id),
      displayName: boundString(session.metadata.name ?? workspaceFor(session.metadata.cwd), 128),
      adapter: boundString(session.metadata.adapter, 64),
      workspace: boundString(workspaceFor(session.metadata.cwd), 160),
      state,
      activitySummary,
      activitySince: session.lastActivityAt,
      attentionReasons: attentionReasons.slice(0, 8),
      activeToolCount: tools.filter((t) => t.status === "running").length,
      ...activeTask ? { activeTaskState: activeTask.state } : {},
      completeness: {
        activity: summary ? "complete" : "unavailable",
        attention: attentionReasons.length <= 8 ? "complete" : "truncated",
        tools: allTools.length > MAX_MONITOR_TOOLS ? "truncated" : "complete",
        tasks: allTasks.length > MAX_MONITOR_TASKS ? "truncated" : "complete"
      }
    };
  }
  deriveState(session, tasks) {
    if (session.state === "running") return "running";
    const hasActiveTargetTask = tasks.some(
      (t) => t.role === "target" && (t.state === "submitted" || t.state === "working")
    );
    if (hasActiveTargetTask) return "waiting";
    return "idle";
  }
  deriveAttention(session, tools) {
    const reasons = [];
    const failedTools = tools.filter((t) => t.status === "failed");
    if (failedTools.length > 0) {
      reasons.push(`Failed tool: ${boundString(failedTools[0].toolName, 100)}`);
    }
    const runningTools = tools.filter((t) => t.status === "running");
    const longRunning = runningTools.filter(
      (t) => this.options.clock.now() - t.startedAt > 12e4
    );
    if (longRunning.length > 0) {
      reasons.push(`Long-running tool: ${boundString(longRunning[0].toolName, 100)}`);
    }
    return reasons.slice(0, 8);
  }
  deriveActivitySummary(summary, session, tools, tasks) {
    if (summary) return boundString(summary.summary, 240);
    const runningTools = tools.filter((t) => t.status === "running");
    if (runningTools.length > 0) {
      return boundString(`Running \`${runningTools[0].toolName}\``, 240);
    }
    if (session.state === "running") return "Assistant responding";
    const hasActiveTargetTask = tasks.some(
      (t) => t.role === "target" && (t.state === "submitted" || t.state === "working")
    );
    if (hasActiveTargetTask) return "Waiting on delegated task";
    return "Idle";
  }
  buildTimeline(session, summary, tools) {
    const entries = [];
    if (summary) {
      entries.push({
        timestamp: summary.timestamp,
        category: "activity.summary",
        label: boundString(summary.summary, 240)
      });
    }
    for (const tool of tools) {
      if (tool.status === "running") {
        entries.push({
          timestamp: tool.startedAt,
          category: "tool.started",
          label: tool.toolName
        });
      } else {
        entries.push({
          timestamp: tool.endedAt ?? tool.startedAt,
          category: tool.status === "succeeded" ? "tool.succeeded" : "tool.failed",
          label: tool.toolName
        });
      }
    }
    entries.sort((a, b) => b.timestamp - a.timestamp);
    return entries.slice(0, MAX_MONITOR_TIMELINE);
  }
};
function workspaceFor(cwd) {
  return basename(cwd) || cwd;
}
function boundString(value, maxLength) {
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength - 1) + "\u2026";
}

// packages/hub/src/monitor-revision.ts
var MonitorRevision = class {
  revision = 0;
  notifier = new ChangeNotifier();
  current() {
    return this.revision;
  }
  changed() {
    this.revision += 1;
    this.notifier.notify("monitor");
    return this.revision;
  }
  async waitForChange(observed, timeoutMs, signal) {
    const clampedTimeout = Math.min(Math.max(timeoutMs, 0), 3e4);
    await this.notifier.wait("monitor", observed, clampedTimeout, signal);
    return this.revision;
  }
  close() {
    this.notifier.close();
  }
};

// packages/hub/src/monitor-discovery.ts
import { randomBytes as randomBytes5 } from "node:crypto";
import { promises as fs3 } from "node:fs";
import { dirname as dirname3, join as join3 } from "node:path";
var publishedRecords2 = /* @__PURE__ */ new Map();
async function writeMonitorDiscoveryFile(path, record) {
  const directory = dirname3(path);
  await fs3.mkdir(directory, { recursive: true, mode: 448 });
  if (process.platform !== "win32") await fs3.chmod(directory, 448);
  const tempPath = join3(directory, `.tmp-monitor-${randomBytes5(8).toString("hex")}`);
  const handle = await fs3.open(tempPath, "w", 384);
  try {
    await handle.writeFile(JSON.stringify(record), "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await fs3.rename(tempPath, path);
  } catch (error) {
    await fs3.rm(tempPath, { force: true });
    throw error;
  }
  publishedRecords2.set(path, record);
}
async function removeMonitorDiscoveryFile(path) {
  const expected = publishedRecords2.get(path);
  try {
    const contents = await fs3.readFile(path, "utf8");
    const current = JSON.parse(contents);
    if (!expected || !sameRecord2(current, expected)) return;
    await fs3.unlink(path);
  } catch (error) {
    if (!(error instanceof Error) || error.code !== "ENOENT") {
      throw error;
    }
  } finally {
    publishedRecords2.delete(path);
  }
}
function sameRecord2(current, expected) {
  return current.daemonId === expected.daemonId && current.capability === expected.capability && current.apiVersion === expected.apiVersion && current.startedAt === expected.startedAt;
}

// packages/hub/src/daemon.ts
var SWEEP_MS = 5e3;
var OWNERSHIP_CHECK_MS = 100;
var DEFAULT_EMPTY_EXIT_MS = 3e4;
async function createDaemonRuntime(options) {
  const clock = options.clock ?? new SystemClock();
  const database = createDatabase();
  const onProjectionChanged = options.monitor ? () => {
    options.monitor.revision.changed();
  } : void 0;
  const registry = new HubStore({
    database,
    clock,
    ...options.leaseMs !== void 0 ? { leaseMs: options.leaseMs } : {},
    onProjectionChanged
  });
  const tasks = new TaskStore({ database, clock, instanceId: randomUUID4(), onProjectionChanged });
  const providers = new WorkerProviderCatalog(options.providers ?? []);
  const notifier = new ChangeNotifier();
  const router = new DeliveryRouter({ registry, tasks, clock, notifier });
  const coordination = new CoordinationService({ registry, tasks, router, providers, clock, notifier });
  const sessions = {
    registerSession(request) {
      const result = registry.register(request);
      if (request.launchToken) {
        try {
          coordination.bindWorkerSession(request.launchToken, result.sessionId);
        } catch (error) {
          registry.deleteSession(result.sessionId);
          throw error;
        }
      }
      return result;
    },
    deleteSession(id) {
      const deleted = registry.deleteSession(id);
      if (deleted) coordination.onSessionClosed(id);
      return deleted;
    }
  };
  const monitor = options.monitor ? {
    capabilityDigest: options.monitor.capabilityDigest,
    projection: new MonitorProjection({
      hub: registry,
      tasks,
      clock,
      identity: options.monitor.identity,
      daemonId: options.monitor.daemonId,
      startedAt: options.monitor.startedAt,
      revision: () => options.monitor.revision.current()
    }),
    revision: options.monitor.revision
  } : void 0;
  const server = await createHubServer({
    token: options.token,
    store: registry,
    coordination,
    router,
    providers,
    sessions,
    clock,
    ...monitor ? { monitor } : {}
  });
  let closed = false;
  return {
    server,
    registry,
    tasks,
    coordination,
    router,
    providers,
    register: (request) => sessions.registerSession(request),
    deleteSession: (id) => sessions.deleteSession(id),
    sweep() {
      for (const id of registry.expireLeases()) coordination.onSessionClosed(id);
      coordination.expireDeadlines();
      coordination.expireWorkerLaunches();
    },
    isEmpty() {
      return registry.countSessions() === 0 && coordination.countRetainedTasks() === 0;
    },
    async close() {
      if (closed) return;
      closed = true;
      await server.close();
      router.close();
      coordination.close();
      registry.close();
      database.close();
    }
  };
}
function positiveIntegerEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === void 0) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}
async function start() {
  const token = process.env.AGENT_HUB_TOKEN;
  const file = process.env.AGENT_HUB_DISCOVERY_FILE;
  if (!token) throw new Error("AGENT_HUB_TOKEN is required");
  if (!file) throw new Error("AGENT_HUB_DISCOVERY_FILE is required");
  const emptyMs = positiveIntegerEnv("AGENT_HUB_EMPTY_EXIT_MS", DEFAULT_EMPTY_EXIT_MS);
  const startedAt = Date.now();
  const ownership = await acquireDaemonOwnership({
    discoveryFile: file,
    pid: process.pid,
    startedAt
  });
  const daemonId = randomUUID4();
  const monitorToken = randomBytes6(32).toString("hex");
  const monitorCapabilityDigest = createHash4("sha256").update(monitorToken, "utf8").digest();
  const monitorIdentityKey = randomBytes6(32);
  const monitorRevision = new MonitorRevision();
  let runtime;
  let record;
  const monitorDiscoveryFile = join4(dirname4(file), "monitor.json");
  try {
    runtime = await createDaemonRuntime({
      token,
      leaseMs: positiveIntegerEnv("AGENT_HUB_LEASE_MS", LEASE_MS),
      emptyExitMs: emptyMs,
      monitor: {
        capabilityDigest: monitorCapabilityDigest,
        identity: new MonitorIdentity(monitorIdentityKey),
        daemonId,
        startedAt,
        revision: monitorRevision
      }
    });
    record = {
      port: runtime.server.port,
      pid: process.pid,
      token,
      protocolVersion: PROTOCOL_VERSION,
      startedAt
    };
    await writeDiscoveryFile(file, record);
    await writeMonitorDiscoveryFile(monitorDiscoveryFile, {
      endpoint: runtime.server.url,
      apiVersion: MONITOR_API_VERSION,
      daemonId,
      startedAt,
      capability: monitorToken
    });
  } catch (error) {
    monitorRevision.close();
    await ownership.release().catch(() => void 0);
    throw error;
  }
  let stopped = false;
  let stopPromise;
  let emptySince = Date.now();
  let nextSweepAt = Date.now() + SWEEP_MS;
  const stop = (code = 0) => {
    if (stopPromise) return stopPromise;
    stopped = true;
    stopPromise = (async () => {
      monitorRevision.close();
      await runtime.close().catch(() => void 0);
      await removeMonitorDiscoveryFile(monitorDiscoveryFile).catch(() => void 0);
      await removeDiscoveryFile(file).catch(() => void 0);
      await ownership.release().catch(() => void 0);
      process.exit(code);
    })();
    return stopPromise;
  };
  process.once("SIGINT", () => void stop());
  process.once("SIGTERM", () => void stop());
  while (!stopped) {
    await delay2(OWNERSHIP_CHECK_MS).catch(() => void 0);
    if (stopped) break;
    try {
      const ownsDiscovery = await ownsDiscoveryFile(file, record);
      if (!ownsDiscovery || !await ownership.refresh()) {
        await stop();
        return;
      }
      const now = Date.now();
      if (now < nextSweepAt) continue;
      nextSweepAt = now + SWEEP_MS;
      runtime.sweep();
      if (runtime.isEmpty()) {
        if (now - emptySince >= emptyMs) await stop();
      } else {
        emptySince = now;
      }
    } catch {
      await stop(1);
      return;
    }
  }
}
var invokedEntrypoint = process.argv[1];
if (invokedEntrypoint && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(invokedEntrypoint)) {
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
export {
  createDaemonRuntime,
  positiveIntegerEnv
};
//# sourceMappingURL=hub-daemon.js.map
