
/**
 * Module dependencies
 */

const jsonfile = require('jsonfile');
const fs = require('fs');
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
 * processTwitterList: private function
 * This purpose of this method is process raw tweet json objects into headline json source files.
 */
function processTwitterList(name, rawTweets, rules, config) {
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
    headline.score = parseInt((ratingHoursAgo * 1.2) + (retweetCount * 1.5) + favoriteCount, 10);

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

  const cacheFileName = `${config.cache_path}/${name}.source.json`;
  jsonfile.writeFile(cacheFileName, headlines, { spaces: 2 }, (err) => {
    if (err) throw err;
  });

  return headlines;
}


/**
 * asyncLoop: private function
 * A reusable function for async looping through an array.
 */
async function asyncLoop(array, callback) {
  for (let index = 0; index < array.length; index += 1) {
    /* eslint-disable no-await-in-loop */
    await callback(array[index], index, array);
  }
}


/**
 * updateHeadlines: private function
 * This purpose of this function is to create the headlines file by
 * looping through each of the source files and processing each one.
 * The headlines are then sorted at the end.
 */
function updateHeadlines(config) {
  return new Promise((() => {
    const headlines = [];

    // collecting tweets from source list
    const { sources } = config.engine;

    const process = async () => {
      await asyncLoop(sources, async (source) => {
        /* eslint-disable max-len */
        await twitter.getTwitterList(source.owner_screen_name, source.slug, source.rules, config).then((res) => {
          const thisHeadline = processTwitterList(res.slug, res.data, res.rules, config);
          Object.keys(thisHeadline).forEach((headlineID) => {
            headlines.push(thisHeadline[headlineID]);
          });
        });
      });

      // sort headlines based on what is set in the config
      // currently there is three choices: top20, latest20, none
      if (config.engine.sort === 'top20') {
        headlines.sort((a, b) => parseFloat(b.score) - parseFloat(a.score));
        headlines.length = 20;
      } else if (config.engine.sort === 'latest20') {
        headlines.sort((a, b) => parseFloat(b.timestamp) - parseFloat(a.timestamp));
        headlines.length = 20;
      }

      // Write combined headline file
      const cacheFileName = `${config.cache_path}/headlines.json`;
      jsonfile.writeFile(cacheFileName, headlines, { spaces: 2 }, (err) => {
        if (err) throw err;
      });
    };
    process();
  }));
}


/**
 * read: public function
 * This purpose of this function is to load the headlines cache file and return it.
 */
Headlines.prototype.read = async function read() {
  let headlines = [];
  const cacheFileName = `${this.config.cache_path}/headlines.json`;
  headlines = jsonfile.readFileSync(cacheFileName);
  return headlines;
};


/**
 * collect: public function
 * This function updates all of the individual source lists files
 * and the main headlines file.
 */
Headlines.prototype.collect = async function collect() {
  return updateHeadlines(this.config);
};


/**
 * rateLimit: public function
 * Allows developers to check the current Twitter account rateLimit
 */
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
