'use strict';

const mongoose = require('mongoose'),
    Schema = mongoose.Schema;
const SchemaTypes = mongoose.Schema.Types;


const ChapterSchema = new Schema({
    chapter_name: {
        type: String,
        required: true,
        trim: true
    },
    chapter_url: {
        type: String,
        trim: true
    },
    chapter_content: {
        type: String,
        required: true,
        trim: true
    },
    chapter_id: {
        type: String,
        required: true,
        trim: true
    },
    novel: {
        type: Object,
        require: true
    },
    getInfoCrawler: {
        type: Boolean,
        default: false,
        require: false
    },
    premium_content: {
        type: Boolean,
        default: false,
        require: false
    },
    created_date: {
        type: Date,
        default: Date.now
    },
    crawler_date: {
        type: Date,
        default: Date.now
    },
    adult_score: {
        type: SchemaTypes.Decimal128,
        default: null
    }
});
ChapterSchema.index({ 'novel.novel_id': 1, 'chapter_id': 1 }, { unique: true });
const Chapter = mongoose.model('Chapters', ChapterSchema);
module.exports = Chapter;