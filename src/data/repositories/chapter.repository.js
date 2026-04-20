async function createChapterSafe({ model, payload, duplicateQuery }) {
  if (!model || typeof model.create !== "function") {
    throw new Error("A valid mongoose model is required");
  }

  try {
    const doc = await model.create(payload);
    return {
      created: true,
      duplicate: false,
      doc: typeof doc.toObject === "function" ? doc.toObject() : doc
    };
  } catch (error) {
    if (!(error && error.code === 11000)) {
      throw error;
    }

    let existing = null;
    if (duplicateQuery) {
      existing = await model.findOne(duplicateQuery).sort({ crawler_date: -1 }).lean();
    }

    return {
      created: false,
      duplicate: true,
      doc: existing
    };
  }
}

module.exports = {
  createChapterSafe
};
