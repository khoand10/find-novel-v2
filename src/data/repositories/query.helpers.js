function toPositiveInt(value, fallbackValue) {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallbackValue;
  }

  return Math.floor(parsed);
}

function buildPagination(options = {}) {
  const defaultLimit = toPositiveInt(options.defaultLimit, 20);
  const maxLimit = toPositiveInt(options.maxLimit, 200);
  const page = toPositiveInt(options.page, 1);
  const requestedLimit = toPositiveInt(options.limit, defaultLimit);

  const limit = Math.min(requestedLimit, maxLimit);
  const skip = (page - 1) * limit;

  return {
    page,
    limit,
    skip
  };
}

function applyPagination(query, options = {}) {
  if (!query || typeof query.limit !== "function" || typeof query.skip !== "function") {
    return query;
  }

  const { limit, skip } = buildPagination(options);
  return query.limit(limit).skip(skip);
}

module.exports = {
  applyPagination,
  buildPagination,
  toPositiveInt
};
