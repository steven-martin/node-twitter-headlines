
/**
 * Module dependencies
 */

const jsonfile = require('jsonfile');
const fs = require('fs');
const glob = require('glob');
const moment = require('moment');
const twitter = require('./twitter.client');


/**
 * Headlines: constructor
 * Creates a new instance of Headlines.
 */

const Headlines = function Headlines(settings) {
  this.config = settings;
  this.flags = {};

  // load engine configuration in Headlines model
  this.config.engine = jsonfile.readFileSync(this.config.headlines_file);

  // set cache directory and create if it doesn't exist
  this.config.cache_path = './headlines';
  if (!fs.existsSync(this.config.cache_path)) {
    fs.mkdirSync(this.config.cache_path);
  }
  // the cache flag states if we should use the cache files are not. Initally no.
  this.flags.useCache = false;
};
Headlines.prototype.config = {};
Headlines.prototype.flags = {};


/**
 * Headlines: tweets2headlines method (private)
 * This purpose of this method is parse raw tweet json objects into headline json source files.
 */

function createSourceData(name, rawTweets, rules, config) {
  const headlines = [];
  Object.keys(rawTweets).forEach((tweet) => {
    const headline = {};

    // set source fields
    headline.source_name = ('name' in rawTweets[tweet].user) ? rawTweets[tweet].user.name : '';
    headline.source_photo = ('profile_image_url' in rawTweets[tweet].user) ? rawTweets[tweet].user.profile_image_url : '';

    // set article fields
    headline.article_link = (0 in rawTweets[tweet].entities.urls) ? rawTweets[tweet].entities.urls[0].expanded_url : '';
    headline.article_photo = ('extended_entities' in rawTweets[tweet]) ? rawTweets[tweet].extended_entities.media[0].media_url : '';

    // tidy and set article description
    headline.article_description = ('text' in rawTweets[tweet]) ? rawTweets[tweet].text : '';
    headline.article_description = headline.article_description.replace(/(?:https?|ftp):\/\/[\n\S]+/g, '');
    headline.article_description = headline.article_description.replace(/&amp;/, 'and');

    // set headline date
    headline.date = ('created_at' in rawTweets[tweet]) ? rawTweets[tweet].created_at : '';
    const timestamp = Date.parse(headline.date);
    headline.timestamp = timestamp;

    // set headline score
    const retweetCount = ('retweet_count' in rawTweets[tweet]) ? rawTweets[tweet].retweet_count : 0;
    const favoriteCount = ('favorite_count' in rawTweets[tweet] === true) ? rawTweets[tweet].favorite_count : 0;
    const timestampNow = moment(new Date(), 'YYYY-M-DD HH:mm:ss');
    const timestampThen = moment(new Date(timestamp), 'YYYY-M-DD HH:mm:ss');
    const ratingHoursAgo = moment(timestampNow).diff(timestampThen, 'hours');
    headline.score = parseInt(ratingHoursAgo + (retweetCount * 1.5) + favoriteCount, 10);

    // Categories
    const categoryList = config.engine.categories;
    headline.category = 'News';
    headline.category_badge = 'default_badge';
    headline.tags = '';
    Object.keys(categoryList).forEach((category) => {
      const searchPattern = new RegExp(categoryList[category].search_pattern, 'i');
      if (searchPattern.test(headline.article_description)) {
        headline.category = categoryList[category].category;
        headline.category_badge = categoryList[category].badge;
        if (headline.tags === '') {
          headline.tags += categoryList[category].category;
        } else {
          headline.tags = `${headline.tags},${categoryList[category].category}`;
        }
      }
    });

    // Custom Rules
    let include = true;
    if (rules.default === 'exclude all') {
      include = false;
    }
    const customrules = rules.custom;
    Object.keys(customrules).forEach((rule) => {
      // We test to see if the 'contains' is true for the 'where'.
      const contains = new RegExp(customrules[rule].contains, 'i');
      let where = 'article_description';
      if (headline[customrules[rule].where] === 'source') {
        where = 'source_name';
      }
      const ruleResult = contains.test(headline[where]);
      if (ruleResult) {
        if (customrules[rule].action === 'force include') {
          include = true;
        }
        if (customrules[rule].action === 'force exclude') {
          include = false;
        }
      }
    });

    // Mandatory Rules
    if (headline.article_description === '') { include = false; }
    if (headline.article_link === '') { include = false; }
    if (headline.article_photo === '') { include = false; }

    if (include === true) {
      headlines.push(headline);
    }
  });

  const cacheFileName = `${config.cache_path}/${name}.headlines.json`;
  jsonfile.writeFile(cacheFileName, headlines, { spaces: 2 }, (err) => {
    if (err) throw err;
  });
}


/**
 * Headlines: Read method
 * This purpose of this method is to collect all of the individual source lists
 * and create a main headline json.
 */

Headlines.prototype.read = async function read() {
  let headlines = [];

  // if the cache fag is set to true then use the cache files
  if (this.flags.useCache) {
    const cacheFileName = `${this.config.cache_path}/headlines.json`;
    headlines = jsonfile.readFileSync(cacheFileName);
  } else {
  // otherwise create new headlines and update cache

    // merge all headline files in one array
    const files = glob.sync(`${this.config.cache_path}/*.headlines.json`);
    if (files) {
      Object.keys(files).forEach((file) => {
        const thisHeadline = jsonfile.readFileSync(files[file]);
        Object.keys(thisHeadline).forEach((thisHeadlineEntry) => {
          headlines.push(thisHeadline[thisHeadlineEntry]);
        });
      });
    }

    // sort headlines based on what is set in the config
    // currently there is three choices: top20, latest20, none
    if (this.config.engine.sort === 'top20') {
      headlines.sort((a, b) => parseFloat(b.score) - parseFloat(a.score));
      headlines.length = 20;
    } else if (this.config.engine.sort === 'latest20') {
      headlines.sort((a, b) => parseFloat(b.timestamp) - parseFloat(a.timestamp));
      headlines.length = 20;
    }

    // Write combined headline file
    const cacheFileName = `${this.config.cache_path}/headlines.json`;
    jsonfile.writeFile(cacheFileName, headlines, { spaces: 2 }, (err) => {
      if (err) throw err;
    });

    this.flags.useCache = true;
  }

  return headlines;
};


/**
 * Headlines: Collect method
 * This method updates individual source lists
 */

Headlines.prototype.collect = async function collect() {
  return new Promise(((resolve) => {
    this.flags.useCache = false;

    // collecting tweets from source list
    const { sources } = this.config.engine;
    Object.keys(sources).forEach((count) => {
      const sourceRules = this.config.engine.sources[count].rules;
      const sourceOwner = this.config.engine.sources[count].owner_screen_name;
      const sourceSlug = this.config.engine.sources[count].slug;

      twitter.getSource(sourceOwner, sourceSlug, sourceRules, this.config).then((res) => {
        createSourceData(res.slug, res.data, res.rules, this.config);
        resolve(res.rate_limit);
      });
    });
  }));
};

Headlines.prototype.rateLimit = function rateLimit() {
  return new Promise(((resolve) => {
    twitter.getRateLimit(this.config).then((res) => {
      // console.log("RateLimit0: " + JSON.stringify(res));
      resolve(res.rate_limit);
      return res.rate_limit;
    });
  }));
};

module.exports = Headlines;
