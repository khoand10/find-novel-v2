async function upsertBySlug({
  model,
  slugField = "slug",
  slugValue,
  payload = {},
  updateOnMatch = false,
  lean = true
}) {
  if (!model || typeof model.findOneAndUpdate !== "function") {
    throw new Error("A valid mongoose model is required");
  }

  if (!slugValue) {
    throw new Error("slugValue is required");
  }

  const filter = { [slugField]: slugValue };
  const updateDoc = updateOnMatch
    ? {
        $set: payload,
        $setOnInsert: { [slugField]: slugValue }
      }
    : {
        $setOnInsert: {
          ...payload,
          [slugField]: slugValue
        }
      };

  const rawResult = await model.findOneAndUpdate(filter, updateDoc, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
    rawResult: true
  });

  const doc = rawResult && rawResult.value ? rawResult.value : null;
  const lastErrorObject =
    rawResult && rawResult.lastErrorObject ? rawResult.lastErrorObject : null;
  const created = Boolean(
    lastErrorObject &&
      (lastErrorObject.updatedExisting === false || Boolean(lastErrorObject.upserted))
  );

  let output = doc;
  if (doc && lean && typeof doc.toObject === "function") {
    output = doc.toObject();
  }

  return {
    created,
    doc: output
  };
}

async function findByNovelId(model, novelId, options = {}) {
  if (!model || typeof model.findOne !== "function") {
    throw new Error("A valid mongoose model is required");
  }

  if (!novelId) {
    return null;
  }

  const field = options.field || "novel_id";
  let query = model.findOne({ [field]: novelId }, options.projection || null);

  if (options.sort) {
    query = query.sort(options.sort);
  }

  if (options.lean !== false) {
    query = query.lean();
  }

  return query;
}

module.exports = {
  findByNovelId,
  upsertBySlug
};
