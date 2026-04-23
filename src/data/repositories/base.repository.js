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
  let doc = await model.findOne(filter);
  let created = false;

  if (!doc) {
    if (updateOnMatch) {
      doc = await model.findOneAndUpdate(
        filter,
        {
          $set: payload,
          $setOnInsert: { [slugField]: slugValue }
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true
        }
      );

      created = true;
    } else {
      try {
        doc = await model.create({
          ...payload,
          [slugField]: slugValue
        });
        created = true;
      } catch (error) {
        if (!(error && error.code === 11000)) {
          throw error;
        }

        doc = await model.findOne(filter);
        if (!doc) {
          throw error;
        }
      }
    }
  } else if (updateOnMatch) {
    doc = await model.findOneAndUpdate(
      filter,
      { $set: payload },
      {
        new: true
      }
    );
  }

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
