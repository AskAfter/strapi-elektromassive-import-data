const parameterTypeCache = new Map();
const parameterValueCache = new Map();

function clearCaches() {
  console.log(
    `Clearing caches: ${parameterTypeCache.size} parameter types and ${parameterValueCache.size} parameter values`
      .yellow
  );
  parameterTypeCache.clear();
  parameterValueCache.clear();
}

export { clearCaches, parameterTypeCache, parameterValueCache };
