
/**
 * Module dependencies
 */

const jsonfile = require('jsonfile');
const moment = require('moment');
const twitter = require('./twitter.client');


/**
 * Headlines: constructor
 * Creates a new instance of Headlines.
 */

const Headlines = function Headlines(settings) {
  this.config = settings;
  this.flags = {};
  this.headlines = {};
  this.categories = {};
  this.rateLimit = {};

  // load engine configuration in Headlines model
  this.config.engine = jsonfile.readFileSync(this.config.headlines_file);

  // prep 'raw' data object
  this.raw = {};
  this.raw.categories = {};
  this.raw.categories.News = [];
  Object.keys(this.config.engine.categories).forEach((categoryID) => {
    this.raw.categories[this.config.engine.categories[categoryID].category] = [];
  });
};
Headlines.prototype.config = {};
Headlines.prototype.flags = {};
Headlines.prototype.headlines = {};
Headlines.prototype.categories = {};
Headlines.prototype.rateLimit = {};


/**
 * processTwitterList: private function
 * This purpose of this method is process raw tweet json objects into a headline object.
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

    // Add this headline to headlines array if rules allow
    if (include === true) {
      headlines.push(headline);
    }
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
function updateHeadlines(thisInstance) {
  return new Promise((() => {
    // Init the headlines array
    const headlines = [];

    // collecting tweets from source list and add the to the headlines and categories arrays
    const { sources } = thisInstance.config.engine;

    const process = async () => {
      await asyncLoop(sources, async (source) => {
        /* eslint-disable max-len */
        await twitter.getTwitterList(source.owner_screen_name, source.slug, source.rules, thisInstance.config).then((res) => {
          const thisHeadline = processTwitterList(res.slug, res.data, res.rules, thisInstance.config);
          Object.keys(thisHeadline).forEach((headlineID) => {
            headlines.push(thisHeadline[headlineID]);
            const thisCategoryTimestamp = thisHeadline[headlineID].timestamp;
            let alreadyexists = false;
            Object.keys(thisInstance.raw.categories[thisHeadline[headlineID].category]).forEach((thisCategory) => {
              const checkCategoryTimestamp = thisInstance.raw.categories[thisHeadline[headlineID].category][thisCategory].timestamp;
              if (checkCategoryTimestamp === thisCategoryTimestamp) {
                alreadyexists = true;
              }
            });
            if (alreadyexists === false) {
              thisInstance.raw.categories[thisHeadline[headlineID].category].push(thisHeadline[headlineID]);
            }
          });
          /* eslint-disable no-param-reassign */
          thisInstance.rateLimit = res.rate_limit;
        });
      });

      // Init the categories array
      const { categories } = thisInstance.raw.categories;

      // sort headlines and categories based on what is set in the config
      // currently there is three choices: top20, latest20, none
      if (thisInstance.config.engine.sort === 'top20') {
        headlines.sort((a, b) => parseFloat(b.score) - parseFloat(a.score));
        if (headlines.length > 20) {
          headlines.length = 20;
        }
        Object.keys(thisInstance.config.engine.categories).forEach((categoryID) => {
          categories[thisInstance.config.engine.categories[categoryID].category].sort((a, b) => parseFloat(b.score) - parseFloat(a.score));
          if (categories[thisInstance.config.engine.categories[categoryID].category].length > 20) {
            categories[thisInstance.config.engine.categories[categoryID].category].length = 20;
          }
        });
        categories.News.sort((a, b) => parseFloat(b.score) - parseFloat(a.score));
        if (categories.News.length > 20) {
          categories.News.length = 20;
        }
      } else if (thisInstance.config.engine.sort === 'latest20') {
        headlines.sort((a, b) => parseFloat(b.timestamp) - parseFloat(a.timestamp));
        if (headlines.length > 20) {
          headlines.length = 20;
        }
        Object.keys(thisInstance.config.engine.categories).forEach((categoryID) => {
          categories[thisInstance.config.engine.categories[categoryID].category].sort((a, b) => parseFloat(b.timestamp) - parseFloat(a.timestamp));
          if (categories[thisInstance.config.engine.categories[categoryID].category].length > 20) {
            categories[thisInstance.config.engine.categories[categoryID].category].length = 20;
          }
        });
        categories.News.sort((a, b) => parseFloat(b.timestamp) - parseFloat(a.timestamp));
        if (categories.News.length > 20) {
          categories.News.length = 20;
        }
      }
      // puts the headlines in the data this instance's data object
      /* eslint-disable no-param-reassign */
      thisInstance.headlines = headlines;
      /* eslint-disable no-param-reassign */
      thisInstance.categories = categories;
    };
    process();
  }));
}

/**
 * get: publc function
 * This function processes all of the twitter sources and produces the headlines data.
 */
Headlines.prototype.get = async function get() {
  updateHeadlines(this);
};

module.exports = Headlines;
