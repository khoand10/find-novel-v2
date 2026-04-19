'use strict';

const mongoose = require('mongoose'),
    Schema = mongoose.Schema;
const SchemaTypes = mongoose.Schema.Types;
const NovelSchema = new Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Users',
        default: null
    },
    novel_status: {
        type: Number,
        require: true
    },
    hot: {
        type: Boolean,
        default: false
    },
    premium_content: {
        type: Boolean,
        default: false,
        require: false
    },
    new: {
        type: Boolean,
        default: false
    },
    view: {
        type: Number,
        default: 0
    },
    viewToDay: {
        type: Number,
        default: 0
    },
    viewWeek: {
        type: Number,
        default: 0
    },
    viewMonth: {
        type: Number,
        default: 0
    },
    totalChapter: {
        type: Number,
        default: 0
    },
    avgPointType2: {
        type: SchemaTypes.Decimal128,
        default: 0
    },
    voteCountType2: {
        type: Number,
        default: 0
    },
    novel_name: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    novel_other_name: {
        type: String,
        trim: true
    },
    novel_source: {
        type: String,
        trim: true,
        default: ''
    },
    novel_author: {
        type: String,
        required: true,
        trim: true
    },
    novel_id: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    novel_ids: {
        type: Array,
        default: []
    },
    novel_tags: {
        type: Array,
        required: false
    },
    not_adult: {
        type: Boolean,
        default: false
    },
    total_chapter_webnovel: {
        type: String,
        trim: true
    },
    webnovel_link: {
        type: String,
        trim: true
    },
    last_chapter_url: {
        type: String,
        trim: true
    },
    first_chapter_url: {
        type: String,
        trim: true
    },
    novel_victim_banner: {
        type: String,
        trim: true
    },
    novel_desc: {
        type: String,
        trim: true
    },
    novel_genres: {
        type: Array,
        required: true
    },
    created_date: {
        type: Date,
        default: Date.now
    },
    recentChapter: {
        type: Object
    },
    recentPremium: {
        type: Object
    },
    recentFree: {
        type: Object
    },
    firstChapter: {
        type: Object
    },
    crawler_date: {
        type: Date,
        default: Date.now
    },
    updated_date_webnovel: {
        type: Date,
        default: Date.now
    },
    isPanda: {
        type: Boolean,
        default: false
    },
    havePaidChapter: {
        type: Boolean,
        default: false
    },
    default_chapter_price: {
        type: Number,
        default: 0
    },
    disable_premium_desktop: {
        type: Boolean,
        default: false
    }
});

const Novel = mongoose.model('Novels', NovelSchema);
module.exports = Novel;